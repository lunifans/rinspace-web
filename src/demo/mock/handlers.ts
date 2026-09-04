import {
  http,
  HttpResponse,
  isCommonAssetRequest,
  passthrough,
  type RequestHandler,
} from 'msw';

import type { RuntimeConfig } from '@/app/config/runtime';
import { DemoRepositoryError, type DemoRepository } from '@/demo/repository';
import type { ApiSchemas } from '@/generated/api-contract';
import {
  demoBookActivity,
  demoBookChapterActivity,
  demoBookContext,
  demoBookReader,
  demoBookReviews,
  demoCollection,
  demoCollectionFolderPage,
  demoComments,
  demoContentDetail,
  demoContentPage,
  demoCreateCollectionFolder,
  demoCreateComment,
  demoFollowingTags,
  demoFollow,
  demoHomeFeed,
  demoHomeSidebar,
  demoKnowledgeGraph,
  demoLike,
  demoPersonalCollections,
  demoQuestionDetail,
  demoQuestionInviteUsers,
  demoQuestionPage,
  demoReactions,
  demoRelatedBooks,
  demoRevisions,
  demoRecordContentRead,
  demoSearch,
  demoTagActivity,
  demoTagDetail,
  demoTagDirectory,
  demoTagPage,
  demoTagStats,
  demoUpdateReaction,
  demoUserRanking,
} from './discovery';
import {
  demoActivityTimeline,
  demoActivityTimelineDetail,
  demoBadgeAwards,
  demoBadgeInfo,
  demoBadges,
  demoCurrentUserInfo,
  demoMarkAllNotificationsRead,
  demoMarkNotificationRead,
  demoNotificationPage,
  demoNotifications,
  demoNotificationStatus,
  demoPersonalAnswers,
  demoPersonalComments,
  demoPersonalFollows,
  demoPersonalQATop,
  demoPersonalQuestions,
  demoPersonalVotes,
  demoPrivateProfile,
  demoPublicUserInfo,
  demoUserBadgeAwards,
  demoUserInterfaceConfig,
  demoUserNotificationConfig,
  demoUserRelations,
} from './identity';
import {
  demoCreateContent,
  demoCreatorAnalytics,
  demoCreatorContributions,
  demoDeleteContent,
  demoDeleteDraft,
  demoReadDraft,
  demoUpdateContent,
  demoWriteDraft,
} from './creation';
import { applyDemoScenario, createStoredDemoScenarioSource, type DemoScenarioSource } from './scenarios';
import {
  DemoRequestError,
  demoErrorResponse,
} from './request';

type DemoHandlerOptions = Readonly<{
  origin?: string;
  scenario?: DemoScenarioSource;
}>;

function apiEndpoint(apiBase: URL, path: string): string {
  return new URL(path.replace(/^\/+/, ''), apiBase).toString();
}

async function runDemoHandler(
  scenario: DemoScenarioSource,
  operation: () => Promise<Response> | Response,
): Promise<Response> {
  const injected = await applyDemoScenario(scenario);
  if (injected) return injected;
  try {
    return await operation();
  } catch (error) {
    if (error instanceof DemoRequestError) return demoErrorResponse(error);
    if (error instanceof DemoRepositoryError) {
      return demoErrorResponse(new DemoRequestError(
        error.code === 'quota_exceeded' ? 507 : 500,
        `demo.repository.${error.code}`,
        error.code === 'quota_exceeded'
          ? 'Browser storage is full. Reset demo data or free storage, then retry.'
          : 'Demo data could not be read safely.',
      ));
    }
    return demoErrorResponse(new DemoRequestError(500, 'demo.internal', 'The demo request could not be completed.'));
  }
}

async function siteInfoResponse(config: RuntimeConfig, repository: DemoRepository): Promise<Response> {
  const metadata = await repository.getMetadata();
  if (!metadata || metadata.state !== 'ready') {
    throw new DemoRequestError(500, 'demo.repository.not_ready', 'Demo data is not ready.');
  }
  const payload: ApiSchemas['SiteInfo'] = {
    general: {
      name: config.site.name,
      short_description: config.site.shortName,
      description: config.site.description,
      site_url: new URL(config.basePath, config.canonicalOrigin).toString(),
      contact_email: config.site.contactEmail ?? '',
    },
    interface: { language: config.site.defaultLocale, time_zone: 'Asia/Shanghai' },
    version: config.api.contractVersion,
    revision: metadata.checksum,
  };
  return HttpResponse.json(payload);
}

function apiShapedPath(pathname: string): boolean {
  return /\/(?:admin\/)?api(?:\/|$)/.test(pathname) || /\/auth\/v\d+(?:\/|$)/.test(pathname);
}

export function createDemoRequestHandlers(
  config: RuntimeConfig,
  repository: DemoRepository,
  options: DemoHandlerOptions = {},
): RequestHandler[] {
  if (config.mode !== 'demo') throw new Error('Demo handlers require demo runtime configuration.');
  const origin = options.origin ?? window.location.origin;
  const apiBase = new URL(config.api.baseUrl, origin);
  const scenario = options.scenario ?? createStoredDemoScenarioSource(window.localStorage);
  return [
    http.get(apiEndpoint(apiBase, 'siteinfo'), () => runDemoHandler(
      scenario,
      () => siteInfoResponse(config, repository),
    )),
    http.get(apiEndpoint(apiBase, 'feed'), ({ request }) => runDemoHandler(
      scenario,
      async () => HttpResponse.json(await demoHomeFeed(request, repository)),
    )),
    http.get(apiEndpoint(apiBase, 'home/sidebar'), ({ request }) => runDemoHandler(
      scenario,
      async () => HttpResponse.json(await demoHomeSidebar(request, repository)),
    )),
    http.get(apiEndpoint(apiBase, 'knowledge-graph'), () => runDemoHandler(
      scenario,
      async () => HttpResponse.json(await demoKnowledgeGraph(repository)),
    )),
    http.get(apiEndpoint(apiBase, 'search'), ({ request }) => runDemoHandler(
      scenario,
      async () => HttpResponse.json(await demoSearch(request, repository)),
    )),
    http.get(apiEndpoint(apiBase, 'content'), ({ request }) => runDemoHandler(
      scenario,
      async () => HttpResponse.json(await demoContentPage(request, repository)),
    )),
    http.post(apiEndpoint(apiBase, 'content'), ({ request }) => runDemoHandler(
      scenario,
      async () => HttpResponse.json(await demoCreateContent(request, repository)),
    )),
    http.get(apiEndpoint(apiBase, 'content/:reference'), ({ params, request }) => runDemoHandler(
      scenario,
      async () => HttpResponse.json(await demoContentDetail(String(params.reference), repository, request)),
    )),
    http.put(apiEndpoint(apiBase, 'content/:reference'), ({ params, request }) => runDemoHandler(
      scenario,
      async () => HttpResponse.json(await demoUpdateContent(String(params.reference), request, repository)),
    )),
    http.delete(apiEndpoint(apiBase, 'content/:reference'), ({ params, request }) => runDemoHandler(
      scenario,
      async () => HttpResponse.json(await demoDeleteContent(String(params.reference), request, repository)),
    )),
    http.post(apiEndpoint(apiBase, 'content/:reference/read'), ({ params, request }) => runDemoHandler(
      scenario,
      async () => HttpResponse.json(await demoRecordContentRead(String(params.reference), request, repository)),
    )),
    http.get(apiEndpoint(apiBase, 'content/:reference/book-context'), ({ params }) => runDemoHandler(
      scenario,
      async () => HttpResponse.json(await demoBookContext(String(params.reference), repository)),
    )),
    http.get(apiEndpoint(apiBase, 'revisions'), ({ request }) => runDemoHandler(
      scenario,
      async () => HttpResponse.json(await demoRevisions(request, repository)),
    )),
    http.get(apiEndpoint(apiBase, 'questions/:reference'), ({ params }) => runDemoHandler(
      scenario,
      async () => HttpResponse.json(await demoQuestionDetail(String(params.reference), repository)),
    )),
    http.get(apiEndpoint(apiBase, 'question/page'), ({ request }) => runDemoHandler(
      scenario,
      async () => HttpResponse.json(await demoQuestionPage(request, repository)),
    )),
    http.get(apiEndpoint(apiBase, 'question/link'), ({ request }) => runDemoHandler(
      scenario,
      async () => HttpResponse.json(await demoQuestionPage(request, repository)),
    )),
    http.get(apiEndpoint(apiBase, 'question/similar'), ({ request }) => runDemoHandler(
      scenario,
      async () => HttpResponse.json(await demoQuestionPage(request, repository)),
    )),
    http.get(apiEndpoint(apiBase, 'question/similar/tag'), ({ request }) => runDemoHandler(
      scenario,
      async () => HttpResponse.json(await demoQuestionPage(request, repository)),
    )),
    http.get(apiEndpoint(apiBase, 'question/invite'), ({ request }) => runDemoHandler(
      scenario,
      async () => HttpResponse.json(await demoQuestionInviteUsers(request, repository)),
    )),
    http.get(apiEndpoint(apiBase, 'books'), ({ request }) => runDemoHandler(
      scenario,
      async () => HttpResponse.json(await demoContentPage(request, repository, 'book')),
    )),
    http.post(apiEndpoint(apiBase, 'books'), ({ request }) => runDemoHandler(
      scenario,
      async () => HttpResponse.json(await demoCreateContent(request, repository, 'book')),
    )),
    http.get(apiEndpoint(apiBase, 'books/:reference/read'), ({ params }) => runDemoHandler(
      scenario,
      async () => HttpResponse.json(await demoBookReader(String(params.reference), repository)),
    )),
    http.get(apiEndpoint(apiBase, 'books/:reference/related'), ({ request, params }) => runDemoHandler(
      scenario,
      async () => HttpResponse.json(await demoRelatedBooks(String(params.reference), request, repository)),
    )),
    http.get(apiEndpoint(apiBase, 'books/:reference/reviews'), ({ params }) => runDemoHandler(
      scenario,
      async () => HttpResponse.json(await demoBookReviews(String(params.reference), repository)),
    )),
    http.get(apiEndpoint(apiBase, 'books/:reference/activity'), ({ request, params }) => runDemoHandler(
      scenario,
      async () => HttpResponse.json(await demoBookActivity(String(params.reference), request, repository)),
    )),
    http.get(apiEndpoint(apiBase, 'books/:reference/chapters/activity'), ({ request, params }) => runDemoHandler(
      scenario,
      async () => HttpResponse.json(await demoBookChapterActivity(String(params.reference), request, repository)),
    )),
    http.get(apiEndpoint(apiBase, 'tags/page'), ({ request }) => runDemoHandler(
      scenario,
      async () => HttpResponse.json(await demoTagPage(request, repository)),
    )),
    http.get(apiEndpoint(apiBase, 'tags/activity'), ({ request }) => runDemoHandler(
      scenario,
      async () => HttpResponse.json(await demoTagActivity(request, repository)),
    )),
    http.get(apiEndpoint(apiBase, 'tags/following'), ({ request }) => runDemoHandler(
      scenario,
      async () => HttpResponse.json(await demoFollowingTags(request, repository)),
    )),
    http.get(apiEndpoint(apiBase, 'v2/tags/directory'), ({ request }) => runDemoHandler(
      scenario,
      async () => HttpResponse.json(await demoTagDirectory(request, repository)),
    )),
    http.get(apiEndpoint(apiBase, 'tag'), ({ request }) => runDemoHandler(
      scenario,
      async () => HttpResponse.json(await demoTagDetail(request, repository)),
    )),
    http.get(apiEndpoint(apiBase, 'tag/stats'), ({ request }) => runDemoHandler(
      scenario,
      async () => HttpResponse.json(await demoTagStats(request, repository)),
    )),
    http.get(apiEndpoint(apiBase, 'user/ranking'), () => runDemoHandler(
      scenario,
      async () => HttpResponse.json(await demoUserRanking(repository)),
    )),
    http.get(apiEndpoint(apiBase, 'comments'), ({ request }) => runDemoHandler(
      scenario,
      async () => HttpResponse.json(await demoComments(request, repository)),
    )),
    http.post(apiEndpoint(apiBase, 'comments'), ({ request }) => runDemoHandler(
      scenario,
      async () => HttpResponse.json(await demoCreateComment(request, repository)),
    )),
    http.get(apiEndpoint(apiBase, 'meta/reaction'), ({ request }) => runDemoHandler(
      scenario,
      async () => HttpResponse.json(await demoReactions(request, repository)),
    )),
    http.put(apiEndpoint(apiBase, 'meta/reaction'), ({ request }) => runDemoHandler(
      scenario,
      async () => HttpResponse.json(await demoUpdateReaction(request, repository)),
    )),
    http.post(apiEndpoint(apiBase, 'follows'), ({ request }) => runDemoHandler(
      scenario,
      async () => HttpResponse.json(await demoFollow(request, repository)),
    )),
    http.post(apiEndpoint(apiBase, 'collections'), ({ request }) => runDemoHandler(
      scenario,
      async () => HttpResponse.json(await demoCollection(request, repository)),
    )),
    http.get(apiEndpoint(apiBase, 'collection/folders'), ({ request }) => runDemoHandler(
      scenario,
      async () => HttpResponse.json(await demoCollectionFolderPage(request, repository)),
    )),
    http.post(apiEndpoint(apiBase, 'collection/folders'), ({ request }) => runDemoHandler(
      scenario,
      async () => HttpResponse.json(await demoCreateCollectionFolder(request, repository)),
    )),
    http.post(apiEndpoint(apiBase, 'like'), ({ request }) => runDemoHandler(
      scenario,
      async () => HttpResponse.json(await demoLike(request, repository)),
    )),
    http.get(apiEndpoint(apiBase, 'personal/collection/page'), ({ request }) => runDemoHandler(
      scenario,
      async () => HttpResponse.json(await demoPersonalCollections(request, repository)),
    )),
    http.get(apiEndpoint(apiBase, 'personal/user/info'), ({ request }) => runDemoHandler(
      scenario,
      async () => HttpResponse.json(await demoPublicUserInfo(request, repository)),
    )),
    http.get(apiEndpoint(apiBase, 'user/relations'), ({ request }) => runDemoHandler(
      scenario,
      async () => HttpResponse.json(await demoUserRelations(request, repository)),
    )),
    http.get(apiEndpoint(apiBase, 'user/info'), ({ request }) => runDemoHandler(
      scenario,
      async () => HttpResponse.json(await demoCurrentUserInfo(request, repository)),
    )),
    http.put(apiEndpoint(apiBase, 'user/info'), ({ request }) => runDemoHandler(
      scenario,
      async () => HttpResponse.json(await demoCurrentUserInfo(request, repository)),
    )),
    http.get(apiEndpoint(apiBase, 'profile'), ({ request }) => runDemoHandler(
      scenario,
      async () => HttpResponse.json(await demoPrivateProfile(request, repository)),
    )),
    http.post(apiEndpoint(apiBase, 'profile'), ({ request }) => runDemoHandler(
      scenario,
      async () => HttpResponse.json(await demoPrivateProfile(request, repository)),
    )),
    http.get(apiEndpoint(apiBase, 'personal/qa/top'), ({ request }) => runDemoHandler(
      scenario,
      async () => HttpResponse.json(await demoPersonalQATop(request, repository)),
    )),
    http.get(apiEndpoint(apiBase, 'personal/question/page'), ({ request }) => runDemoHandler(
      scenario,
      async () => HttpResponse.json(await demoPersonalQuestions(request, repository)),
    )),
    http.get(apiEndpoint(apiBase, 'personal/answer/page'), () => runDemoHandler(
      scenario,
      async () => HttpResponse.json(await demoPersonalAnswers()),
    )),
    http.get(apiEndpoint(apiBase, 'personal/comment/page'), ({ request }) => runDemoHandler(
      scenario,
      async () => HttpResponse.json(await demoPersonalComments(request, repository)),
    )),
    http.get(apiEndpoint(apiBase, 'personal/follow/page'), ({ request }) => runDemoHandler(
      scenario,
      async () => HttpResponse.json(await demoPersonalFollows(request, repository)),
    )),
    http.get(apiEndpoint(apiBase, 'personal/vote/page'), ({ request }) => runDemoHandler(
      scenario,
      async () => HttpResponse.json(await demoPersonalVotes(request, repository)),
    )),
    http.get(apiEndpoint(apiBase, 'badges'), () => runDemoHandler(
      scenario,
      async () => HttpResponse.json(await demoBadges()),
    )),
    http.get(apiEndpoint(apiBase, 'badge'), ({ request }) => runDemoHandler(
      scenario,
      async () => HttpResponse.json(await demoBadgeInfo(request)),
    )),
    http.get(apiEndpoint(apiBase, 'badge/awards/page'), ({ request }) => runDemoHandler(
      scenario,
      async () => HttpResponse.json(await demoBadgeAwards(request, repository)),
    )),
    http.get(apiEndpoint(apiBase, 'badge/user/awards'), ({ request }) => runDemoHandler(
      scenario,
      async () => HttpResponse.json(await demoUserBadgeAwards(request, repository)),
    )),
    http.get(apiEndpoint(apiBase, 'badge/user/awards/recent'), ({ request }) => runDemoHandler(
      scenario,
      async () => HttpResponse.json(await demoUserBadgeAwards(request, repository)),
    )),
    http.get(apiEndpoint(apiBase, 'notifications'), ({ request }) => runDemoHandler(
      scenario,
      async () => HttpResponse.json(await demoNotifications(request, repository)),
    )),
    http.get(apiEndpoint(apiBase, 'notification/page'), ({ request }) => runDemoHandler(
      scenario,
      async () => HttpResponse.json(await demoNotificationPage(request, repository)),
    )),
    http.get(apiEndpoint(apiBase, 'notification/status'), ({ request }) => runDemoHandler(
      scenario,
      async () => HttpResponse.json(await demoNotificationStatus(request, repository)),
    )),
    http.put(apiEndpoint(apiBase, 'notification/status'), ({ request }) => runDemoHandler(
      scenario,
      async () => HttpResponse.json(await demoNotificationStatus(request, repository)),
    )),
    http.put(apiEndpoint(apiBase, 'notification/read/state'), ({ request }) => runDemoHandler(
      scenario,
      async () => HttpResponse.json(await demoMarkNotificationRead(request, repository)),
    )),
    http.put(apiEndpoint(apiBase, 'notification/read/state/all'), ({ request }) => runDemoHandler(
      scenario,
      async () => HttpResponse.json(await demoMarkAllNotificationsRead(request, repository)),
    )),
    http.put(apiEndpoint(apiBase, 'user/interface'), ({ request }) => runDemoHandler(
      scenario,
      async () => HttpResponse.json(await demoUserInterfaceConfig(request, repository)),
    )),
    http.post(apiEndpoint(apiBase, 'user/notification/config'), ({ request }) => runDemoHandler(
      scenario,
      async () => HttpResponse.json(await demoUserNotificationConfig(request, repository)),
    )),
    http.put(apiEndpoint(apiBase, 'user/notification/config'), ({ request }) => runDemoHandler(
      scenario,
      async () => HttpResponse.json(await demoUserNotificationConfig(request, repository)),
    )),
    http.get(apiEndpoint(apiBase, 'activity/timeline'), ({ request }) => runDemoHandler(
      scenario,
      async () => HttpResponse.json(await demoActivityTimeline(request, repository)),
    )),
    http.get(apiEndpoint(apiBase, 'activity/timeline/detail'), ({ request }) => runDemoHandler(
      scenario,
      async () => HttpResponse.json(await demoActivityTimelineDetail(request, repository)),
    )),
    http.get(apiEndpoint(apiBase, 'rin-writer/draft'), ({ request }) => runDemoHandler(
      scenario,
      async () => {
        const draft = await demoReadDraft(request, repository);
        return draft ? HttpResponse.json(draft) : new HttpResponse(null, { status: 204 });
      },
    )),
    http.put(apiEndpoint(apiBase, 'rin-writer/draft'), ({ request }) => runDemoHandler(
      scenario,
      async () => HttpResponse.json(await demoWriteDraft(request, repository)),
    )),
    http.delete(apiEndpoint(apiBase, 'rin-writer/draft'), ({ request }) => runDemoHandler(
      scenario,
      async () => {
        await demoDeleteDraft(request, repository);
        return new HttpResponse(null, { status: 204 });
      },
    )),
    http.get(apiEndpoint(apiBase, 'creator/analytics'), ({ request }) => runDemoHandler(
      scenario,
      async () => HttpResponse.json(await demoCreatorAnalytics(request, repository)),
    )),
    http.get(apiEndpoint(apiBase, 'creator/contributions'), ({ request }) => runDemoHandler(
      scenario,
      async () => HttpResponse.json(await demoCreatorContributions(request, repository)),
    )),
    http.all(({ request }) => {
      const requestUrl = new URL(request.url);
      return requestUrl.origin !== origin || !isCommonAssetRequest(request);
    }, ({ request }) => {
      const requestUrl = new URL(request.url);
      if (requestUrl.origin !== origin) return HttpResponse.error();
      const inApiBase = requestUrl.pathname.startsWith(apiBase.pathname);
      if (inApiBase || apiShapedPath(requestUrl.pathname)) {
        return runDemoHandler(scenario, () => demoErrorResponse(new DemoRequestError(
          501,
          'demo.handler_not_registered',
          'This first-party demo endpoint has no registered handler.',
          { method: request.method.toUpperCase(), path: requestUrl.pathname },
        )));
      }
      return passthrough();
    }),
  ];
}
