import { Migration } from '@mikro-orm/migrations';

export class Migration20260717130000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table "users" add column "avatar_url" varchar(255) null;`,
    );
    this.addSql(
      `alter table "users" add column "job_title" varchar(255) null;`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "users" drop column "job_title";`);
    this.addSql(`alter table "users" drop column "avatar_url";`);
  }
}
