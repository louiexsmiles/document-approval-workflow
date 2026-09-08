import type { DocumentStatus } from '@/lib/api';
import { STATUS_LABELS } from '@/lib/labels';

const CLASSES: Record<DocumentStatus, string> = {
  APPROVED: 'bg-emerald-100 text-emerald-800 ring-1 ring-inset ring-emerald-200/80',
  REJECTED: 'bg-red-100 text-red-800 ring-1 ring-inset ring-red-200/80',
  IN_PROGRESS: 'bg-amber-100 text-amber-900 ring-1 ring-inset ring-amber-200/80',
};

export function StatusBadge({ status }: { status: DocumentStatus }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-semibold tracking-wide ${CLASSES[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}
