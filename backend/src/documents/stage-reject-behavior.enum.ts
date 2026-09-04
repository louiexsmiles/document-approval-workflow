/** Where a document goes when this stage rejects it. See DECISIONS.md ADR-004. */
export enum StageRejectBehavior {
  /** Back to the beginning. Matches the original hardcoded behaviour. */
  TO_FIRST_STAGE = 'TO_FIRST_STAGE',
  /** Back one stage. */
  TO_PREVIOUS_STAGE = 'TO_PREVIOUS_STAGE',
  /** Back to the stage named by `rejectTargetStage`. */
  TO_SPECIFIC_STAGE = 'TO_SPECIFIC_STAGE',
  /** Refused outright. The document is finished and cannot be resubmitted. */
  TERMINAL = 'TERMINAL',
}
