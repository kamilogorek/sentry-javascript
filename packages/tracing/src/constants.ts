// Store finish reasons in tuple to save on bundle size
// Readonly type should enforce that this is not mutated.
export const FINISH_REASON_TAG = 'finishReason' as const;

export const IDLE_TRANSACTION_FINISH_REASONS = [
  'heartbeatFailed',
  'idleTimeout',
  'documentHidden',
  'finalTimeout',
  'externalFinish',
] as const;
