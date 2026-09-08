'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Spinner } from '@/components/spinner';
import { useActingAs } from '@/context/acting-as-context';
import {
  ApiError,
  approveDocument,
  rejectDocument,
  type DocumentDetail,
} from '@/lib/api';

function successMessage(
  action: 'approve' | 'reject',
  result: DocumentDetail,
  stageBefore: string | null,
): string {
  const landedOn = result.stages.find((stage) => stage.id === result.currentStage?.id);

  if (action === 'reject') {
    if (result.status === 'REJECTED') return 'Rejected — this document is closed';
    return landedOn
      ? `Rejected — sent back to ${landedOn.name}`
      : 'Rejected — sent back for changes';
  }

  if (result.status === 'APPROVED') return 'Document approved';

  // The document is sitting where it was, so this stage is waiting on someone else.
  // Reporting that it advanced would contradict the workflow panel beside it.
  if (result.currentStage?.id === stageBefore) {
    return 'Approved — this stage still needs another approver';
  }

  return landedOn ? `Approved — moved to ${landedOn.name}` : 'Approved — moved on';
}

type Props = {
  documentId: string;
  /** The stage the document sits at now, so a result can be compared against it. */
  currentStageId: string | null;
};

export function ApprovalActions({ documentId, currentStageId }: Props) {
  const router = useRouter();
  const { activeUserId } = useActingAs();
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<'approve' | 'reject' | null>(null);

  useEffect(() => {
    if (!success) return;
    const timer = window.setTimeout(() => setSuccess(null), 4000);
    return () => window.clearTimeout(timer);
  }, [success]);

  async function runAction(action: 'approve' | 'reject') {
    if (!activeUserId) {
      setError('Select a user in the top bar first.');
      return;
    }

    // Checked here as well as server-side so the person is told before the round trip.
    const reason = comment.trim();
    if (action === 'reject' && !reason) {
      setError('A rejection needs a reason — the author has to know what to fix.');
      return;
    }

    setError(null);
    setSuccess(null);
    setBusyAction(action);

    try {
      const result =
        action === 'approve'
          ? await approveDocument(documentId, activeUserId, reason || undefined)
          : await rejectDocument(documentId, activeUserId, reason);

      setSuccess(successMessage(action, result, currentStageId));
      setComment('');
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        setError('You are not an approver on this stage.');
      } else if (err instanceof ApiError && err.status === 409) {
        setError('Someone changed this document. Reload and try again.');
      } else {
        setError(err instanceof Error ? err.message : 'Action failed');
      }
    } finally {
      setBusyAction(null);
    }
  }

  const busy = busyAction !== null;

  return (
    <div className="mt-4 space-y-3">
      <label className="field">
        <span className="field-label">Comment</span>
        <textarea
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          rows={3}
          disabled={busy}
          placeholder="Optional when approving, required when rejecting"
          className="input resize-y"
        />
      </label>

      <div className="flex flex-wrap gap-2.5">
        <button
          type="button"
          disabled={busy || !activeUserId}
          onClick={() => runAction('approve')}
          className="btn btn-success min-w-[7.5rem]"
        >
          {busyAction === 'approve' && <Spinner />}
          {busyAction === 'approve' ? 'Approving…' : 'Approve'}
        </button>
        <button
          type="button"
          disabled={busy || !activeUserId}
          onClick={() => runAction('reject')}
          className="btn btn-destructive min-w-[7.5rem]"
        >
          {busyAction === 'reject' && <Spinner />}
          {busyAction === 'reject' ? 'Rejecting…' : 'Reject'}
        </button>
      </div>

      {success && (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800 ring-1 ring-inset ring-emerald-100">
          {success}
        </p>
      )}
      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-inset ring-red-100">
          {error}
        </p>
      )}
    </div>
  );
}
