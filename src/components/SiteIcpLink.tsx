import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useOptionalBootstrap } from '@/app/bootstrap/context';

function SiteIcpLink() {
  const { t } = useTranslation('common');
  const site = useOptionalBootstrap()?.config.site;
  const operator = site?.legalEntity ?? site?.name ?? t('appName');
  const policeCode = site?.filings.publicSecurity?.replace(/\D/g, '') ?? '';
  return (
    <div className="site-icp-links">
      <div className="site-operator-line">
        <span>© {new Date().getFullYear()} {operator}</span>
        {site?.contactEmail ? <a href={`mailto:${site.contactEmail}`}>{site.contactEmail}</a> : null}
        {site?.sourceUrl ? <a href={site.sourceUrl} target="_blank" rel="noreferrer">{t('footer.source')}</a> : null}
      </div>
      <nav className="site-legal-links" aria-label={t('footer.legalNav')}>
        <Link to="/legal">{t('footer.legal')}</Link>
        <Link to="/terms">{t('footer.terms')}</Link>
        <Link to="/privacy">{t('footer.privacy')}</Link>
        <Link to="/copyright">{t('footer.copyright')}</Link>
        <Link to="/contact">{t('footer.contact')}</Link>
      </nav>
      {site?.filings.icp ? (
        <a className="site-icp-link" href="https://beian.miit.gov.cn/" target="_blank" rel="noreferrer">
          {site.filings.icp}
        </a>
      ) : null}
      {site?.filings.publicSecurity && policeCode ? (
        <a
          className="site-icp-link site-police-beian-link"
          href={`https://beian.mps.gov.cn/#/query/webSearch?code=${policeCode}`}
          target="_blank"
          rel="noreferrer"
        >
          <span>{site.filings.publicSecurity}</span>
        </a>
      ) : null}
    </div>
  );
}

export default SiteIcpLink;
