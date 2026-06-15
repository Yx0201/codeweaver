"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Clock3,
  Loader2,
  X,
  XCircle,
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import type {
  UploadPipelineState,
  UploadPipelineStep,
} from "@/lib/upload-processing";

export interface UploadSession {
  fileId: string;
  filename: string;
  status: string;
  process: UploadPipelineState | null;
}

interface UploadProgressContextValue {
  visibleSession: UploadSession | null;
  /**
   * Show the panel for the given session. If the file isn't terminal
   * (not "completed"/"failed") and no poll is already running for it,
   * the provider also resumes the processing loop.
   */
  openPanel: (session: UploadSession) => void;
  /** Hide the panel; any active polling continues in the background. */
  closePanel: () => void;
  /** True if there's an in-flight polling loop for the given file id. */
  isPolling: (fileId: string) => boolean;
}

const UploadProgressContext = createContext<UploadProgressContextValue | null>(
  null
);

interface UploadProgressProviderProps {
  knowledgeBaseId: number;
  children: React.ReactNode;
}

function isTerminalStatus(status: string): boolean {
  return status === "completed" || status === "failed";
}

export function UploadProgressProvider({
  knowledgeBaseId,
  children,
}: UploadProgressProviderProps) {
  const [visibleSession, setVisibleSession] = useState<UploadSession | null>(
    null
  );
  // Files currently being polled. We dedupe by id so a re-open never spawns
  // a second loop for the same file.
  const activePolls = useRef<Set<string>>(new Set());
  const router = useRouter();

  const pollFile = useCallback(
    async (initial: UploadSession) => {
      if (activePolls.current.has(initial.fileId)) return;
      activePolls.current.add(initial.fileId);

      try {
        let done = false;
        while (!done) {
          const res = await fetch(
            `/api/knowledge/${knowledgeBaseId}/files/${initial.fileId}/process`,
            { method: "POST" }
          );
          const data = await res.json().catch(() => null);

          if (!res.ok || !data) {
            throw new Error(data?.error ?? "文件处理失败");
          }

          const updated: UploadSession = {
            fileId: initial.fileId,
            filename: data.filename ?? initial.filename,
            status: data.status,
            process: data.process,
          };

          // Only push into the visible panel if it's still showing this file.
          setVisibleSession((curr) =>
            curr?.fileId === initial.fileId ? updated : curr
          );

          if (data.status === "completed") {
            done = true;
            break;
          }
          if (data.status === "failed") {
            throw new Error(data.error ?? "文件处理失败");
          }

          await new Promise((resolve) => setTimeout(resolve, 250));
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "文件处理失败，请重试";
        setVisibleSession((curr) => {
          if (curr?.fileId !== initial.fileId) return curr;
          return {
            ...curr,
            status: "failed",
            process: curr.process
              ? { ...curr.process, error: message }
              : null,
          };
        });
      } finally {
        activePolls.current.delete(initial.fileId);
        // Re-fetch server data so the row's persistent status reflects reality.
        router.refresh();
      }
    },
    [knowledgeBaseId, router]
  );

  const openPanel = useCallback(
    (session: UploadSession) => {
      setVisibleSession((curr) => {
        // If the panel is already showing this file with live data, keep it
        // — a stale snapshot from the file list must not overwrite that.
        if (curr?.fileId === session.fileId) return curr;
        return session;
      });
      if (
        !isTerminalStatus(session.status) &&
        !activePolls.current.has(session.fileId)
      ) {
        void pollFile(session);
      }
    },
    [pollFile]
  );

  const closePanel = useCallback(() => {
    setVisibleSession(null);
  }, []);

  const isPolling = useCallback(
    (fileId: string) => activePolls.current.has(fileId),
    []
  );

  // Auto-dismiss the panel a few seconds after a successful run so a happy
  // path doesn't require a manual close.
  useEffect(() => {
    if (visibleSession?.status !== "completed") return;
    const timer = setTimeout(() => setVisibleSession(null), 4000);
    return () => clearTimeout(timer);
  }, [visibleSession?.status]);

  return (
    <UploadProgressContext.Provider
      value={{ visibleSession, openPanel, closePanel, isPolling }}
    >
      {children}
      {visibleSession?.process && (
        <ProgressPanel
          session={visibleSession}
          onClose={closePanel}
        />
      )}
    </UploadProgressContext.Provider>
  );
}

export function useUploadProgress(): UploadProgressContextValue {
  const ctx = useContext(UploadProgressContext);
  if (!ctx) {
    throw new Error(
      "useUploadProgress must be used within an UploadProgressProvider"
    );
  }
  return ctx;
}

// ---------- panel UI ----------

function StepIcon({ step }: { step: UploadPipelineStep }) {
  if (step.status === "completed") {
    return <CheckCircle2 className="size-4 text-primary" strokeWidth={2} />;
  }
  if (step.status === "failed") {
    return <XCircle className="size-4 text-destructive" strokeWidth={2} />;
  }
  if (step.status === "running") {
    return (
      <Loader2 className="size-4 animate-spin text-primary" strokeWidth={2} />
    );
  }
  return <Clock3 className="size-4 text-muted-foreground" strokeWidth={1.75} />;
}

function ProgressPanel({
  session,
  onClose,
}: {
  session: UploadSession;
  onClose: () => void;
}) {
  if (!session.process) return null;

  const currentStep =
    session.process.steps.find((s) => s.status === "running") ??
    session.process.steps.find((s) => s.status === "failed") ??
    null;

  const statusLabel =
    session.status === "completed"
      ? "已完成"
      : session.status === "failed"
        ? "处理失败"
        : "后台处理中";

  return (
    <div
      role="status"
      aria-live="polite"
      className="animate-rise-in fixed bottom-6 right-6 z-40 w-[min(380px,calc(100vw-3rem))] overflow-hidden rounded-xl border border-border bg-card/95 shadow-[var(--shadow-ambient)] backdrop-blur supports-[backdrop-filter]:bg-card/85"
    >
      <div className="flex items-start gap-3 px-4 pt-3 pb-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium tracking-tight">
            {session.filename}
          </p>
          <p className="mt-0.5 truncate font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground tabular-nums">
            <span className="text-foreground/70">
              {session.process.currentStageIndex}/{session.process.totalStages}
            </span>
            {currentStep ? <> · {currentStep.label}</> : null}
            <span className="ml-1 text-border">·</span>{" "}
            <span
              className={cn(
                session.status === "completed" && "text-primary",
                session.status === "failed" && "text-destructive"
              )}
            >
              {statusLabel}
            </span>
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="font-mono text-lg font-semibold tabular-nums leading-none">
            {session.process.totalPercent}%
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="-mr-1 -mt-0.5 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        </div>
      </div>

      <div className="px-4">
        <Progress value={session.process.totalPercent} className="h-1" />
      </div>

      <div className="space-y-0.5 px-2 py-3">
        {session.process.steps.map((step) => {
          const isRunning = step.status === "running";
          const percentTone =
            step.status === "completed"
              ? "text-primary"
              : step.status === "failed"
                ? "text-destructive"
                : isRunning
                  ? "text-primary"
                  : "text-muted-foreground/60";
          return (
            <div
              key={step.key}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-2 py-1.5 transition-colors",
                isRunning && "bg-accent/50"
              )}
            >
              <StepIcon step={step} />
              <p
                className={cn(
                  "min-w-0 flex-1 truncate text-xs",
                  step.status === "pending"
                    ? "text-muted-foreground"
                    : "text-foreground/90",
                  isRunning && "font-medium text-foreground"
                )}
              >
                {step.label}
              </p>
              <span
                className={cn(
                  "shrink-0 font-mono text-[10px] tabular-nums",
                  percentTone
                )}
              >
                {step.progress}%
              </span>
            </div>
          );
        })}
      </div>

      {session.process.error && (
        <p className="border-t border-border bg-destructive/10 px-4 py-2 text-xs text-destructive">
          {session.process.error}
        </p>
      )}

      {session.status === "completed" && !session.process.error && (
        <p className="border-t border-border bg-primary/10 px-4 py-2 text-xs text-primary">
          处理完成,可以开始检索与对话。
        </p>
      )}
    </div>
  );
}
