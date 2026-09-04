import { describe, expect, it } from 'vitest';
import * as feed from '../feed';
import * as article from './article'; import * as question from './question'; import * as discussion from './discussion'; import * as book from './book'; import * as tag from './tag'; import * as identity from './identity'; import * as group from './group'; import * as notification from './notification'; import * as activity from './activity'; import * as publication from './publication'; import * as moderation from './moderation'; import * as admin from './admin'; import * as assistant from './assistant'; import * as shared from './shared';

describe('explicit domain service slices', () => {
  it.each(Object.entries({ article, question, discussion, book, tag, identity, group, notification, activity, publication, moderation, admin, assistant, shared }))('%s preserves exact implementations', (_domain, exports) => {
    for (const [name, implementation] of Object.entries(exports)) expect(implementation, name).toBe(feed[name as keyof typeof feed]);
  });
});
