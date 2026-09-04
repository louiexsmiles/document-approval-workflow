import { Migration } from '@mikro-orm/migrations';

export class Migration20260904172605 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table "approval_stages" ("id" uuid not null, "document_id" uuid not null, "position" int not null, "name" varchar(255) not null, "policy" text check ("policy" in ('ANY', 'ALL')) not null default 'ANY', "reject_behavior" text check ("reject_behavior" in ('TO_FIRST_STAGE', 'TO_PREVIOUS_STAGE', 'TO_SPECIFIC_STAGE', 'TERMINAL')) not null default 'TO_FIRST_STAGE', "reject_target_stage_id" uuid null, constraint "approval_stages_pkey" primary key ("id"));`);
    this.addSql(`alter table "approval_stages" add constraint "approval_stages_document_id_position_unique" unique ("document_id", "position");`);

    this.addSql(`create table "stage_approvers" ("id" uuid not null, "stage_id" uuid not null, "user_id" uuid not null, constraint "stage_approvers_pkey" primary key ("id"));`);
    this.addSql(`alter table "stage_approvers" add constraint "stage_approvers_stage_id_user_id_unique" unique ("stage_id", "user_id");`);

    this.addSql(`create table "approval_events" ("id" uuid not null, "document_id" uuid not null, "stage_id" uuid null, "actor_id" uuid not null, "action" text check ("action" in ('APPROVE', 'REJECT')) not null, "comment" text null, "created_at" timestamptz not null, constraint "approval_events_pkey" primary key ("id"));`);
    this.addSql(`create index "approval_events_document_id_created_at_index" on "approval_events" ("document_id", "created_at");`);

    this.addSql(`alter table "approval_stages" add constraint "approval_stages_document_id_foreign" foreign key ("document_id") references "documents" ("id") on update cascade on delete cascade;`);
    this.addSql(`alter table "approval_stages" add constraint "approval_stages_reject_target_stage_id_foreign" foreign key ("reject_target_stage_id") references "approval_stages" ("id") on update cascade on delete set null;`);

    this.addSql(`alter table "stage_approvers" add constraint "stage_approvers_stage_id_foreign" foreign key ("stage_id") references "approval_stages" ("id") on update cascade on delete cascade;`);
    this.addSql(`alter table "stage_approvers" add constraint "stage_approvers_user_id_foreign" foreign key ("user_id") references "users" ("id") on update cascade;`);

    this.addSql(`alter table "approval_events" add constraint "approval_events_document_id_foreign" foreign key ("document_id") references "documents" ("id") on update cascade on delete cascade;`);
    this.addSql(`alter table "approval_events" add constraint "approval_events_stage_id_foreign" foreign key ("stage_id") references "approval_stages" ("id") on update cascade on delete cascade;`);
    this.addSql(`alter table "approval_events" add constraint "approval_events_actor_id_foreign" foreign key ("actor_id") references "users" ("id") on update cascade;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "approval_stages" drop constraint "approval_stages_reject_target_stage_id_foreign";`);

    this.addSql(`alter table "stage_approvers" drop constraint "stage_approvers_stage_id_foreign";`);

    this.addSql(`alter table "approval_events" drop constraint "approval_events_stage_id_foreign";`);

    this.addSql(`drop table if exists "approval_stages" cascade;`);

    this.addSql(`drop table if exists "stage_approvers" cascade;`);

    this.addSql(`drop table if exists "approval_events" cascade;`);
  }

}
