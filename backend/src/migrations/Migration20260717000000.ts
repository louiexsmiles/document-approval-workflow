import { Migration } from '@mikro-orm/migrations';

export class Migration20260717000000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      create table "users" (
        "id" uuid not null,
        "name" varchar(255) not null,
        "email" varchar(255) not null,
        constraint "users_pkey" primary key ("id")
      );
    `);
    this.addSql(
      `alter table "users" add constraint "users_email_unique" unique ("email");`,
    );

    this.addSql(`
      create table "documents" (
        "id" uuid not null,
        "title" varchar(255) not null,
        "body" text not null,
        "current_stage" text check ("current_stage" in ('DRAFT_REVIEW', 'LEGAL_REVIEW', 'FINAL_APPROVAL')) not null default 'DRAFT_REVIEW',
        "status" text check ("status" in ('IN_PROGRESS', 'APPROVED')) not null default 'IN_PROGRESS',
        "draft_review_approver_id" uuid not null,
        "legal_review_approver_id" uuid not null,
        "final_approval_approver_id" uuid not null,
        "created_at" timestamptz not null,
        "updated_at" timestamptz not null,
        constraint "documents_pkey" primary key ("id")
      );
    `);

    this.addSql(`
      alter table "documents"
        add constraint "documents_draft_review_approver_id_foreign"
        foreign key ("draft_review_approver_id") references "users" ("id")
        on update cascade;
    `);
    this.addSql(`
      alter table "documents"
        add constraint "documents_legal_review_approver_id_foreign"
        foreign key ("legal_review_approver_id") references "users" ("id")
        on update cascade;
    `);
    this.addSql(`
      alter table "documents"
        add constraint "documents_final_approval_approver_id_foreign"
        foreign key ("final_approval_approver_id") references "users" ("id")
        on update cascade;
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "documents" cascade;`);
    this.addSql(`drop table if exists "users" cascade;`);
  }
}
