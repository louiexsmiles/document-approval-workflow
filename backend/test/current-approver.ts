import type { DocumentResponse, UserResponse } from './test-app';

/**
 * The only place the tests know how a document exposes its approvers.
 *
 * When the workflow becomes dynamic, this file changes and the invariant tests should
 * not. If one breaks, either the rewrite lost real behaviour or the invariant itself
 * needs rethinking — both worth stopping for.
 */

/** Who, if anyone, may act on this document right now. */
export function currentApproverId(doc: DocumentResponse): string | null {
  if (doc.status !== 'IN_PROGRESS') {
    return null;
  }

  switch (doc.currentStage) {
    case 'DRAFT_REVIEW':
      return doc.draftReviewApprover.id;
    case 'LEGAL_REVIEW':
      return doc.legalReviewApprover.id;
    case 'FINAL_APPROVAL':
      return doc.finalApprovalApprover.id;
    default:
      return null;
  }
}

/** Any user who may NOT act on this document right now. Used for 403 assertions. */
export function someNonApprover(
  doc: DocumentResponse,
  users: UserResponse[],
): UserResponse {
  const current = currentApproverId(doc);
  const other = users.find((user) => user.id !== current);

  if (!other) {
    throw new Error('Fixture needs at least two users to find a non-approver');
  }
  return other;
}

/** Whether the document has reached a terminal state and accepts no further actions. */
export function isTerminal(doc: DocumentResponse): boolean {
  return currentApproverId(doc) === null;
}
