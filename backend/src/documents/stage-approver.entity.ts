import { randomUUID } from 'crypto';
import {
  Entity,
  ManyToOne,
  OptionalProps,
  PrimaryKey,
  Unique,
} from '@mikro-orm/core';
import { User } from '../users/user.entity';
import { ApprovalStage } from './approval-stage.entity';

/** A user assigned to approve at a particular stage. */
@Entity({ tableName: 'stage_approvers' })
@Unique({ properties: ['stage', 'user'] })
export class StageApprover {
  [OptionalProps]?: 'id';

  @PrimaryKey({ type: 'uuid' })
  id: string = randomUUID();

  @ManyToOne(() => ApprovalStage, { deleteRule: 'cascade' })
  stage!: ApprovalStage;

  @ManyToOne(() => User)
  user!: User;
}
