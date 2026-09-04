import { randomUUID } from 'crypto';
import {
  Collection,
  Entity,
  Enum,
  ManyToOne,
  OneToMany,
  OptionalProps,
  PrimaryKey,
  Property,
  Unique,
} from '@mikro-orm/core';
import { Document } from './document.entity';
import { StageApprovalPolicy } from './stage-approval-policy.enum';
import { StageRejectBehavior } from './stage-reject-behavior.enum';
import { StageApprover } from './stage-approver.entity';

/**
 * One step in a document's approval workflow.
 *
 * Owned by the document, not shared between documents — editing one document's workflow
 * can never affect another's.
 */
@Entity({ tableName: 'approval_stages' })
@Unique({ properties: ['document', 'position'] })
export class ApprovalStage {
  [OptionalProps]?: 'id' | 'policy' | 'rejectBehavior' | 'rejectTargetStage';

  @PrimaryKey({ type: 'uuid' })
  id: string = randomUUID();

  @ManyToOne(() => Document, { deleteRule: 'cascade' })
  document!: Document;

  /** Zero-based order within the document. Not "order" — that is reserved in SQL. */
  @Property()
  position!: number;

  @Property()
  name!: string;

  @Enum(() => StageApprovalPolicy)
  policy: StageApprovalPolicy = StageApprovalPolicy.ANY;

  @Enum(() => StageRejectBehavior)
  rejectBehavior: StageRejectBehavior = StageRejectBehavior.TO_FIRST_STAGE;

  /** Only meaningful when rejectBehavior is TO_SPECIFIC_STAGE. */
  @ManyToOne(() => ApprovalStage, { nullable: true, deleteRule: 'set null' })
  rejectTargetStage: ApprovalStage | null = null;

  @OneToMany(() => StageApprover, (approver) => approver.stage, {
    orphanRemoval: true,
  })
  approvers = new Collection<StageApprover>(this);
}
