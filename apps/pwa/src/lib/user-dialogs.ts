export function notifyUser(message: string): void {
  if (typeof window === 'undefined') return;
  // Centralized so dialogs can later be replaced by toast/modal UI.
  // eslint-disable-next-line no-alert
  window.alert(message);
}

export function confirmUser(message: string): boolean {
  if (typeof window === 'undefined') return false;
  // eslint-disable-next-line no-alert
  return window.confirm(message);
}

export function promptUser(message: string, defaultValue?: string): string | null {
  if (typeof window === 'undefined') return null;
  // eslint-disable-next-line no-alert
  return window.prompt(message, defaultValue);
}
