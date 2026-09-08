import { Migration } from '@mikro-orm/migrations';

/**
 * Moves each document's three approver columns into rows in approval_stages and
 * stage_approvers. The columns themselves stay put until the service reads from the
 * new tables.
 *
 * Raw SQL on purpose: a migration must keep running unchanged years from now, so it
 * cannot depend on entity classes that may be renamed later.
 */
export class Migration20260904203927_BackfillApproverColumnsIntoStages extends Migration {
  override async up(): Promise<void> {
    // One stage per old approver column, in the order the workflow ran.
    // Skips documents that already have stages, so re-running is safe.
    this.addSql(`
      insert into "approval_stages" ("id", "document_id", "position", "name", "policy", "reject_behavior")
      select gen_random_uuid(), d."id", v."position", v."name", 'ANY', 'TO_FIRST_STAGE'
      from "documents" d
      cross join (values
        (0, 'Draft Review'),
        (1, 'Legal Review'),
        (2, 'Final Approval')
      ) as v("position", "name")
      where not exists (
        select 1 from "approval_stages" s where s."document_id" = d."id"
      );
    `);

    // Each new stage takes its approver from the column it was built from.
    this.addSql(`
      insert into "stage_approvers" ("id", "stage_id", "user_id")
      select gen_random_uuid(), s."id",
        case s."position"
          when 0 then d."draft_review_approver_id"
          when 1 then d."legal_review_approver_id"
          when 2 then d."final_approval_approver_id"
        end
      from "approval_stages" s
      join "documents" d on d."id" = s."document_id"
      where not exists (
        select 1 from "stage_approvers" a where a."stage_id" = s."id"
      );
    `);
  }

  override async down(): Promise<void> {
    // stage_approvers rows go with their stages via on delete cascade.
    this.addSql(`delete from "approval_stages";`);
  }
}
