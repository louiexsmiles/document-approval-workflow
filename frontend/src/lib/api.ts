function getApiBaseUrl(): string {
  if (typeof window === 'undefined') {
    // Server components / SSR talk to the Nest API directly.
    return process.env.API_URL ?? 'http://localhost:3001';
  }
  // Browser talks to the host-mapped API port.
  return process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
}

export type DocumentStage =
  | 'DRAFT_REVIEW'
  | 'LEGAL_REVIEW'
  | 'FINAL_APPROVAL';

export type DocumentStatus = 'IN_PROGRESS' | 'APPROVED';

export type User = {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  jobTitle: string | null;
};

export type DocumentSummary = {
  id: string;
  title: string;
  currentStage: DocumentStage;
  status: DocumentStatus;
};

export type DocumentDetail = DocumentSummary & {
  body: string;
  draftReviewApprover: User;
  legalReviewApprover: User;
  finalApprovalApprover: User;
  createdAt: string;
  updatedAt: string;
};

export type CreateDocumentInput = {
  title: string;
  body: string;
  draftReviewApproverId: string;
  legalReviewApproverId: string;
  finalApprovalApproverId: string;
};

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${getApiBaseUrl()}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    cache: 'no-store',
  });

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.message) {
        message = Array.isArray(body.message)
          ? body.message.join(', ')
          : body.message;
      }
    } catch {
      // ignore parse errors
    }
    throw new ApiError(message, res.status);
  }

  return res.json() as Promise<T>;
}

export function getDocuments() {
  return request<DocumentSummary[]>('/documents');
}

export function getDocument(id: string) {
  return request<DocumentDetail>(`/documents/${id}`);
}

export function getUsers() {
  return request<User[]>('/users');
}

export function createDocument(input: CreateDocumentInput) {
  return request<DocumentDetail>('/documents', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function approveDocument(id: string, userId: string) {
  return request<DocumentDetail>(`/documents/${id}/approve`, {
    method: 'POST',
    body: JSON.stringify({ userId }),
  });
}

export function rejectDocument(id: string, userId: string) {
  return request<DocumentDetail>(`/documents/${id}/reject`, {
    method: 'POST',
    body: JSON.stringify({ userId }),
  });
}
