import { type ReactNode } from 'react';
import { Link } from 'react-router-dom';

import type { RevisionSummary, TagDetail } from '@/services/contracts';
import { tagEditPath, tagWikiHistoryPath } from '@/utils/routes';
import { wikiPlainTextFromHtml } from '@/utils/wikiLinks';

export type TagRevisionContent = {
  display_name?: string;
  slug_name?: string;
  original_text?: string;
  parsed_text?: string;
  html?: string;
  tex_source?: string;
};

type DiffKind = 'equal' | 'insert' | 'delete';

type DiffOp<T> = {
  kind: DiffKind;
  value: T;
};

type InlineDiffPart = {
  kind: DiffKind;
  text: string;
};

type RevisionDiffRow = {
  kind: 'equal' | 'insert' | 'delete' | 'modify';
  oldLineNumber?: number;
  newLineNumber?: number;
  oldText?: string;
  newText?: string;
  oldParts?: InlineDiffPart[];
  newParts?: InlineDiffPart[];
};

export type TagRevisionView = {
  title: string;
  source: string;
  html: string;
};

export function tagName(tag: TagDetail) {
  return tag.displayName.trim() || tag.slugName;
}

export function parseTagRevisionContent(value: string): TagRevisionContent | null {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object') return null;
    const record = parsed as Record<string, unknown>;
    const content: TagRevisionContent = {};
    if (typeof record.display_name === 'string') content.display_name = record.display_name;
    if (typeof record.slug_name === 'string') content.slug_name = record.slug_name;
    if (typeof record.original_text === 'string') content.original_text = record.original_text;
    if (typeof record.parsed_text === 'string') content.parsed_text = record.parsed_text;
    if (typeof record.html === 'string') content.html = record.html;
    if (typeof record.tex_source === 'string') content.tex_source = record.tex_source;
    return content;
  } catch {
    return null;
  }
}

export function dateLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

export function dateTimeLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function tagRevisionHistoryPath(tag: TagDetail, revision?: RevisionSummary) {
  const base = tagWikiHistoryPath(tag.id, tag.slugName || tagName(tag));
  return revision ? `${base}?revision=${encodeURIComponent(String(revision.id))}` : base;
}

export function revisionEditPath(tag: TagDetail, revision: RevisionSummary) {
  return `${tagEditPath(tag.id, tag.slugName || tagName(tag))}?revision=${encodeURIComponent(String(revision.id))}`;
}

export function revisionView(revision: RevisionSummary | null): TagRevisionView | null {
  if (!revision) return null;
  const content = parseTagRevisionContent(revision.content);
  const html = content?.html || content?.parsed_text || '';
  const source =
    content?.tex_source ||
    content?.original_text ||
    wikiPlainTextFromHtml(html) ||
    (content ? '' : revision.content);
  return {
    title: content?.display_name || revision.title || '未命名标签',
    source,
    html,
  };
}

function textLength(value: string) {
  return Array.from(value || '').length;
}

function diffSequence<T>(oldItems: T[], newItems: T[], isEqual: (oldItem: T, newItem: T) => boolean): DiffOp<T>[] {
  const rows = oldItems.length;
  const columns = newItems.length;
  const matrix: number[][] = Array.from({ length: rows + 1 }, () => Array(columns + 1).fill(0));

  for (let oldIndex = rows - 1; oldIndex >= 0; oldIndex -= 1) {
    for (let newIndex = columns - 1; newIndex >= 0; newIndex -= 1) {
      matrix[oldIndex][newIndex] = isEqual(oldItems[oldIndex], newItems[newIndex])
        ? matrix[oldIndex + 1][newIndex + 1] + 1
        : Math.max(matrix[oldIndex + 1][newIndex], matrix[oldIndex][newIndex + 1]);
    }
  }

  const result: DiffOp<T>[] = [];
  let oldIndex = 0;
  let newIndex = 0;
  while (oldIndex < rows && newIndex < columns) {
    if (isEqual(oldItems[oldIndex], newItems[newIndex])) {
      result.push({ kind: 'equal', value: oldItems[oldIndex] });
      oldIndex += 1;
      newIndex += 1;
    } else if (matrix[oldIndex + 1][newIndex] >= matrix[oldIndex][newIndex + 1]) {
      result.push({ kind: 'delete', value: oldItems[oldIndex] });
      oldIndex += 1;
    } else {
      result.push({ kind: 'insert', value: newItems[newIndex] });
      newIndex += 1;
    }
  }
  while (oldIndex < rows) {
    result.push({ kind: 'delete', value: oldItems[oldIndex] });
    oldIndex += 1;
  }
  while (newIndex < columns) {
    result.push({ kind: 'insert', value: newItems[newIndex] });
    newIndex += 1;
  }
  return result;
}

function coalesceInlineDiff(ops: DiffOp<string>[]) {
  const parts: InlineDiffPart[] = [];
  for (const op of ops) {
    const previous = parts[parts.length - 1];
    if (previous?.kind === op.kind) {
      previous.text += op.value;
    } else {
      parts.push({ kind: op.kind, text: op.value });
    }
  }
  return parts;
}

function inlineDiff(oldText: string, newText: string) {
  return coalesceInlineDiff(
    diffSequence(Array.from(oldText), Array.from(newText), (oldChar, newChar) => oldChar === newChar),
  );
}

function splitRevisionLines(text: string) {
  if (!text) return [];
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
}

function revisionDiffRows(current: TagRevisionView | null, previous: TagRevisionView | null): RevisionDiffRow[] {
  if (!current) return [];
  const oldLines = splitRevisionLines(previous?.source || '');
  const newLines = splitRevisionLines(current.source);
  const ops = diffSequence(oldLines, newLines, (oldLine, newLine) => oldLine === newLine);
  const rows: RevisionDiffRow[] = [];
  let oldLineNumber = 1;
  let newLineNumber = 1;
  let index = 0;

  while (index < ops.length) {
    if (ops[index].kind === 'equal') {
      rows.push({
        kind: 'equal',
        oldLineNumber,
        newLineNumber,
        oldText: ops[index].value,
        newText: ops[index].value,
      });
      oldLineNumber += 1;
      newLineNumber += 1;
      index += 1;
      continue;
    }

    const deleted: Array<{ text: string; lineNumber: number }> = [];
    const inserted: Array<{ text: string; lineNumber: number }> = [];
    while (index < ops.length && ops[index].kind !== 'equal') {
      if (ops[index].kind === 'delete') {
        deleted.push({ text: ops[index].value, lineNumber: oldLineNumber });
        oldLineNumber += 1;
      } else {
        inserted.push({ text: ops[index].value, lineNumber: newLineNumber });
        newLineNumber += 1;
      }
      index += 1;
    }

    const pairedCount = Math.min(deleted.length, inserted.length);
    for (let pairIndex = 0; pairIndex < pairedCount; pairIndex += 1) {
      const oldText = deleted[pairIndex].text;
      const newText = inserted[pairIndex].text;
      const parts = inlineDiff(oldText, newText);
      rows.push({
        kind: 'modify',
        oldLineNumber: deleted[pairIndex].lineNumber,
        newLineNumber: inserted[pairIndex].lineNumber,
        oldText,
        newText,
        oldParts: parts.filter((part) => part.kind !== 'insert'),
        newParts: parts.filter((part) => part.kind !== 'delete'),
      });
    }
    for (let deleteIndex = pairedCount; deleteIndex < deleted.length; deleteIndex += 1) {
      rows.push({
        kind: 'delete',
        oldLineNumber: deleted[deleteIndex].lineNumber,
        oldText: deleted[deleteIndex].text,
      });
    }
    for (let insertIndex = pairedCount; insertIndex < inserted.length; insertIndex += 1) {
      rows.push({
        kind: 'insert',
        newLineNumber: inserted[insertIndex].lineNumber,
        newText: inserted[insertIndex].text,
      });
    }
  }

  return rows;
}

function changedRevisionDiffRows(current: TagRevisionView | null, previous: TagRevisionView | null) {
  return revisionDiffRows(current, previous).filter((row) => row.kind !== 'equal');
}

function revisionChangeSummary(current: TagRevisionView | null, previous: TagRevisionView | null) {
  const summary = {
    addedChars: 0,
    deletedChars: 0,
    addedLines: 0,
    deletedLines: 0,
  };
  for (const row of changedRevisionDiffRows(current, previous)) {
    if (row.kind === 'insert') {
      summary.addedLines += 1;
      summary.addedChars += textLength(row.newText || '');
      continue;
    }
    if (row.kind === 'delete') {
      summary.deletedLines += 1;
      summary.deletedChars += textLength(row.oldText || '');
      continue;
    }
    const addedChars = (row.newParts || [])
      .filter((part) => part.kind === 'insert')
      .reduce((total, part) => total + textLength(part.text), 0);
    const deletedChars = (row.oldParts || [])
      .filter((part) => part.kind === 'delete')
      .reduce((total, part) => total + textLength(part.text), 0);
    if (addedChars > 0) {
      summary.addedLines += 1;
      summary.addedChars += addedChars;
    }
    if (deletedChars > 0) {
      summary.deletedLines += 1;
      summary.deletedChars += deletedChars;
    }
  }
  return summary;
}

function renderInlineParts(parts: InlineDiffPart[] | undefined, fallback: string) {
  const visibleParts = parts?.length ? parts : [{ kind: 'equal' as DiffKind, text: fallback }];
  return visibleParts.map((part, index) => (
    <span className={part.kind === 'equal' ? undefined : `revision-inline-${part.kind}`} key={`${part.kind}-${index}`}>
      {part.text || ' '}
    </span>
  ));
}

function revisionDiffLine(
  marker: '+' | '-',
  lineNumber: number | undefined,
  children: ReactNode,
  key?: string,
) {
  return (
    <div
      className={`revision-diff-line revision-diff-${marker === '+' ? 'insert' : 'delete'}`}
      key={key}
    >
      <span className="revision-diff-marker">{marker}</span>
      <span className="revision-diff-number">{lineNumber || ''}</span>
      <code>{children}</code>
    </div>
  );
}

export function RevisionDiffView({
  current,
  previous,
}: {
  current: TagRevisionView | null;
  previous: TagRevisionView | null;
}) {
  if (!current) return null;
  const changedRows = changedRevisionDiffRows(current, previous);
  const titleChanged = Boolean(previous) && current.title !== previous?.title;
  const summary = revisionChangeSummary(current, previous);

  return (
    <section className="tag-wiki-history-section">
      <span>与上一版对比</span>
      <div className="revision-diff-box">
        <div className="revision-diff-summary">
          <strong>新增 {summary.addedChars} 字</strong>
          <strong>删除 {summary.deletedChars} 字</strong>
          <span>
            {previous
              ? `${summary.addedLines} 行新增相关 · ${summary.deletedLines} 行删除相关`
              : '首个版本没有上一版可对比'}
          </span>
        </div>
        {titleChanged ? (
          <div className="revision-field-diff">
            <span>标题</span>
            <del>{previous?.title || '无标题'}</del>
            <ins>{current.title || '无标题'}</ins>
          </div>
        ) : null}
        {!changedRows.length ? (
          <p className="revision-diff-empty">
            {titleChanged ? '正文没有变化。' : '没有检测到正文或标题变化。'}
          </p>
        ) : (
          <div className="revision-diff-lines">
            {changedRows.map((row, index) => {
              if (row.kind === 'insert') {
                return revisionDiffLine('+', row.newLineNumber, row.newText || ' ', `insert-${row.newLineNumber || index}`);
              }
              if (row.kind === 'delete') {
                return revisionDiffLine('-', row.oldLineNumber, row.oldText || ' ', `delete-${row.oldLineNumber || index}`);
              }
              return (
                <div className="revision-diff-pair" key={`modify-${row.oldLineNumber || index}-${row.newLineNumber || index}`}>
                  {revisionDiffLine('-', row.oldLineNumber, renderInlineParts(row.oldParts, row.oldText || ' '))}
                  {revisionDiffLine('+', row.newLineNumber, renderInlineParts(row.newParts, row.newText || ' '))}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

export function RevisionRestoreLink({
  tag,
  revision,
}: {
  tag: TagDetail;
  revision: RevisionSummary;
}) {
  return <Link to={revisionEditPath(tag, revision)}>恢复此版本</Link>;
}
