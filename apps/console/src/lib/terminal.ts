export function buildTerminalUrl() {
  const configuredUrl = import.meta.env.VITE_TERMINAL_URL as string | undefined;
  if (configuredUrl) return configuredUrl;

  if (!import.meta.env.DEV) {
    return `${window.location.origin}/terminal/`;
  }

  const host = window.location.hostname || "localhost";
  const protocol = window.location.protocol || "http:";
  return `${protocol}//${host}:7681/`;
}
