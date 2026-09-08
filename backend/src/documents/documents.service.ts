import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { LockMode } from '@mikro-orm/core';
import { EntityManager } from '@mikro-orm/postgresql';
import { User } from '../users/user.entity';
import { ApprovalAction } from './approval-action.enum';
import {
  ApprovalEvent,
  type StageSnapshot as StageSnapshotRecord,
} from './approval-event.entity';
import { ApprovalStage } from './approval-stage.entity';
import { Document } from './document.entity';
import { StageApprover } from './stage-approver.entity';
import { DocumentStatus } from './document-status.enum';
import { CreateDocumentDto, CreateStageDto } from './dto/create-document.dto';
import { UpdateStageDto, UpdateStagesDto } from './dto/update-stages.dto';
import { StageApprovalPolicy } from './stage-approval-policy.enum';
import { StageRejectBehavior } from './stage-reject-behavior.enum';
import { isStageComplete, type ActionRecord } from './stage-evaluator';

@Injectable()
export class DocumentsService {
  constructor(private readonly em: EntityManager) {}

  async findAll() {
    const documents = await this.em.find(
      Document,
      {},
      { populate: ['currentStage'], orderBy: { createdAt: 'DESC' } },
    );

    return documents.map((doc) => ({
      id: doc.id,
      title: doc.title,
      status: doc.status,
      currentStage: doc.currentStage
        ? { id: doc.currentStage.id, name: doc.currentStage.name }
        : null,
    }));
  }

  async findOne(id: string): Promise<Document> {
    const document = await this.em.findOne(
      Document,
      { id },
      { populate: ['stages', 'stages.approvers', 'stages.approvers.user', 'currentStage'] },
    );

    if (!document) {
      throw new NotFoundException(`Document ${id} not found`);
    }
    return document;
  }

  async history(id: string): Promise<ApprovalEvent[]> {
    await this.findOne(id);
    return this.em.find(
      ApprovalEvent,
      { document: id },
      { populate: ['actor', 'stage'], orderBy: { createdAt: 'ASC' } },
    );
  }

  async create(dto: CreateDocumentDto): Promise<Document> {
    const approverIds = [...new Set(dto.stages.flatMap((stage) => stage.approverIds))];

    // Everything is built on the transaction's own EntityManager. A document is inserted
    // before its stages exist, so for a moment it is in progress with no current stage —
    // the deferred trigger only judges the state at commit, by which time the pointer is
    // set. Creating on the outer manager would leave that final assignment untracked.
    const document = await this.em.transactional(async (em) => {
      const users = await em.find(User, { id: { $in: approverIds } });
      if (users.length !== approverIds.length) {
        throw new BadRequestException('One or more approvers do not exist');
      }

      const created = em.create(Document, { title: dto.title, body: dto.body });

      const stages = dto.stages.map((input, position) => {
        const stage = em.create(ApprovalStage, {
          document: created,
          position,
          name: input.name,
          policy: input.policy ?? StageApprovalPolicy.ANY,
          rejectBehavior: input.rejectBehavior ?? StageRejectBehavior.TO_FIRST_STAGE,
        });

        // Set() because the same person listed twice would break the unique constraint
        // on (stage, user).
        for (const userId of new Set(input.approverIds)) {
          em.create(StageApprover, { stage, user: em.getReference(User, userId) });
        }
        return stage;
      });

      this.resolveRejectTargets(dto.stages, stages);
      created.currentStage = stages[0];

      return created;
    });

    return this.findOne(document.id);
  }

  /** A stage may only reject backwards, so the target must already exist in the list. */
  private resolveRejectTargets(
    inputs: CreateStageDto[],
    stages: ApprovalStage[],
  ): void {
    inputs.forEach((input, position) => {
      if (input.rejectBehavior !== StageRejectBehavior.TO_SPECIFIC_STAGE) {
        return;
      }

      const target = stages[input.rejectTargetPosition ?? -1];
      if (!target) {
        throw new BadRequestException(
          `Stage ${position} rejects to position ${input.rejectTargetPosition}, which does not exist`,
        );
      }
      if (target.position >= position) {
        throw new BadRequestException(
          `Stage ${position} cannot reject forward to position ${target.position}`,
        );
      }

      stages[position].rejectTargetStage = target;
    });
  }

  /**
   * Replace a document's workflow with the list given.
   *
   * Stages carrying an id are kept, stages without one are added, and anything omitted is
   * deleted. A stage holding approvals in the current round cannot be touched — a
   * rejection starts a new round, which is what makes a badly configured stage fixable.
   */
  async updateStages(id: string, dto: UpdateStagesDto): Promise<Document> {
    await this.em.transactional(async (em) => {
      const document = await this.lockDocument(em, id);

      if (document.status !== DocumentStatus.IN_PROGRESS) {
        throw new BadRequestException(
          `Cannot change the workflow of a document that is ${document.status}`,
        );
      }

      const existing = new Map(
        document.stages.getItems().map((stage) => [stage.id, stage]),
      );
      const events = toRecords(await this.loadEvents(em, id));
      const locked = new Set(
        events
          .filter(
            (e) =>
              e.round === document.approvalRound &&
              e.action === ApprovalAction.APPROVE &&
              e.stageId,
          )
          .map((e) => e.stageId as string),
      );

      this.assertStagesAreEditable(dto, document, existing, locked);
      await this.assertApproversExist(em, dto.stages);

      // Anything the client left out goes. Locked stages and the current stage were
      // already refused above, so nothing being removed here is in use.
      for (const [stageId, stage] of existing) {
        if (!dto.stages.some((input) => input.id === stageId)) {
          em.remove(stage);
        }
      }

      const stages = dto.stages.map((input, position) =>
        input.id
          ? this.applyStageEdit(em, existing.get(input.id)!, input, position)
          : this.buildStage(em, document, input, position),
      );

      this.resolveRejectTargets(dto.stages, stages);
    });

    return this.findOne(id);
  }

  /** Everything the caller is not allowed to do, checked before anything is written. */
  private assertStagesAreEditable(
    dto: UpdateStagesDto,
    document: Document,
    existing: Map<string, ApprovalStage>,
    locked: Set<string>,
  ): void {
    const kept = new Set<string>();

    dto.stages.forEach((input, position) => {
      if (!input.id) {
        return;
      }
      if (!existing.has(input.id)) {
        throw new BadRequestException(
          `Stage ${input.id} does not belong to this document`,
        );
      }
      if (kept.has(input.id)) {
        throw new BadRequestException(`Stage ${input.id} appears more than once`);
      }
      kept.add(input.id);

      if (locked.has(input.id) && this.stageChanged(existing.get(input.id)!, input, position)) {
        throw new ConflictException(
          `Stage "${existing.get(input.id)!.name}" has approvals in this round and cannot be changed`,
        );
      }
    });

    for (const stageId of locked) {
      if (!kept.has(stageId)) {
        throw new ConflictException(
          `Stage "${existing.get(stageId)?.name}" has approvals in this round and cannot be removed`,
        );
      }
    }

    if (document.currentStage && !kept.has(document.currentStage.id)) {
      throw new ConflictException(
        'Cannot remove the stage this document is currently waiting at',
      );
    }

    // A stage that ends up behind the document can never be reached, so nobody would ever
    // approve it. Comparing earlier positions catches both new stages and reordered ones.
    if (document.currentStage) {
      const wasBehind = (input: UpdateStageDto): boolean => {
        const before = input.id ? existing.get(input.id) : undefined;
        return before !== undefined && before.position < document.currentStage!.position;
      };

      const waitingAt = dto.stages.findIndex(
        (input) => input.id === document.currentStage!.id,
      );
      const stranded = dto.stages.findIndex(
        (input, position) => position < waitingAt && !wasBehind(input),
      );

      if (stranded !== -1) {
        throw new ConflictException(
          `"${dto.stages[stranded].name}" would sit behind the stage this document is waiting at, so nobody could ever approve it`,
        );
      }
    }
  }

  /** True if anything a locked stage is meant to freeze would move. */
  private stageChanged(
    stage: ApprovalStage,
    input: UpdateStageDto,
    position: number,
  ): boolean {
    const before = stage.approvers.getItems().map((a) => a.user.id).sort();
    const after = [...new Set(input.approverIds)].sort();

    return (
      stage.name !== input.name ||
      stage.position !== position ||
      stage.policy !== (input.policy ?? stage.policy) ||
      stage.rejectBehavior !== (input.rejectBehavior ?? stage.rejectBehavior) ||
      before.length !== after.length ||
      before.some((userId, i) => userId !== after[i])
    );
  }

  private applyStageEdit(
    em: EntityManager,
    stage: ApprovalStage,
    input: UpdateStageDto,
    position: number,
  ): ApprovalStage {
    stage.position = position;
    stage.name = input.name;
    stage.policy = input.policy ?? StageApprovalPolicy.ANY;
    stage.rejectBehavior = input.rejectBehavior ?? StageRejectBehavior.TO_FIRST_STAGE;
    stage.rejectTargetStage = null;

    const wanted = new Set(input.approverIds);
    for (const approver of stage.approvers.getItems()) {
      if (wanted.has(approver.user.id)) {
        wanted.delete(approver.user.id);
      } else {
        em.remove(approver);
      }
    }
    for (const userId of wanted) {
      em.create(StageApprover, { stage, user: em.getReference(User, userId) });
    }

    return stage;
  }

  private buildStage(
    em: EntityManager,
    document: Document,
    input: UpdateStageDto,
    position: number,
  ): ApprovalStage {
    const stage = em.create(ApprovalStage, {
      document,
      position,
      name: input.name,
      policy: input.policy ?? StageApprovalPolicy.ANY,
      rejectBehavior: input.rejectBehavior ?? StageRejectBehavior.TO_FIRST_STAGE,
    });

    for (const userId of new Set(input.approverIds)) {
      em.create(StageApprover, { stage, user: em.getReference(User, userId) });
    }
    return stage;
  }

  private async assertApproversExist(
    em: EntityManager,
    stages: { approverIds: string[] }[],
  ): Promise<void> {
    const ids = [...new Set(stages.flatMap((stage) => stage.approverIds))];
    const users = await em.find(User, { id: { $in: ids } });

    if (users.length !== ids.length) {
      throw new BadRequestException('One or more approvers do not exist');
    }
  }

  /**
   * Approve on behalf of a user.
   *
   * Runs in a transaction holding a write lock on the document row. With an ALL stage
   * several approvers are authorised at once, so without the lock two requests can read
   * the same state, both decide the stage is unfinished, and the document never advances.
   */
  async approve(id: string, userId: string, comment?: string): Promise<Document> {
    await this.em.transactional(async (em) => {
      const document = await this.lockDocument(em, id);
      const stage = this.requireActionableStage(document);
      this.requireApprover(stage, userId);

      const records = toRecords(await this.loadEvents(em, id));

      // Approving twice changes nothing. Returning an error instead would make a
      // double-click or a retried request look like a failure.
      const alreadyApproved = records.some(
        (record) =>
          record.round === document.approvalRound &&
          record.stageId === stage.id &&
          record.actorId === userId &&
          record.action === ApprovalAction.APPROVE,
      );

      if (!alreadyApproved) {
        const record = {
          stageId: stage.id,
          actorId: userId,
          action: ApprovalAction.APPROVE,
          round: document.approvalRound,
        };

        em.create(ApprovalEvent, {
          document,
          stage,
          actor: em.getReference(User, userId),
          action: record.action,
          comment: comment ?? null,
          round: record.round,
          stageSnapshot: stageSnapshot(stage),
        });

        // Added in memory rather than re-reading. The transaction flushes on commit.
        records.push(record);
      }

      if (isStageComplete(snapshot(stage), records, document.approvalRound)) {
        this.advance(document, stage);
      }
    });

    return this.findOne(id);
  }

  /** Reject on behalf of a user. Where the document lands is a property of the stage. */
  async reject(id: string, userId: string, comment: string): Promise<Document> {
    await this.em.transactional(async (em) => {
      const document = await this.lockDocument(em, id);
      const stage = this.requireActionableStage(document);
      this.requireApprover(stage, userId);

      em.create(ApprovalEvent, {
        document,
        stage,
        actor: em.getReference(User, userId),
        action: ApprovalAction.REJECT,
        comment,
        round: document.approvalRound,
        stageSnapshot: stageSnapshot(stage),
      });

      // A new round begins, so approvals collected before this stop counting. Nothing is
      // deleted — the events stay, they just belong to a past round.
      document.approvalRound += 1;
      this.applyRejectBehavior(document, stage);
    });

    return this.findOne(id);
  }

  private async lockDocument(em: EntityManager, id: string): Promise<Document> {
    const document = await em.findOne(
      Document,
      { id },
      { populate: ['stages', 'stages.approvers'], lockMode: LockMode.PESSIMISTIC_WRITE },
    );

    if (!document) {
      throw new NotFoundException(`Document ${id} not found`);
    }
    return document;
  }

  private async loadEvents(em: EntityManager, id: string): Promise<ApprovalEvent[]> {
    return em.find(ApprovalEvent, { document: id }, { populate: ['actor', 'stage'] });
  }

  private requireActionableStage(document: Document): ApprovalStage {
    if (document.status !== DocumentStatus.IN_PROGRESS || !document.currentStage) {
      throw new BadRequestException(
        `Cannot act on a document that is ${document.status}`,
      );
    }
    return document.currentStage;
  }

  private requireApprover(stage: ApprovalStage, userId: string): void {
    const approvers = stage.approvers.getItems().map((a) => a.user.id);

    if (!approvers.includes(userId)) {
      throw new ForbiddenException(
        'Only an approver assigned to the current stage may act on this document',
      );
    }
  }

  private orderedStages(document: Document): ApprovalStage[] {
    return document.stages.getItems().sort((a, b) => a.position - b.position);
  }

  private advance(document: Document, completed: ApprovalStage): void {
    const next = this.orderedStages(document).find(
      (stage) => stage.position > completed.position,
    );

    document.currentStage = next ?? null;
    if (!next) {
      document.status = DocumentStatus.APPROVED;
    }
  }

  private applyRejectBehavior(document: Document, stage: ApprovalStage): void {
    const stages = this.orderedStages(document);

    switch (stage.rejectBehavior) {
      case StageRejectBehavior.TERMINAL:
        document.status = DocumentStatus.REJECTED;
        document.currentStage = null;
        return;

      case StageRejectBehavior.TO_PREVIOUS_STAGE:
        // Rejecting at the first stage leaves the document where it is. There is nowhere
        // earlier to send it, and the author revises in place.
        document.currentStage =
          stages.find((s) => s.position === stage.position - 1) ?? stage;
        return;

      case StageRejectBehavior.TO_SPECIFIC_STAGE:
        // The target is nullable, and the foreign key clears it if that stage is deleted.
        document.currentStage = stage.rejectTargetStage ?? stages[0];
        return;

      case StageRejectBehavior.TO_FIRST_STAGE:
        document.currentStage = stages[0];
        return;

      default: {
        // never only accepts a value the compiler has proved impossible. Add a reject
        // behaviour without handling it here and this stops compiling, rather than
        // silently leaving the document where it was.
        const unhandled: never = stage.rejectBehavior;
        throw new Error(`Unhandled reject behaviour: ${String(unhandled)}`);
      }
    }
  }
}

function snapshot(stage: ApprovalStage) {
  return {
    id: stage.id,
    policy: stage.policy,
    approverIds: stage.approvers.getItems().map((a) => a.user.id),
  };
}

/** The stage as it stands now, recorded onto the event so history cannot drift. */
function stageSnapshot(stage: ApprovalStage): StageSnapshotRecord {
  return {
    name: stage.name,
    policy: stage.policy,
    approverIds: stage.approvers.getItems().map((a) => a.user.id),
  };
}

function toRecords(events: ApprovalEvent[]): ActionRecord[] {
  return events.map((event) => ({
    stageId: event.stage?.id ?? null,
    actorId: event.actor.id,
    action: event.action,
    round: event.round,
  }));
}
