import type { DocumentStatus } from '@/lib/api';
import { STATUS_LABELS } from '@/lib/labels';

export function StatusBadge({ status }: { status: DocumentStatus }) {
  const className =
    status === 'APPROVED'
      ? 'bg-emerald-100 text-emerald-800 ring-1 ring-inset ring-emerald-200/80'
      : 'bg-amber-100 text-amber-900 ring-1 ring-inset ring-amber-200/80';

  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-semibold tracking-wide ${className}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}
