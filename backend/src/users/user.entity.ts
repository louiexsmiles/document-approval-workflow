import { randomUUID } from 'crypto';
import { Entity, OptionalProps, PrimaryKey, Property } from '@mikro-orm/core';

@Entity({ tableName: 'users' })
export class User {
  [OptionalProps]?: 'id' | 'avatarUrl' | 'jobTitle';

  @PrimaryKey({ type: 'uuid' })
  id: string = randomUUID();

  @Property()
  name!: string;

  @Property({ unique: true })
  email!: string;

  @Property({ nullable: true })
  avatarUrl: string | null = null;

  @Property({ nullable: true })
  jobTitle: string | null = null;
}
