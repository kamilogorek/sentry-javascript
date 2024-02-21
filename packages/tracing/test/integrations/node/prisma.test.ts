/* eslint-disable deprecation/deprecation */

import { Integrations } from '../../../src';

const mockStartSpan = jest.fn();

jest.mock('@sentry/core', () => {
  const original = jest.requireActual('@sentry/core');
  return {
    ...original,
    startSpan: (...args: unknown[]) => {
      mockStartSpan(...args);
      return original.startSpan(...args);
    },
  };
});

type PrismaMiddleware = (params: unknown, next: (params?: unknown) => Promise<unknown>) => Promise<unknown>;

class PrismaClient {
  public user: { create: () => Promise<unknown> | undefined } = {
    create: () => this._middleware?.({ action: 'create', model: 'user' }, () => Promise.resolve('result')),
  };

  public _engineConfig = {
    activeProvider: 'postgresql',
    clientVersion: '3.1.2',
  };

  private _middleware?: PrismaMiddleware;

  constructor() {
    this._middleware = undefined;
  }

  public $use(cb: PrismaMiddleware) {
    this._middleware = cb;
  }
}

describe('setupOnce', function () {
  beforeEach(() => {
    mockStartSpan.mockClear();
    mockStartSpan.mockReset();
  });

  it('should add middleware with $use method correctly', done => {
    const prismaClient = new PrismaClient();
    new Integrations.Prisma({ client: prismaClient });
    void prismaClient.user.create()?.then(() => {
      expect(mockStartSpan).toHaveBeenCalledTimes(1);
      expect(mockStartSpan).toHaveBeenLastCalledWith(
        {
          attributes: {
            'sentry.origin': 'auto.db.prisma',
          },
          name: 'user create',
          onlyIfParent: true,
          op: 'db.prisma',
          data: { 'db.system': 'postgresql', 'db.prisma.version': '3.1.2', 'db.operation': 'create' },
        },
        expect.any(Function),
      );
      done();
    });
  });
});
