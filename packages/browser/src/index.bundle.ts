// This is exported so the loader does not fail when switching off Replay/Tracing
import {
  Feedback,
  Replay,
  addTracingExtensions,
  browserTracingIntegration,
  feedbackIntegration,
  replayIntegration,
} from '@sentry-internal/integration-shims';

import * as Sentry from './index.bundle.base';

// TODO (v8): Remove this as it was only needed for backwards compatibility
// eslint-disable-next-line deprecation/deprecation
Sentry.Integrations.Replay = Replay;

export * from './index.bundle.base';
export {
  addTracingExtensions,
  // eslint-disable-next-line deprecation/deprecation
  Replay,
  // eslint-disable-next-line deprecation/deprecation
  Feedback,
  browserTracingIntegration,
  feedbackIntegration,
  replayIntegration,
};
// Note: We do not export a shim for `Span` here, as that is quite complex and would blow up the bundle
