import type { ClientOptions, CustomSamplingContext, Hub, TransactionContext } from '@sentry/types';
import { getMainCarrier } from '../asyncContext';

import { spanToTraceHeader } from '../utils/spanUtils';
import { registerErrorInstrumentation } from './errors';
import { IdleTransaction } from './idletransaction';
import { sampleTransaction } from './sampling';
import { Transaction } from './transaction';

/** Returns all trace headers that are currently on the top scope. */
function traceHeaders(this: Hub): { [key: string]: string } {
  // eslint-disable-next-line deprecation/deprecation
  const scope = this.getScope();
  // eslint-disable-next-line deprecation/deprecation
  const span = scope.getSpan();

  return span
    ? {
        'sentry-trace': spanToTraceHeader(span),
      }
    : {};
}

/**
 * Creates a new transaction and adds a sampling decision if it doesn't yet have one.
 *
 * The Hub.startTransaction method delegates to this method to do its work, passing the Hub instance in as `this`, as if
 * it had been called on the hub directly. Exists as a separate function so that it can be injected into the class as an
 * "extension method."
 *
 * @param this: The Hub starting the transaction
 * @param transactionContext: Data used to configure the transaction
 * @param CustomSamplingContext: Optional data to be provided to the `tracesSampler` function (if any)
 *
 * @returns The new transaction
 *
 * @see {@link Hub.startTransaction}
 */
function _startTransaction(
  this: Hub,
  transactionContext: TransactionContext,
  customSamplingContext?: CustomSamplingContext,
): Transaction {
  // eslint-disable-next-line deprecation/deprecation
  const client = this.getClient();
  const options: Partial<ClientOptions> = (client && client.getOptions()) || {};

  // eslint-disable-next-line deprecation/deprecation
  let transaction = new Transaction(transactionContext, this);
  transaction = sampleTransaction(transaction, options, {
    name: transactionContext.name,
    parentSampled: transactionContext.parentSampled,
    transactionContext,
    attributes: {
      // eslint-disable-next-line deprecation/deprecation
      ...transactionContext.data,
      ...transactionContext.attributes,
    },
    ...customSamplingContext,
  });
  if (transaction.isRecording()) {
    transaction.initSpanRecorder();
  }
  if (client) {
    client.emit('startTransaction', transaction);
  }
  return transaction;
}

/**
 * Create new idle transaction.
 */
export function startIdleTransaction(
  hub: Hub,
  transactionContext: TransactionContext,
  idleTimeout: number,
  finalTimeout: number,
  onScope?: boolean,
  customSamplingContext?: CustomSamplingContext,
  heartbeatInterval?: number,
  delayAutoFinishUntilSignal: boolean = false,
): IdleTransaction {
  // eslint-disable-next-line deprecation/deprecation
  const client = hub.getClient();
  const options: Partial<ClientOptions> = (client && client.getOptions()) || {};

  // eslint-disable-next-line deprecation/deprecation
  let transaction = new IdleTransaction(
    transactionContext,
    hub,
    idleTimeout,
    finalTimeout,
    heartbeatInterval,
    onScope,
    delayAutoFinishUntilSignal,
  );
  transaction = sampleTransaction(transaction, options, {
    name: transactionContext.name,
    parentSampled: transactionContext.parentSampled,
    transactionContext,
    attributes: {
      // eslint-disable-next-line deprecation/deprecation
      ...transactionContext.data,
      ...transactionContext.attributes,
    },
    ...customSamplingContext,
  });
  if (transaction.isRecording()) {
    transaction.initSpanRecorder();
  }
  if (client) {
    client.emit('startTransaction', transaction);
  }
  return transaction;
}

/**
 * Adds tracing extensions to the global hub.
 */
export function addTracingExtensions(): void {
  const carrier = getMainCarrier();
  if (!carrier.__SENTRY__) {
    return;
  }
  carrier.__SENTRY__.extensions = carrier.__SENTRY__.extensions || {};
  if (!carrier.__SENTRY__.extensions.startTransaction) {
    carrier.__SENTRY__.extensions.startTransaction = _startTransaction;
  }
  if (!carrier.__SENTRY__.extensions.traceHeaders) {
    carrier.__SENTRY__.extensions.traceHeaders = traceHeaders;
  }

  registerErrorInstrumentation();
}
