import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { UsersService } from '../users/users.service';
import { Document } from './document.entity';
import { DocumentStage } from './document-stage.enum';
import { DocumentStatus } from './document-status.enum';
import { CreateDocumentDto } from './dto/create-document.dto';

const STAGE_ORDER: DocumentStage[] = [
  DocumentStage.DRAFT_REVIEW,
  DocumentStage.LEGAL_REVIEW,
  DocumentStage.FINAL_APPROVAL,
];

@Injectable()
export class DocumentsService {
  constructor(
    private readonly em: EntityManager,
    private readonly usersService: UsersService,
  ) {}

  async findAll(): Promise<
    Pick<Document, 'id' | 'title' | 'currentStage' | 'status'>[]
  > {
    const documents = await this.em.find(
      Document,
      {},
      { orderBy: { createdAt: 'DESC' } },
    );
    return documents.map((doc) => ({
      id: doc.id,
      title: doc.title,
      currentStage: doc.currentStage,
      status: doc.status,
    }));
  }

  async findOne(id: string): Promise<Document> {
    const document = await this.em.findOne(
      Document,
      { id },
      {
        populate: [
          'draftReviewApprover',
          'legalReviewApprover',
          'finalApprovalApprover',
        ],
      },
    );
    if (!document) {
      throw new NotFoundException(`Document ${id} not found`);
    }
    return document;
  }

  async create(dto: CreateDocumentDto): Promise<Document> {
    const draftReviewApprover = await this.requireUser(
      dto.draftReviewApproverId,
    );
    const legalReviewApprover = await this.requireUser(
      dto.legalReviewApproverId,
    );
    const finalApprovalApprover = await this.requireUser(
      dto.finalApprovalApproverId,
    );

    const document = this.em.create(Document, {
      title: dto.title,
      body: dto.body,
      currentStage: DocumentStage.DRAFT_REVIEW,
      status: DocumentStatus.IN_PROGRESS,
      draftReviewApprover,
      legalReviewApprover,
      finalApprovalApprover,
    });

    await this.em.persistAndFlush(document);
    return this.findOne(document.id);
  }

  async approve(id: string, userId: string): Promise<Document> {
    const document = await this.findOne(id);
    this.assertInProgress(document);
    this.assertCurrentApprover(document, userId);

    if (document.currentStage === DocumentStage.FINAL_APPROVAL) {
      document.status = DocumentStatus.APPROVED;
    } else {
      const index = STAGE_ORDER.indexOf(document.currentStage);
      document.currentStage = STAGE_ORDER[index + 1];
    }

    await this.em.flush();
    return document;
  }

  async reject(id: string, userId: string): Promise<Document> {
    const document = await this.findOne(id);
    this.assertInProgress(document);
    this.assertCurrentApprover(document, userId);

    document.currentStage = DocumentStage.DRAFT_REVIEW;
    document.status = DocumentStatus.IN_PROGRESS;

    await this.em.flush();
    return document;
  }

  private assertInProgress(document: Document): void {
    if (document.status === DocumentStatus.APPROVED) {
      throw new BadRequestException(
        'Cannot act on a document that is already APPROVED',
      );
    }
  }

  private assertCurrentApprover(document: Document, userId: string): void {
    const currentApproverId = this.getCurrentApproverId(document);
    if (currentApproverId !== userId) {
      throw new ForbiddenException(
        'Only the assigned approver for the current stage may act on this document',
      );
    }
  }

  private getCurrentApproverId(document: Document): string {
    switch (document.currentStage) {
      case DocumentStage.DRAFT_REVIEW:
        return document.draftReviewApprover.id;
      case DocumentStage.LEGAL_REVIEW:
        return document.legalReviewApprover.id;
      case DocumentStage.FINAL_APPROVAL:
        return document.finalApprovalApprover.id;
    }
  }

  private async requireUser(id: string) {
    const user = await this.usersService.findOne(id);
    if (!user) {
      throw new BadRequestException(`User ${id} not found`);
    }
    return user;
  }
}
