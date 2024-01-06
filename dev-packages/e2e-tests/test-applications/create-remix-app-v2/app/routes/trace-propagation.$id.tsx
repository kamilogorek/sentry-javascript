import { LoaderFunction, json } from '@remix-run/node';
import { Link, useLoaderData } from '@remix-run/react';
import * as Sentry from '@sentry/remix';
import { useEffect, useState } from 'react';

type LoaderData = { traceId: string; paramsId: string };

export const loader: LoaderFunction = async ({ params }) => {
  const transaction = Sentry.getActiveTransaction();

  let traceId = null;

  if (transaction) {
    traceId = transaction.traceId;
  }

  return json({
    traceId,
    paramsId: params.id,
  });
};

export default function TracePropagation() {
  const [count, setCount] = useState(0);
  const data = useLoaderData<LoaderData>();

  useEffect(() => {
    if (count > 0 && data && data.paramsId === '-1') {
      throw new Error(data.traceId);
    } else {
      setTimeout(() => setCount(count + 1), 0);
    }
  }, [count, data]);

  return (
    <div>
      <Link to="/trace-propagation-navigated" id="navigation">
        navigate
      </Link>
      <span id="trace-id">{data && data.traceId ? data.traceId : 'Not Found'}</span>
    </div>
  );
}
