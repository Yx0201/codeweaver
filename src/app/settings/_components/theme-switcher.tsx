"use client";

import { useEffect, useState } from "react";
import { Sun, Moon, Monitor, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme, type Theme } from "@/components/theme/theme-provider";

const options: { value: Theme; label: string; description: string; icon: typeof Sun }[] = [
  {
    value: "light",
    label: "日间模式",
    description: "始终使用浅色主题",
    icon: Sun,
  },
  {
    value: "dark",
    label: "暗黑模式",
    description: "始终使用深色主题",
    icon: Moon,
  },
  {
    value: "system",
    label: "跟随系统",
    description: "根据系统外观自动切换",
    icon: Monitor,
  },
];

export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();
  // Avoid rendering selection state during SSR — the provider only knows the
  // real choice after mount. Render an inert state until then to prevent
  // hydration mismatch on the "selected" indicator.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <div className="grid gap-2 sm:grid-cols-3">
      {options.map((opt) => {
        const isActive = mounted && theme === opt.value;
        const Icon = opt.icon;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => setTheme(opt.value)}
            aria-pressed={isActive}
            className={cn(
              "group relative flex flex-col items-start gap-2.5 rounded-xl border bg-card p-4 text-left transition-all duration-200",
              "hover:border-primary/40 hover:bg-accent/30",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              "active:scale-[0.99]",
              isActive
                ? "border-primary/60 bg-accent/40 shadow-[var(--shadow-ambient)]"
                : "border-border"
            )}
          >
            <span
              className={cn(
                "flex size-9 items-center justify-center rounded-lg ring-1 transition-colors",
                isActive
                  ? "bg-primary/15 text-primary ring-primary/25"
                  : "bg-muted text-muted-foreground ring-border"
              )}
            >
              <Icon className="size-4.5" strokeWidth={1.75} />
            </span>
            <div>
              <p className="text-sm font-medium tracking-tight">{opt.label}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {opt.description}
              </p>
            </div>
            {isActive && (
              <span className="absolute right-3 top-3 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <Check className="size-3" strokeWidth={3} />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
