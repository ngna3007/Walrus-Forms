import { Link } from "react-router-dom";
import { ArrowRight, ChevronDown } from "lucide-react";

export function Hero() {
  return (
    <section className="relative min-h-svh flex flex-col items-center justify-center overflow-hidden">
      <div className="pointer-events-none absolute inset-0 hero-gradient-bg grain" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-background/0 via-background/0 to-background" />

      <div className="relative mx-auto flex max-w-5xl flex-col items-center px-4 text-center sm:px-6 lg:px-8 z-10">
        <div className="animate-fade-rise pill mb-8 border-primary/30 bg-primary/10 text-primary">
          <span className="h-1.5 w-1.5 rounded-full bg-primary" />
          Built for Walrus Session 2 — Form Tooling
        </div>

        <h1
          className="animate-fade-rise font-serif leading-[1.02] tracking-[-0.035em] text-foreground text-[2.5rem] sm:text-[3rem] md:text-[3.5rem] lg:text-[4.25rem] font-medium"
          style={{ textWrap: "balance" }}
        >
          Where <span className="text-muted-foreground/70">feedback</span>
          <br className="hidden md:block" /> <span className="text-muted-foreground/70">becomes</span>{" "}
          verifiable.
        </h1>

        <p
          className="animate-fade-rise animation-delay-200 mt-8 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg"
          style={{ textWrap: "balance" }}
        >
          Forms stored on Walrus. Submissions encrypted with Seal. Triage on Sui.
          The end-to-end feedback stack for on-chain communities.
        </p>

        <div className="animate-fade-rise animation-delay-400 mt-10 flex items-center gap-3">
          <Link to="/dashboard">
            <button className="liquid-glass-strong group inline-flex cursor-pointer items-center gap-3 rounded-full px-8 py-3.5 text-sm font-medium tracking-wide text-foreground hover:scale-[1.02] transition-transform">
              Start building
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </button>
          </Link>
          <a
            href="https://github.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors px-4 py-3"
          >
            View source →
          </a>
        </div>
      </div>

      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce">
        <ChevronDown className="h-5 w-5 text-muted-foreground/50" />
      </div>
    </section>
  );
}
