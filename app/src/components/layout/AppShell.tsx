import { useEffect, useState, type ReactNode } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import {
  FileText,
  Users2,
  Settings,
  Sun,
  Moon,
  Plus,
  Menu,
  X,
} from "lucide-react";

import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { WalletWidget } from "@/components/WalletWidget";
import { applyTheme, getStoredTheme, type Theme } from "@/lib/theme";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/dashboard", label: "Forms", icon: FileText, end: true },
  { to: "/dashboard/allowlists", label: "Allowlists", icon: Users2 },
  { to: "/dashboard/settings", label: "Settings", icon: Settings },
];

const TITLES: { match: RegExp; title: string; crumb?: string }[] = [
  { match: /^\/dashboard\/allowlists/, title: "Allowlists", crumb: "Forms / Allowlists" },
  { match: /^\/dashboard\/settings/, title: "Settings", crumb: "Forms / Settings" },
  { match: /^\/dashboard$/, title: "Forms", crumb: "Forms" },
  { match: /^\/builder/, title: "Builder", crumb: "Forms / New form" },
  { match: /^\/admin\//, title: "Submissions", crumb: "Forms / Submissions" },
];

export function AppShell({ children, action }: { children: ReactNode; action?: ReactNode }) {
  const location = useLocation();
  const [theme, setTheme] = useState<Theme>(getStoredTheme());
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const meta = TITLES.find((t) => t.match.test(location.pathname));

  return (
    <div className="min-h-svh flex bg-background text-foreground">
      <aside
        className={cn(
          "fixed md:sticky top-0 z-40 h-svh w-[240px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar transition-transform",
          mobileOpen ? "flex translate-x-0" : "hidden md:flex md:translate-x-0",
          !mobileOpen && "max-md:-translate-x-full",
        )}
      >
        <div className="h-16 px-5 flex items-center justify-between border-b border-sidebar-border">
          <Link to="/" aria-label="Home">
            <Logo />
          </Link>
          <button
            type="button"
            className="md:hidden text-muted-foreground hover:text-foreground"
            onClick={() => setMobileOpen(false)}
            aria-label="Close menu"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav className="flex-1 p-3 flex flex-col gap-0.5 overflow-y-auto">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
                  isActive
                    ? "bg-primary/10 text-primary border-l-2 border-primary pl-[10px]"
                    : "text-muted-foreground hover:text-foreground hover:bg-background-soft",
                )
              }
            >
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="px-3 pb-4">
          <div className="border-t border-sidebar-border pt-3">
            <WalletWidget />
          </div>
        </div>
      </aside>

      {mobileOpen && (
        <button
          type="button"
          aria-label="Close menu overlay"
          className="md:hidden fixed inset-0 z-30 bg-black/40 backdrop-blur-sm"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="h-16 border-b border-border/60 flex items-center justify-between px-4 sm:px-6 gap-4 sticky top-0 z-20 backdrop-blur-xl bg-background/80">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              className="md:hidden text-muted-foreground hover:text-foreground -ml-1"
              onClick={() => setMobileOpen(true)}
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <span className="font-mono text-xs text-muted-foreground hidden sm:inline">
              {meta?.crumb ?? "walrus.forms"}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {action}
            <Button
              variant="ghost"
              size="sm"
              aria-label="Toggle theme"
              onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
            >
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
          </div>
        </header>

        <main className="flex-1 px-4 sm:px-6 py-8">{children}</main>
      </div>
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
      <div>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h1 className="mt-1 font-serif italic text-3xl sm:text-4xl tracking-tight">{title}</h1>
        {description && (
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground leading-relaxed">{description}</p>
        )}
      </div>
      {action && <div className="shrink-0 flex items-center gap-2">{action}</div>}
    </div>
  );
}

export { Plus };
