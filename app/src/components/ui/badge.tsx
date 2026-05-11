import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/utils";

type Tone = "neutral" | "primary" | "secondary" | "tertiary" | "muted" | "destructive";

const toneClass: Record<Tone, string> = {
  neutral: "bg-background-soft text-foreground border-border",
  primary: "bg-primary/15 text-primary border-primary/30",
  secondary: "bg-secondary/20 text-secondary-foreground border-secondary/40 dark:text-secondary",
  tertiary: "bg-tertiary/15 text-tertiary border-tertiary/40 dark:text-tertiary",
  muted: "bg-muted text-muted-foreground border-border",
  destructive: "bg-destructive/15 text-destructive border-destructive/40",
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
  icon?: ReactNode;
}

export function Badge({ tone = "neutral", icon, className, children, ...rest }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium leading-none",
        toneClass[tone],
        className,
      )}
      {...rest}
    >
      {icon && <span className="shrink-0 [&>svg]:h-3 [&>svg]:w-3">{icon}</span>}
      {children}
    </span>
  );
}

export function StatusDot({ tone = "neutral" }: { tone?: Tone }) {
  const dot: Record<Tone, string> = {
    neutral: "bg-muted-foreground/60",
    primary: "bg-primary",
    secondary: "bg-secondary",
    tertiary: "bg-tertiary",
    muted: "bg-muted-foreground/40",
    destructive: "bg-destructive",
  };
  return <span className={cn("inline-block h-2 w-2 rounded-full", dot[tone])} />;
}
