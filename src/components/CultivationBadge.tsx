import { publicEnv } from '@/app/config/env';
import { identityCultivationRealmLabel } from '@/features/identity/labels';
import { formatNumber } from '@/i18n/format';
import { useResolvedLocale } from '@/i18n/LanguageProvider';
import { useFeatureTranslation } from '@/i18n/useFeatureTranslation';
import { cultivationForRank } from '@/utils/cultivation';

type CultivationBadgeProps = {
  rank?: number | null;
};

export default function CultivationBadge({ rank }: CultivationBadgeProps) {
  const { t } = useFeatureTranslation('identity');
  const locale = useResolvedLocale();
  const cultivation = cultivationForRank(rank);
  if (!cultivation) return null;
  const normalizedRank =
    typeof rank === 'number' && Number.isFinite(rank)
      ? Math.max(0, Math.floor(rank))
      : 0;
  const realm = identityCultivationRealmLabel(t, cultivation);
  const label = t('cultivation.label', {
    realm,
    rank: formatNumber(locale, normalizedRank),
  });

  return (
    <span
      className={`cultivation-badge realm-${cultivation.className}${
        cultivation.phaseClass ? ` phase-${cultivation.phaseClass}` : ''
      }`}
      title={label}
      role="img"
      aria-label={label}
    >
      <img
        className="cultivation-icon"
        src={`${publicEnv.publicBasePath || ''}/assets/cultivation-star.png`}
        alt=""
        aria-hidden="true"
      />
      <span>{t(`cultivation.realms.${cultivation.className}`)}</span>
      {cultivation.phase ? (
        <i className="cultivation-phase-mark" aria-hidden="true" />
      ) : null}
    </span>
  );
}
