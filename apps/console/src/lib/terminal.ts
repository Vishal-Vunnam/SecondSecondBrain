export function buildTerminalUrl() {
  const host = window.location.hostname || "localhost";
  const protocol = window.location.protocol || "http:";
  return `${protocol}//${host}:7681/`;
}
