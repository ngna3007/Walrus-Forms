import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "outline" | "glass" | "destructive";
type Size = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
}

const variantClass: Record<Variant, string> = {
  primary:
    "bg-primary text-primary-foreground hover:opacity-95 active:opacity-90 shadow-sm",
  secondary:
    "bg-secondary text-secondary-foreground hover:opacity-95",
  ghost:
    "bg-transparent text-foreground hover:bg-[color-mix(in_oklab,var(--foreground)_8%,transparent)]",
  outline:
    "bg-transparent text-foreground border border-border hover:bg-[color-mix(in_oklab,var(--foreground)_5%,transparent)]",
  glass:
    "liquid-glass text-foreground hover:scale-[1.02] hover:border-primary/40",
  destructive:
    "bg-destructive text-destructive-foreground hover:opacity-95",
};

const sizeClass: Record<Size, string> = {
  sm: "h-8 px-3 text-xs rounded-md gap-1.5",
  md: "h-10 px-4 text-sm rounded-lg gap-2",
  lg: "h-12 px-6 text-sm rounded-xl gap-2",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", leftIcon, rightIcon, className, children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center font-medium tracking-tight transition-all duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        variantClass[variant],
        sizeClass[size],
        className,
      )}
      {...rest}
    >
      {leftIcon && <span className="shrink-0">{leftIcon}</span>}
      {children}
      {rightIcon && <span className="shrink-0">{rightIcon}</span>}
    </button>
  );
});
