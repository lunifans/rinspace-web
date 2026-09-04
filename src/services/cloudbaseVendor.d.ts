export type CloudBaseError = { message?: string } | null;
export type CloudBaseAuth = {
  setSession(session: { access_token: string; refresh_token: string }): Promise<unknown>;
  getSession(): Promise<{ data?: { session?: Record<string, unknown> } }>;
  updateUser(input: {
    nickname?: string;
    avatar_url?: string;
    user_metadata?: Record<string, string>;
    picture?: string;
  }): Promise<unknown>;
};
export type CloudBaseBucket = {
  upload(path: string, file: File, options: Record<string, unknown>): Promise<{ error: CloudBaseError; data: unknown }>;
  remove(paths: string[]): Promise<{ error: CloudBaseError; data: unknown }>;
  createSignedUrl(path: string, expiresIn: number): Promise<{
    error: CloudBaseError;
    data: { signedUrl?: string; fullSignedURL?: string };
  }>;
};
export type CloudBaseApp = {
  auth(options: { persistence: 'local' }): CloudBaseAuth;
  storage: { from(bucket: string): CloudBaseBucket };
  getTempFileURL(input: { fileList: Array<{ fileID: string; maxAge: number }> }): Promise<{
    fileList?: Array<{ tempFileURL?: string; download_url?: string }>;
  }>;
};
declare const cloudbase: {
  init(config: {
    env: string;
    region: string;
    accessKey?: string;
    auth?: { detectSessionInUrl: boolean };
  }): CloudBaseApp;
};
export default cloudbase;
