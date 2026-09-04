import { RuntimeHelmet as Helmet } from '@/components/RuntimeHelmet';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import SiteTopbar from '@/components/SiteTopbarShell';
import {
  productionCapability,
  type ProductionCapabilityId,
} from './productionCapabilities';

export default function DemoProductionCapabilityPage({
  capabilityId,
}: {
  capabilityId: ProductionCapabilityId;
}) {
  const { t } = useTranslation('common');
  const capability = productionCapability(capabilityId);
  const title = t(`demo.capabilities.items.${capabilityId}.title`);

  return (
    <>
      <Helmet title={title} />
      <SiteTopbar />
      <main className="rin-demo-capability-page" data-rin-demo-capability={capabilityId}>
        <section className="panel rin-demo-capability-card" aria-labelledby="rin-demo-capability-title">
          <span className="rin-demo-capability-kicker">{t('demo.capabilities.productionOnly')}</span>
          <h1 id="rin-demo-capability-title">{title}</h1>
          <p>{t(`demo.capabilities.items.${capabilityId}.description`)}</p>
          <dl>
            <div>
              <dt>{t('demo.capabilities.state')}</dt>
              <dd>{t(`demo.capabilities.states.${capability.state}`)}</dd>
            </div>
            <div>
              <dt>{t('demo.capabilities.dependency')}</dt>
              <dd>{t(`demo.capabilities.items.${capabilityId}.dependency`)}</dd>
            </div>
            <div>
              <dt>{t('demo.capabilities.recovery')}</dt>
              <dd>{t(`demo.capabilities.items.${capabilityId}.recovery`)}</dd>
            </div>
          </dl>
          <Link className="primary-link-button" to="/">{t('demo.capabilities.backHome')}</Link>
        </section>
      </main>
    </>
  );
}
