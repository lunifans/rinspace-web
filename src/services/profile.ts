import { getCloudBaseAuth, hasCloudBasePublishableKey } from './cloudbase';
import { getCurrentAuthUser, getFreshAuthSession, replaceStoredSession } from './phoneAuth';
import { requestJson, ServiceError } from './httpClient';
import type { ApiOperations, ApiSchemas } from '@/generated/api-contract';

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
type ProfileResponse = ApiSchemas['Profile'];
type ProfileUpdateRequest = ApiOperations['saveProfile']['requestBody'];

type UploadedAvatar = {
  fileID: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function parseProfileResponse(value: unknown): ProfileResponse | null {
  if (!isRecord(value)) return null;
  const stringFields = [
    'uid', 'handle', 'username', 'nickname', 'avatarDataUrl', 'coverUrl', 'bio', 'website',
    'location', 'aboutHtml', 'updatedAt', 'createdAt',
  ] as const;
  if (stringFields.some((field) => value[field] !== undefined && typeof value[field] !== 'string')) return null;
  if (value.rank !== undefined && !Number.isInteger(value.rank)) return null;
  const knownFields: readonly string[] = [...stringFields, 'rank'];
  if (Object.keys(value).some((field) => !knownFields.includes(field))) return null;
  return value;
}

async function requestProfile(method: 'GET' | 'POST', body: ProfileUpdateRequest | null = null) {
  let payload: unknown;
  try {
    payload = await requestJson<unknown>('profile', {
      method,
      auth: 'required',
      body: body ?? undefined,
    });
  } catch (error) {
    if (error instanceof ServiceError && error.status === 404) return null;
    if (error instanceof ServiceError && error.message && !error.message.startsWith('Request failed')) {
      throw new Error(error.message);
    }
    throw new Error('资料保存失败，请稍后重试。');
  }
  if (payload === null) return null;
  const parsed = parseProfileResponse(payload);
  if (!parsed) {
    throw new Error('资料返回格式异常。');
  }
  return parsed;
}

export function messageFromError(error: unknown) {
  if (error instanceof Error) return error.message;
  if (isRecord(error) && typeof error.message === 'string') {
    return error.message;
  }
  return '操作失败，请稍后重试。';
}

export function normalizePhone(phone: string) {
  return phone.replace(/\s+/g, '');
}

export function isMainlandPhone(phone: string) {
  return /^1[3-9]\d{9}$/.test(normalizePhone(phone));
}

export async function getCurrentUser() {
  return getCurrentAuthUser();
}

export async function loadProfile(user: { id?: string }) {
  if (!user.id) throw new Error('当前用户缺少 uid。');
  return requestProfile('GET');
}

export async function saveProfile(
  user: { id?: string },
  profile: {
    username: string;
    nickname: string;
    avatarDataUrl: string;
    coverUrl?: string;
    bio?: string;
    website?: string;
    location?: string;
    aboutHtml?: string;
  },
  options: Readonly<{ syncCloudBase?: boolean }> = {},
) {
  if (!user.id) throw new Error('当前用户缺少 uid。');

  const nickname = profile.nickname.trim();
  if (nickname.length < 2 || nickname.length > 24) {
    throw new Error('昵称需要 2 到 24 个字符。');
  }
  const username = profile.username.trim().replace(/^@+/, '');

  if (options.syncCloudBase !== false) {
    await updateCloudBaseUserProfile({
      username,
      nickname,
      avatarUrl: profile.avatarDataUrl,
    });
  }

  return requestProfile('POST', {
    username,
    nickname,
    avatarDataUrl: profile.avatarDataUrl,
    coverUrl: profile.coverUrl || '',
    bio: profile.bio,
    website: profile.website,
    location: profile.location,
    aboutHtml: profile.aboutHtml,
  });
}

function validateAvatarFile(file: File) {
  if (!file.type.startsWith('image/')) {
    throw new Error('请选择图片文件。');
  }
  if (file.size > MAX_AVATAR_BYTES) {
    throw new Error('头像图片不能超过 2MB。');
  }
}

function cloudBackedAvatar(value: string) {
  const trimmed = value.trim();
  return trimmed.startsWith('https://') || trimmed.startsWith('http://') || trimmed.startsWith('cloud://');
}

async function syncCloudBaseSession() {
  if (!hasCloudBasePublishableKey()) {
    throw new Error('CloudBase publishable key 未配置，无法上传头像。');
  }
  const session = await getFreshAuthSession();
  if (!session) {
    throw new Error('请先登录后上传头像。');
  }
  const auth = getCloudBaseAuth();
  await auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  });
  const nextSession = await auth.getSession();
  if (isRecord(nextSession.data) && isRecord(nextSession.data.session)) {
    const refreshed = nextSession.data.session;
    if (
      typeof refreshed.access_token === 'string' &&
      typeof refreshed.refresh_token === 'string'
    ) {
      replaceStoredSession({
        access_token: refreshed.access_token,
        refresh_token: refreshed.refresh_token,
        expires_in: typeof refreshed.expires_in === 'number' ? refreshed.expires_in : session.expires_in,
        sub: typeof refreshed.user === 'object' && refreshed.user !== null && 'id' in refreshed.user && typeof refreshed.user.id === 'string'
          ? refreshed.user.id
          : session.sub,
      });
    }
  }
  return auth;
}

async function uploadProfileImageFile(
  user: { id?: string },
  file: File,
  source: 'avatar' | 'cover',
): Promise<UploadedAvatar> {
  if (!user.id) throw new Error('当前用户缺少 uid。');
  validateAvatarFile(file);

  const body = new FormData();
  body.set('source', source);
  body.set('file', file);
  const payload = await requestJson<unknown>('file', {
    method: 'POST',
    auth: 'required',
    body,
    bodyEncoding: 'form-data',
  });
  if (typeof payload !== 'string' || !payload.startsWith('https://')) {
    throw new Error(source === 'cover' ? '封面上传失败：缺少公开图片地址。' : 'CloudBase 头像上传失败：缺少公开头像地址。');
  }

  return {
    fileID: payload,
  };
}

export async function uploadAvatarFile(user: { id?: string }, file: File): Promise<UploadedAvatar> {
  return uploadProfileImageFile(user, file, 'avatar');
}

export async function uploadCoverFile(user: { id?: string }, file: File): Promise<UploadedAvatar> {
  return uploadProfileImageFile(user, file, 'cover');
}

async function updateCloudBaseUserProfile(input: { username: string; nickname: string; avatarUrl: string }) {
  if (!hasCloudBasePublishableKey()) {
    return;
  }
  const auth = await syncCloudBaseSession();
  const params: Parameters<typeof auth.updateUser>[0] = {
    nickname: input.nickname,
  };
  const modernParams = params as Parameters<typeof auth.updateUser>[0] & {
    user_metadata?: Record<string, string>;
    picture?: string;
  };
  modernParams.user_metadata = {
    nickname: input.nickname,
    nickName: input.nickname,
    ...(input.username
      ? {
          preferred_username: input.username,
        }
      : {}),
    ...(input.avatarUrl
      ? {
          avatarUrl: input.avatarUrl,
          avatar_url: input.avatarUrl,
          picture: input.avatarUrl,
        }
      : {}),
  };
  if (cloudBackedAvatar(input.avatarUrl)) {
    modernParams.picture = input.avatarUrl;
    params.avatar_url = input.avatarUrl;
  }
  await auth.updateUser(params);
}
