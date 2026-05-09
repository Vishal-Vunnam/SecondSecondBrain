const services = [
  { key: "console", endpoint: "/health/console" },
  { key: "couchdb", endpoint: "/health/couchdb" },
  { key: "syncthing", endpoint: "/health/syncthing" },
  { key: "anythingllm", endpoint: "/health/anythingllm" },
  { key: "ollama", endpoint: "/health/ollama" },
];

const host = window.location.hostname || "localhost";
const protocol = window.location.protocol || "http:";
const hostLabel = document.querySelector("#hostLabel");
const refreshButton = document.querySelector("#refreshButton");

hostLabel.textContent = host;

document.querySelectorAll(".external-link").forEach((link) => {
  const port = link.dataset.port;
  const path = link.dataset.path || "/";
  link.href = `${protocol}//${host}:${port}${path}`;
});

async function fetchWithTimeout(url, timeoutMs = 3500) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: controller.signal,
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    window.clearTimeout(timeout);
  }
}

function setServiceStatus(key, status) {
  const card = document.querySelector(`[data-service="${key}"]`);
  const dot = card?.querySelector(".status-dot");
  if (!dot) return;
  dot.classList.remove("checking", "online", "offline");
  dot.classList.add(status);
}

async function refreshHealth() {
  services.forEach((service) => setServiceStatus(service.key, "checking"));
  const results = await Promise.all(
    services.map(async (service) => ({
      key: service.key,
      online: await fetchWithTimeout(service.endpoint),
    })),
  );
  results.forEach((result) => {
    setServiceStatus(result.key, result.online ? "online" : "offline");
  });
}

refreshButton.addEventListener("click", refreshHealth);
refreshHealth();
