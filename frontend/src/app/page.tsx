import Link from 'next/link';
import { StatusBadge } from '@/components/status-badge';
import { getDocuments } from '@/lib/api';
import { STAGE_LABELS } from '@/lib/labels';

export default async function HomePage() {
  const documents = await getDocuments();

  return (
    <div className="card overflow-hidden">
      <div className="flex items-end justify-between gap-4 border-b border-stone-100 px-5 py-6 sm:px-6">
        <div>
          <h1 className="page-title">Documents</h1>
          <p className="page-subtitle">
            Track each document through the fixed approval stages.
          </p>
        </div>
        <Link href="/new" className="btn btn-primary shrink-0">
          New document
        </Link>
      </div>

      {documents.length === 0 ? (
        <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
          <p className="text-base font-medium text-stone-800">No documents yet</p>
          <p className="mt-1.5 max-w-sm text-sm text-stone-500">
            Create a document and assign one approver for each stage to get
            started.
          </p>
          <Link href="/new" className="btn btn-primary mt-5">
            Create document
          </Link>
        </div>
      ) : (
        <ul className="divide-y divide-stone-100">
          {documents.map((doc) => (
            <li key={doc.id}>
              <Link
                href={`/documents/${doc.id}`}
                className="group flex items-center justify-between gap-4 px-5 py-4 transition hover:bg-stone-50/80 sm:px-6"
              >
                <div className="min-w-0">
                  <div className="truncate text-base font-semibold text-stone-900 group-hover:text-stone-950">
                    {doc.title}
                  </div>
                  <div className="mt-1 text-sm text-stone-500">
                    {STAGE_LABELS[doc.currentStage]}
                  </div>
                </div>
                <StatusBadge status={doc.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
