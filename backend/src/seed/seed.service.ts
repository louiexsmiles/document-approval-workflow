import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { MikroORM } from '@mikro-orm/core';
import { EntityManager } from '@mikro-orm/postgresql';
import { Document } from '../documents/document.entity';
import { DocumentStage } from '../documents/document-stage.enum';
import { DocumentStatus } from '../documents/document-status.enum';
import { User } from '../users/user.entity';

function avatarUrlFor(name: string): string {
  return `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(name)}`;
}

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
    const userCount = await this.em.count(User);
    if (userCount > 0) {
      await this.backfillProfileFields();
      this.logger.log('Seed data already present, skipping create');
      return;
    }

    this.logger.log('Seeding demo data...');

    const alice = this.em.create(User, {
      name: 'Alice Chen',
      email: 'alice@example.com',
      jobTitle: 'Product Manager',
      avatarUrl: avatarUrlFor('Alice Chen'),
    });
    const bob = this.em.create(User, {
      name: 'Bob Martinez',
      email: 'bob@example.com',
      jobTitle: 'Legal Counsel',
      avatarUrl: avatarUrlFor('Bob Martinez'),
    });
    const cara = this.em.create(User, {
      name: 'Cara Nguyen',
      email: 'cara@example.com',
      jobTitle: 'Compliance Lead',
      avatarUrl: avatarUrlFor('Cara Nguyen'),
    });
    const dan = this.em.create(User, {
      name: 'Dan Patel',
      email: 'dan@example.com',
      jobTitle: 'Engineering Manager',
      avatarUrl: avatarUrlFor('Dan Patel'),
    });
    const eve = this.em.create(User, {
      name: 'Eve Brooks',
      email: 'eve@example.com',
      jobTitle: 'General Counsel',
      avatarUrl: avatarUrlFor('Eve Brooks'),
    });

    this.em.create(Document, {
      title: 'Vendor Onboarding Policy',
      body: 'Draft policy covering how new vendors are evaluated and onboarded.',
      currentStage: DocumentStage.DRAFT_REVIEW,
      status: DocumentStatus.IN_PROGRESS,
      draftReviewApprover: alice,
      legalReviewApprover: bob,
      finalApprovalApprover: cara,
    });

    this.em.create(Document, {
      title: 'Data Retention Guidelines',
      body: 'Guidelines for how long customer data is retained across products.',
      currentStage: DocumentStage.LEGAL_REVIEW,
      status: DocumentStatus.IN_PROGRESS,
      draftReviewApprover: dan,
      legalReviewApprover: eve,
      finalApprovalApprover: alice,
    });

    this.em.create(Document, {
      title: 'Incident Response Playbook',
      body: 'Fully approved playbook for responding to security incidents.',
      currentStage: DocumentStage.FINAL_APPROVAL,
      status: DocumentStatus.APPROVED,
      draftReviewApprover: bob,
      legalReviewApprover: cara,
      finalApprovalApprover: dan,
    });

    await this.em.flush();
    this.logger.log('Seed data created (5 users, 3 documents)');
  }

  /** Fill profile fields if an older seed volume predates these columns. */
  private async backfillProfileFields() {
    const profiles: Record<string, { jobTitle: string; name: string }> = {
      'alice@example.com': {
        name: 'Alice Chen',
        jobTitle: 'Product Manager',
      },
      'bob@example.com': {
        name: 'Bob Martinez',
        jobTitle: 'Legal Counsel',
      },
      'cara@example.com': {
        name: 'Cara Nguyen',
        jobTitle: 'Compliance Lead',
      },
      'dan@example.com': {
        name: 'Dan Patel',
        jobTitle: 'Engineering Manager',
      },
      'eve@example.com': {
        name: 'Eve Brooks',
        jobTitle: 'General Counsel',
      },
    };

    const users = await this.em.find(User, {});
    let updated = 0;
    for (const user of users) {
      const profile = profiles[user.email];
      if (!profile) continue;
      if (user.jobTitle == null || user.avatarUrl == null) {
        user.jobTitle = user.jobTitle ?? profile.jobTitle;
        user.avatarUrl = user.avatarUrl ?? avatarUrlFor(profile.name);
        updated += 1;
      }
    }
    if (updated > 0) {
      await this.em.flush();
      this.logger.log(`Backfilled profile fields for ${updated} users`);
    }
  }
}
