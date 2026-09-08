'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Spinner } from '@/components/spinner';
import {
  blankStage,
  firstStageProblem,
  moveStage,
  StageFields,
  toStageInputs,
  type StageDraft,
} from '@/components/stage-fields';
import {
  ApiError,
  orderedStages,
  updateStages,
  type DocumentDetail,
  type User,
} from '@/lib/api';

type Props = {
  document: DocumentDetail;
  users: User[];
  /**
   * Stages holding approvals in this round. Only an affordance — the server enforces the
   * same rule and will refuse regardless. Disabling the inputs saves a pointless round
   * trip and shows why.
   */
  lockedStageIds: string[];
};

function toDrafts(document: DocumentDetail, locked: string[]): StageDraft[] {
  return orderedStages(document).map((stage) => ({
    key: stage.id,
    id: stage.id,
    name: stage.name,
    approverIds: stage.approvers.map((approver) => approver.user.id),
    policy: stage.policy,
    rejectBehavior: stage.rejectBehavior,
    // Existing stages use their id as the draft key, so the target id is already a key.
    rejectTargetKey: stage.rejectTargetStage,
    locked: locked.includes(stage.id),
  }));
}

export function StageEditor({ document, users, lockedStageIds }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [stages, setStages] = useState<StageDraft[]>(() =>
    toDrafts(document, lockedStageIds),
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [refreshing, startRefresh] = useTransition();

  // The save is not done until the refreshed page has arrived, so treat both as busy.
  const busy = saving || refreshing;

  function reset() {
    setStages(toDrafts(document, lockedStageIds));
    setError(null);
  }

  function patchStage(key: string, patch: Partial<StageDraft>) {
    setStages((current) =>
      current.map((stage) => (stage.key === key ? { ...stage, ...patch } : stage)),
    );
  }

  function toggleApprover(key: string, userId: string) {
    setStages((current) =>
      current.map((stage) =>
        stage.key === key
          ? {
              ...stage,
              approverIds: stage.approverIds.includes(userId)
                ? stage.approverIds.filter((id) => id !== userId)
                : [...stage.approverIds, userId],
            }
          : stage,
      ),
    );
  }

  async function save() {
    const problem = firstStageProblem(stages);
    if (problem) {
      setError(problem);
      return;
    }

    setError(null);
    setSaving(true);

    try {
      await updateStages(document.id, toStageInputs(stages));
      // One transition, so both commit once the refresh lands. Closing on its own commits
      // immediately, and the collapsing subtree takes the pending refresh with it.
      startRefresh(() => {
        router.refresh();
        setOpen(false);
      });
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setError(err.message);
      } else {
        setError(err instanceof Error ? err.message : 'Could not save the workflow');
      }
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          reset();
          setOpen(true);
        }}
        className="btn btn-secondary w-full"
      >
        Edit workflow
      </button>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <p className="text-sm text-stone-500">
          Stages run in the order shown.
        </p>
        <button
          type="button"
          onClick={() => setStages((current) => [...current, blankStage()])}
          className="btn btn-secondary shrink-0"
        >
          Add stage
        </button>
      </div>

      <ol className="space-y-4">
        {stages.map((stage, index) => (
          <StageFields
            key={stage.key}
            stage={stage}
            index={index}
            total={stages.length}
            users={users}
            earlierStages={stages.slice(0, index)}
            onChange={(patch) => patchStage(stage.key, patch)}
            onToggleApprover={(userId) => toggleApprover(stage.key, userId)}
            onMove={(direction) =>
              setStages((current) => moveStage(current, index, direction))
            }
            onRemove={() =>
              setStages((current) => current.filter((s) => s.key !== stage.key))
            }
          />
        ))}
      </ol>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-inset ring-red-100">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-2.5">
        <button
          type="button"
          onClick={save}
          disabled={busy}
          className="btn btn-primary min-w-[8rem]"
        >
          {busy && <Spinner />}
          {busy ? 'Saving…' : 'Save workflow'}
        </button>
        <button
          type="button"
          onClick={() => {
            reset();
            setOpen(false);
          }}
          disabled={busy}
          className="btn btn-secondary"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
