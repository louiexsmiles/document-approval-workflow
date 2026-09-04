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
import { User } from '../users/user.entity';
import { ApprovalStage } from './approval-stage.entity';
import { DocumentStage } from './document-stage.enum';
import { DocumentStatus } from './document-status.enum';

@Entity({ tableName: 'documents' })
export class Document {
  [OptionalProps]?:
    | 'id'
    | 'currentStage'
    | 'status'
    | 'createdAt'
    | 'updatedAt';

  @PrimaryKey({ type: 'uuid' })
  id: string = randomUUID();

  @Property()
  title!: string;

  @Property({ type: 'text' })
  body!: string;

  @Enum(() => DocumentStage)
  currentStage: DocumentStage = DocumentStage.DRAFT_REVIEW;

  @Enum(() => DocumentStatus)
  status: DocumentStatus = DocumentStatus.IN_PROGRESS;

  @ManyToOne(() => User)
  draftReviewApprover!: User;

  @ManyToOne(() => User)
  legalReviewApprover!: User;

  @ManyToOne(() => User)
  finalApprovalApprover!: User;

  /**
   * The document's own workflow, ordered by position. Empty until the data migration
   * backfills it; the three approver columns above are removed once the service reads
   * from here instead.
   */
  @OneToMany(() => ApprovalStage, (stage) => stage.document, {
    orphanRemoval: true,
  })
  stages = new Collection<ApprovalStage>(this);

  @Property({ onCreate: () => new Date() })
  createdAt: Date = new Date();

  @Property({ onCreate: () => new Date(), onUpdate: () => new Date() })
  updatedAt: Date = new Date();
}
