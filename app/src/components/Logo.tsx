import { cn } from "@/lib/utils";

export function Logo({ className, withWordmark = true }: { className?: string; withWordmark?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <svg width="22" height="22" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="lg" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
            <stop stopColor="#1F6FEB" />
            <stop offset="0.6" stopColor="#7FFFD4" />
            <stop offset="1" stopColor="#C684F6" />
          </linearGradient>
        </defs>
        <path
          d="M6 16c0-5.5 4.5-10 10-10s10 4.5 10 10v2c0 4.5-3.5 8-8 8h-1l-2 4-2-4h-1c-3 0-6-2-6-5"
          stroke="url(#lg)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        <circle cx="13" cy="14" r="1.5" fill="#7FFFD4" />
        <circle cx="19" cy="14" r="1.5" fill="#C684F6" />
      </svg>
      {withWordmark && (
        <span className="font-serif italic text-lg tracking-tight">Walrus Forms</span>
      )}
    </div>
  );
}
