import { requestJson } from '@/services/httpClient';
import { getAuthDeviceId } from '@/services/phoneAuth';

export type ContentReadResponse = {
  counted: boolean;
  readCount: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function parseContentReadResponse(value: unknown): ContentReadResponse {
  if (!isRecord(value) || typeof value.counted !== 'boolean' || typeof value.readCount !== 'number' || !Number.isFinite(value.readCount)) {
    throw new Error('阅读统计返回格式异常。');
  }
  return { counted: value.counted, readCount: value.readCount };
}

export function createContentReadRequestId() {
  const value = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
  return `read:${value}`;
}

export async function recordContentRead(slug: string, requestId: string): Promise<ContentReadResponse> {
  const normalizedSlug = slug.trim();
  if (!normalizedSlug) throw new Error('缺少内容标识。');
  const payload = await requestJson<unknown>(
    `content/${encodeURIComponent(normalizedSlug)}/read`,
    {
      method: 'POST',
      auth: 'optional',
      headers: { 'x-device-id': getAuthDeviceId() },
      body: { requestId },
    },
  );
  return parseContentReadResponse(payload);
}
