import type { DocumentResponse, UserResponse } from './test-app';

/**
 * The only place the tests know how a document exposes its approvers.
 *
 * When the workflow became dynamic, this file changed and the invariant tests did not.
 * If one breaks, either the rewrite lost real behaviour or the invariant itself needs
 * rethinking — either way, stop and look.
 */

/** Everyone who may act on this document right now. Empty once it has finished. */
export function currentApproverIds(doc: DocumentResponse): string[] {
  if (doc.status !== 'IN_PROGRESS' || !doc.currentStage) {
    return [];
  }

  const stage = doc.stages.find((s) => s.id === doc.currentStage!.id);
  return stage ? stage.approvers.map((a) => a.user.id) : [];
}

/** One person who may act, or null if nobody can. */
export function currentApproverId(doc: DocumentResponse): string | null {
  return currentApproverIds(doc)[0] ?? null;
}

/** Any user who may NOT act on this document right now. Used for 403 assertions. */
export function someNonApprover(
  doc: DocumentResponse,
  users: UserResponse[],
): UserResponse {
  const authorised = new Set(currentApproverIds(doc));
  const other = users.find((user) => !authorised.has(user.id));

  if (!other) {
    throw new Error('Fixture needs a user who is not an approver on the current stage');
  }
  return other;
}

/** Whether the document has reached a terminal state and accepts no further actions. */
export function isTerminal(doc: DocumentResponse): boolean {
  return currentApproverIds(doc).length === 0;
}
