/** How many of a stage's approvers must approve before it is complete. */
export enum StageApprovalPolicy {
  /** One approval from any assigned approver. */
  ANY = 'ANY',
  /** Every assigned approver must approve. */
  ALL = 'ALL',
}
