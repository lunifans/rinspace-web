import {
  parsePublicationProgress,
  PublicationProgressPoller,
  type PublicationProgress,
  type PublicationScheduler,
  type VisibilitySource,
} from './publicationProgress';

declare function test(name: string, callback: () => void | Promise<void>): void;
declare function expect(actual: unknown): {
  toBe(expected: unknown): void;
  toEqual(expected: unknown): void;
};

const now = '2026-08-14T10:00:00Z';

function validating(projectId = 'article:42'): PublicationProgress {
  return {
    schemaVersion: 'rin-publication-progress/v1',
    view: 'public',
    projectId,
    state: 'validating',
    displayingPreviousVersion: true,
    updatedAt: now,
  };
}

class FakeScheduler implements PublicationScheduler {
  callbacks = new Map<ReturnType<typeof setTimeout>, () => void>();

  set(callback: () => void) {
    const handle = setTimeout(() => undefined, 60_000);
    this.callbacks.set(handle, callback);
    return handle;
  }

  clear(handle: ReturnType<typeof setTimeout>) {
    clearTimeout(handle);
    this.callbacks.delete(handle);
  }

  runNext() {
    const first = this.callbacks.entries().next().value as [ReturnType<typeof setTimeout>, () => void] | undefined;
    if (!first) return;
    this.clear(first[0]);
    first[1]();
  }
}

class FakeVisibility implements VisibilitySource {
  hidden = false;
  listeners = new Set<() => void>();

  addEventListener(_type: 'visibilitychange', listener: () => void) { this.listeners.add(listener); }
  removeEventListener(_type: 'visibilitychange', listener: () => void) { this.listeners.delete(listener); }
  emit() { this.listeners.forEach((listener) => listener()); }
}

test('parsePublicationProgress accepts known and unknown ETA but rejects extra data', () => {
  const queue = {
    schemaVersion: 'rin-publication-progress/v1',
    view: 'public',
    projectId: 'article:42',
    state: 'queued',
    displayingPreviousVersion: true,
    updatedAt: now,
    queue: {
      jobsAheadEstimate: 2,
      queuedProjects: 3,
      activeProjects: 1,
      estimate: null,
      scope: 'instance',
      calculatedAt: now,
    },
  };
  expect(parsePublicationProgress(queue)?.state).toBe('queued');
  expect(parsePublicationProgress({ ...queue, queue: { ...queue.queue, jobsAheadEstimate: undefined } })?.state).toBe('queued');
  expect(parsePublicationProgress({ ...queue, privateRepository: 'a/42' })).toBe(null);
  expect(parsePublicationProgress({ ...queue, queue: { ...queue.queue, queuedProjects: -1 } })).toBe(null);
});

test('PublicationProgressPoller pauses while hidden and resumes immediately', async () => {
  const scheduler = new FakeScheduler();
  const visibility = new FakeVisibility();
  const states: Array<PublicationProgress | null> = [];
  let calls = 0;
  const poller = new PublicationProgressPoller(
    'article-42',
    (progress) => states.push(progress),
    () => undefined,
    async () => { calls += 1; return validating(); },
    scheduler,
    visibility,
    5_000,
  );
  poller.start();
  await Promise.resolve();
  expect(calls).toBe(1);
  expect(states.length).toBe(1);
  visibility.hidden = true;
  visibility.emit();
  expect(scheduler.callbacks.size).toBe(0);
  visibility.hidden = false;
  visibility.emit();
  await Promise.resolve();
  expect(calls).toBe(2);
  poller.stop();
});

test('PublicationProgressPoller keeps checking after a steady response and discovers an external push', async () => {
  const scheduler = new FakeScheduler();
  const visibility = new FakeVisibility();
  const states: Array<PublicationProgress | null> = [];
  let calls = 0;
  const poller = new PublicationProgressPoller(
    'article-42',
    (progress) => states.push(progress),
    () => undefined,
    async () => {
      calls += 1;
      return calls === 1 ? null : validating();
    },
    scheduler,
    visibility,
    5_000,
  );

  poller.start();
  await Promise.resolve();
  expect(states).toEqual([null]);
  expect(scheduler.callbacks.size).toBe(1);

  scheduler.runNext();
  await Promise.resolve();
  expect(states.map((state) => state?.state ?? null)).toEqual([null, 'validating']);
  expect(scheduler.callbacks.size).toBe(1);
  poller.stop();
});

test('PublicationProgressPoller ignores stale route responses and retains state on transient error', async () => {
  const scheduler = new FakeScheduler();
  const visibility = new FakeVisibility();
  const states: Array<PublicationProgress | null> = [];
  const errors: Error[] = [];
  const pending = new Map<string, Array<{ resolve: (value: PublicationProgress | null) => void; reject: (error: Error) => void }>>();
  const poller = new PublicationProgressPoller(
    'old',
    (progress) => states.push(progress),
    (error) => errors.push(error),
    (contentRef) => new Promise((resolve, reject) => {
      const entries = pending.get(contentRef) || [];
      entries.push({ resolve, reject });
      pending.set(contentRef, entries);
    }),
    scheduler,
    visibility,
    5_000,
  );
  poller.start();
  poller.replace('new');
  pending.get('old')?.[0].resolve(validating('article:41'));
  pending.get('new')?.[0].resolve(validating('article:42'));
  await Promise.resolve();
  await Promise.resolve();
  expect(states.map((state) => state?.projectId)).toEqual(['article:42']);

  scheduler.runNext();
  await Promise.resolve();
  pending.get('new')?.[1].reject(new Error('temporary upstream failure'));
  await Promise.resolve();
  await Promise.resolve();
  expect(states.map((state) => state?.projectId)).toEqual(['article:42']);
  expect(errors.length).toBe(1);
  poller.stop();
});
