import type { DocumentDetail, Stage } from '@/lib/api';
import { currentStageOf, orderedStages } from '@/lib/api';
import { POLICY_LABELS } from '@/lib/labels';

type StageState = 'current' | 'passed' | 'pending' | 'closed';

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
