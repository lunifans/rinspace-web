export type CultivationRealm = {
  fullName: string;
  realm: string;
  phase?: string;
  className: string;
  phaseClass?: string;
};

type CultivationThreshold = {
  realm: string;
  phase?: string;
  minRank: number;
  phaseClass?: string;
};

const qiLayerNames = [
  '一层',
  '二层',
  '三层',
  '四层',
  '五层',
  '六层',
  '七层',
  '八层',
  '九层',
  '十层',
  '十一层',
  '十二层',
  '十三层',
];

const qiRealms = Array.from({ length: 13 }, (_, index) => ({
  realm: '炼气期',
  phase: qiLayerNames[index],
  minRank: index * 50,
  phaseClass: `q${index + 1}`,
}));

const realmStarts = [
  { realm: '筑基', minRank: 800 },
  { realm: '结丹', minRank: 2000 },
  { realm: '元婴', minRank: 5000 },
  { realm: '化神', minRank: 12000 },
  { realm: '炼虚', minRank: 30000 },
  { realm: '合体', minRank: 80000 },
  { realm: '大乘', minRank: 200000 },
  { realm: '真仙', minRank: 600000 },
  { realm: '金仙', minRank: 2000000 },
  { realm: '太乙玉仙', minRank: 8000000 },
  { realm: '大罗', minRank: 30000000 },
];

const advancedRealms = realmStarts.flatMap((current, index) => {
  const nextMinRank =
    realmStarts[index + 1]?.minRank ?? 100000000;
  const span = nextMinRank - current.minRank;
  const phaseStep = Math.floor(span / 4);
  return [
    { realm: current.realm, phase: '初期', minRank: current.minRank, phaseClass: 'early' },
    { realm: current.realm, phase: '中期', minRank: current.minRank + phaseStep, phaseClass: 'middle' },
    { realm: current.realm, phase: '后期', minRank: current.minRank + phaseStep * 2, phaseClass: 'late' },
    { realm: current.realm, phase: '大圆满', minRank: current.minRank + phaseStep * 3, phaseClass: 'complete' },
  ];
});

export const cultivationThresholds: CultivationThreshold[] = [
  ...qiRealms,
  ...advancedRealms,
  {
    realm: '道祖境',
    minRank: 100000000,
  },
];

export type CultivationProgress = {
  rank: number;
  cultivation: CultivationRealm;
  nextThreshold: CultivationThreshold | null;
  remaining: number | null;
};

export function cultivationForRank(rank?: number | null): CultivationRealm | null {
  if (typeof rank !== 'number' || !Number.isFinite(rank)) return null;
  const normalizedRank = Math.max(0, Math.floor(rank));
  const threshold = cultivationThresholds.reduce(
    (current, candidate) =>
      normalizedRank >= candidate.minRank ? candidate : current,
    cultivationThresholds[0],
  );
  const fullName = threshold.phase
    ? `${threshold.realm}${threshold.phase}`
    : threshold.realm;
  return {
    fullName,
    realm: threshold.realm,
    phase: threshold.phase,
    className: realmClassName(threshold.realm),
    phaseClass: threshold.phaseClass,
  };
}

export function cultivationProgressForRank(rank?: number | null): CultivationProgress | null {
  if (typeof rank !== 'number' || !Number.isFinite(rank)) return null;
  const normalizedRank = Math.max(0, Math.floor(rank));
  const current = cultivationForRank(normalizedRank);
  if (!current) return null;
  const currentIndex = cultivationThresholds.reduce((index, threshold, candidateIndex) => (
    normalizedRank >= threshold.minRank ? candidateIndex : index
  ), 0);
  const nextThreshold = cultivationThresholds[currentIndex + 1] || null;
  return {
    rank: normalizedRank,
    cultivation: current,
    nextThreshold,
    remaining: nextThreshold ? Math.max(0, nextThreshold.minRank - normalizedRank) : null,
  };
}

function realmClassName(realm: string) {
  if (realm === '炼气期') return 'qi';
  if (realm === '筑基') return 'foundation';
  if (realm === '结丹') return 'dan';
  if (realm === '元婴') return 'yuanying';
  if (realm === '化神') return 'huashen';
  if (realm === '炼虚') return 'lianxu';
  if (realm === '合体') return 'heti';
  if (realm === '大乘') return 'dacheng';
  if (realm === '真仙') return 'zhenxian';
  if (realm === '金仙') return 'jinxian';
  if (realm === '太乙玉仙') return 'taiyi';
  if (realm === '大罗') return 'daluo';
  return 'daozu';
}
