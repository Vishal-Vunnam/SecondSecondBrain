const devApiBase = "http://127.0.0.1:8099";

export function apiUrl(path: string) {
  const configuredBase = import.meta.env.VITE_API_BASE as string | undefined;
  const base = configuredBase ?? (import.meta.env.DEV ? devApiBase : "");
  return `${base}${path}`;
}
