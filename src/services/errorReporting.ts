/** Sends browser errors to /api/client-errors (production builds only, a few per page load). */
const MAX_REPORTS_PER_PAGE = 5;
let reported = 0;
const seen = new Set<string>();

export function reportClientError(message: unknown, stack?: unknown): void {
  if (!import.meta.env.PROD) return;
  const text = String(message ?? '').slice(0, 1000);
  if (!text || seen.has(text) || reported >= MAX_REPORTS_PER_PAGE) return;
  seen.add(text);
  reported++;
  try {
    fetch('/api/client-errors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // No user data: only the message, stack and the page path (without query or hash)
      body: JSON.stringify({ message: text, stack: typeof stack === 'string' ? stack.slice(0, 8000) : undefined, path: window.location.pathname }),
      keepalive: true
    }).catch(() => {});
  } catch {
    // reporting must never throw
  }
}

export function installErrorReporting(): void {
  window.addEventListener('error', event => {
    // Resource loading errors (images etc.) have no message; skip them
    if (!event.message) return;
    reportClientError(event.message, event.error?.stack);
  });
  window.addEventListener('unhandledrejection', event => {
    const reason: any = event.reason;
    reportClientError(reason?.message ?? String(reason), reason?.stack);
  });
}
