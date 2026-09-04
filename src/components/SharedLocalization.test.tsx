import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { i18n } from '@/i18n';
import type { PublicationProgress } from '@/services/publicationProgress';
import { AsyncState } from './patterns';
import { PublicationProgressPanel } from './PublicationProgressPanel';
import { Pagination } from './ui/primitives';

const queuedProgress: PublicationProgress = {
  schemaVersion: 'rin-publication-progress/v1',
  view: 'public',
  projectId: 'article:42',
  displayingPreviousVersion: true,
  updatedAt: '2026-08-27T08:00:00Z',
  state: 'queued',
  queue: {
    jobsAheadEstimate: 2,
    queuedProjects: 3,
    activeProjects: 1,
    estimate: null,
    scope: 'instance',
    calculatedAt: '2026-08-27T08:00:00Z',
  },
};

describe('shared interface localization', () => {
  afterEach(async () => {
    await act(async () => {
      await i18n.changeLanguage('zh-CN');
    });
  });

  it('renders shared states, pagination, and publication progress in English', async () => {
    await act(async () => {
      await i18n.changeLanguage('en');
    });

    render(
      <>
        <AsyncState state="empty" />
        <Pagination page={2} pageCount={4} onPageChange={() => undefined} />
        <PublicationProgressPanel progress={queuedProgress} />
      </>,
    );

    expect(screen.getByText('No content')).toBeTruthy();
    expect(screen.getByRole('navigation', { name: 'Pagination' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Previous' })).toBeTruthy();
    expect(screen.getByText('Page 2 of 4')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Waiting to render' })).toBeTruthy();
    expect(screen.getByText('About 2 jobs ahead')).toBeTruthy();
  });
});
