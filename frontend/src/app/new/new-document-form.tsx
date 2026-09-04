'use client';

import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { Spinner } from '@/components/spinner';
import { createDocument, type User } from '@/lib/api';

type FieldErrors = {
  title?: string;
  body?: string;
  draftReviewApproverId?: string;
  legalReviewApproverId?: string;
  finalApprovalApproverId?: string;
};

export function NewDocumentForm({ users }: { users: User[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);

  const defaultUserId = users[0]?.id ?? '';

  function validate(form: FormData): FieldErrors {
    const next: FieldErrors = {};
    const title = String(form.get('title') ?? '').trim();
    const body = String(form.get('body') ?? '').trim();

    if (!title) next.title = 'Title is required.';
    if (!body) next.body = 'Body is required.';
    if (!String(form.get('draftReviewApproverId') ?? '')) {
      next.draftReviewApproverId = 'Select an approver.';
    }
    if (!String(form.get('legalReviewApproverId') ?? '')) {
      next.legalReviewApproverId = 'Select an approver.';
    }
    if (!String(form.get('finalApprovalApproverId') ?? '')) {
      next.finalApprovalApproverId = 'Select an approver.';
    }
    return next;
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const form = new FormData(event.currentTarget);
    const errors = validate(form);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      return;
    }

    setSubmitting(true);

    try {
      const document = await createDocument({
        title: String(form.get('title') ?? '').trim(),
        body: String(form.get('body') ?? '').trim(),
        draftReviewApproverId: String(form.get('draftReviewApproverId') ?? ''),
        legalReviewApproverId: String(form.get('legalReviewApproverId') ?? ''),
        finalApprovalApproverId: String(
          form.get('finalApprovalApproverId') ?? '',
        ),
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
    <form onSubmit={onSubmit} className="card card-pad space-y-6" noValidate>
      <label className="field">
        <span className="field-label">Title</span>
        <input
          name="title"
          className={`input ${fieldErrors.title ? 'input-error' : ''}`}
          placeholder="e.g. Vendor Onboarding Policy"
          aria-invalid={Boolean(fieldErrors.title)}
        />
        {fieldErrors.title && (
          <span className="field-error">{fieldErrors.title}</span>
        )}
      </label>

      <label className="field">
        <span className="field-label">Body</span>
        <textarea
          name="body"
          rows={7}
          className={`input resize-y ${fieldErrors.body ? 'input-error' : ''}`}
          placeholder="Document content…"
          aria-invalid={Boolean(fieldErrors.body)}
        />
        {fieldErrors.body && (
          <span className="field-error">{fieldErrors.body}</span>
        )}
      </label>

      <div className="space-y-5 border-t border-stone-100 pt-6">
        <p className="section-label">Approvers</p>
        <ApproverSelect
          name="draftReviewApproverId"
          label="Draft Review"
          users={users}
          defaultValue={defaultUserId}
          error={fieldErrors.draftReviewApproverId}
        />
        <ApproverSelect
          name="legalReviewApproverId"
          label="Legal Review"
          users={users}
          defaultValue={users[1]?.id ?? defaultUserId}
          error={fieldErrors.legalReviewApproverId}
        />
        <ApproverSelect
          name="finalApprovalApproverId"
          label="Final Approval"
          users={users}
          defaultValue={users[2]?.id ?? defaultUserId}
          error={fieldErrors.finalApprovalApproverId}
        />
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-inset ring-red-100">
          {error}
        </p>
      )}

      <div className="flex items-center gap-3 border-t border-stone-100 pt-6">
        <button
          type="submit"
          disabled={submitting}
          className="btn btn-primary min-w-[10rem]"
        >
          {submitting && <Spinner />}
          {submitting ? 'Creating…' : 'Create document'}
        </button>
      </div>
    </form>
  );
}

function ApproverSelect({
  name,
  label,
  users,
  defaultValue,
  error,
}: {
  name: string;
  label: string;
  users: User[];
  defaultValue: string;
  error?: string;
}) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <select
        name={name}
        defaultValue={defaultValue}
        className={`input ${error ? 'input-error' : ''}`}
        aria-invalid={Boolean(error)}
      >
        {users.map((user) => (
          <option key={user.id} value={user.id}>
            {user.name} ({user.email})
          </option>
        ))}
      </select>
      {error && <span className="field-error">{error}</span>}
    </label>
  );
}
