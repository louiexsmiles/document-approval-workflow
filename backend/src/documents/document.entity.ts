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
} from '@mikro-orm/core';
import { ApprovalStage } from './approval-stage.entity';
import { DocumentStatus } from './document-status.enum';

/**
 * A document is waiting at exactly one stage, or it has finished and is waiting at none.
 * A deferred constraint trigger enforces that; see the AddStageMatchesStatusCheck
 * migration for why it is a trigger rather than a plain check.
 */
@Entity({ tableName: 'documents' })
export class Document {
  [OptionalProps]?:
    | 'id'
    | 'status'
    | 'currentStage'
    | 'approvalRound'
    | 'createdAt'
    | 'updatedAt';

  @PrimaryKey({ type: 'uuid' })
  id: string = randomUUID();

  @Property()
  title!: string;

  @Property({ type: 'text' })
  body!: string;

  @Enum(() => DocumentStatus)
  status: DocumentStatus = DocumentStatus.IN_PROGRESS;

  /** The document's own workflow, ordered by position. */
  @OneToMany(() => ApprovalStage, (stage) => stage.document, {
    orphanRemoval: true,
  })
  stages = new Collection<ApprovalStage>(this);

  /** Where the document is waiting. Null means it has finished, approved or rejected. */
  @ManyToOne(() => ApprovalStage, { nullable: true, deleteRule: 'set null' })
  currentStage: ApprovalStage | null = null;

  /**
   * Increments on every rejection. Events carry the round they were recorded in, so a
   * rejection resets progress by making earlier approvals belong to a past round rather
   * than by deleting them or comparing timestamps.
   */
  @Property()
  approvalRound: number = 0;

  @Property({ onCreate: () => new Date() })
  createdAt: Date = new Date();

  @Property({ onCreate: () => new Date(), onUpdate: () => new Date() })
  updatedAt: Date = new Date();
}
