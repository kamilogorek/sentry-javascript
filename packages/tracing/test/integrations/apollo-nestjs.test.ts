/* eslint-disable deprecation/deprecation */
/* eslint-disable @typescript-eslint/unbound-method */
import { Hub, Scope, SentrySpan } from '@sentry/core';
import type { Span } from '@sentry/types';

import { Integrations } from '../../src';

type ApolloResolverGroup = {
  [key: string]: () => unknown;
};

type ApolloModelResolvers = {
  [key: string]: ApolloResolverGroup;
};

class GraphQLFactory {
  _resolvers: ApolloModelResolvers[];
  resolversExplorerService = {
    explore: () => this._resolvers,
  };
  constructor() {
    this._resolvers = [
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
    ];

    this.mergeWithSchema();
  }

  public mergeWithSchema(..._args: unknown[]) {
    return this.resolversExplorerService.explore();
  }
}

// Jest mocks get hoisted. vars starting with `mock` are hoisted before imports.
/* eslint-disable no-var */
var mockFactory = GraphQLFactory;

// mock for @nestjs/graphql package
jest.mock('@sentry/utils', () => {
  const actual = jest.requireActual('@sentry/utils');
  return {
    ...actual,
    loadModule() {
      return {
        GraphQLFactory: mockFactory,
      };
    },
  };
});

describe('setupOnce', () => {
  let scope = new Scope();
  let parentSpan: Span;
  let childSpan: Span;
  let GraphQLFactoryInstance: GraphQLFactory;

  beforeAll(() => {
    new Integrations.Apollo({
      useNestjs: true,
    }).setupOnce(
      () => undefined,
      () => new Hub(undefined, scope),
    );

    GraphQLFactoryInstance = new GraphQLFactory();
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
    GraphQLFactoryInstance._resolvers[0]?.['Query']?.['res_1']?.();
    expect(scope.getSpan).toBeCalled();
    expect(parentSpan.startChild).toBeCalledWith({
      name: 'Query.res_1',
      op: 'graphql.resolve',
      origin: 'auto.graphql.apollo',
    });
    expect(childSpan.end).toBeCalled();
  });

  it('should wrap another simple resolver', () => {
    GraphQLFactoryInstance._resolvers[0]?.['Mutation']?.['res_2']?.();
    expect(scope.getSpan).toBeCalled();
    expect(parentSpan.startChild).toBeCalledWith({
      name: 'Mutation.res_2',
      op: 'graphql.resolve',
      origin: 'auto.graphql.apollo',
    });
    expect(childSpan.end).toBeCalled();
  });
});
