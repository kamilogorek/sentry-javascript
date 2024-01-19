export {
  // eslint-disable-next-line deprecation/deprecation
  withSentryGetStaticProps,
  wrapGetStaticPropsWithSentry,
} from './wrapGetStaticPropsWithSentry';

export {
  // eslint-disable-next-line deprecation/deprecation
  withSentryServerSideGetInitialProps,
  wrapGetInitialPropsWithSentry,
} from './wrapGetInitialPropsWithSentry';

export {
  // eslint-disable-next-line deprecation/deprecation
  withSentryServerSideAppGetInitialProps,
  wrapAppGetInitialPropsWithSentry,
} from './wrapAppGetInitialPropsWithSentry';

export {
  // eslint-disable-next-line deprecation/deprecation
  withSentryServerSideDocumentGetInitialProps,
  wrapDocumentGetInitialPropsWithSentry,
} from './wrapDocumentGetInitialPropsWithSentry';

export {
  // eslint-disable-next-line deprecation/deprecation
  withSentryServerSideErrorGetInitialProps,
  wrapErrorGetInitialPropsWithSentry,
} from './wrapErrorGetInitialPropsWithSentry';

export {
  // eslint-disable-next-line deprecation/deprecation
  withSentryGetServerSideProps,
  wrapGetServerSidePropsWithSentry,
} from './wrapGetServerSidePropsWithSentry';

export { wrapServerComponentWithSentry } from './wrapServerComponentWithSentry';

export { wrapRouteHandlerWithSentry } from './wrapRouteHandlerWithSentry';

export { wrapApiHandlerWithSentryVercelCrons } from './wrapApiHandlerWithSentryVercelCrons';

export { wrapMiddlewareWithSentry } from './wrapMiddlewareWithSentry';

export { wrapPageComponentWithSentry } from './wrapPageComponentWithSentry';

export { wrapGenerationFunctionWithSentry } from './wrapGenerationFunctionWithSentry';

export { withServerActionInstrumentation } from './withServerActionInstrumentation';

export { experimental_nextjsSSRTracing } from './appDirSSRTracing';
