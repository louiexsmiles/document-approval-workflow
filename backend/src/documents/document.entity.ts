import { randomUUID } from 'crypto';
import {
  Entity,
  Enum,
  ManyToOne,
  OptionalProps,
  PrimaryKey,
  Property,
} from '@mikro-orm/core';
import { User } from '../users/user.entity';
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

  @Property({ onCreate: () => new Date() })
  createdAt: Date = new Date();

  @Property({ onCreate: () => new Date(), onUpdate: () => new Date() })
  updatedAt: Date = new Date();
}
