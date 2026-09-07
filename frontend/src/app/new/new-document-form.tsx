'use client';

import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { Spinner } from '@/components/spinner';
import {
  createDocument,
  type StageApprovalPolicy,
  type StageInput,
  type User,
} from '@/lib/api';
import { POLICY_LABELS } from '@/lib/labels';

/** A stage being built. `key` is only for React — the server derives position from order. */
type StageDraft = {
  key: string;
  name: string;
  approverIds: string[];
  policy: StageApprovalPolicy;
};

let nextKey = 0;
function blankStage(name = ''): StageDraft {
  nextKey += 1;
  return { key: `stage-${nextKey}`, name, approverIds: [], policy: 'ANY' };
}

export function NewDocumentForm({ users }: { users: User[] }) {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [stages, setStages] = useState<StageDraft[]>([
    blankStage('Draft Review'),
    blankStage('Final Approval'),
  ]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function updateStage(key: string, patch: Partial<StageDraft>) {
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

  function move(index: number, direction: -1 | 1) {
    setStages((current) => {
      const next = [...current];
      const target = index + direction;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  /** Mirrors the API's rules so the person is told before the round trip. */
  function firstProblem(): string | null {
    if (!title.trim()) return 'The document needs a title.';
    if (!body.trim()) return 'The document needs a body.';
    if (stages.length === 0) return 'A document needs at least one approval stage.';

    for (const [index, stage] of stages.entries()) {
      if (!stage.name.trim()) return `Stage ${index + 1} needs a name.`;
      if (stage.approverIds.length === 0) {
        return `"${stage.name.trim()}" has no approvers, so nobody could ever act on it.`;
      }
    }
    return null;
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const problem = firstProblem();
    if (problem) {
      setError(problem);
      return;
    }

    setError(null);
    setSubmitting(true);

    const payload: StageInput[] = stages.map((stage) => ({
      name: stage.name.trim(),
      approverIds: stage.approverIds,
      policy: stage.policy,
    }));

    try {
      const document = await createDocument({
        title: title.trim(),
        body: body.trim(),
        stages: payload,
      });
      router.push(`/documents/${document.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create document');
      setSubmitting(false);
    }
  }

  if (users.length === 0) {
    return (
      <div className="empty-state">
        <p className="text-base font-medium text-stone-800">No users available</p>
        <p className="mt-1.5 text-sm text-stone-500">
          Start the API with seed data first.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6" noValidate>
      <div className="card card-pad space-y-6">
        <label className="field">
          <span className="field-label">Title</span>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="input"
            placeholder="e.g. Vendor Onboarding Policy"
          />
        </label>

        <label className="field">
          <span className="field-label">Body</span>
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            rows={7}
            className="input resize-y"
            placeholder="Document content…"
          />
        </label>
      </div>

      <div className="card card-pad space-y-5">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="section-label">Approval workflow</p>
            <p className="mt-1 text-sm text-stone-500">
              Stages run in the order shown. Each needs at least one approver.
            </p>
          </div>
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
            <li key={stage.key} className="rounded-xl border border-stone-200 p-4">
              <div className="flex items-start gap-3">
                <span className="mt-2 w-6 shrink-0 text-sm font-semibold text-stone-400">
                  {index + 1}
                </span>

                <div className="min-w-0 flex-1 space-y-4">
                  <input
                    value={stage.name}
                    onChange={(event) =>
                      updateStage(stage.key, { name: event.target.value })
                    }
                    className="input"
                    placeholder="Stage name, e.g. Legal Review"
                    aria-label={`Name for stage ${index + 1}`}
                  />

                  <fieldset>
                    <legend className="field-label mb-2">Approvers</legend>
                    <div className="flex flex-wrap gap-2">
                      {users.map((user) => {
                        const checked = stage.approverIds.includes(user.id);
                        return (
                          <label
                            key={user.id}
                            className={`cursor-pointer rounded-full border px-3 py-1.5 text-sm transition ${
                              checked
                                ? 'border-stone-900 bg-stone-900 text-white'
                                : 'border-stone-300 text-stone-700 hover:border-stone-400'
                            }`}
                          >
                            <input
                              type="checkbox"
                              className="sr-only"
                              checked={checked}
                              onChange={() => toggleApprover(stage.key, user.id)}
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
                          updateStage(stage.key, {
                            policy: event.target.value as StageApprovalPolicy,
                          })
                        }
                        className="input"
                      >
                        <option value="ANY">{POLICY_LABELS.ANY}</option>
                        <option value="ALL">{POLICY_LABELS.ALL}</option>
                      </select>
                    </label>
                  )}
                </div>

                <div className="flex shrink-0 flex-col gap-1">
                  <button
                    type="button"
                    onClick={() => move(index, -1)}
                    disabled={index === 0}
                    className="rounded px-2 py-1 text-stone-500 hover:bg-stone-100 disabled:opacity-30"
                    aria-label={`Move stage ${index + 1} earlier`}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => move(index, 1)}
                    disabled={index === stages.length - 1}
                    className="rounded px-2 py-1 text-stone-500 hover:bg-stone-100 disabled:opacity-30"
                    aria-label={`Move stage ${index + 1} later`}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setStages((current) =>
                        current.filter((candidate) => candidate.key !== stage.key),
                      )
                    }
                    disabled={stages.length === 1}
                    className="rounded px-2 py-1 text-stone-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30"
                    aria-label={`Remove stage ${index + 1}`}
                  >
                    ✕
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ol>
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-inset ring-red-100">
          {error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <button type="submit" disabled={submitting} className="btn btn-primary min-w-[10rem]">
          {submitting && <Spinner />}
          {submitting ? 'Creating…' : 'Create document'}
        </button>
      </div>
    </form>
  );
}
