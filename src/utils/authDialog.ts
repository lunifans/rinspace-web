export const authDialogRequestEvent = 'rinspace:auth-dialog-request';

export function requestAuthDialog() {
  globalThis.window?.dispatchEvent(new Event(authDialogRequestEvent));
}
