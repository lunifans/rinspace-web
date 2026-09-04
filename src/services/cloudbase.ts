import { publicEnv } from '@/app/config/env';
import cloudbase from './cloudbaseVendor';

function cloudbasePublicConfig() {
  const env = publicEnv.cloudbaseEnvId || '';
  if (!env) {
    throw new Error('CloudBase env is required.');
  }
  return {
    env,
    region: publicEnv.cloudbaseRegion || 'ap-shanghai',
    accessKey: publicEnv.cloudbaseAccessKey || '',
  };
}

let appInstance: ReturnType<typeof cloudbase.init> | null = null;
let appConfigKey = '';

export function getCloudBaseApp() {
  const config = cloudbasePublicConfig();
  const configKey = JSON.stringify(config);
  if (!appInstance || appConfigKey !== configKey) {
    appInstance = cloudbase.init({
      env: config.env,
      region: config.region,
      ...(config.accessKey ? { accessKey: config.accessKey, auth: { detectSessionInUrl: true } } : {}),
    });
    appConfigKey = configKey;
  }
  return appInstance;
}

export function getCloudBaseAuth() {
  return getCloudBaseApp().auth({ persistence: 'local' });
}

export function hasCloudBasePublishableKey(): boolean {
  return Boolean(publicEnv.cloudbaseAccessKey);
}
