import { requestJson, ServiceError } from './httpClient';
import { getGiteaBasePath } from '@/utils/giteaPaths';

async function requestGiteaJson(path: string): Promise<unknown> {
  const response = await fetch(`${getGiteaBasePath()}${path.replace(/^\/+/, '')}`, {
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`Gitea request failed (${response.status}).`);
  return response.json() as Promise<unknown>;
}

export function loadGiteaUserHeatmap(username: string): Promise<unknown> {
  return requestGiteaJson(`api/v1/users/${encodeURIComponent(username)}/heatmap`);
}

export function loadRecentGiteaRepositories(): Promise<unknown> {
  return requestGiteaJson('api/v1/user/repos?limit=1&sort=updated');
}

function userFacingError(error: unknown, fallback: string): Error {
  if (error instanceof ServiceError && error.message && !error.message.startsWith('Request failed')) {
    return new Error(error.message);
  }
  return new Error(fallback);
}

export async function syncGiteaSession(): Promise<boolean> {
  try {
    await requestJson<unknown>('gitea/sso', { method: 'POST', auth: 'required' });
    return true;
  } catch (error) {
    if (error instanceof ServiceError && error.code === 'authentication.required') return false;
    throw userFacingError(error, 'Git 登录同步失败。');
  }
}

export async function clearGiteaSession(): Promise<void> {
  try {
    await requestJson<unknown>('gitea/sso', { method: 'DELETE', auth: 'none' });
  } catch (error) {
    throw userFacingError(error, 'Git 登录清理失败。');
  }
}
