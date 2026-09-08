import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { MikroORM } from '@mikro-orm/core';
import { EntityManager } from '@mikro-orm/postgresql';
import { ApprovalStage } from '../documents/approval-stage.entity';
import { Document } from '../documents/document.entity';
import { DocumentStatus } from '../documents/document-status.enum';
import { StageApprover } from '../documents/stage-approver.entity';
import { StageApprovalPolicy } from '../documents/stage-approval-policy.enum';
import { StageRejectBehavior } from '../documents/stage-reject-behavior.enum';
import { User } from '../users/user.entity';

function avatarUrlFor(name: string): string {
  return `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(name)}`;
}

type StageSeed = {
  name: string;
  approvers: User[];
  policy?: StageApprovalPolicy;
  rejectBehavior?: StageRejectBehavior;
  /** Position this stage sends a rejection to. Only read for TO_SPECIFIC_STAGE. */
  rejectTargetPosition?: number;
};

@Injectable()
export class SeedService implements OnModuleInit {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    private readonly orm: MikroORM,
    private readonly em: EntityManager,
  ) {}

  async onModuleInit() {
    await this.orm.getMigrator().up();
    await this.seed();
  }

  private async seed() {
    if ((await this.em.count(User)) > 0) {
      this.logger.log('Seed data already present, skipping create');
      return;
    }

    this.logger.log('Seeding demo data...');

    const [alice, bob, cara, dan, eve] = [
      ['Alice Chen', 'alice@example.com', 'Product Manager'],
      ['Bob Martinez', 'bob@example.com', 'Legal Counsel'],
      ['Cara Nguyen', 'cara@example.com', 'Compliance Lead'],
      ['Dan Patel', 'dan@example.com', 'Engineering Manager'],
      ['Eve Brooks', 'eve@example.com', 'General Counsel'],
    ].map(([name, email, jobTitle]) =>
      this.em.create(User, { name, email, jobTitle, avatarUrl: avatarUrlFor(name) }),
    );

    // Deliberately different shapes, so the dynamic model is visible on first boot rather
    // than needing someone to build a workflow before anything looks different.

    // Three stages, one approver each — what every document used to look like.
    this.buildDocument(
      'Vendor Onboarding Policy',
      'Draft policy covering how new vendors are evaluated and onboarded.',
      [
        { name: 'Draft Review', approvers: [alice] },
        { name: 'Legal Review', approvers: [bob] },
        { name: 'Final Approval', approvers: [cara] },
      ],
    );

    // Two stages, and the second needs everyone rather than anyone.
    this.buildDocument(
      'Data Retention Guidelines',
      'Guidelines for how long customer data is retained across products.',
      [
        { name: 'Author Review', approvers: [dan] },
        {
          name: 'Legal and Compliance',
          approvers: [bob, eve, cara],
          policy: StageApprovalPolicy.ALL,
          rejectBehavior: StageRejectBehavior.TO_PREVIOUS_STAGE,
        },
      ],
    );

    // Five stages, including one that can refuse the document outright.
    this.buildDocument(
      'Q4 Vendor Contract — Southwest Builders',
      'Annual renewal of the construction services agreement.',
      [
        { name: 'Requester Check', approvers: [alice] },
        { name: 'Budget Review', approvers: [dan] },
        {
          name: 'Legal Review',
          approvers: [bob, eve],
          policy: StageApprovalPolicy.ALL,
          // Legal sends a contract back to Budget, not to the beginning. The numbers are
          // what changed; making the requester start over would be busywork.
          rejectBehavior: StageRejectBehavior.TO_SPECIFIC_STAGE,
          rejectTargetPosition: 1,
        },
        { name: 'Compliance', approvers: [cara] },
        {
          name: 'Executive Sign-off',
          approvers: [eve],
          rejectBehavior: StageRejectBehavior.TERMINAL,
        },
      ],
    );

    // Already finished: no current stage, which is what a completed document looks like.
    const done = this.buildDocument(
      'Incident Response Playbook',
      'Fully approved playbook for responding to security incidents.',
      [
        { name: 'Draft Review', approvers: [bob] },
        { name: 'Legal Review', approvers: [cara] },
        { name: 'Final Approval', approvers: [dan] },
      ],
    );
    done.status = DocumentStatus.APPROVED;
    done.currentStage = null;

    await this.em.flush();
    this.logger.log('Seed data created (5 users, 4 documents)');
  }

  private buildDocument(title: string, body: string, stages: StageSeed[]): Document {
    const document = this.em.create(Document, { title, body });

    const created = stages.map((seed, position) => {
      const stage = this.em.create(ApprovalStage, {
        document,
        position,
        name: seed.name,
        policy: seed.policy ?? StageApprovalPolicy.ANY,
        rejectBehavior: seed.rejectBehavior ?? StageRejectBehavior.TO_FIRST_STAGE,
      });

      for (const user of seed.approvers) {
        this.em.create(StageApprover, { stage, user });
      }
      return stage;
    });

    // Second pass: a stage cannot point at a sibling that does not exist yet.
    stages.forEach((seed, position) => {
      if (seed.rejectTargetPosition !== undefined) {
        created[position].rejectTargetStage = created[seed.rejectTargetPosition];
      }
    });

    document.currentStage = created[0];
    return document;
  }
}
