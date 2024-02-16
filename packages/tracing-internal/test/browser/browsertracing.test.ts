/* eslint-disable deprecation/deprecation */
import { TRACING_DEFAULTS, getClient, getCurrentHub, setCurrentClient, spanToJSON } from '@sentry/core';
import * as hubExtensions from '@sentry/core';
import type { BaseTransportOptions, ClientOptions, DsnComponents, HandlerDataHistory } from '@sentry/types';
import { JSDOM } from 'jsdom';

import { timestampInSeconds } from '@sentry/utils';
import type { IdleTransaction } from '../../../tracing/src';
import { getActiveTransaction } from '../../../tracing/src';
import { getDefaultBrowserClientOptions } from '../../../tracing/test/testutils';
import type { BrowserTracingOptions } from '../../src/browser/browsertracing';
import { BrowserTracing, getMetaContent } from '../../src/browser/browsertracing';
import { defaultRequestInstrumentationOptions } from '../../src/browser/request';
import { instrumentRoutingWithDefaults } from '../../src/browser/router';
import { WINDOW } from '../../src/browser/types';
import { TestClient } from '../utils/TestClient';

let mockChangeHistory: (data: HandlerDataHistory) => void = () => {};

jest.mock('@sentry/utils', () => {
  const actual = jest.requireActual('@sentry/utils');
  return {
    ...actual,

    addHistoryInstrumentationHandler: (callback: (data: HandlerDataHistory) => void): void => {
      mockChangeHistory = callback;
    },
  };
});

const mockStartTrackingWebVitals = jest.fn().mockReturnValue(() => () => {});

jest.mock('../../src/browser/metrics', () => ({
  addPerformanceEntries: jest.fn(),
  startTrackingInteractions: jest.fn(),
  startTrackingLongTasks: jest.fn(),
  startTrackingWebVitals: () => mockStartTrackingWebVitals(),
}));

const instrumentOutgoingRequestsMock = jest.fn();
jest.mock('./../../src/browser/request', () => {
  const actual = jest.requireActual('./../../src/browser/request');
  return {
    ...actual,
    instrumentOutgoingRequests: (options: Partial<BrowserTracingOptions>) => instrumentOutgoingRequestsMock(options),
  };
});

beforeAll(() => {
  const dom = new JSDOM();
  // @ts-expect-error need to override global document
  WINDOW.document = dom.window.document;
  // @ts-expect-error need to override global document
  WINDOW.window = dom.window;
  WINDOW.location = dom.window.location;
});

describe('BrowserTracing', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    const options = getDefaultBrowserClientOptions({ tracesSampleRate: 1 });
    const client = new TestClient(options);
    setCurrentClient(client);
    client.init();
    document.head.innerHTML = '';

    mockStartTrackingWebVitals.mockClear();
  });

  afterEach(() => {
    const activeTransaction = getActiveTransaction();
    if (activeTransaction) {
      // Should unset off of scope.
      activeTransaction.end();
    }
  });

  function createBrowserTracing(setup?: boolean, _options?: Partial<BrowserTracingOptions>): BrowserTracing {
    const instance = new BrowserTracing(_options);
    if (setup) {
      const processor = () => undefined;
      instance.setupOnce(processor, () => getCurrentHub() as hubExtensions.Hub);
    }

    return instance;
  }

  // These are important enough to check with a test as incorrect defaults could
  // break a lot of users' configurations.
  it('is created with default settings', () => {
    const browserTracing = createBrowserTracing();

    expect(browserTracing.options).toEqual({
      enableLongTask: true,
      _experiments: {},
      ...TRACING_DEFAULTS,
      markBackgroundTransactions: true,
      routingInstrumentation: instrumentRoutingWithDefaults,
      startTransactionOnLocationChange: true,
      startTransactionOnPageLoad: true,
      ...defaultRequestInstrumentationOptions,
    });
  });

  it('is allows to disable enableLongTask via _experiments', () => {
    const browserTracing = createBrowserTracing(false, {
      _experiments: {
        enableLongTask: false,
      },
    });

    expect(browserTracing.options).toEqual({
      enableLongTask: false,
      ...TRACING_DEFAULTS,
      markBackgroundTransactions: true,
      routingInstrumentation: instrumentRoutingWithDefaults,
      startTransactionOnLocationChange: true,
      startTransactionOnPageLoad: true,
      ...defaultRequestInstrumentationOptions,
      _experiments: {
        enableLongTask: false,
      },
    });
  });

  it('is allows to disable enableLongTask', () => {
    const browserTracing = createBrowserTracing(false, {
      enableLongTask: false,
    });

    expect(browserTracing.options).toEqual({
      enableLongTask: false,
      _experiments: {},
      ...TRACING_DEFAULTS,
      markBackgroundTransactions: true,
      routingInstrumentation: instrumentRoutingWithDefaults,
      startTransactionOnLocationChange: true,
      startTransactionOnPageLoad: true,
      ...defaultRequestInstrumentationOptions,
    });
  });

  /**
   * All of these tests under `describe('route transaction')` are tested with
   * `browserTracing.options = { routingInstrumentation: customInstrumentRouting }`,
   * so that we can show this functionality works independent of the default routing integration.
   */
  describe('route transaction', () => {
    const customInstrumentRouting = (customStartTransaction: (obj: any) => void) => {
      customStartTransaction({ name: 'a/path', op: 'pageload' });
    };

    it('_experiements calls onStartRouteTransaction on route instrumentation', () => {
      const onStartTranscation = jest.fn();
      createBrowserTracing(true, {
        _experiments: {
          onStartRouteTransaction: onStartTranscation,
        },
      });

      expect(onStartTranscation).toHaveBeenCalledTimes(1);
    });

    it('calls custom routing instrumenation', () => {
      createBrowserTracing(true, {
        routingInstrumentation: customInstrumentRouting,
      });

      const transaction = getActiveTransaction() as IdleTransaction;
      expect(transaction).toBeDefined();
      expect(transaction.name).toBe('a/path');
      expect(transaction.op).toBe('pageload');
    });

    it('trims all transactions', () => {
      createBrowserTracing(true, {
        routingInstrumentation: customInstrumentRouting,
      });

      const transaction = getActiveTransaction() as IdleTransaction;
      const span = transaction.startChild();

      const timestamp = timestampInSeconds();
      span.end(timestamp);
      transaction.end(timestamp + 12345);

      expect(spanToJSON(transaction).timestamp).toBe(timestamp);
    });

    describe('beforeNavigate', () => {
      it('is called on transaction creation', () => {
        const mockBeforeNavigation = jest.fn().mockReturnValue({ name: 'here/is/my/path' });
        createBrowserTracing(true, {
          beforeNavigate: mockBeforeNavigation,
          routingInstrumentation: customInstrumentRouting,
        });
        const transaction = getActiveTransaction() as IdleTransaction;
        expect(transaction).toBeDefined();

        expect(mockBeforeNavigation).toHaveBeenCalledTimes(1);
      });

      it('creates a transaction with sampled = false if beforeNavigate returns undefined', () => {
        const mockBeforeNavigation = jest.fn().mockReturnValue(undefined);
        createBrowserTracing(true, {
          beforeNavigate: mockBeforeNavigation,
          routingInstrumentation: customInstrumentRouting,
        });
        const transaction = getActiveTransaction() as IdleTransaction;
        expect(transaction.sampled).toBe(false);

        expect(mockBeforeNavigation).toHaveBeenCalledTimes(1);
      });

      it('can override default context values', () => {
        const mockBeforeNavigation = jest.fn(ctx => ({
          ...ctx,
          op: 'not-pageload',
        }));
        createBrowserTracing(true, {
          beforeNavigate: mockBeforeNavigation,
          routingInstrumentation: customInstrumentRouting,
        });
        const transaction = getActiveTransaction() as IdleTransaction;
        expect(transaction).toBeDefined();
        expect(transaction.op).toBe('not-pageload');

        expect(mockBeforeNavigation).toHaveBeenCalledTimes(1);
      });

      it("sets transaction name source to `'custom'` if name is changed", () => {
        const mockBeforeNavigation = jest.fn(ctx => ({
          ...ctx,
          name: 'newName',
        }));
        createBrowserTracing(true, {
          beforeNavigate: mockBeforeNavigation,
          routingInstrumentation: customInstrumentRouting,
        });
        const transaction = getActiveTransaction() as IdleTransaction;
        expect(transaction).toBeDefined();
        expect(transaction.name).toBe('newName');
        expect(transaction.metadata.source).toBe('custom');

        expect(mockBeforeNavigation).toHaveBeenCalledTimes(1);
      });

      it('sets transaction name source to default `url` if name is not changed', () => {
        const mockBeforeNavigation = jest.fn(ctx => ({
          ...ctx,
        }));
        createBrowserTracing(true, {
          beforeNavigate: mockBeforeNavigation,
          routingInstrumentation: (customStartTransaction: (obj: any) => void) => {
            customStartTransaction({ name: 'a/path', op: 'pageload', metadata: { source: 'url' } });
          },
        });
        const transaction = getActiveTransaction() as IdleTransaction;
        expect(transaction).toBeDefined();
        expect(transaction.name).toBe('a/path');
        expect(transaction.metadata.source).toBe('url');

        expect(mockBeforeNavigation).toHaveBeenCalledTimes(1);
      });
    });

    it('sets transaction context from sentry-trace header', () => {
      const name = 'sentry-trace';
      const content = '126de09502ae4e0fb26c6967190756a4-b6e54397b12a2a0f-1';
      document.head.innerHTML =
        `<meta name="${name}" content="${content}">` + '<meta name="baggage" content="sentry-release=2.1.14,foo=bar">';
      const startIdleTransaction = jest.spyOn(hubExtensions, 'startIdleTransaction');

      createBrowserTracing(true, { routingInstrumentation: customInstrumentRouting });

      expect(startIdleTransaction).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          traceId: '126de09502ae4e0fb26c6967190756a4',
          parentSpanId: 'b6e54397b12a2a0f',
          parentSampled: true,
          metadata: {
            dynamicSamplingContext: { release: '2.1.14' },
          },
        }),
        expect.any(Number),
        expect.any(Number),
        expect.any(Boolean),
        expect.any(Object),
        expect.any(Number),
        true,
      );
    });

    describe('idleTimeout', () => {
      it('is created by default', () => {
        createBrowserTracing(true, { routingInstrumentation: customInstrumentRouting });
        const mockFinish = jest.fn();
        const transaction = getActiveTransaction() as IdleTransaction;
        transaction.sendAutoFinishSignal();
        transaction.end = mockFinish;

        const span = transaction.startChild(); // activities = 1
        span.end(); // activities = 0

        expect(mockFinish).toHaveBeenCalledTimes(0);
        jest.advanceTimersByTime(TRACING_DEFAULTS.idleTimeout);
        expect(mockFinish).toHaveBeenCalledTimes(1);
      });

      it('can be a custom value', () => {
        createBrowserTracing(true, { idleTimeout: 2000, routingInstrumentation: customInstrumentRouting });
        const mockFinish = jest.fn();
        const transaction = getActiveTransaction() as IdleTransaction;
        transaction.sendAutoFinishSignal();
        transaction.end = mockFinish;

        const span = transaction.startChild(); // activities = 1
        span.end(); // activities = 0

        expect(mockFinish).toHaveBeenCalledTimes(0);
        jest.advanceTimersByTime(2000);
        expect(mockFinish).toHaveBeenCalledTimes(1);
      });

      it('calls `_collectWebVitals` if enabled', () => {
        createBrowserTracing(true, { routingInstrumentation: customInstrumentRouting });
        const transaction = getActiveTransaction() as IdleTransaction;

        const span = transaction.startChild(); // activities = 1
        span.end(); // activities = 0

        jest.advanceTimersByTime(TRACING_DEFAULTS.idleTimeout);
        expect(mockStartTrackingWebVitals).toHaveBeenCalledTimes(1);
      });
    });

    describe('heartbeatInterval', () => {
      it('can be a custom value', () => {
        const interval = 200;
        createBrowserTracing(true, { heartbeatInterval: interval, routingInstrumentation: customInstrumentRouting });
        const mockFinish = jest.fn();
        const transaction = getActiveTransaction() as IdleTransaction;
        transaction.sendAutoFinishSignal();
        transaction.end = mockFinish;

        const span = transaction.startChild(); // activities = 1
        span.end(); // activities = 0

        expect(mockFinish).toHaveBeenCalledTimes(0);
        jest.advanceTimersByTime(interval * 3);
        expect(mockFinish).toHaveBeenCalledTimes(1);
      });
    });
  });

  // Integration tests for the default routing instrumentation
  describe('default routing instrumentation', () => {
    describe('pageload transaction', () => {
      it('is created on setup on scope', () => {
        createBrowserTracing(true);
        const transaction = getActiveTransaction() as IdleTransaction;
        expect(transaction).toBeDefined();

        expect(transaction.op).toBe('pageload');
      });

      it('is not created if the option is false', () => {
        createBrowserTracing(true, { startTransactionOnPageLoad: false });
        const transaction = getActiveTransaction() as IdleTransaction;
        expect(transaction).not.toBeDefined();
      });
    });

    describe('navigation transaction', () => {
      beforeEach(() => {
        mockChangeHistory = () => undefined;
      });

      it('it is not created automatically at startup', () => {
        createBrowserTracing(true);
        jest.runAllTimers();

        const transaction = getActiveTransaction() as IdleTransaction;
        expect(transaction).not.toBeDefined();
      });

      it('is created on location change', () => {
        createBrowserTracing(true);
        const transaction1 = getActiveTransaction() as IdleTransaction;
        expect(transaction1.op).toBe('pageload');
        expect(spanToJSON(transaction1).timestamp).not.toBeDefined();

        mockChangeHistory({ to: 'here', from: 'there' });
        const transaction2 = getActiveTransaction() as IdleTransaction;
        expect(transaction2.op).toBe('navigation');

        expect(spanToJSON(transaction1).timestamp).toBeDefined();
      });

      it('is not created if startTransactionOnLocationChange is false', () => {
        createBrowserTracing(true, { startTransactionOnLocationChange: false });
        const transaction1 = getActiveTransaction() as IdleTransaction;
        expect(transaction1.op).toBe('pageload');
        expect(spanToJSON(transaction1).timestamp).not.toBeDefined();

        mockChangeHistory({ to: 'here', from: 'there' });
        const transaction2 = getActiveTransaction() as IdleTransaction;
        expect(transaction2.op).toBe('pageload');
      });
    });
  });

  describe('sentry-trace and baggage <meta> elements', () => {
    describe('getMetaContent', () => {
      it('finds the specified tag and extracts the value', () => {
        const name = 'sentry-trace';
        const content = '126de09502ae4e0fb26c6967190756a4-b6e54397b12a2a0f-1';
        document.head.innerHTML = `<meta name="${name}" content="${content}">`;

        const metaTagValue = getMetaContent(name);
        expect(metaTagValue).toBe(content);
      });

      it("doesn't return meta tags other than the one specified", () => {
        document.head.innerHTML = '<meta name="cat-cafe">';

        const metaTagValue = getMetaContent('dogpark');
        expect(metaTagValue).toBe(undefined);
      });

      it('can pick the correct tag out of multiple options', () => {
        const name = 'sentry-trace';
        const content = '126de09502ae4e0fb26c6967190756a4-b6e54397b12a2a0f-1';
        const sentryTraceMeta = `<meta name="${name}" content="${content}">`;
        const otherMeta = '<meta name="cat-cafe">';
        document.head.innerHTML = `${sentryTraceMeta} ${otherMeta}`;

        const metaTagValue = getMetaContent(name);
        expect(metaTagValue).toBe(content);
      });
    });

    describe('using the <meta> tag data', () => {
      beforeEach(() => {
        getClient()!.getOptions = () => {
          return {
            release: '1.0.0',
            environment: 'production',
          } as ClientOptions<BaseTransportOptions>;
        };

        getClient()!.getDsn = () => {
          return {
            publicKey: 'pubKey',
          } as DsnComponents;
        };
      });

      it('uses the tracing data for pageload transactions', () => {
        // make sampled false here, so we can see that it's being used rather than the tracesSampleRate-dictated one
        document.head.innerHTML =
          '<meta name="sentry-trace" content="12312012123120121231201212312012-1121201211212012-0">' +
          '<meta name="baggage" content="sentry-release=2.1.14,foo=bar">';

        // pageload transactions are created as part of the BrowserTracing integration's initialization
        createBrowserTracing(true);
        const transaction = getActiveTransaction() as IdleTransaction;
        const dynamicSamplingContext = transaction.getDynamicSamplingContext()!;

        expect(transaction).toBeDefined();
        expect(transaction.op).toBe('pageload');
        expect(transaction.traceId).toEqual('12312012123120121231201212312012');
        expect(transaction.parentSpanId).toEqual('1121201211212012');
        expect(transaction.sampled).toBe(false);
        expect(dynamicSamplingContext).toBeDefined();
        expect(dynamicSamplingContext).toStrictEqual({ release: '2.1.14' });
      });

      it('puts frozen Dynamic Sampling Context on pageload transactions if sentry-trace data and only 3rd party baggage is present', () => {
        // make sampled false here, so we can see that it's being used rather than the tracesSampleRate-dictated one
        document.head.innerHTML =
          '<meta name="sentry-trace" content="12312012123120121231201212312012-1121201211212012-0">' +
          '<meta name="baggage" content="foo=bar">';

        // pageload transactions are created as part of the BrowserTracing integration's initialization
        createBrowserTracing(true);
        const transaction = getActiveTransaction() as IdleTransaction;
        const dynamicSamplingContext = transaction.getDynamicSamplingContext()!;

        expect(transaction).toBeDefined();
        expect(transaction.op).toBe('pageload');
        expect(transaction.traceId).toEqual('12312012123120121231201212312012');
        expect(transaction.parentSpanId).toEqual('1121201211212012');
        expect(transaction.sampled).toBe(false);
        expect(dynamicSamplingContext).toStrictEqual({});
      });

      it('ignores the meta tag data for navigation transactions', () => {
        mockChangeHistory = () => undefined;
        document.head.innerHTML =
          '<meta name="sentry-trace" content="12312012123120121231201212312012-1121201211212012-0">' +
          '<meta name="baggage" content="sentry-release=2.1.14">';

        createBrowserTracing(true);

        mockChangeHistory({ to: 'here', from: 'there' });
        const transaction = getActiveTransaction() as IdleTransaction;
        const dynamicSamplingContext = transaction.getDynamicSamplingContext()!;

        expect(transaction).toBeDefined();
        expect(transaction.op).toBe('navigation');
        expect(transaction.traceId).not.toEqual('12312012123120121231201212312012');
        expect(transaction.parentSpanId).toBeUndefined();
        expect(dynamicSamplingContext).toStrictEqual({
          release: '1.0.0',
          environment: 'production',
          public_key: 'pubKey',
          sampled: 'false',
          trace_id: expect.not.stringMatching('12312012123120121231201212312012'),
        });
      });
    });
  });

  describe('sampling', () => {
    const dogParkLocation = {
      hash: '#next-to-the-fountain',
      host: 'the.dog.park',
      hostname: 'the.dog.park',
      href: 'mutualsniffing://the.dog.park/by/the/trees/?chase=me&please=thankyou#next-to-the-fountain',
      origin: "'mutualsniffing://the.dog.park",
      pathname: '/by/the/trees/',
      port: '',
      protocol: 'mutualsniffing:',
      search: '?chase=me&please=thankyou',
    };

    it('extracts window.location/self.location for sampling context in pageload transactions', () => {
      WINDOW.location = dogParkLocation as any;

      const tracesSampler = jest.fn();
      const options = getDefaultBrowserClientOptions({ tracesSampler });
      const client = new TestClient(options);
      setCurrentClient(client);
      client.init();
      // setting up the BrowserTracing integration automatically starts a pageload transaction
      createBrowserTracing(true);

      expect(tracesSampler).toHaveBeenCalledWith(
        expect.objectContaining({
          location: dogParkLocation,
          transactionContext: expect.objectContaining({ op: 'pageload' }),
        }),
      );
    });

    it('extracts window.location/self.location for sampling context in navigation transactions', () => {
      WINDOW.location = dogParkLocation as any;

      const tracesSampler = jest.fn();
      const options = getDefaultBrowserClientOptions({ tracesSampler });
      const client = new TestClient(options);
      setCurrentClient(client);
      client.init();
      // setting up the BrowserTracing integration normally automatically starts a pageload transaction, but that's not
      // what we're testing here
      createBrowserTracing(true, { startTransactionOnPageLoad: false });

      mockChangeHistory({ to: 'here', from: 'there' });
      expect(tracesSampler).toHaveBeenCalledWith(
        expect.objectContaining({
          location: dogParkLocation,
          transactionContext: expect.objectContaining({ op: 'navigation' }),
        }),
      );
    });
  });
});
