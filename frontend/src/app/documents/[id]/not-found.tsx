import Link from 'next/link';

export default function DocumentNotFound() {
  return (
    <div className="empty-state">
      <h1 className="text-lg font-semibold text-stone-900">Document not found</h1>
      <p className="mt-1.5 text-sm text-stone-500">
        That document does not exist or may have been removed.
      </p>
      <Link href="/" className="btn btn-secondary mt-5">
        Back to documents
      </Link>
    </div>
  );
}
