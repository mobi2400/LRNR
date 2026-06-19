/**
 * Next's `server-only` package is great inside the app runtime, but it throws
 * immediately in standalone Node scripts. This lightweight guard keeps the same
 * intent for shared server modules while still allowing local validation
 * scripts to execute on Windows during development.
 */
export function assertServerOnly(moduleName: string): void {
  if (typeof window !== 'undefined') {
    throw new Error(
      `${moduleName} is server-only and must not run in the browser.`,
    );
  }
}
