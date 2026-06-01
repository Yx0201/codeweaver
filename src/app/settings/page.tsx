import { Palette } from "lucide-react";
import { ThemeSwitcher } from "./_components/theme-switcher";

export default function SettingsPage() {
  return (
    <div className="px-6 py-8 md:px-10">
      <div className="mx-auto max-w-3xl">
        <div className="mb-8 border-b border-border pb-6">
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-primary">
            Settings
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">
            系统设置
          </h1>
          <p className="mt-2 max-w-prose text-sm leading-relaxed text-muted-foreground">
            调整界面外观与运行偏好。更多设置项将在这里逐步开放。
          </p>
        </div>

        <section
          aria-labelledby="appearance-heading"
          className="rounded-xl border border-border bg-card/40 p-6"
        >
          <div className="mb-5 flex items-start gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/15">
              <Palette className="size-5" strokeWidth={1.75} />
            </span>
            <div>
              <h2
                id="appearance-heading"
                className="text-base font-semibold tracking-tight"
              >
                外观
              </h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                选择应用的主题配色。
              </p>
            </div>
          </div>

          <ThemeSwitcher />
        </section>
      </div>
    </div>
  );
}
