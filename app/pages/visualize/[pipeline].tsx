import { useRouter } from 'next/router';
import { useEffect } from 'react';

export default function PipelinePage() {
  const { query } = useRouter();
  const name = query.pipeline as string;

  useEffect(() => {
    if (name) {
      window.location.href = `http://${window.location.hostname}:9000/${name}/`;
    }
  }, [name]);

  return null;
}
