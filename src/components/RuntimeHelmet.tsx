import { Helmet, type HelmetProps } from 'react-helmet-async';
import type { PropsWithChildren } from 'react';

import { useOptionalBootstrap } from '@/app/bootstrap/context';
import { runtimeDocumentTitle } from '@/app/config/siteMetadata';

export function RuntimeHelmet({ title, ...props }: PropsWithChildren<HelmetProps>) {
  const bootstrap = useOptionalBootstrap();
  const resolvedTitle = bootstrap && title
    ? runtimeDocumentTitle(bootstrap.config, title)
    : title;
  return <Helmet {...props} title={resolvedTitle} />;
}
