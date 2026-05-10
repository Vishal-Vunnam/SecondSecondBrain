import { initialStatuses, services } from "../config/workspace";
import type { ServiceKey, ServiceStatus } from "../types";
import { apiUrl } from "./api";

async function checkEndpoint(endpoint: string, timeoutMs = 3000) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(apiUrl(endpoint), {
      cache: "no-store",
      credentials: "include",
      signal: controller.signal,
    });
    return response.ok || response.status === 401;
  } catch {
    return false;
  } finally {
    window.clearTimeout(timeout);
  }
}

export function getCheckingStatuses() {
  return { ...initialStatuses };
}

export async function probeServices(): Promise<Record<ServiceKey, ServiceStatus>> {
  const results = await Promise.all(
    services.map(async (service) => {
      const status: ServiceStatus = (await checkEndpoint(service.endpoint)) ? "online" : "offline";
      return {
        key: service.key,
        status,
      };
    }),
  );

  return results.reduce<Record<ServiceKey, ServiceStatus>>((next, result) => {
    next[result.key] = result.status;
    return next;
  }, getCheckingStatuses());
}
