import type { IncomingMessage, ServerResponse } from "node:http";
import { homeLatitude, homeLocation, homeLongitude, newsFeedUrl, newsSource } from "../core/config.js";
import { sendJson } from "../core/http.js";

type WeatherSummary = {
  location: string;
  condition: string;
  temperatureF: number | null;
  feelsLikeF: number | null;
  windMph: number | null;
  observedAt: string | null;
};

type NewsItem = {
  title: string;
  source: string;
  url: string;
  publishedAt: string | null;
};

function asNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function conditionFromWeatherCode(code: unknown) {
  if (typeof code !== "number") return "Unavailable";

  if (code === 0) return "Clear";
  if ([1, 2].includes(code)) return "Partly cloudy";
  if (code === 3) return "Overcast";
  if ([45, 48].includes(code)) return "Fog";
  if ([51, 53, 55, 56, 57].includes(code)) return "Drizzle";
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "Rain";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "Snow";
  if ([95, 96, 99].includes(code)) return "Thunderstorms";

  return "Variable";
}

function decodeXmlEntity(entity: string) {
  const named: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    quot: '"',
  };

  if (entity.startsWith("#x")) {
    const codePoint = Number.parseInt(entity.slice(2), 16);
    return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : `&${entity};`;
  }
  if (entity.startsWith("#")) {
    const codePoint = Number.parseInt(entity.slice(1), 10);
    return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : `&${entity};`;
  }
  return named[entity] ?? `&${entity};`;
}

function decodeXml(value: string) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&([^;]+);/g, (_match, entity: string) => decodeXmlEntity(entity))
    .trim();
}

function getXmlTag(block: string, tag: string) {
  const match = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match ? decodeXml(match[1]) : null;
}

async function routeWeather(res: ServerResponse) {
  const weatherUrl = new URL("https://api.open-meteo.com/v1/forecast");
  weatherUrl.searchParams.set("latitude", homeLatitude);
  weatherUrl.searchParams.set("longitude", homeLongitude);
  weatherUrl.searchParams.set("current", "temperature_2m,apparent_temperature,weather_code,wind_speed_10m");
  weatherUrl.searchParams.set("temperature_unit", "fahrenheit");
  weatherUrl.searchParams.set("wind_speed_unit", "mph");
  weatherUrl.searchParams.set("timezone", "auto");

  const response = await fetch(weatherUrl, { signal: AbortSignal.timeout(5000) });
  if (!response.ok) {
    sendJson(res, 502, { error: `Weather provider returned ${response.status}` });
    return;
  }

  const payload = (await response.json()) as {
    current?: {
      apparent_temperature?: unknown;
      temperature_2m?: unknown;
      time?: unknown;
      weather_code?: unknown;
      wind_speed_10m?: unknown;
    };
  };
  const current = payload.current ?? {};
  const summary: WeatherSummary = {
    location: homeLocation,
    condition: conditionFromWeatherCode(current.weather_code),
    temperatureF: asNumber(current.temperature_2m),
    feelsLikeF: asNumber(current.apparent_temperature),
    windMph: asNumber(current.wind_speed_10m),
    observedAt: typeof current.time === "string" ? current.time : null,
  };

  sendJson(res, 200, summary);
}

async function routeNews(res: ServerResponse) {
  const response = await fetch(newsFeedUrl, { signal: AbortSignal.timeout(5000) });
  if (!response.ok) {
    sendJson(res, 502, { error: `News provider returned ${response.status}` });
    return;
  }

  const xml = await response.text();
  const items: NewsItem[] = Array.from(xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi))
    .slice(0, 7)
    .map((match) => {
      const block = match[1];
      return {
        title: getXmlTag(block, "title") ?? "Untitled",
        source: newsSource,
        url: getXmlTag(block, "link") ?? "",
        publishedAt: getXmlTag(block, "pubDate"),
      };
    })
    .filter((item) => item.title !== "Untitled" && item.url);

  sendJson(res, 200, {
    source: newsSource,
    generatedAt: new Date().toISOString(),
    items,
  });
}

export async function routeHome(req: IncomingMessage, res: ServerResponse, url: URL) {
  if (url.pathname === "/api/home/weather" && req.method === "GET") {
    await routeWeather(res);
    return true;
  }
  if (url.pathname === "/api/home/news" && req.method === "GET") {
    await routeNews(res);
    return true;
  }
  return false;
}
