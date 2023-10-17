import { logger } from '@sentry/utils';

import type { FeedbackConfigurationWithDefaults } from '../types';
import { createDialogStyles } from './Dialog.css';
import { createMainStyles } from './Main.css';

interface CreateShadowHostParams {
  options: FeedbackConfigurationWithDefaults;
}
/**
 *
 */
export function createShadowHost({ options }: CreateShadowHostParams): [shadow: ShadowRoot, host: HTMLDivElement] {
  // eslint-disable-next-line no-restricted-globals
  const doc = document;
  if (!doc.head.attachShadow) {
    // Shadow DOM not supported
    logger.warn('[Feedback] Browser does not support shadow DOM API');
    throw new Error('Browser does not support shadow DOM API.');
  }

  // Create the host
  const host = doc.createElement('div');
  host.id = options.id;

  // Create the shadow root
  const shadow = host.attachShadow({ mode: 'open' });

  shadow.appendChild(
    createMainStyles(doc, options.colorScheme, { dark: options.themeDark, light: options.themeLight }),
  );
  shadow.appendChild(createDialogStyles(doc));

  return [shadow, host];
}
