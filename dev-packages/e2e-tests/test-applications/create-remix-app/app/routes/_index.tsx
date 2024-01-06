import { Link } from '@remix-run/react';
import * as Sentry from '@sentry/remix';

export default function Index() {
  return (
    <div>
      <input
        type="button"
        value="Capture Exception"
        id="exception-button"
        onClick={() => {
          const eventId = Sentry.captureException(new Error('I am an error!'));
          window.capturedExceptionId = eventId;
        }}
      />
      <Link to="/user/0" id="navigation">
        navigate
      </Link>
    </div>
  );
}
