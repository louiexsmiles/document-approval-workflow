import type { DocumentStatus, StageApprovalPolicy, StageRejectBehavior } from './api';

// Stage names are data now — whatever the customer typed — so there is no label map for
// them. Only the values the system itself defines get one.

export const STATUS_LABELS: Record<DocumentStatus, string> = {
  IN_PROGRESS: 'In Progress',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
};

export const POLICY_LABELS: Record<StageApprovalPolicy, string> = {
  ANY: 'Any approver',
  ALL: 'All approvers',
};

export const REJECT_BEHAVIOR_LABELS: Record<StageRejectBehavior, string> = {
  TO_FIRST_STAGE: 'Back to the first stage',
  TO_PREVIOUS_STAGE: 'Back one stage',
  TO_SPECIFIC_STAGE: 'Back to a chosen stage',
  TERMINAL: 'Rejected outright',
};
