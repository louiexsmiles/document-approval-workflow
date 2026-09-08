export enum DocumentStatus {
  IN_PROGRESS = 'IN_PROGRESS',
  APPROVED = 'APPROVED',
  /** Refused outright by a stage with TERMINAL reject behaviour. Cannot be resubmitted. */
  REJECTED = 'REJECTED',
}
