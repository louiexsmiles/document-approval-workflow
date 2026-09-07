import { Migration } from '@mikro-orm/migrations';

/**
 * Reordering stages swaps their positions, and for a moment two rows share one. Postgres
 * enforces a unique constraint as each row is written, even inside a single UPDATE, so
 * the swap is rejected halfway through despite the final state being valid.
 *
 * Unlike CHECK constraints, UNIQUE ones can be deferred, so this one is checked at commit.
 * Postgres cannot alter a constraint's deferrability, so it is dropped and recreated.
 *
 * Verified by removing this migration: the reorder test then fails with a duplicate key.
 */
export class Migration20260907173830_DeferStagePositionUniqueness extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      alter table "approval_stages"
        drop constraint "approval_stages_document_id_position_unique";
    `);
    this.addSql(`
      alter table "approval_stages"
        add constraint "approval_stages_document_id_position_unique"
        unique ("document_id", "position") deferrable initially deferred;
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`
      alter table "approval_stages"
        drop constraint "approval_stages_document_id_position_unique";
    `);
    this.addSql(`
      alter table "approval_stages"
        add constraint "approval_stages_document_id_position_unique"
        unique ("document_id", "position");
    `);
  }
}
