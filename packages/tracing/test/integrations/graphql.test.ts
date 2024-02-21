/* eslint-disable deprecation/deprecation */
/* eslint-disable @typescript-eslint/unbound-method */
import { Hub, Scope, SentrySpan } from '@sentry/core';
import type { Span } from '@sentry/types';

import { Integrations } from '../../src';

const GQLExecute = {
  execute() {
    return Promise.resolve();
  },
};

// Jest mocks get hoisted. vars starting with `mock` are hoisted before imports.
/* eslint-disable no-var */
var mockClient = GQLExecute;

// mock for 'graphql/execution/execution.js' package
jest.mock('@sentry/utils', () => {
  const actual = jest.requireActual('@sentry/utils');
  return {
    ...actual,
    loadModule() {
      return mockClient;
    },
  };
});

describe('setupOnce', () => {
  let scope = new Scope();
  let parentSpan: Span;
  let childSpan: Span;

  beforeAll(() => {
    new Integrations.GraphQL().setupOnce(
      () => undefined,
      () => new Hub(undefined, scope),
    );
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

  it('should wrap execute method', async () => {
    await GQLExecute.execute();
    expect(scope.getSpan).toBeCalled();
    expect(parentSpan.startChild).toBeCalledWith({
      name: 'execute',
      op: 'graphql.execute',
      origin: 'auto.graphql.graphql',
    });
    expect(childSpan.end).toBeCalled();
    expect(scope.setSpan).toHaveBeenCalledTimes(2);
  });
});
