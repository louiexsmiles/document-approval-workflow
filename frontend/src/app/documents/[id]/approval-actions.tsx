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
  type DocumentStage,
} from '@/lib/api';
import { STAGE_LABELS } from '@/lib/labels';

function successMessage(
  action: 'approve' | 'reject',
  result: DocumentDetail,
): string {
  if (action === 'reject') {
    return 'Rejected — returned to Draft Review';
  }
  if (result.status === 'APPROVED') {
    return 'Document approved';
  }
  return `Advanced to ${STAGE_LABELS[result.currentStage as DocumentStage]}`;
}

export function ApprovalActions({ documentId }: { documentId: string }) {
  const router = useRouter();
  const { activeUserId } = useActingAs();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<'approve' | 'reject' | null>(
    null,
  );

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

    setError(null);
    setSuccess(null);
    setBusyAction(action);

    try {
      const result =
        action === 'approve'
          ? await approveDocument(documentId, activeUserId)
          : await rejectDocument(documentId, activeUserId);
      setSuccess(successMessage(action, result));
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        setError('You are not the approver for this stage.');
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
