import { Migration } from '@mikro-orm/migrations';

/**
 * Adds the columns the dynamic engine needs, and fills them from the old enum.
 *
 * current_stage_id replaces the current_stage enum: a pointer to a row rather than one of
 * three hardcoded names. Null means the document is finished.
 *
 * approval_round and round exist so progress can be reset on rejection by labelling events
 * rather than comparing timestamps. Timestamps are set by the API process, so two servers
 * with drifting clocks can record events out of order.
 *
 * Additive only. The old columns stay until the service reads from these.
 */
export class Migration20260904224908_AddCurrentStagePointerAndRounds extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table "documents" add column "current_stage_id" uuid null;`);
    this.addSql(`
      alter table "documents"
        add constraint "documents_current_stage_id_foreign"
        foreign key ("current_stage_id") references "approval_stages" ("id")
        on update cascade on delete set null;
    `);

    this.addSql(
      `alter table "documents" add column "approval_round" int not null default 0;`,
    );
    // Added with a default so existing rows satisfy NOT NULL, then dropped: the service
    // always sets the round explicitly, and a default would quietly mislabel an event as
    // round 0 if it ever failed to.
    this.addSql(
      `alter table "approval_events" add column "round" int not null default 0;`,
    );
    this.addSql(`alter table "approval_events" alter column "round" drop default;`);

    // Point each in-progress document at the stage matching its old enum value.
    // Documents that are already APPROVED keep a null pointer, which is what finished means.
    this.addSql(`
      update "documents" d
      set "current_stage_id" = s."id"
      from "approval_stages" s
      where s."document_id" = d."id"
        and d."status" = 'IN_PROGRESS'
        and s."position" = case d."current_stage"
              when 'DRAFT_REVIEW'   then 0
              when 'LEGAL_REVIEW'   then 1
              when 'FINAL_APPROVAL' then 2
            end;
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "approval_events" drop column "round";`);
    this.addSql(`alter table "documents" drop column "approval_round";`);
    this.addSql(
      `alter table "documents" drop constraint "documents_current_stage_id_foreign";`,
    );
    this.addSql(`alter table "documents" drop column "current_stage_id";`);
  }
}
