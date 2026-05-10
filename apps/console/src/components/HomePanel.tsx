import { ArrowRight, CalendarDays, CloudSun, Newspaper, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { appModules } from "../config/modules";
import { loadNewsSummary, loadWeatherSummary } from "../lib/home";
import type { AppModuleId, NewsSummary, ServiceKey, ServiceStatus, WeatherSummary } from "../types";

type HomePanelProps = {
  noteCount: number;
  onSelectModule: (module: AppModuleId) => void;
  statuses: Record<ServiceKey, ServiceStatus>;
};

function formatTemperature(value: number | null) {
  return value === null ? "--" : `${Math.round(value)}°`;
}

function formatPublishedAt(value: string | null) {
  if (!value) return "Recent";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recent";
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit", month: "short", day: "numeric" }).format(date);
}

export function HomePanel({ noteCount, onSelectModule, statuses }: HomePanelProps) {
  const [weather, setWeather] = useState<WeatherSummary | null>(null);
  const [weatherError, setWeatherError] = useState<string | null>(null);
  const [news, setNews] = useState<NewsSummary | null>(null);
  const [newsError, setNewsError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const now = useMemo(() => new Date(), []);
  const dateLabel = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" }).format(now);
  const yearLabel = new Intl.DateTimeFormat(undefined, { year: "numeric" }).format(now);
  const onlineServices = Object.values(statuses).filter((status) => status === "online").length;
  const activeModules = appModules.filter((module) => module.status === "active" && module.id !== "home");

  useEffect(() => {
    let active = true;

    async function loadHome() {
      setLoading(true);
      const [weatherResult, newsResult] = await Promise.allSettled([loadWeatherSummary(), loadNewsSummary()]);

      if (!active) return;

      if (weatherResult.status === "fulfilled") {
        setWeather(weatherResult.value);
        setWeatherError(null);
      } else {
        setWeather(null);
        setWeatherError(weatherResult.reason instanceof Error ? weatherResult.reason.message : "Weather unavailable");
      }

      if (newsResult.status === "fulfilled") {
        setNews(newsResult.value);
        setNewsError(null);
      } else {
        setNews(null);
        setNewsError(newsResult.reason instanceof Error ? newsResult.reason.message : "News unavailable");
      }

      setLoading(false);
    }

    loadHome();
    return () => {
      active = false;
    };
  }, []);

  return (
    <section className="home-panel" aria-label="Home">
      <div className="home-hero">
        <div>
          <span>{yearLabel}</span>
          <h3>{dateLabel}</h3>
          <p>Vishal.ai keeps the day in view: notes, shell tools, signals, and the next little system worth building.</p>
        </div>
        <div className="date-card" aria-label="Today">
          <CalendarDays size={18} />
          <strong>{now.getDate()}</strong>
          <span>{now.toLocaleString(undefined, { month: "short" })}</span>
        </div>
      </div>

      <div className="home-grid">
        <article className="home-card weather-card">
          <div className="home-card-heading">
            <div>
              <CloudSun size={18} />
              <span>Weather</span>
            </div>
            {loading && <RefreshCw className="spin" size={14} />}
          </div>
          {weather ? (
            <div className="weather-body">
              <strong>{formatTemperature(weather.temperatureF)}</strong>
              <div>
                <span>{weather.location}</span>
                <p>{weather.condition}</p>
                <small>
                  Feels {formatTemperature(weather.feelsLikeF)} · Wind {weather.windMph === null ? "--" : `${Math.round(weather.windMph)} mph`}
                </small>
              </div>
            </div>
          ) : (
            <p className="home-muted">{weatherError ?? "Loading local weather"}</p>
          )}
        </article>

        <article className="home-card stats-card">
          <div className="home-card-heading">
            <div>
              <span>System</span>
            </div>
          </div>
          <div className="stat-grid">
            <div>
              <strong>{onlineServices}/4</strong>
              <span>services online</span>
            </div>
            <div>
              <strong>{noteCount}</strong>
              <span>visible notes here</span>
            </div>
          </div>
        </article>

        <article className="home-card news-card">
          <div className="home-card-heading">
            <div>
              <Newspaper size={18} />
              <span>Brief</span>
            </div>
            {news && <small>{news.source}</small>}
          </div>
          {news?.items.length ? (
            <div className="news-list">
              {news.items.slice(0, 5).map((item) => (
                <a href={item.url} key={item.url} rel="noreferrer" target="_blank">
                  <span>{item.title}</span>
                  <small>{formatPublishedAt(item.publishedAt)}</small>
                </a>
              ))}
            </div>
          ) : (
            <p className="home-muted">{newsError ?? "Loading headlines"}</p>
          )}
        </article>

        <article className="home-card launch-card">
          <div className="home-card-heading">
            <div>
              <span>Launch</span>
            </div>
          </div>
          <div className="launch-list">
            {activeModules.map((module) => (
              <button key={module.id} onClick={() => onSelectModule(module.id)} type="button">
                <span>
                  <strong>{module.title}</strong>
                  <small>{module.description}</small>
                </span>
                <ArrowRight size={16} />
              </button>
            ))}
          </div>
        </article>
      </div>
    </section>
  );
}
