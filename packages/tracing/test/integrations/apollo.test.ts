/* eslint-disable deprecation/deprecation */
/* eslint-disable @typescript-eslint/unbound-method */
import { Hub, Scope, SentrySpan } from '@sentry/core';
import type { Span } from '@sentry/types';

import { Integrations } from '../../src';

type ApolloResolverGroup = {
  [key: string]: () => any;
};

type ApolloModelResolvers = {
  [key: string]: ApolloResolverGroup;
};

class ApolloServerBase {
  config: {
    resolvers: ApolloModelResolvers[];
  };

  constructor() {
    this.config = {
      resolvers: [
        {
          Query: {
            res_1(..._args: unknown[]) {
              return 'foo';
            },
          },
          Mutation: {
            res_2(..._args: unknown[]) {
              return 'bar';
            },
          },
        },
      ],
    };

    this.constructSchema();
  }

  public constructSchema(..._args: unknown[]) {
    return null;
  }
}

// Jest mocks get hoisted. vars starting with `mock` are hoisted before imports.
/* eslint-disable no-var */
var mockClient = ApolloServerBase;

// mock for ApolloServer package
jest.mock('@sentry/utils', () => {
  const actual = jest.requireActual('@sentry/utils');
  return {
    ...actual,
    loadModule() {
      return {
        ApolloServerBase: mockClient,
      };
    },
  };
});

describe('setupOnce', () => {
  let scope = new Scope();
  let parentSpan: Span;
  let childSpan: Span;
  let ApolloServer: ApolloServerBase;

  beforeAll(() => {
    new Integrations.Apollo().setupOnce(
      () => undefined,
      () => new Hub(undefined, scope),
    );

    ApolloServer = new ApolloServerBase();
  });

  beforeEach(() => {
    scope = new Scope();
    parentSpan = new SentrySpan();
    childSpan = parentSpan.startChild();
    jest.spyOn(scope, 'getSpan').mockReturnValueOnce(parentSpan);
    jest.spyOn(scope, 'setSpan');
    jest.spyOn(parentSpan, 'startChild').mockReturnValueOnce(childSpan);
    jest.spyOn(childSpan, 'end');
  });

  it('should wrap a simple resolver', () => {
    ApolloServer.config.resolvers[0]?.['Query']?.['res_1']?.();
    expect(scope.getSpan).toBeCalled();
    expect(parentSpan.startChild).toBeCalledWith({
      name: 'Query.res_1',
      op: 'graphql.resolve',
      origin: 'auto.graphql.apollo',
    });
    expect(childSpan.end).toBeCalled();
  });

  it('should wrap another simple resolver', () => {
    ApolloServer.config.resolvers[0]?.['Mutation']?.['res_2']?.();
    expect(scope.getSpan).toBeCalled();
    expect(parentSpan.startChild).toBeCalledWith({
      name: 'Mutation.res_2',
      op: 'graphql.resolve',
      origin: 'auto.graphql.apollo',
    });
    expect(childSpan.end).toBeCalled();
  });
});
