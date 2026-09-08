import type { DocumentDetail, Stage } from '@/lib/api';
import { currentStageOf, orderedStages } from '@/lib/api';
import { POLICY_LABELS, REJECT_BEHAVIOR_LABELS } from '@/lib/labels';

type StageState = 'current' | 'passed' | 'pending' | 'closed';

/**
 * Where a rejection at this stage sends the document, in words. Named targets are looked
 * up so the reader sees "back to Budget Review" rather than an id, and the default is
 * skipped: saying it on every stage would drown the ones that differ.
 */
function rejectSummary(stage: Stage, stages: Stage[]): string | null {
  if (stage.rejectBehavior === 'TO_FIRST_STAGE') return null;

  if (stage.rejectBehavior === 'TO_SPECIFIC_STAGE') {
    const target = stages.find((s) => s.id === stage.rejectTargetStage);
    return target ? `Rejecting sends it back to ${target.name}` : null;
  }
  if (stage.rejectBehavior === 'TO_PREVIOUS_STAGE') return 'Rejecting sends it back one stage';
  return 'Rejecting refuses the document outright';
}

/**
 * Where a stage sits relative to the document's progress. Derived from positions rather
 * than a hardcoded order, so it works for however many stages a document has.
 */
function stateOf(document: DocumentDetail, stage: Stage): StageState {
  if (document.status === 'REJECTED') return 'closed';
  if (document.status === 'APPROVED') return 'passed';

  const current = currentStageOf(document);
  if (!current) return 'pending';
  if (stage.id === current.id) return 'current';
  return stage.position < current.position ? 'passed' : 'pending';
}

const STATE_LABELS: Record<StageState, string> = {
  current: 'Current',
  passed: 'Passed',
  pending: 'Pending',
  closed: 'Closed',
};

export function StageList({ document }: { document: DocumentDetail }) {
  const stages = orderedStages(document);

  return (
    <ol className="space-y-3">
      {stages.map((stage) => {
        const state = stateOf(document, stage);

        return (
          <li
            key={stage.id}
            className={`card px-5 py-4 ${
              state === 'current' ? 'border-stone-900 shadow-md' : ''
            }`}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-stone-900">
                  {stage.position + 1}. {stage.name}
                </div>

                <ul className="mt-1.5 space-y-0.5">
                  {stage.approvers.map((approver) => (
                    <li key={approver.id} className="text-sm text-stone-600">
                      {approver.user.name}
                    </li>
                  ))}
                </ul>

                {/* Only worth saying when more than one person is involved. */}
                {stage.approvers.length > 1 && (
                  <div className="mt-1.5 text-xs text-stone-500">
                    {POLICY_LABELS[stage.policy]} must approve
                  </div>
                )}

                {rejectSummary(stage, stages) && (
                  <div className="mt-1 text-xs text-stone-500">
                    {rejectSummary(stage, stages)}
                  </div>
                )}
              </div>

              <span className="shrink-0 text-xs font-medium text-stone-500">
                {STATE_LABELS[state]}
              </span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
