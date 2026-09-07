import { Migration } from '@mikro-orm/migrations';

/**
 * Records the stage's name, policy and approvers onto each event, so history reads what
 * was true at the time rather than joining to a stage that may since have been edited.
 *
 * Nullable, and existing rows are left null. Backfilling them from the current stage would
 * write today's state as if it were history — inventing an audit record is worse than
 * admitting there isn't one. Snapshots begin here.
 */
export class Migration20260907174853_AddStageSnapshotToEvents extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table "approval_events" add column "stage_snapshot" jsonb null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "approval_events" drop column "stage_snapshot";`);
  }
}
