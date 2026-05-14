import { useEffect, useRef, useState } from "react";
import {
  Activity,
  Bookmark,
  BookOpenText,
  ChevronDown,
  CircleDollarSign,
  Dumbbell,
  GalleryVerticalEnd,
  HeartPulse,
  Home,
  ListTodo,
  LogOut,
  Moon,
  Palette,
  PieChart,
  Receipt,
  RefreshCw,
  ShoppingCart,
  Sun,
  Terminal,
  Utensils,
  Wallet,
} from "lucide-react";
import { appModules } from "../config/modules";
import type { AppModule, AppModuleId, AppTheme } from "../types";

type TopbarProps = {
  activeModule: AppModule;
  activeModuleId: AppModuleId;
  onRefresh: () => void;
  onLogout: () => void;
  onSelectModule: (module: AppModuleId) => void;
  onToggleTheme: () => void;
  refreshing: boolean;
  theme: AppTheme;
};

const moduleIcons: Record<AppModuleId, typeof BookOpenText> = {
  home: Home,
  tasks: ListTodo,
  notes: BookOpenText,
  "reading-list": Bookmark,
  terminal: Terminal,
  system: GalleryVerticalEnd,
  health: Activity,
  "health-log": HeartPulse,
  "health-food": Utensils,
  fitness: Dumbbell,
  "health-body": HeartPulse,
  money: Wallet,
  shopping: ShoppingCart,
  budget: PieChart,
  expenses: Receipt,
};

type NavDropdownId = "knowledge" | "health" | "money";

type NavDropdown = {
  id: NavDropdownId;
  label: string;
  description: string;
  Icon: typeof BookOpenText;
  moduleIds: AppModuleId[];
};

const moduleById = new Map(appModules.map((module) => [module.id, module]));

const navDropdowns: NavDropdown[] = [
  {
    id: "knowledge",
    label: "Knowledge",
    description: "Notes, reading, shell, and system tools.",
    Icon: BookOpenText,
    moduleIds: ["notes", "reading-list", "terminal", "system"],
  },
  {
    id: "health",
    label: "Health",
    description: "Overview, food, fitness, and body logs.",
    Icon: Activity,
    moduleIds: ["health", "health-log", "health-food", "fitness", "health-body"],
  },
  {
    id: "money",
    label: "Money",
    description: "Shopping, budget, and expenses.",
    Icon: CircleDollarSign,
    moduleIds: ["money", "shopping", "budget", "expenses"],
  },
];

function getDropdownModules(dropdown: NavDropdown) {
  return dropdown.moduleIds
    .map((id) => moduleById.get(id))
    .filter((module): module is AppModule => module !== undefined);
}

export function Topbar({ activeModule, activeModuleId, onLogout, onRefresh, onSelectModule, onToggleTheme, refreshing, theme }: TopbarProps) {
  const host = window.location.hostname || "localhost";
  const themeMeta: Record<AppTheme, { Icon: typeof Sun; nextLabel: string }> = {
    light: { Icon: Moon, nextLabel: "Switch to dark mode" },
    dark: { Icon: Palette, nextLabel: "Switch to Guston light" },
    "guston-light": { Icon: Moon, nextLabel: "Switch to Guston dark" },
    "guston-dark": { Icon: Sun, nextLabel: "Switch to light mode" },
  };
  const { Icon: ThemeIcon, nextLabel: themeNextLabel } = themeMeta[theme];
  const [openMenu, setOpenMenu] = useState<NavDropdownId | null>(null);
  const navRef = useRef<HTMLElement | null>(null);
  const primaryModules = appModules.filter((module) => module.group === "home");

  useEffect(() => {
    function handleMouseDown(event: MouseEvent) {
      if (!openMenu) return;
      const target = event.target;
      if (target instanceof Node && navRef.current?.contains(target)) return;
      setOpenMenu(null);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpenMenu(null);
    }

    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [openMenu]);

  function renderModuleButton(module: AppModule, variant: "top" | "dropdown" = "top") {
    const Icon = moduleIcons[module.id];
    const isActive = activeModuleId === module.id;

    return (
      <button
        aria-current={isActive ? "page" : undefined}
        className={`${variant === "top" ? "module-nav-button" : "module-dropdown-item"} ${isActive ? "active" : ""} ${
          module.status === "planned" ? "planned" : ""
        }`}
        key={module.id}
        onClick={() => {
          onSelectModule(module.id);
          setOpenMenu(null);
        }}
        role={variant === "dropdown" ? "menuitem" : undefined}
        title={module.description}
        type="button"
      >
        <Icon size={15} />
        <span>{module.shortTitle}</span>
      </button>
    );
  }

  return (
    <header className="topbar">
      <div className="topbar-title">
        <span className="brand-pulse" aria-hidden="true" />
        <h1 className="brand-wordmark">vishalbot</h1>
      </div>
      <nav className="module-nav" aria-label="Application modules" ref={navRef}>
        {primaryModules.map((module) => renderModuleButton(module))}
        {navDropdowns.map((dropdown) => {
          const modules = getDropdownModules(dropdown);
          const dropdownActive = modules.some((module) => module.id === activeModuleId);
          const dropdownPlanned = modules.every((module) => module.status === "planned");
          const isOpen = openMenu === dropdown.id;
          const TriggerIcon = dropdown.Icon;

          return (
            <div
              className={`module-nav-menu ${dropdownActive ? "active" : ""} ${dropdownPlanned ? "planned" : ""} ${isOpen ? "open" : ""}`}
              key={dropdown.id}
            >
              <button
                aria-expanded={isOpen}
                aria-haspopup="menu"
                className={`module-nav-button module-nav-trigger ${dropdownActive ? "active" : ""} ${dropdownPlanned ? "planned" : ""}`}
                onClick={() => setOpenMenu((current) => (current === dropdown.id ? null : dropdown.id))}
                title={dropdown.description}
                type="button"
              >
                <TriggerIcon size={15} />
                <span>{dropdown.label}</span>
                <ChevronDown className="module-nav-chevron" size={14} />
              </button>
              {isOpen && (
                <div className="module-dropdown" role="menu">
                  {modules.map((module) => renderModuleButton(module, "dropdown"))}
                </div>
              )}
            </div>
          );
        })}
      </nav>
      <div className="topbar-actions">
        <span className="host-chip">{host}</span>
        <button
          className="icon-button"
          onClick={onToggleTheme}
          type="button"
          aria-label={themeNextLabel}
          title={themeNextLabel}
        >
          <ThemeIcon size={14} />
        </button>
        <button className="icon-button" onClick={onRefresh} type="button" aria-label="Refresh status">
          <RefreshCw size={14} className={refreshing ? "spin" : ""} />
        </button>
        <button className="icon-button" onClick={onLogout} type="button" aria-label="Log out" title="Log out">
          <LogOut size={14} />
        </button>
      </div>
    </header>
  );
}
