import { ApprovalAction } from './approval-action.enum';
import { StageApprovalPolicy } from './stage-approval-policy.enum';
import {
  approversWhoApproved,
  isStageComplete,
  type ActionRecord,
  type StageSnapshot,
} from './stage-evaluator';

const ALICE = 'user-alice';
const BOB = 'user-bob';
const CARA = 'user-cara';

function stage(
  policy: StageApprovalPolicy,
  approverIds: string[],
  id = 'stage-1',
): StageSnapshot {
  return { id, policy, approverIds };
}

function approval(actorId: string, stageId = 'stage-1', round = 0): ActionRecord {
  return { stageId, actorId, action: ApprovalAction.APPROVE, round };
}

function rejection(actorId: string, stageId = 'stage-1', round = 0): ActionRecord {
  return { stageId, actorId, action: ApprovalAction.REJECT, round };
}

describe('isStageComplete', () => {
  describe('ANY policy', () => {
    const any = stage(StageApprovalPolicy.ANY, [ALICE, BOB, CARA]);

    it('is incomplete with no approvals', () => {
      expect(isStageComplete(any, [], 0)).toBe(false);
    });

    it('is complete once a single assigned approver approves', () => {
      expect(isStageComplete(any, [approval(BOB)], 0)).toBe(true);
    });

    it('ignores approvals from people who are not assigned to the stage', () => {
      expect(isStageComplete(any, [approval('user-stranger')], 0)).toBe(false);
    });
  });

  describe('ALL policy', () => {
    const all = stage(StageApprovalPolicy.ALL, [ALICE, BOB, CARA]);

    it('is incomplete while anyone has not approved', () => {
      expect(isStageComplete(all, [approval(ALICE), approval(BOB)], 0)).toBe(false);
    });

    it('is complete once everyone has approved', () => {
      const events = [approval(ALICE), approval(BOB), approval(CARA)];
      expect(isStageComplete(all, events, 0)).toBe(true);
    });

    it('does not care what order people approve in', () => {
      const events = [approval(CARA), approval(ALICE), approval(BOB)];
      expect(isStageComplete(all, events, 0)).toBe(true);
    });

    it('counts each person once however many times they approve', () => {
      const events = [approval(ALICE), approval(ALICE), approval(ALICE)];
      expect(isStageComplete(all, events, 0)).toBe(false);
    });
  });

  describe('what does not count', () => {
    const all = stage(StageApprovalPolicy.ALL, [ALICE, BOB]);

    it('ignores approvals recorded against a different stage', () => {
      const events = [approval(ALICE), approval(BOB, 'stage-2')];
      expect(isStageComplete(all, events, 0)).toBe(false);
    });

    it('ignores approvals from an earlier round', () => {
      // Everyone approved, then the document was rejected and is now in round 1.
      const events = [approval(ALICE, 'stage-1', 0), approval(BOB, 'stage-1', 0)];
      expect(isStageComplete(all, events, 1)).toBe(false);
    });

    it('counts approvals from the current round after a rejection', () => {
      const events = [
        approval(ALICE, 'stage-1', 0),
        rejection(BOB, 'stage-1', 0),
        approval(ALICE, 'stage-1', 1),
        approval(BOB, 'stage-1', 1),
      ];
      expect(isStageComplete(all, events, 1)).toBe(true);
    });

    it('does not treat a rejection as an approval', () => {
      const any = stage(StageApprovalPolicy.ANY, [ALICE]);
      expect(isStageComplete(any, [rejection(ALICE)], 0)).toBe(false);
    });

    it('ignores document-level events that belong to no stage', () => {
      const any = stage(StageApprovalPolicy.ANY, [ALICE]);
      const events: ActionRecord[] = [
        { stageId: null, actorId: ALICE, action: ApprovalAction.APPROVE, round: 0 },
      ];
      expect(isStageComplete(any, events, 0)).toBe(false);
    });
  });

  describe('degenerate stages', () => {
    it('never completes a stage with no approvers, even under ALL', () => {
      // ALL of nobody is vacuously true, which would silently advance past a stage
      // that no one can act on. Validation blocks these; this is the safety net.
      expect(isStageComplete(stage(StageApprovalPolicy.ALL, []), [], 0)).toBe(false);
    });

    it('completes a single-approver ALL stage like an ANY stage', () => {
      const solo = stage(StageApprovalPolicy.ALL, [ALICE]);
      expect(isStageComplete(solo, [approval(ALICE)], 0)).toBe(true);
    });
  });
});

describe('approversWhoApproved', () => {
  const all = stage(StageApprovalPolicy.ALL, [ALICE, BOB, CARA]);

  it('reports who has approved so far, for progress display', () => {
    const approved = approversWhoApproved(all, [approval(CARA), approval(ALICE)], 0);
    expect(approved.sort()).toEqual([ALICE, CARA].sort());
  });

  it('deduplicates repeat approvals from the same person', () => {
    expect(approversWhoApproved(all, [approval(BOB), approval(BOB)], 0)).toEqual([BOB]);
  });
});
