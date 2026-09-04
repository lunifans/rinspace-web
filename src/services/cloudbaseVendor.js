import cloudbase from '@cloudbase/app';
import { registerAuth } from '@cloudbase/auth';
import { registerStorage } from '@cloudbase/storage';

cloudbase.registerVersion('4.0.0');
registerAuth(cloudbase);
registerStorage(cloudbase);

export default cloudbase;
