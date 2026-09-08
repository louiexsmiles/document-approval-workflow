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
import { StageApprovalPolicy } from './stage-approval-policy.enum';

/** The stage as it stood at the moment an action was recorded. */
export type StageSnapshot = {
  name: string;
  policy: StageApprovalPolicy;
  approverIds: string[];
};

/**
 * One recorded action on a document. Append-only: rows are never updated or deleted.
 *
 * No `updatedAt` on purpose — an audit record that can be edited is not an audit record.
 */
@Entity({ tableName: 'approval_events' })
@Index({ properties: ['document', 'createdAt'] })
export class ApprovalEvent {
  [OptionalProps]?: 'id' | 'stage' | 'comment' | 'createdAt' | 'stageSnapshot';

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

  /** Which round of review this happened in. See Document.approvalRound. */
  @Property()
  round!: number;

  /**
   * What the stage looked like when this happened. History reads it instead of joining to
   * the live stage, so a later rename or policy change cannot rewrite what was approved.
   *
   * Null on events recorded before snapshots existed. Backfilling those from the current
   * stage would invent an audit record, which is worse than admitting there isn't one.
   */
  @Property({ type: 'json', nullable: true })
  stageSnapshot: StageSnapshot | null = null;

  /** Required when rejecting — a rejection with no reason is useless. */
  @Property({ type: 'text', nullable: true })
  comment: string | null = null;

  @Property({ onCreate: () => new Date() })
  createdAt: Date = new Date();
}
