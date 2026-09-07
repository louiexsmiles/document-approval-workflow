function getApiBaseUrl(): string {
  if (typeof window === 'undefined') {
    // Server components / SSR talk to the Nest API directly.
    return process.env.API_URL ?? 'http://localhost:3001';
  }
  // Browser talks to the host-mapped API port.
  return process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
}

export type DocumentStatus = 'IN_PROGRESS' | 'APPROVED' | 'REJECTED';

/** How many of a stage's approvers must approve before it is complete. */
export type StageApprovalPolicy = 'ANY' | 'ALL';

/** Where a document goes when this stage rejects it. */
export type StageRejectBehavior =
  | 'TO_FIRST_STAGE'
  | 'TO_PREVIOUS_STAGE'
  | 'TO_SPECIFIC_STAGE'
  | 'TERMINAL';

export type ApprovalAction = 'APPROVE' | 'REJECT';

export type User = {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  jobTitle: string | null;
};

export type StageApprover = {
  id: string;
  user: User;
};

/** One step in a document's workflow. Names and order are data, not code. */
export type Stage = {
  id: string;
  position: number;
  name: string;
  policy: StageApprovalPolicy;
  rejectBehavior: StageRejectBehavior;
  approvers: StageApprover[];
};

export type DocumentSummary = {
  id: string;
  title: string;
  status: DocumentStatus;
  /** Null once the document has finished, approved or rejected. */
  currentStage: { id: string; name: string } | null;
};

export type DocumentDetail = {
  id: string;
  title: string;
  body: string;
  status: DocumentStatus;
  /** Increments on every rejection. Approvals only count within the current round. */
  approvalRound: number;
  stages: Stage[];
  currentStage: { id: string } | null;
  createdAt: string;
  updatedAt: string;
};

export type ApprovalEvent = {
  id: string;
  createdAt: string;
  round: number;
  action: ApprovalAction;
  comment: string | null;
  actor: User;
  /** The live stage. Null for document-level actions. */
  stage: { id: string; name: string } | null;
  /**
   * The stage as it was when this happened. Prefer it over `stage` for display — a stage
   * can be renamed afterwards, and this is what the person actually acted on. Null on
   * events recorded before snapshots existed.
   */
  stageSnapshot: {
    name: string;
    policy: StageApprovalPolicy;
    approverIds: string[];
  } | null;
};

export type StageInput = {
  /** Present when editing an existing stage. Absent means add it. */
  id?: string;
  name: string;
  approverIds: string[];
  policy?: StageApprovalPolicy;
  rejectBehavior?: StageRejectBehavior;
  /** Only read when rejectBehavior is TO_SPECIFIC_STAGE. Must point backwards. */
  rejectTargetPosition?: number;
};

export type CreateDocumentInput = {
  title: string;
  body: string;
  stages: StageInput[];
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

export function getDocumentHistory(id: string) {
  return request<ApprovalEvent[]>(`/documents/${id}/history`);
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

export function updateStages(id: string, stages: StageInput[]) {
  return request<DocumentDetail>(`/documents/${id}/stages`, {
    method: 'PATCH',
    body: JSON.stringify({ stages }),
  });
}

export function approveDocument(id: string, userId: string, comment?: string) {
  return request<DocumentDetail>(`/documents/${id}/approve`, {
    method: 'POST',
    body: JSON.stringify(comment ? { userId, comment } : { userId }),
  });
}

/** A reason is required — the API rejects the request without one. */
export function rejectDocument(id: string, userId: string, comment: string) {
  return request<DocumentDetail>(`/documents/${id}/reject`, {
    method: 'POST',
    body: JSON.stringify({ userId, comment }),
  });
}

/** Ordered stages, and which one the document is waiting at. */
export function orderedStages(document: DocumentDetail): Stage[] {
  return [...document.stages].sort((a, b) => a.position - b.position);
}

export function currentStageOf(document: DocumentDetail): Stage | null {
  if (!document.currentStage) return null;
  return document.stages.find((s) => s.id === document.currentStage!.id) ?? null;
}
