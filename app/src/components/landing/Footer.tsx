import { Logo } from "@/components/Logo";

export function Footer() {
  return (
    <footer className="border-t border-border/40 px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
        <Logo />
        <div className="flex items-center gap-6 text-sm text-muted-foreground">
          <a href="https://docs.wal.app" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">
            Walrus docs
          </a>
          <a href="https://discord.com/invite/walrusprotocol" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">
            Discord
          </a>
          <a href="https://github.com" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">
            GitHub
          </a>
        </div>
        <span className="font-mono text-xs text-muted-foreground/60">© 2026 walrus.forms</span>
      </div>
    </footer>
  );
}
