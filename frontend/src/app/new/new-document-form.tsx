'use client';

import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { Spinner } from '@/components/spinner';
import {
  blankStage,
  firstStageProblem,
  moveStage,
  StageFields,
  toStageInputs,
  type StageDraft,
} from '@/components/stage-fields';
import { createDocument, type User } from '@/lib/api';

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

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const problem =
      (!title.trim() && 'The document needs a title.') ||
      (!body.trim() && 'The document needs a body.') ||
      firstStageProblem(stages);

    if (problem) {
      setError(problem);
      return;
    }

    setError(null);
    setSubmitting(true);


    try {
      const document = await createDocument({
        title: title.trim(),
        body: body.trim(),
        stages: toStageInputs(stages),
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
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-inset ring-red-100">
          {error}
        </p>
      )}

      <button type="submit" disabled={submitting} className="btn btn-primary min-w-[10rem]">
        {submitting && <Spinner />}
        {submitting ? 'Creating…' : 'Create document'}
      </button>
    </form>
  );
}
