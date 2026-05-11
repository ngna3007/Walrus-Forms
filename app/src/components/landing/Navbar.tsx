import { Link } from "react-router-dom";
import { ConnectButton } from "@mysten/dapp-kit";

import { Logo } from "@/components/Logo";

export function Navbar() {
  return (
    <header className="fixed top-0 inset-x-0 z-50 backdrop-blur-xl bg-background/30 border-b border-border/40">
      <nav className="mx-auto max-w-7xl flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link to="/" className="flex items-center">
          <Logo />
        </Link>

        <div className="hidden md:flex items-center gap-1">
          <a
            href="https://docs.wal.app"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg px-3 py-2 text-sm font-light text-muted-foreground hover:text-foreground transition-colors"
          >
            Walrus docs
          </a>
          <a
            href="https://github.com"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg px-3 py-2 text-sm font-light text-muted-foreground hover:text-foreground transition-colors"
          >
            GitHub
          </a>
          <Link
            to="/dashboard"
            className="rounded-lg px-3 py-2 text-sm font-light text-muted-foreground hover:text-foreground transition-colors"
          >
            Dashboard
          </Link>
        </div>

        <div className="flex items-center gap-2">
          <ConnectButton />
        </div>
      </nav>
    </header>
  );
}
