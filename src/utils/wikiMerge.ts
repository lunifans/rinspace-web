export type WikiMergeResult = {
  merged: string;
  hasConflicts: boolean;
};

type WikiChangeRange = {
  start: number;
  end: number;
  replacement: string[];
};

function lines(value: string) {
  return value.replace(/\r\n?/g, '\n').split('\n');
}

function changedRange(base: string[], next: string[]): WikiChangeRange | null {
  let start = 0;
  while (start < base.length && start < next.length && base[start] === next[start]) {
    start += 1;
  }
  if (start === base.length && start === next.length) return null;

  let baseEnd = base.length;
  let nextEnd = next.length;
  while (
    baseEnd > start &&
    nextEnd > start &&
    base[baseEnd - 1] === next[nextEnd - 1]
  ) {
    baseEnd -= 1;
    nextEnd -= 1;
  }
  return {
    start,
    end: baseEnd,
    replacement: next.slice(start, nextEnd),
  };
}

function sameRange(left: WikiChangeRange, right: WikiChangeRange) {
  return (
    left.start === right.start &&
    left.end === right.end &&
    left.replacement.length === right.replacement.length &&
    left.replacement.every((line, index) => line === right.replacement[index])
  );
}

function applyNonOverlapping(
  base: string[],
  first: WikiChangeRange,
  second: WikiChangeRange,
) {
  return [
    ...base.slice(0, first.start),
    ...first.replacement,
    ...base.slice(first.end, second.start),
    ...second.replacement,
    ...base.slice(second.end),
  ].join('\n');
}

function conflictBlock(
  base: string[],
  local: WikiChangeRange,
  latest: WikiChangeRange,
) {
  return [
    '<<<<<<< 我的未保存修改',
    ...local.replacement,
    '||||||| 打开编辑器时的版本',
    ...base.slice(Math.min(local.start, latest.start), Math.max(local.end, latest.end)),
    '=======',
    ...latest.replacement,
    '>>>>>>> 线上最新版',
  ];
}

export function mergeWikiSources(
  baseSource: string,
  localSource: string,
  latestSource: string,
): WikiMergeResult {
  if (localSource === latestSource) {
    return { merged: localSource, hasConflicts: false };
  }
  if (localSource === baseSource) {
    return { merged: latestSource, hasConflicts: false };
  }
  if (latestSource === baseSource) {
    return { merged: localSource, hasConflicts: false };
  }

  const base = lines(baseSource);
  const local = changedRange(base, lines(localSource));
  const latest = changedRange(base, lines(latestSource));

  if (!local) return { merged: latestSource, hasConflicts: false };
  if (!latest) return { merged: localSource, hasConflicts: false };
  if (sameRange(local, latest)) {
    return { merged: localSource, hasConflicts: false };
  }

  if (local.end <= latest.start && local.start !== latest.start) {
    return { merged: applyNonOverlapping(base, local, latest), hasConflicts: false };
  }
  if (latest.end <= local.start && latest.start !== local.start) {
    return { merged: applyNonOverlapping(base, latest, local), hasConflicts: false };
  }

  const start = Math.min(local.start, latest.start);
  const end = Math.max(local.end, latest.end);
  return {
    merged: [
      ...base.slice(0, start),
      ...conflictBlock(base, local, latest),
      ...base.slice(end),
    ].join('\n'),
    hasConflicts: true,
  };
}
