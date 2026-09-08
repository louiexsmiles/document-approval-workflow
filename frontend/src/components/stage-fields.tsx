'use client';

import type {
  StageApprovalPolicy,
  StageInput,
  StageRejectBehavior,
  User,
} from '@/lib/api';
import { POLICY_LABELS, REJECT_BEHAVIOR_LABELS } from '@/lib/labels';

export type StageDraft = {
  /** React key. Also the server-side id when this stage already exists. */
  key: string;
  id?: string;
  name: string;
  approverIds: string[];
  policy: StageApprovalPolicy;
  rejectBehavior: StageRejectBehavior;
  /**
   * Which stage a rejection returns to, held as that stage's draft key rather than its
   * position. Positions shift when stages move or are removed; a key does not, so a
   * reorder cannot quietly repoint a rejection at a different stage.
   */
  rejectTargetKey?: string | null;
  /** Set when the stage holds approvals in the current round and cannot be changed. */
  locked?: boolean;
};

let nextKey = 0;
export function blankStage(name = ''): StageDraft {
  nextKey += 1;
  return {
    key: `stage-${nextKey}`,
    name,
    approverIds: [],
    policy: 'ANY',
    rejectBehavior: 'TO_FIRST_STAGE',
  };
}

/** Mirrors the API's rules so the person is told before the round trip. */
export function firstStageProblem(stages: StageDraft[]): string | null {
  if (stages.length === 0) return 'A document needs at least one approval stage.';

  for (const [index, stage] of stages.entries()) {
    const label = stage.name.trim() || `Stage ${index + 1}`;

    if (!stage.name.trim()) return `Stage ${index + 1} needs a name.`;
    if (stage.approverIds.length === 0) {
      return `"${label}" has no approvers, so nobody could ever act on it.`;
    }

    if (stage.rejectBehavior === 'TO_SPECIFIC_STAGE') {
      const target = stages.findIndex((s) => s.key === stage.rejectTargetKey);

      if (target === -1) {
        return `"${label}" sends rejections to a chosen stage, but none is selected.`;
      }
      // The server refuses a target at or after the rejecting stage — a rejection that
      // moved a document forward would not be a rejection. Reordering can create this.
      if (target >= index) {
        return `"${label}" cannot send a rejection forward to "${stages[target].name.trim()}".`;
      }
    }
  }
  return null;
}

/**
 * Drafts to the shape the API takes. Reject targets are sent as positions, so the key is
 * resolved to an index here — the one place that conversion happens.
 */
export function toStageInputs(stages: StageDraft[]): StageInput[] {
  return stages.map((stage) => {
    const input: StageInput = {
      ...(stage.id ? { id: stage.id } : {}),
      name: stage.name.trim(),
      approverIds: stage.approverIds,
      policy: stage.policy,
      rejectBehavior: stage.rejectBehavior,
    };

    if (stage.rejectBehavior === 'TO_SPECIFIC_STAGE') {
      const target = stages.findIndex((s) => s.key === stage.rejectTargetKey);
      if (target !== -1) input.rejectTargetPosition = target;
    }
    return input;
  });
}

/** Swap a stage with its neighbour. Returns the list unchanged at either end. */
export function moveStage(
  stages: StageDraft[],
  index: number,
  direction: -1 | 1,
): StageDraft[] {
  const target = index + direction;
  if (target < 0 || target >= stages.length) return stages;

  const next = [...stages];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

type Props = {
  stage: StageDraft;
  index: number;
  total: number;
  users: User[];
  /** Every stage ahead of this one — the only legal targets for a rejection. */
  earlierStages: { key: string; name: string }[];
  onChange: (patch: Partial<StageDraft>) => void;
  onToggleApprover: (userId: string) => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
};

/**
 * One editable stage. Shared by the create form and the editor on a document, so the two
 * cannot drift apart.
 */
export function StageFields({
  stage,
  index,
  total,
  users,
  earlierStages,
  onChange,
  onToggleApprover,
  onMove,
  onRemove,
}: Props) {
  const locked = stage.locked === true;

  return (
    <li
      className={`rounded-xl border p-4 ${
        locked ? 'border-stone-200 bg-stone-50' : 'border-stone-200'
      }`}
    >
      <div className="flex items-start gap-3">
        <span className="mt-2 w-6 shrink-0 text-sm font-semibold text-stone-400">
          {index + 1}
        </span>

        <div className="min-w-0 flex-1 space-y-4">
          {locked && (
            <p className="text-xs font-medium text-stone-500">
              Already approved this round — locked until the document is sent back.
            </p>
          )}

          <input
            value={stage.name}
            onChange={(event) => onChange({ name: event.target.value })}
            disabled={locked}
            className="input disabled:bg-stone-100 disabled:text-stone-500"
            placeholder="Stage name, e.g. Legal Review"
            aria-label={`Name for stage ${index + 1}`}
          />

          <fieldset disabled={locked}>
            <legend className="field-label mb-2">Approvers</legend>
            <div className="flex flex-wrap gap-2">
              {users.map((user) => {
                const checked = stage.approverIds.includes(user.id);
                return (
                  <label
                    key={user.id}
                    className={`rounded-full border px-3 py-1.5 text-sm transition ${
                      locked ? 'cursor-default' : 'cursor-pointer'
                    } ${
                      checked
                        ? 'border-stone-900 bg-stone-900 text-white'
                        : 'border-stone-300 text-stone-700 hover:border-stone-400'
                    } ${locked && !checked ? 'opacity-40' : ''}`}
                  >
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={checked}
                      onChange={() => onToggleApprover(user.id)}
                    />
                    {user.name}
                  </label>
                );
              })}
            </div>
          </fieldset>

          {/* Only meaningful once more than one person is assigned. */}
          {stage.approverIds.length > 1 && (
            <label className="field">
              <span className="field-label">How many must approve</span>
              <select
                value={stage.policy}
                onChange={(event) =>
                  onChange({ policy: event.target.value as StageApprovalPolicy })
                }
                disabled={locked}
                className="input disabled:bg-stone-100 disabled:text-stone-500"
              >
                <option value="ANY">{POLICY_LABELS.ANY}</option>
                <option value="ALL">{POLICY_LABELS.ALL}</option>
              </select>
            </label>
          )}

          <label className="field">
            <span className="field-label">If rejected here</span>
            <select
              value={stage.rejectBehavior}
              onChange={(event) =>
                onChange({ rejectBehavior: event.target.value as StageRejectBehavior })
              }
              disabled={locked}
              className="input disabled:bg-stone-100 disabled:text-stone-500"
              aria-label={`Reject behaviour for stage ${index + 1}`}
            >
              <option value="TO_FIRST_STAGE">{REJECT_BEHAVIOR_LABELS.TO_FIRST_STAGE}</option>
              <option value="TO_PREVIOUS_STAGE">
                {REJECT_BEHAVIOR_LABELS.TO_PREVIOUS_STAGE}
              </option>
              {/* Nothing precedes the first stage, so there is nothing to choose. */}
              {earlierStages.length > 0 && (
                <option value="TO_SPECIFIC_STAGE">
                  {REJECT_BEHAVIOR_LABELS.TO_SPECIFIC_STAGE}
                </option>
              )}
              <option value="TERMINAL">{REJECT_BEHAVIOR_LABELS.TERMINAL}</option>
            </select>
          </label>

          {stage.rejectBehavior === 'TO_SPECIFIC_STAGE' && earlierStages.length > 0 && (
            <label className="field">
              <span className="field-label">Send it back to</span>
              <select
                value={stage.rejectTargetKey ?? ''}
                onChange={(event) =>
                  onChange({ rejectTargetKey: event.target.value || null })
                }
                disabled={locked}
                className="input disabled:bg-stone-100 disabled:text-stone-500"
                aria-label={`Reject target for stage ${index + 1}`}
              >
                <option value="">Choose a stage…</option>
                {earlierStages.map((earlier, position) => (
                  <option key={earlier.key} value={earlier.key}>
                    {position + 1}. {earlier.name.trim() || 'Untitled stage'}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        <div className="flex shrink-0 flex-col gap-1">
          <button
            type="button"
            onClick={() => onMove(-1)}
            disabled={locked || index === 0}
            className="rounded px-2 py-1 text-stone-500 hover:bg-stone-100 disabled:opacity-30"
            aria-label={`Move stage ${index + 1} earlier`}
          >
            ↑
          </button>
          <button
            type="button"
            onClick={() => onMove(1)}
            disabled={locked || index === total - 1}
            className="rounded px-2 py-1 text-stone-500 hover:bg-stone-100 disabled:opacity-30"
            aria-label={`Move stage ${index + 1} later`}
          >
            ↓
          </button>
          <button
            type="button"
            onClick={onRemove}
            disabled={locked || total === 1}
            className="rounded px-2 py-1 text-stone-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30"
            aria-label={`Remove stage ${index + 1}`}
          >
            ✕
          </button>
        </div>
      </div>
    </li>
  );
}
