export type DemoHttpMethod = 'DELETE' | 'GET' | 'PATCH' | 'POST' | 'PUT';

export type DemoApiRoute = Readonly<{
  id: string;
  methods: readonly DemoHttpMethod[];
  path: RegExp;
  implementation: 'implemented' | 'planned';
}>;

export const demoApiRouteRegistry: readonly DemoApiRoute[] = Object.freeze([
  { id: 'site-info', methods: ['GET'], path: /^siteinfo$/, implementation: 'implemented' },
  { id: 'home-feed', methods: ['GET'], path: /^feed$/, implementation: 'implemented' },
  { id: 'home-sidebar', methods: ['GET'], path: /^home\/sidebar$/, implementation: 'implemented' },
  { id: 'knowledge-graph', methods: ['GET'], path: /^knowledge-graph$/, implementation: 'implemented' },
  { id: 'search', methods: ['GET'], path: /^search$/, implementation: 'implemented' },
  { id: 'content-list', methods: ['GET', 'POST'], path: /^content$/, implementation: 'implemented' },
  { id: 'content-detail', methods: ['DELETE', 'GET', 'PUT'], path: /^content\/[^/]+$/, implementation: 'implemented' },
  { id: 'content-read', methods: ['POST'], path: /^content\/[^/]+\/read$/, implementation: 'implemented' },
  { id: 'content-book-context', methods: ['GET'], path: /^content\/[^/]+\/book-context$/, implementation: 'implemented' },
  { id: 'revisions', methods: ['GET'], path: /^revisions$/, implementation: 'implemented' },
  { id: 'question-detail', methods: ['GET'], path: /^questions\/[^/]+$/, implementation: 'implemented' },
  { id: 'question-directory', methods: ['GET'], path: /^question\/(?:page|link|similar|similar\/tag)$/, implementation: 'implemented' },
  { id: 'question-invite', methods: ['GET'], path: /^question\/invite$/, implementation: 'implemented' },
  { id: 'book-directory', methods: ['GET', 'POST'], path: /^books$/, implementation: 'implemented' },
  { id: 'book-reading', methods: ['GET'], path: /^books\/[^/]+\/(?:read|related|reviews|activity)$/, implementation: 'implemented' },
  { id: 'book-chapter-activity', methods: ['GET'], path: /^books\/[^/]+\/chapters\/activity$/, implementation: 'implemented' },
  { id: 'tag-page', methods: ['GET'], path: /^tags\/(?:page|activity|following)$/, implementation: 'implemented' },
  { id: 'tag-directory-v2', methods: ['GET'], path: /^v2\/tags\/directory$/, implementation: 'implemented' },
  { id: 'tag-detail', methods: ['GET'], path: /^tag$/, implementation: 'implemented' },
  { id: 'tag-stats', methods: ['GET'], path: /^tag\/stats$/, implementation: 'implemented' },
  { id: 'user-directory', methods: ['GET'], path: /^user\/ranking$/, implementation: 'implemented' },
  { id: 'comments', methods: ['GET', 'POST'], path: /^comments$/, implementation: 'implemented' },
  { id: 'reactions', methods: ['GET', 'PUT'], path: /^meta\/reaction$/, implementation: 'implemented' },
  { id: 'follows', methods: ['POST'], path: /^follows$/, implementation: 'implemented' },
  { id: 'collections', methods: ['POST'], path: /^collections$/, implementation: 'implemented' },
  { id: 'collection-folders', methods: ['GET', 'POST'], path: /^collection\/folders$/, implementation: 'implemented' },
  { id: 'likes', methods: ['POST'], path: /^like$/, implementation: 'implemented' },
  { id: 'personal-collections', methods: ['GET'], path: /^personal\/collection\/page$/, implementation: 'implemented' },
  { id: 'public-profile', methods: ['GET'], path: /^personal\/user\/info$/, implementation: 'implemented' },
  { id: 'profile-relations', methods: ['GET'], path: /^user\/relations$/, implementation: 'implemented' },
  { id: 'current-user-info', methods: ['GET', 'PUT'], path: /^user\/info$/, implementation: 'implemented' },
  { id: 'private-profile', methods: ['GET', 'POST'], path: /^profile$/, implementation: 'implemented' },
  { id: 'personal-qa', methods: ['GET'], path: /^personal\/(?:qa\/top|question\/page|answer\/page|comment\/page)$/, implementation: 'implemented' },
  { id: 'personal-follow-vote', methods: ['GET'], path: /^personal\/(?:follow|vote)\/page$/, implementation: 'implemented' },
  { id: 'badges', methods: ['GET'], path: /^badges$/, implementation: 'implemented' },
  { id: 'badge-detail', methods: ['GET'], path: /^badge$/, implementation: 'implemented' },
  { id: 'badge-awards', methods: ['GET'], path: /^badge\/awards\/page$/, implementation: 'implemented' },
  { id: 'user-badges', methods: ['GET'], path: /^badge\/user\/awards(?:\/recent)?$/, implementation: 'implemented' },
  { id: 'notifications', methods: ['GET'], path: /^notifications$/, implementation: 'implemented' },
  { id: 'notification-page', methods: ['GET'], path: /^notification\/page$/, implementation: 'implemented' },
  { id: 'notification-status', methods: ['GET', 'PUT'], path: /^notification\/status$/, implementation: 'implemented' },
  { id: 'notification-read', methods: ['PUT'], path: /^notification\/read\/state(?:\/all)?$/, implementation: 'implemented' },
  { id: 'settings-interface', methods: ['PUT'], path: /^user\/interface$/, implementation: 'implemented' },
  { id: 'settings-notifications', methods: ['POST', 'PUT'], path: /^user\/notification\/config$/, implementation: 'implemented' },
  { id: 'activity-timeline', methods: ['GET'], path: /^activity\/timeline(?:\/detail)?$/, implementation: 'implemented' },
  {
    id: 'book-page-annotations',
    methods: ['GET', 'POST'],
    path: /^books\/[^/]+\/reader\/pages\/[^/]+\/annotations$/,
    implementation: 'planned',
  },
  {
    id: 'book-annotation',
    methods: ['DELETE', 'GET', 'PATCH'],
    path: /^book-annotations\/[^/]+$/,
    implementation: 'planned',
  },
  { id: 'code-recoveries', methods: ['GET'], path: /^code\/recoveries$/, implementation: 'planned' },
  {
    id: 'code-recovery-ticket',
    methods: ['POST'],
    path: /^code\/recoveries\/[^/]+\/ticket$/,
    implementation: 'planned',
  },
  { id: 'creator-analytics', methods: ['GET'], path: /^creator\/analytics$/, implementation: 'implemented' },
  { id: 'creator-contributions', methods: ['GET'], path: /^creator\/contributions$/, implementation: 'implemented' },
  { id: 'writer-draft', methods: ['DELETE', 'GET', 'PUT'], path: /^rin-writer\/draft$/, implementation: 'implemented' },
  { id: 'report-reasons', methods: ['GET'], path: /^report-reasons$/, implementation: 'planned' },
  { id: 'reports', methods: ['POST'], path: /^reports$/, implementation: 'planned' },
]);

export function findDemoApiRoute(method: string, logicalPath: string): DemoApiRoute | null {
  const normalizedMethod = method.toUpperCase() as DemoHttpMethod;
  return demoApiRouteRegistry.find((route) => (
    route.methods.includes(normalizedMethod) && route.path.test(logicalPath)
  )) ?? null;
}
