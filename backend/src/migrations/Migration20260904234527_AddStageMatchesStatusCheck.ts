import { Migration } from '@mikro-orm/migrations';

/**
 * status and current_stage_id encode one fact between them: a document is either waiting
 * at a stage, or it has finished. Nothing stopped them disagreeing, so deleting the stage
 * a document sat on left it in progress with nowhere to go.
 *
 * A plain CHECK cannot express this. A document is inserted before its stages exist,
 * because stages carry a document_id foreign key, so current_stage_id is briefly null
 * while the status is IN_PROGRESS. Postgres refuses to defer CHECK constraints, so the
 * rule would fire on a state that only ever exists mid-transaction.
 *
 * A deferred constraint trigger runs at commit instead. It re-reads the row rather than
 * trusting NEW: deferred triggers queue one event per statement, each holding the snapshot
 * from when that statement ran, so the insert's NEW still shows a null pointer even after
 * a later update sets it.
 */
export class Migration20260904234527_AddStageMatchesStatusCheck extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      create or replace function documents_stage_matches_status() returns trigger as \$\$
      declare
        final_status text;
        final_stage uuid;
      begin
        select status, current_stage_id into final_status, final_stage
        from documents where id = new.id;

        -- Deleted later in the same transaction; nothing left to check.
        if not found then
          return null;
        end if;

        if (final_status = 'IN_PROGRESS') <> (final_stage is not null) then
          raise exception
            'document % has status % with current_stage_id %, which cannot both be true',
            new.id, final_status, coalesce(final_stage::text, 'null');
        end if;

        return null;
      end;
      \$\$ language plpgsql;
    `);

    this.addSql(`
      create constraint trigger documents_stage_matches_status
      after insert or update on documents
      deferrable initially deferred
      for each row execute function documents_stage_matches_status();
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`drop trigger if exists documents_stage_matches_status on documents;`);
    this.addSql(`drop function if exists documents_stage_matches_status();`);
  }
}
