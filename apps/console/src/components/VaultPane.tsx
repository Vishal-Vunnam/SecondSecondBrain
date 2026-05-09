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
        <h1>Vault</h1>
        <span className="seal">Live</span>
      </header>

      <label className="search-plate">
        <Search size={13} />
        <input placeholder="Search" aria-label="Search archive" />
      </label>

      <div>
        <p className="section-label">Shelves</p>
        <nav className="shelf-list" aria-label="Vault shelves">
          {shelves.map((shelf, index) => (
            <a className={`shelf-item ${index === 0 ? "active" : ""}`} href="#manuscript" key={shelf.name}>
              <span>{shelf.count}</span>
              <strong>{shelf.name}</strong>
            </a>
          ))}
        </nav>
      </div>

      <section className="service-ledger" aria-label="Service state">
        {services.map((service) => (
          <div className="service-row" key={service.key}>
            <StatusDot status={statuses[service.key]} />
            <strong>{service.label}</strong>
            <span>{service.detail}</span>
          </div>
        ))}
      </section>
    </aside>
  );
}
