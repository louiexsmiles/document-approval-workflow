import { randomUUID } from 'crypto';
import {
  Entity,
  Enum,
  Index,
  ManyToOne,
  OptionalProps,
  PrimaryKey,
  Property,
} from '@mikro-orm/core';
import { User } from '../users/user.entity';
import { ApprovalAction } from './approval-action.enum';
import { ApprovalStage } from './approval-stage.entity';
import { Document } from './document.entity';

/**
 * One recorded action on a document. Append-only: rows are never updated or deleted.
 *
 * No `updatedAt` on purpose — an audit record that can be edited is not an audit record.
 */
@Entity({ tableName: 'approval_events' })
@Index({ properties: ['document', 'createdAt'] })
export class ApprovalEvent {
  [OptionalProps]?: 'id' | 'stage' | 'comment' | 'createdAt';

  @PrimaryKey({ type: 'uuid' })
  id: string = randomUUID();

  @ManyToOne(() => Document, { deleteRule: 'cascade' })
  document!: Document;

  /** Null for document-level actions that belong to no single stage. */
  @ManyToOne(() => ApprovalStage, { nullable: true, deleteRule: 'cascade' })
  stage: ApprovalStage | null = null;

  @ManyToOne(() => User)
  actor!: User;

  @Enum(() => ApprovalAction)
  action!: ApprovalAction;

  /** Required when rejecting — a rejection with no reason is useless. */
  @Property({ type: 'text', nullable: true })
  comment: string | null = null;

  @Property({ onCreate: () => new Date() })
  createdAt: Date = new Date();
}
