import Link from 'next/link';
import { notFound } from 'next/navigation';
import { HistoryTimeline } from '@/components/history-timeline';
import { StageList } from '@/components/stage-list';
import { StatusBadge } from '@/components/status-badge';
import {
  currentStageOf,
  getDocument,
  getDocumentHistory,
  getUsers,
} from '@/lib/api';
import { ApprovalActions } from './approval-actions';
import { StageEditor } from './stage-editor';

type Props = {
  params: Promise<{ id: string }>;
};

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default async function DocumentDetailPage({ params }: Props) {
  const { id } = await params;

  let document;
  try {
    document = await getDocument(id);
  } catch {
    notFound();
  }

  const [history, users] = await Promise.all([getDocumentHistory(id), getUsers()]);
  const current = currentStageOf(document);

  // Which stages the server will refuse to change: those approved in the current round.
  // Derived from history the page already has, so the editor can disable them rather than
  // let someone edit into a 409.
  const lockedStageIds = [
    ...new Set(
      history
        .filter(
          (event) =>
            event.round === document.approvalRound &&
            event.action === 'APPROVE' &&
            event.stage,
        )
        .map((event) => event.stage!.id),
    ),
  ];

  return (
    <div>
      <Link href="/" className="back-link">
        ← Documents
      </Link>

      <div className="mt-5 grid grid-cols-1 items-start gap-8 md:grid-cols-3">
        <div className="card min-w-0 overflow-hidden border-t-2 border-t-stone-800 md:col-span-2">
          <div className="flex items-start justify-between gap-4 border-b border-stone-100 px-6 py-6 sm:px-8">
            <div className="min-w-0">
              <h1 className="page-title">{document.title}</h1>
              <p className="page-subtitle">
                {current
                  ? `Waiting at ${current.name}`
                  : 'No stages remaining'}
              </p>
            </div>
            <StatusBadge status={document.status} />
          </div>

          <section className="border-b border-stone-100 px-6 py-8 sm:px-8 sm:py-10">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-stone-500">
              Body
            </h2>
            <p className="mt-4 max-w-[70ch] whitespace-pre-wrap text-base leading-8 text-stone-800">
              {document.body}
            </p>
          </section>

          <section className="border-b border-stone-100 px-6 py-6 sm:px-8">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-stone-500">
              History
            </h2>
            <div className="mt-5">
              <HistoryTimeline events={history} />
            </div>
          </section>

          <section className="px-6 py-6 sm:px-8">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-stone-500">
              Details
            </h2>
            <dl className="mt-5 grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2">
              <div>
                <dt className="text-xs font-medium text-stone-400">Created</dt>
                <dd className="mt-1 text-sm text-stone-800">
                  {formatDate(document.createdAt)}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-stone-400">Last updated</dt>
                <dd className="mt-1 text-sm text-stone-800">
                  {formatDate(document.updatedAt)}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-stone-400">Review round</dt>
                <dd className="mt-1 text-sm text-stone-800">
                  {document.approvalRound + 1}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-stone-400">Document ID</dt>
                <dd className="mt-1 break-all font-mono text-xs text-stone-500">
                  {document.id}
                </dd>
              </div>
            </dl>
          </section>
        </div>

        <aside className="min-w-0 space-y-6 md:sticky md:top-20 md:col-span-1">
          <section>
            <h2 className="section-label mb-3">Workflow</h2>
            <StageList document={document} />

            {document.status === 'IN_PROGRESS' && (
              <div className="mt-3">
                <StageEditor
                  document={document}
                  users={users}
                  lockedStageIds={lockedStageIds}
                />
              </div>
            )}
          </section>

          <section className="card card-pad">
            <h2 className="section-label">Actions</h2>
            {document.status !== 'IN_PROGRESS' ? (
              <div
                className={`mt-3 rounded-lg px-3.5 py-3 text-sm ring-1 ring-inset ${
                  document.status === 'APPROVED'
                    ? 'bg-emerald-50 text-emerald-800 ring-emerald-100'
                    : 'bg-red-50 text-red-800 ring-red-100'
                }`}
              >
                {document.status === 'APPROVED'
                  ? 'This document is fully approved. No further actions are available.'
                  : 'This document was rejected outright and cannot be resubmitted.'}
              </div>
            ) : (
              <ApprovalActions documentId={document.id} />
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
