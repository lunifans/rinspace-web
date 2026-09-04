import { i18n } from './index';
import { CapabilityUnavailable, type RuntimeCapability } from '@/platform/runtime';
import { ServiceError } from '@/services/httpClient';

const capabilityErrorKeys: Readonly<Partial<Record<RuntimeCapability, string>>> = {
  'upload.local': 'capabilities.upload',
  'renderer.remote': 'capabilities.renderer',
  'workspace.remote': 'capabilities.workspace',
};

const serviceErrorKeys: Readonly<Record<string, string>> = {
  'authentication.required': 'authentication.required',
  permission_denied: 'permissionDenied',
  unauthorized: 'authentication.required',
  forbidden: 'permissionDenied',
  conflict: 'conflict',
  not_found: 'notFound',
  validation_failed: 'validationFailed',
  'http.400': 'validationFailed',
  'http.401': 'authentication.required',
  'http.403': 'permissionDenied',
  'http.404': 'notFound',
  'http.409': 'conflict',
  'http.429': 'generic',
  'http.500': 'generic',
  'http.cancelled': 'generic',
  'http.network': 'generic',
  'http.timeout': 'generic',
  'demo.scenario.unauthorized': 'authentication.required',
  'demo.scenario.forbidden': 'permissionDenied',
  'demo.scenario.conflict': 'conflict',
  'demo.scenario.validation': 'validationFailed',
  'demo.scenario.rate_limited': 'generic',
  'demo.scenario.server_error': 'generic',
};

export function localizedErrorMessage(error: unknown, fallbackKey = 'generic') {
  if (error instanceof CapabilityUnavailable) {
    return i18n.t(`errors:${capabilityErrorKeys[error.capability] || 'capabilities.generic'}`);
  }
  if (error instanceof ServiceError) {
    const key = serviceErrorKeys[error.code] || serviceErrorKeys[`http.${error.status}`] || fallbackKey;
    if (!serviceErrorKeys[error.code] && !serviceErrorKeys[`http.${error.status}`]) {
      console.error('Unmapped service error', {
        code: error.code,
        status: error.status,
        detail: error.diagnosticDetail,
        payload: error.payload,
      });
    }
    return i18n.t(`errors:${key}`);
  }
  if (error instanceof Error) {
    console.error('Unmapped client error', error);
  }
  return i18n.t(`errors:${fallbackKey}`);
}
