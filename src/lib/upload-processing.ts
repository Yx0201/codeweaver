export type UploadStepKey =
  | "upload"
  | "retrieval"
  | "embed"
  | "graphSplit"
  | "graphBuild"
  | "finalize";
export type UploadStepStatus = "pending" | "running" | "completed" | "failed";

export interface UploadPipelineStep {
  key: UploadStepKey;
  label: string;
  description: string;
  status: UploadStepStatus;
  progress: number;
}

export interface UploadPipelineCounts {
  retrievalParentChunks: number;
  retrievalChildChunks: number;
  embeddedChunks: number;
  graphChunks: number;
  graphBuiltChunks: number;
}

export interface UploadPipelineState {
  version: 2;
  stage: UploadStepKey;
  totalPercent: number;
  totalStages: number;
  currentStageIndex: number;
  steps: UploadPipelineStep[];
  counts: UploadPipelineCounts;
  error?: string;
  startedAt: string;
  completedAt?: string;
}

const STEP_DEFS: Array<Pick<UploadPipelineStep, "key" | "label" | "description">> = [
  { key: "upload", label: "上传保存", description: "保存原始文件和基础记录" },
  { key: "retrieval", label: "检索分块", description: "按混合检索策略切出父子 chunk" },
  { key: "embed", label: "向量构建", description: "为检索子 chunk 生成 embedding 与关键词索引" },
  { key: "graphSplit", label: "图谱分块", description: "按小说结构切出专用 graph chunk" },
  { key: "graphBuild", label: "图谱构建", description: "提取实体、关系并写入图谱表" },
  { key: "finalize", label: "完成收尾", description: "更新状态并准备前台展示" },
];

function clampProgress(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function withComputedTotals(state: UploadPipelineState): UploadPipelineState {
  const steps = state.steps.map((step) => ({
    ...step,
    progress: clampProgress(step.progress),
  }));

  const totalPercent = clampProgress(
    steps.reduce((sum, step) => sum + step.progress, 0) / steps.length
  );
  const currentStageIndex = Math.max(
    1,
    STEP_DEFS.findIndex((step) => step.key === state.stage) + 1
  );

  return {
    ...state,
    steps,
    totalPercent,
    currentStageIndex,
  };
}

export function createInitialUploadState(): UploadPipelineState {
  return withComputedTotals({
    version: 2,
    stage: "retrieval",
    totalPercent: 0,
    totalStages: STEP_DEFS.length,
    currentStageIndex: 2,
    startedAt: new Date().toISOString(),
    counts: {
      retrievalParentChunks: 0,
      retrievalChildChunks: 0,
      embeddedChunks: 0,
      graphChunks: 0,
      graphBuiltChunks: 0,
    },
    steps: STEP_DEFS.map((step) => ({
      ...step,
      status: step.key === "upload" ? "completed" : step.key === "retrieval" ? "running" : "pending",
      progress: step.key === "upload" ? 100 : 0,
    })),
  });
}

export function updateStepState(
  state: UploadPipelineState,
  key: UploadStepKey,
  patch: Partial<Pick<UploadPipelineStep, "status" | "progress">>
): UploadPipelineState {
  return withComputedTotals({
    ...state,
    steps: state.steps.map((step) =>
      step.key === key
        ? {
            ...step,
            ...patch,
          }
        : step
    ),
  });
}

export function moveToStage(
  state: UploadPipelineState,
  stage: UploadStepKey
): UploadPipelineState {
  return withComputedTotals({
    ...state,
    stage,
    steps: state.steps.map((step) => {
      if (step.key === stage && step.status === "pending") {
        return { ...step, status: "running" };
      }
      return step;
    }),
  });
}

export function markPipelineFailed(
  state: UploadPipelineState,
  error: string
): UploadPipelineState {
  return withComputedTotals({
    ...state,
    error,
    steps: state.steps.map((step) =>
      step.key === state.stage
        ? { ...step, status: "failed" }
        : step
    ),
  });
}

export function markPipelineCompleted(
  state: UploadPipelineState
): UploadPipelineState {
  return withComputedTotals({
    ...state,
    stage: "finalize",
    completedAt: new Date().toISOString(),
    steps: state.steps.map((step) => ({
      ...step,
      status: "completed",
      progress: 100,
    })),
  });
}

export function parseUploadPipelineState(
  metadata: unknown
): UploadPipelineState | null {
  if (!metadata || typeof metadata !== "object") return null;

  const process = (metadata as { process?: unknown }).process;
  if (!process || typeof process !== "object") return null;

  const candidate = process as Partial<UploadPipelineState>;
  if (!candidate.version || !Array.isArray(candidate.steps) || !candidate.stage) {
    return null;
  }

  const legacyCounts = (candidate.counts ?? {}) as Partial<UploadPipelineCounts> & {
    parentChunks?: number;
    childChunks?: number;
  };

  return withComputedTotals({
    version: 2,
    stage: candidate.stage,
    totalPercent: candidate.totalPercent ?? 0,
    totalStages: candidate.totalStages ?? STEP_DEFS.length,
    currentStageIndex: candidate.currentStageIndex ?? 1,
    counts: {
      retrievalParentChunks: legacyCounts.retrievalParentChunks ?? legacyCounts.parentChunks ?? 0,
      retrievalChildChunks: legacyCounts.retrievalChildChunks ?? legacyCounts.childChunks ?? 0,
      embeddedChunks: legacyCounts.embeddedChunks ?? 0,
      graphChunks: legacyCounts.graphChunks ?? 0,
      graphBuiltChunks: legacyCounts.graphBuiltChunks ?? legacyCounts.graphChunks ?? 0,
    },
    steps: candidate.steps.map((step) => ({
      key: step.key,
      label: step.label,
      description: step.description,
      status: step.status,
      progress: step.progress,
    })),
    error: candidate.error,
    startedAt: candidate.startedAt ?? new Date().toISOString(),
    completedAt: candidate.completedAt,
  } as UploadPipelineState);
}

export function buildUploadMetadata(state: UploadPipelineState) {
  return {
    process: state,
  };
}
