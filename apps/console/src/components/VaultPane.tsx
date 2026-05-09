import { Search } from "lucide-react";
import { services, shelves } from "../config/workspace";
import type { ServiceKey, ServiceStatus } from "../types";
import { StatusDot } from "./StatusDot";

type VaultPaneProps = {
  statuses: Record<ServiceKey, ServiceStatus>;
};

export function VaultPane({ statuses }: VaultPaneProps) {
  return (
    <aside className="vault-pane">
      <header className="pane-heading">
        <div>
          <p className="overline">Vault</p>
          <h1>The Second Brain</h1>
        </div>
        <span className="seal">Live</span>
      </header>

      <label className="search-plate">
        <Search size={15} />
        <input placeholder="Search archive" aria-label="Search archive" />
      </label>

      <nav className="shelf-list" aria-label="Vault shelves">
        {shelves.map((shelf, index) => (
          <a className={`shelf-item ${index === 0 ? "active" : ""}`} href="#manuscript" key={shelf.name}>
            <span>{shelf.count}</span>
            <div>
              <strong>{shelf.name}</strong>
              <small>{shelf.detail}</small>
            </div>
          </a>
        ))}
      </nav>

      <section className="service-ledger" aria-label="Service state">
        {services.map((service) => (
          <div className="service-row" key={service.key}>
            <StatusDot status={statuses[service.key]} />
            <div>
              <strong>{service.label}</strong>
              <span>{service.detail}</span>
            </div>
          </div>
        ))}
      </section>
    </aside>
  );
}
