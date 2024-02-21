import type {
  Instrumenter,
  Primitive,
  Span as SpanInterface,
  SpanAttributeValue,
  SpanAttributes,
  SpanContext,
  SpanContextData,
  SpanJSON,
  SpanOrigin,
  SpanTimeInput,
  TraceContext,
  Transaction,
} from '@sentry/types';
import { dropUndefinedKeys, logger, timestampInSeconds, uuid4 } from '@sentry/utils';

import { DEBUG_BUILD } from '../debug-build';
import { getMetricSummaryJsonForSpan } from '../metrics/metric-summary';
import { SEMANTIC_ATTRIBUTE_SENTRY_OP, SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN } from '../semanticAttributes';
import { getRootSpan } from '../utils/getRootSpan';
import {
  TRACE_FLAG_NONE,
  TRACE_FLAG_SAMPLED,
  spanTimeInputToSeconds,
  spanToJSON,
  spanToTraceContext,
} from '../utils/spanUtils';
import type { SpanStatusType } from './spanstatus';
import { setHttpStatus } from './spanstatus';
import { addChildSpanToSpan } from './trace';

/**
 * Keeps track of finished spans for a given transaction
 * @internal
 * @hideconstructor
 * @hidden
 */
export class SpanRecorder {
  public spans: SentrySpan[];

  private readonly _maxlen: number;

  public constructor(maxlen: number = 1000) {
    this._maxlen = maxlen;
    this.spans = [];
  }

  /**
   * This is just so that we don't run out of memory while recording a lot
   * of spans. At some point we just stop and flush out the start of the
   * trace tree (i.e.the first n spans with the smallest
   * start_timestamp).
   */
  public add(span: SentrySpan): void {
    if (this.spans.length > this._maxlen) {
      // eslint-disable-next-line deprecation/deprecation
      span.spanRecorder = undefined;
    } else {
      this.spans.push(span);
    }
  }
}

/**
 * Span contains all data about a span
 */
export class SentrySpan implements SpanInterface {
  /**
   * Tags for the span.
   * @deprecated Use `spanToJSON(span).atttributes` instead.
   */
  public tags: { [key: string]: Primitive };

  /**
   * Data for the span.
   * @deprecated Use `spanToJSON(span).atttributes` instead.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public data: { [key: string]: any };

  /**
   * List of spans that were finalized
   *
   * @deprecated This property will no longer be public. Span recording will be handled internally.
   */
  public spanRecorder?: SpanRecorder;

  /**
   * @inheritDoc
   * @deprecated Use top level `Sentry.getRootSpan()` instead
   */
  public transaction?: Transaction;

  /**
   * The instrumenter that created this span.
   *
   * TODO (v8): This can probably be replaced by an `instanceOf` check of the span class.
   *            the instrumenter can only be sentry or otel so we can check the span instance
   *            to verify which one it is and remove this field entirely.
   *
   * @deprecated This field will be removed.
   */
  public instrumenter: Instrumenter;

  protected _traceId: string;
  protected _spanId: string;
  protected _parentSpanId?: string | undefined;
  protected _sampled: boolean | undefined;
  protected _name?: string | undefined;
  protected _attributes: SpanAttributes;
  /** Epoch timestamp in seconds when the span started. */
  protected _startTime: number;
  /** Epoch timestamp in seconds when the span ended. */
  protected _endTime?: number | undefined;
  /** Internal keeper of the status */
  protected _status?: SpanStatusType | string | undefined;

  private _logMessage?: string;

  /**
   * You should never call the constructor manually, always use `Sentry.startTransaction()`
   * or call `startChild()` on an existing span.
   * @internal
   * @hideconstructor
   * @hidden
   */
  public constructor(spanContext: SpanContext = {}) {
    this._traceId = spanContext.traceId || uuid4();
    this._spanId = spanContext.spanId || uuid4().substring(16);
    this._startTime = spanContext.startTimestamp || timestampInSeconds();
    // eslint-disable-next-line deprecation/deprecation
    this.tags = spanContext.tags ? { ...spanContext.tags } : {};
    // eslint-disable-next-line deprecation/deprecation
    this.data = spanContext.data ? { ...spanContext.data } : {};
    // eslint-disable-next-line deprecation/deprecation
    this.instrumenter = spanContext.instrumenter || 'sentry';

    this._attributes = {};
    this.setAttributes({
      [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: spanContext.origin || 'manual',
      [SEMANTIC_ATTRIBUTE_SENTRY_OP]: spanContext.op,
      ...spanContext.attributes,
    });

    this._name = spanContext.name;

    if (spanContext.parentSpanId) {
      this._parentSpanId = spanContext.parentSpanId;
    }
    // We want to include booleans as well here
    if ('sampled' in spanContext) {
      this._sampled = spanContext.sampled;
    }
    if (spanContext.status) {
      this._status = spanContext.status;
    }
    if (spanContext.endTimestamp) {
      this._endTime = spanContext.endTimestamp;
    }
  }

  // This rule conflicts with another eslint rule :(
  /* eslint-disable @typescript-eslint/member-ordering */

  /**
   * The ID of the trace.
   * @deprecated Use `spanContext().traceId` instead.
   */
  public get traceId(): string {
    return this._traceId;
  }

  /**
   * The ID of the trace.
   * @deprecated You cannot update the traceId of a span after span creation.
   */
  public set traceId(traceId: string) {
    this._traceId = traceId;
  }

  /**
   * The ID of the span.
   * @deprecated Use `spanContext().spanId` instead.
   */
  public get spanId(): string {
    return this._spanId;
  }

  /**
   * The ID of the span.
   * @deprecated You cannot update the spanId of a span after span creation.
   */
  public set spanId(spanId: string) {
    this._spanId = spanId;
  }

  /**
   * @inheritDoc
   *
   * @deprecated Use `startSpan` functions instead.
   */
  public set parentSpanId(string) {
    this._parentSpanId = string;
  }

  /**
   * @inheritDoc
   *
   * @deprecated Use `spanToJSON(span).parent_span_id` instead.
   */
  public get parentSpanId(): string | undefined {
    return this._parentSpanId;
  }

  /**
   * Was this span chosen to be sent as part of the sample?
   * @deprecated Use `isRecording()` instead.
   */
  public get sampled(): boolean | undefined {
    return this._sampled;
  }

  /**
   * Was this span chosen to be sent as part of the sample?
   * @deprecated You cannot update the sampling decision of a span after span creation.
   */
  public set sampled(sampled: boolean | undefined) {
    this._sampled = sampled;
  }

  /**
   * Attributes for the span.
   * @deprecated Use `spanToJSON(span).atttributes` instead.
   */
  public get attributes(): SpanAttributes {
    return this._attributes;
  }

  /**
   * Attributes for the span.
   * @deprecated Use `setAttributes()` instead.
   */
  public set attributes(attributes: SpanAttributes) {
    this._attributes = attributes;
  }

  /**
   * Timestamp in seconds (epoch time) indicating when the span started.
   * @deprecated Use `spanToJSON()` instead.
   */
  public get startTimestamp(): number {
    return this._startTime;
  }

  /**
   * Timestamp in seconds (epoch time) indicating when the span started.
   * @deprecated In v8, you will not be able to update the span start time after creation.
   */
  public set startTimestamp(startTime: number) {
    this._startTime = startTime;
  }

  /**
   * Timestamp in seconds when the span ended.
   * @deprecated Use `spanToJSON()` instead.
   */
  public get endTimestamp(): number | undefined {
    return this._endTime;
  }

  /**
   * Timestamp in seconds when the span ended.
   * @deprecated Set the end time via `span.end()` instead.
   */
  public set endTimestamp(endTime: number | undefined) {
    this._endTime = endTime;
  }

  /**
   * The status of the span.
   *
   * @deprecated Use `spanToJSON().status` instead to get the status.
   */
  public get status(): SpanStatusType | string | undefined {
    return this._status;
  }

  /**
   * The status of the span.
   *
   * @deprecated Use `.setStatus()` instead to set or update the status.
   */
  public set status(status: SpanStatusType | string | undefined) {
    this._status = status;
  }

  /* eslint-enable @typescript-eslint/member-ordering */

  /** @inheritdoc */
  public spanContext(): SpanContextData {
    const { _spanId: spanId, _traceId: traceId, _sampled: sampled } = this;
    return {
      spanId,
      traceId,
      traceFlags: sampled ? TRACE_FLAG_SAMPLED : TRACE_FLAG_NONE,
    };
  }

  /**
   * Creates a new `Span` while setting the current `Span.id` as `parentSpanId`.
   * Also the `sampled` decision will be inherited.
   *
   * @deprecated Use `startSpan()`, `startSpanManual()` or `startInactiveSpan()` instead.
   */
  public startChild(
    spanContext?: Pick<SpanContext, Exclude<keyof SpanContext, 'sampled' | 'traceId' | 'parentSpanId'>>,
  ): SpanInterface {
    const childSpan = new SentrySpan({
      ...spanContext,
      parentSpanId: this._spanId,
      sampled: this._sampled,
      traceId: this._traceId,
    });

    // eslint-disable-next-line deprecation/deprecation
    childSpan.spanRecorder = this.spanRecorder;
    // eslint-disable-next-line deprecation/deprecation
    if (childSpan.spanRecorder) {
      // eslint-disable-next-line deprecation/deprecation
      childSpan.spanRecorder.add(childSpan);
    }

    // To allow for interoperability we track the children of a span twice: Once with the span recorder (old) once with
    // the `addChildSpanToSpan`. Eventually we will only use `addChildSpanToSpan` and drop the span recorder.
    // To ensure interoperability with the `startSpan` API, `addChildSpanToSpan` is also called here.
    addChildSpanToSpan(this, childSpan);

    const rootSpan = getRootSpan(this);
    // TODO: still set span.transaction here until we have a more permanent solution
    // Probably similarly to the weakmap we hold in node-experimental
    // eslint-disable-next-line deprecation/deprecation
    childSpan.transaction = rootSpan as Transaction;

    if (DEBUG_BUILD && rootSpan) {
      const opStr = (spanContext && spanContext.op) || '< unknown op >';
      const nameStr = spanToJSON(childSpan).description || '< unknown name >';
      const idStr = rootSpan.spanContext().spanId;

      const logMessage = `[Tracing] Starting '${opStr}' span on transaction '${nameStr}' (${idStr}).`;
      logger.log(logMessage);
      this._logMessage = logMessage;
    }

    return childSpan;
  }

  /**
   * Sets the tag attribute on the current span.
   *
   * Can also be used to unset a tag, by passing `undefined`.
   *
   * @param key Tag key
   * @param value Tag value
   * @deprecated Use `setAttribute()` instead.
   */
  public setTag(key: string, value: Primitive): this {
    // eslint-disable-next-line deprecation/deprecation
    this.tags = { ...this.tags, [key]: value };
    return this;
  }

  /**
   * Sets the data attribute on the current span
   * @param key Data key
   * @param value Data value
   * @deprecated Use `setAttribute()` instead.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public setData(key: string, value: any): this {
    // eslint-disable-next-line deprecation/deprecation
    this.data = { ...this.data, [key]: value };
    return this;
  }

  /** @inheritdoc */
  public setAttribute(key: string, value: SpanAttributeValue | undefined): void {
    if (value === undefined) {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete this._attributes[key];
    } else {
      this._attributes[key] = value;
    }
  }

  /** @inheritdoc */
  public setAttributes(attributes: SpanAttributes): void {
    Object.keys(attributes).forEach(key => this.setAttribute(key, attributes[key]));
  }

  /**
   * @inheritDoc
   */
  public setStatus(value: SpanStatusType): this {
    this._status = value;
    return this;
  }

  /**
   * @inheritDoc
   */
  public updateName(name: string): this {
    this._name = name;
    return this;
  }

  /**
   * @inheritDoc
   *
   * @deprecated Use `.end()` instead.
   */
  public finish(endTimestamp?: number): void {
    return this.end(endTimestamp);
  }

  /** @inheritdoc */
  public end(endTimestamp?: SpanTimeInput): void {
    // If already ended, skip
    if (this._endTime) {
      return;
    }
    const rootSpan = getRootSpan(this);
    if (
      DEBUG_BUILD &&
      // Don't call this for transactions
      rootSpan &&
      rootSpan.spanContext().spanId !== this._spanId
    ) {
      const logMessage = this._logMessage;
      if (logMessage) {
        logger.log((logMessage as string).replace('Starting', 'Finishing'));
      }
    }

    this._endTime = spanTimeInputToSeconds(endTimestamp);
  }

  /**
   * @inheritDoc
   *
   * @deprecated Use `spanToJSON()` or access the fields directly instead.
   */
  public toContext(): SpanContext {
    return dropUndefinedKeys({
      data: this._getData(),
      name: this._name,
      endTimestamp: this._endTime,
      op: this._attributes[SEMANTIC_ATTRIBUTE_SENTRY_OP],
      parentSpanId: this._parentSpanId,
      sampled: this._sampled,
      spanId: this._spanId,
      startTimestamp: this._startTime,
      status: this._status,
      // eslint-disable-next-line deprecation/deprecation
      tags: this.tags,
      traceId: this._traceId,
    });
  }

  /**
   * @inheritDoc
   *
   * @deprecated Update the fields directly instead.
   */
  public updateWithContext(spanContext: SpanContext): this {
    // eslint-disable-next-line deprecation/deprecation
    this.data = spanContext.data || {};
    this._name = spanContext.name;
    this._endTime = spanContext.endTimestamp;
    this._attributes = { ...this._attributes, [SEMANTIC_ATTRIBUTE_SENTRY_OP]: spanContext.op };
    this._parentSpanId = spanContext.parentSpanId;
    this._sampled = spanContext.sampled;
    this._spanId = spanContext.spanId || this._spanId;
    this._startTime = spanContext.startTimestamp || this._startTime;
    this._status = spanContext.status;
    // eslint-disable-next-line deprecation/deprecation
    this.tags = spanContext.tags || {};
    this._traceId = spanContext.traceId || this._traceId;

    return this;
  }

  /**
   * @inheritDoc
   *
   * @deprecated Use `spanToTraceContext()` util function instead.
   */
  public getTraceContext(): TraceContext {
    return spanToTraceContext(this);
  }

  /**
   * Get JSON representation of this span.
   *
   * @hidden
   * @internal This method is purely for internal purposes and should not be used outside
   * of SDK code. If you need to get a JSON representation of a span,
   * use `spanToJSON(span)` instead.
   */
  public getSpanJSON(): SpanJSON {
    return dropUndefinedKeys({
      data: this._getData(),
      description: this._name,
      op: this._attributes[SEMANTIC_ATTRIBUTE_SENTRY_OP],
      parent_span_id: this._parentSpanId,
      span_id: this._spanId,
      start_timestamp: this._startTime,
      status: this._status,
      // eslint-disable-next-line deprecation/deprecation
      tags: Object.keys(this.tags).length > 0 ? this.tags : undefined,
      timestamp: this._endTime,
      trace_id: this._traceId,
      origin: this._attributes[SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN] as SpanOrigin | undefined,
      _metrics_summary: getMetricSummaryJsonForSpan(this),
    });
  }

  /** @inheritdoc */
  public isRecording(): boolean {
    return !this._endTime && !!this._sampled;
  }

  /**
   * Convert the object to JSON.
   * @deprecated Use `spanToJSON(span)` instead.
   */
  public toJSON(): SpanJSON {
    return this.getSpanJSON();
  }

  /**
   * Get the merged data for this span.
   * For now, this combines `data` and `attributes` together,
   * until eventually we can ingest `attributes` directly.
   */
  private _getData():
    | {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        [key: string]: any;
      }
    | undefined {
    // eslint-disable-next-line deprecation/deprecation
    const { data, _attributes: attributes } = this;

    const hasData = Object.keys(data).length > 0;
    const hasAttributes = Object.keys(attributes).length > 0;

    if (!hasData && !hasAttributes) {
      return undefined;
    }

    if (hasData && hasAttributes) {
      return {
        ...data,
        ...attributes,
      };
    }

    return hasData ? data : attributes;
  }
}
