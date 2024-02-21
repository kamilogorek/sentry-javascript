/* eslint-disable deprecation/deprecation */
/* eslint-disable @typescript-eslint/unbound-method */
import { Hub, Scope, SentrySpan } from '@sentry/core';
import type { Span } from '@sentry/types';
import { loadModule } from '@sentry/utils';
import pg from 'pg';

import { Integrations } from '../../../src';

class PgClient {
  // https://node-postgres.com/api/client#clientquery
  public query(_text: unknown, values: unknown, callback?: (err: unknown, result: unknown) => void) {
    if (typeof callback === 'function') {
      callback(null, null);
      return;
    }

    if (typeof values === 'function') {
      values();
      return;
    }

    return Promise.resolve();
  }
}

// Jest mocks get hoisted. vars starting with `mock` are hoisted before imports.
/* eslint-disable no-var */
var mockModule = {
  Client: PgClient,
  native: {
    Client: PgClient,
  },
};

// mock for 'pg' / 'pg-native' package
jest.mock('@sentry/utils', () => {
  const actual = jest.requireActual('@sentry/utils');
  return {
    ...actual,
    loadModule: jest.fn(() => mockModule),
  };
});

describe('setupOnce', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetAllMocks();
  });

  ['pg', 'pg-native'].forEach(pgApi => {
    const Client: PgClient = new PgClient();
    let scope = new Scope();
    let parentSpan: Span;
    let childSpan: Span;

    beforeAll(() => {
      (pgApi === 'pg' ? new Integrations.Postgres() : new Integrations.Postgres({ usePgNative: true })).setupOnce(
        () => undefined,
        () => new Hub(undefined, scope),
      );
    });

    beforeEach(() => {
      scope = new Scope();
      parentSpan = new SentrySpan();
      childSpan = parentSpan.startChild();
      jest.spyOn(scope, 'getSpan').mockReturnValueOnce(parentSpan);
      jest.spyOn(parentSpan, 'startChild').mockReturnValueOnce(childSpan);
      jest.spyOn(childSpan, 'end');
    });

    it(`should wrap ${pgApi}'s query method accepting callback as the last argument`, done => {
      Client.query('SELECT NOW()', {}, function () {
        expect(scope.getSpan).toBeCalled();
        expect(parentSpan.startChild).toBeCalledWith({
          name: 'SELECT NOW()',
          op: 'db',
          origin: 'auto.db.postgres',
          data: {
            'db.system': 'postgresql',
          },
        });
        expect(childSpan.end).toBeCalled();
        done();
      }) as void;
    });

    it(`should wrap ${pgApi}'s query method accepting callback as the second argument`, done => {
      Client.query('SELECT NOW()', function () {
        expect(scope.getSpan).toBeCalled();
        expect(parentSpan.startChild).toBeCalledWith({
          name: 'SELECT NOW()',
          op: 'db',
          origin: 'auto.db.postgres',
          data: {
            'db.system': 'postgresql',
          },
        });
        expect(childSpan.end).toBeCalled();
        done();
      }) as void;
    });

    it(`should wrap ${pgApi}'s query method accepting no callback as the last argument but returning promise`, async () => {
      await Client.query('SELECT NOW()', null);
      expect(scope.getSpan).toBeCalled();
      expect(parentSpan.startChild).toBeCalledWith({
        name: 'SELECT NOW()',
        op: 'db',
        origin: 'auto.db.postgres',
        data: {
          'db.system': 'postgresql',
        },
      });
      expect(childSpan.end).toBeCalled();
    });
  });

  it('does not attempt resolution when module is passed directly', async () => {
    const scope = new Scope();
    jest.spyOn(scope, 'getSpan').mockReturnValueOnce(new SentrySpan());

    new Integrations.Postgres({ module: mockModule }).setupOnce(
      () => undefined,
      () => new Hub(undefined, scope),
    );

    await new PgClient().query('SELECT NOW()', null);

    expect(loadModule).not.toBeCalled();
    expect(scope.getSpan).toBeCalled();
  });

  it('has valid module type', () => {
    expect(() => new Integrations.Postgres({ module: pg })).not.toThrow();
  });
});
