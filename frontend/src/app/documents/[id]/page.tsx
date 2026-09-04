import Link from 'next/link';
import { notFound } from 'next/navigation';
import { StatusBadge } from '@/components/status-badge';
import { getDocument } from '@/lib/api';
import { STAGE_LABELS, STAGES } from '@/lib/labels';
import { ApprovalActions } from './approval-actions';

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

  const stages = STAGES.map((stage) => ({
    stage,
    label: STAGE_LABELS[stage],
    approver:
      stage === 'DRAFT_REVIEW'
        ? document.draftReviewApprover
        : stage === 'LEGAL_REVIEW'
          ? document.legalReviewApprover
          : document.finalApprovalApprover,
  }));

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
                Current stage: {STAGE_LABELS[document.currentStage]}
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
                <dt className="text-xs font-medium text-stone-400">
                  Last updated
                </dt>
                <dd className="mt-1 text-sm text-stone-800">
                  {formatDate(document.updatedAt)}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs font-medium text-stone-400">
                  Document ID
                </dt>
                <dd className="mt-1 break-all font-mono text-xs text-stone-500">
                  {document.id}
                </dd>
              </div>
            </dl>
          </section>
        </div>

        <aside className="min-w-0 space-y-6 md:sticky md:top-20 md:col-span-1">
          <section>
            <h2 className="section-label mb-3">Stages</h2>
            <ol className="space-y-3">
              {stages.map(({ stage, label, approver }, index) => {
                const currentIndex = STAGES.indexOf(document.currentStage);
                const isCurrent =
                  document.status !== 'APPROVED' &&
                  document.currentStage === stage;
                const isDone =
                  document.status === 'APPROVED' || index < currentIndex;

                return (
                  <li
                    key={stage}
                    className={`card px-5 py-4 ${
                      isCurrent ? 'border-stone-900 shadow-md' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <div className="text-sm font-semibold text-stone-900">
                          {label}
                        </div>
                        <div className="mt-0.5 text-sm text-stone-600">
                          Approver: {approver.name}
                        </div>
                      </div>
                      <span className="text-xs font-medium text-stone-500">
                        {document.status === 'APPROVED' &&
                        stage === 'FINAL_APPROVAL'
                          ? 'Approved'
                          : isCurrent
                            ? 'Current'
                            : isDone
                              ? 'Passed'
                              : 'Pending'}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>

          <section className="card card-pad">
            <h2 className="section-label">Actions</h2>
            {document.status === 'APPROVED' ? (
              <div className="mt-3 rounded-lg bg-emerald-50 px-3.5 py-3 text-sm text-emerald-800 ring-1 ring-inset ring-emerald-100">
                This document is fully approved. No further actions are
                available.
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
