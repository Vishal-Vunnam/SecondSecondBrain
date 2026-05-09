import type { ServiceStatus } from "../types";

type StatusDotProps = {
  status: ServiceStatus;
};

export function StatusDot({ status }: StatusDotProps) {
  return <span className={`status-dot ${status}`} aria-hidden="true" />;
}
