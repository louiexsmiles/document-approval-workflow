import { Migration } from '@mikro-orm/migrations';

/**
 * The contract step: removes the static workflow now that the service reads from
 * approval_stages. Three approver columns and the current_stage enum go, along with the
 * check constraint that pinned stage names to three values.
 *
 * This is the destructive one, and it runs last on purpose. Until now a rollback was free
 * because the old columns still held valid data.
 */
export class Migration20260904225007_DropStaticWorkflowColumns extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table "documents" drop constraint "documents_draft_review_approver_id_foreign";`);
    this.addSql(`alter table "documents" drop constraint "documents_legal_review_approver_id_foreign";`);
    this.addSql(`alter table "documents" drop constraint "documents_final_approval_approver_id_foreign";`);

    this.addSql(`alter table "documents" drop column "draft_review_approver_id";`);
    this.addSql(`alter table "documents" drop column "legal_review_approver_id";`);
    this.addSql(`alter table "documents" drop column "final_approval_approver_id";`);

    this.addSql(`alter table "documents" drop constraint if exists "documents_current_stage_check";`);
    this.addSql(`alter table "documents" drop column "current_stage";`);

    // Status gains REJECTED, so a refused document stops claiming to be in progress.
    this.addSql(`alter table "documents" drop constraint if exists "documents_status_check";`);
    this.addSql(`alter table "documents" add constraint "documents_status_check" check ("status" in ('IN_PROGRESS', 'APPROVED', 'REJECTED'));`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "documents" add column "current_stage" text not null default 'DRAFT_REVIEW';`);
    this.addSql(`alter table "documents" add column "draft_review_approver_id" uuid null;`);
    this.addSql(`alter table "documents" add column "legal_review_approver_id" uuid null;`);
    this.addSql(`alter table "documents" add column "final_approval_approver_id" uuid null;`);
    this.addSql(`alter table "documents" drop constraint if exists "documents_status_check";`);
    this.addSql(`alter table "documents" add constraint "documents_status_check" check ("status" in ('IN_PROGRESS', 'APPROVED'));`);
  }
}
