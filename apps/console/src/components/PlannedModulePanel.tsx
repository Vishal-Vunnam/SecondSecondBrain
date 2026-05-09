import { ArrowRight } from "lucide-react";
import type { AppModule } from "../types";

type PlannedModulePanelProps = {
  module: AppModule;
};

export function PlannedModulePanel({ module }: PlannedModulePanelProps) {
  return (
    <section className="planned-panel" aria-label={`${module.title} workspace`}>
      <div className="planned-copy">
        <span>Planned module</span>
        <h3>{module.title}</h3>
        <p>{module.description}</p>
      </div>
      <div className="planned-frame">
        <div>
          <strong>{module.shortTitle}</strong>
          <span>Reserved app surface</span>
        </div>
        <ArrowRight size={18} />
      </div>
    </section>
  );
}
