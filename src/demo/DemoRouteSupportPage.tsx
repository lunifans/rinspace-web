import { RuntimeHelmet as Helmet } from '@/components/RuntimeHelmet';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import SiteTopbar from '@/components/SiteTopbarShell';

export default function DemoRouteSupportPage() {
  const { t } = useTranslation('common');

  return (
    <>
      <Helmet title={t('demo.routeSupport.title')} />
      <SiteTopbar />
      <main className="rin-demo-capability-page" data-rin-demo-route-support="not-yet-supported">
        <section className="panel rin-demo-capability-card" aria-labelledby="rin-demo-route-support-title">
          <span className="rin-demo-capability-kicker">{t('demo.routeSupport.kicker')}</span>
          <h1 id="rin-demo-route-support-title">{t('demo.routeSupport.title')}</h1>
          <p>{t('demo.routeSupport.message')}</p>
          <p>{t('demo.routeSupport.recovery')}</p>
          <Link className="primary-link-button" to="/">{t('demo.capabilities.backHome')}</Link>
        </section>
      </main>
    </>
  );
}
