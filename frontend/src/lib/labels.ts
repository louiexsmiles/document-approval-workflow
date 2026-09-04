import type { DocumentStage, DocumentStatus } from './api';

export const STAGE_LABELS: Record<DocumentStage, string> = {
  DRAFT_REVIEW: 'Draft Review',
  LEGAL_REVIEW: 'Legal Review',
  FINAL_APPROVAL: 'Final Approval',
};

export const STATUS_LABELS: Record<DocumentStatus, string> = {
  IN_PROGRESS: 'In Progress',
  APPROVED: 'Approved',
};

export const STAGES: DocumentStage[] = [
  'DRAFT_REVIEW',
  'LEGAL_REVIEW',
  'FINAL_APPROVAL',
];
