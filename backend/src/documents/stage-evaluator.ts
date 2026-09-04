import { ApprovalAction } from './approval-action.enum';
import { StageApprovalPolicy } from './stage-approval-policy.enum';

/**
 * Decides whether a stage has collected the approvals it needs.
 *
 * Takes plain data rather than entities so it can be tested without a database, and so
 * the rules live in one place instead of spread across the service.
 */

export type StageSnapshot = {
  id: string;
  policy: StageApprovalPolicy;
  approverIds: string[];
};

export type ActionRecord = {
  stageId: string | null;
  actorId: string;
  action: ApprovalAction;
  round: number;
};

/**
 * Everyone who has approved this stage in the given round.
 *
 * Only assigned approvers count, and each person counts once however many times they
 * clicked. Events from other stages, other rounds, or rejections are ignored.
 */
export function approversWhoApproved(
  stage: StageSnapshot,
  events: ActionRecord[],
  round: number,
): string[] {
  const assigned = new Set(stage.approverIds);
  const approved = new Set<string>();

  for (const event of events) {
    if (
      event.round === round &&
      event.stageId === stage.id &&
      event.action === ApprovalAction.APPROVE &&
      assigned.has(event.actorId)
    ) {
      approved.add(event.actorId);
    }
  }

  return [...approved];
}

/** Whether the stage is satisfied and the document may move on. */
export function isStageComplete(
  stage: StageSnapshot,
  events: ActionRecord[],
  round: number,
): boolean {
  // A stage with no approvers is never complete.
  //
  // Without this check, ALL compares 0 approvals against 0 required, which passes so the
  // document moves past a stage nobody reviewed. Validation blocks these at creation, so
  // reaching here means something skipped it: a bad migration, or a direct database insert.
  // A stuck document gets noticed; a wrongly approved one does not. Production wise I would wrap this to a slack channel or something. 
  // Best to fail loudly for afternoon than allow a sleeping dragon to grow. 
  if (stage.approverIds.length === 0) {
    return false;
  }

  const approved = approversWhoApproved(stage, events, round);

  switch (stage.policy) {
    case StageApprovalPolicy.ANY:
      return approved.length >= 1;
    case StageApprovalPolicy.ALL:
      return approved.length === new Set(stage.approverIds).size;
  }
}
