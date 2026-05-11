import { Database, Lock, GitBranch, Coins, FileBarChart } from "lucide-react";

export function Features() {
  return (
    <section className="relative w-full px-4 pb-24 sm:px-6 sm:pb-32 lg:px-8">
      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-6 md:grid-cols-3">
        <div className="animate-fade-rise group relative col-span-1 md:col-span-2 flex min-h-[320px] flex-col justify-end overflow-hidden rounded-3xl p-8 liquid-glass">
          <div className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-br from-primary/8 to-transparent" />
          <div className="absolute right-6 top-6">
            <Database className="h-8 w-8 text-primary/50" />
          </div>
          <span className="eyebrow">Storage</span>
          <h3 className="mt-2 font-serif italic text-2xl sm:text-3xl text-foreground">
            Walrus-native by design.
          </h3>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
            Every submission is a content-addressed Walrus blob, bound to a Sui
            object. Tamper-evident, verifiable, owned by the submitter — not the
            host.
          </p>
        </div>

        <div className="animate-fade-rise animation-delay-200 group relative col-span-1 flex min-h-[320px] flex-col justify-between overflow-hidden rounded-3xl p-8 liquid-glass">
          <div className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-br from-secondary/6 to-transparent" />
          <Lock className="h-8 w-8 text-secondary/70" />
          <div>
            <span className="eyebrow">Privacy</span>
            <h3 className="mt-2 font-serif italic text-2xl text-foreground">
              Encrypted with Seal.
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Threshold encryption + on-chain access policies in Move. Decrypt
              only when the policy approves.
            </p>
          </div>
        </div>

        <div className="animate-fade-rise animation-delay-300 group relative col-span-1 flex min-h-[320px] flex-col justify-between overflow-hidden rounded-3xl p-8 liquid-glass">
          <div className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-br from-tertiary/6 to-transparent" />
          <GitBranch className="h-8 w-8 text-tertiary/70" />
          <div>
            <span className="eyebrow">Workflow</span>
            <h3 className="mt-2 font-serif italic text-2xl text-foreground">
              On-chain triage.
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              State machine in Move: Open → Triaged → In Progress → Resolved.
              Every transition emits an event.
            </p>
          </div>
        </div>

        <div className="animate-fade-rise animation-delay-400 col-span-1 md:col-span-2 flex flex-col items-start gap-6 rounded-3xl p-8 liquid-glass sm:flex-row sm:items-center sm:gap-8">
          <div className="flex-1">
            <span className="eyebrow">Builders</span>
            <h3 className="mt-2 font-serif italic text-2xl sm:text-3xl text-foreground">
              Built for builders.
            </h3>
            <p className="mt-3 max-w-lg text-sm leading-relaxed text-muted-foreground">
              SDK-first. Works with the Mysten Walrus, Seal, Sui, and dApp Kit
              SDKs. Move contracts you can fork. Walrus Sites for fully
              decentralized hosting.
            </p>
          </div>
          <div className="hidden sm:flex items-center gap-6 text-sm text-muted-foreground">
            <FileBarChart className="h-10 w-10 text-primary/40" />
            <div className="text-center">
              <div className="font-serif italic text-3xl text-foreground">Free</div>
              <div className="text-xs uppercase tracking-widest text-muted-foreground/70">on testnet</div>
            </div>
          </div>
        </div>

        <div className="animate-fade-rise animation-delay-500 group relative col-span-1 md:col-span-3 flex min-h-[200px] items-center justify-between overflow-hidden rounded-3xl p-8 liquid-glass">
          <div className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-r from-primary/6 via-tertiary/4 to-secondary/6" />
          <div>
            <span className="eyebrow">Sponsors &amp; bounties</span>
            <h3 className="mt-2 font-serif italic text-2xl text-foreground">
              Stake WAL. Reward great feedback.
            </h3>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
              Bounty forms hold WAL in a Move escrow. Top-ranked submissions
              get paid out automatically.
            </p>
          </div>
          <Coins className="hidden md:block h-12 w-12 text-tertiary/50" />
        </div>
      </div>
    </section>
  );
}
