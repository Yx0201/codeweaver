"use client";

import { useEffect, useRef, useState } from "react";
import { Network, Orbit, Radar, Sparkles } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useTheme } from "@/components/theme/theme-provider";
import type { KnowledgeGraphData } from "@/lib/knowledge-graph";

// Per-theme color set for the ECharts canvas — node/edge labels and lines
// need to be lifted or darkened depending on the surface they paint on.
const CHART_PALETTES = {
  light: {
    nodeLabel: "#1f2937",
    nodeBorder: "#ffffff",
    nodeShadow: "rgba(15, 23, 42, 0.12)",
    line: "rgba(71, 85, 105, 0.3)",
    lineEmphasis: "rgba(73, 150, 135, 0.7)",
    edgeLabel: "#475569",
    edgeLabelBg: "rgba(255, 255, 255, 0.92)",
    tooltipBg: "rgba(18, 22, 28, 0.94)",
    tooltipBorder: "rgba(255, 255, 255, 0.08)",
    tooltipText: "#e6e9ed",
  },
  dark: {
    nodeLabel: "#d7dde6",
    nodeBorder: "rgba(255, 255, 255, 0.14)",
    nodeShadow: "rgba(0, 0, 0, 0.35)",
    line: "rgba(148, 163, 184, 0.22)",
    lineEmphasis: "rgba(73, 184, 166, 0.6)",
    edgeLabel: "#aab4c0",
    edgeLabelBg: "rgba(28, 33, 40, 0.9)",
    tooltipBg: "rgba(18, 22, 28, 0.94)",
    tooltipBorder: "rgba(255, 255, 255, 0.08)",
    tooltipText: "#e6e9ed",
  },
} as const;

interface KnowledgeGraphPanelProps {
  graph: KnowledgeGraphData;
}

interface GraphEventPayload {
  dataType?: string;
  data?: unknown | null;
}

type Selection =
  | {
      kind: "node";
      title: string;
      subtitle: string;
      meta: string;
      description: string | null;
    }
  | {
      kind: "edge";
      title: string;
      subtitle: string;
      meta: string;
      description: string | null;
    }
  | null;

const ENTITY_TYPE_LABELS: Record<string, string> = {
  person: "人物",
  location: "地点",
  organization: "组织",
  event: "事件",
  concept: "概念",
};

// Entity hues tuned to read on the dark charcoal canvas — moderate
// saturation, lifted lightness, with the brand teal reserved for locations.
const ENTITY_TYPE_COLORS: Record<string, string> = {
  person: "#6aa0f0",
  location: "#49b8a6",
  organization: "#a98ae6",
  event: "#e0a36a",
  concept: "#93a0b3",
};

function getEntityLabel(entityType: string): string {
  return ENTITY_TYPE_LABELS[entityType] ?? entityType;
}

function getEntityColor(entityType: string): string {
  return ENTITY_TYPE_COLORS[entityType] ?? "#93a0b3";
}

export function KnowledgeGraphPanel({ graph }: KnowledgeGraphPanelProps) {
  const chartRef = useRef<HTMLDivElement | null>(null);
  const { resolvedTheme } = useTheme();
  const palette = CHART_PALETTES[resolvedTheme];
  const [selection, setSelection] = useState<Selection>(
    graph.nodes[0]
      ? {
          kind: "node",
          title: graph.nodes[0].name,
          subtitle: getEntityLabel(graph.nodes[0].entityType),
          meta: `关联 ${graph.nodes[0].supportCount} 个原文分块`,
          description: graph.nodes[0].description,
        }
      : null
  );

  useEffect(() => {
    if (!graph.nodes[0]) {
      setSelection(null);
      return;
    }

    setSelection((current) => {
      if (current) return current;

      return {
        kind: "node",
        title: graph.nodes[0].name,
        subtitle: getEntityLabel(graph.nodes[0].entityType),
        meta: `关联 ${graph.nodes[0].supportCount} 个原文分块`,
        description: graph.nodes[0].description,
      };
    });
  }, [graph]);

  useEffect(() => {
    if (!chartRef.current || graph.nodes.length === 0) return;

    let mounted = true;
    let cleanup = () => {};

    void (async () => {
      const echarts = await import("echarts");
      if (!mounted || !chartRef.current) return;

      const chart = echarts.init(chartRef.current, undefined, {
        renderer: "canvas",
      });

      chart.setOption({
        animationDuration: 600,
        animationDurationUpdate: 300,
        tooltip: {
          confine: true,
          backgroundColor: palette.tooltipBg,
          borderColor: palette.tooltipBorder,
          borderWidth: 1,
          textStyle: {
            color: palette.tooltipText,
            fontSize: 12,
          },
          formatter: (params: GraphEventPayload) => {
            const data =
              params.data && typeof params.data === "object"
                ? (params.data as Record<string, unknown>)
                : {};

            if (params.dataType === "node") {
              return [
                `<div style="font-weight:600;margin-bottom:4px;">${data.label ?? ""}</div>`,
                `<div>${data.entityTypeLabel ?? ""}</div>`,
                `<div>关联分块：${data.supportCount ?? 0}</div>`,
              ].join("");
            }

            return [
              `<div style="font-weight:600;margin-bottom:4px;">${data.relation ?? ""}</div>`,
              `<div>${data.sourceName ?? ""} → ${data.targetName ?? ""}</div>`,
              `<div>出现 ${data.occurrenceCount ?? 0} 次</div>`,
            ].join("");
          },
        },
        series: [
          {
            type: "graph",
            layout: "force",
            roam: true,
            draggable: true,
            focusNodeAdjacency: true,
            edgeSymbol: ["none", "arrow"],
            edgeSymbolSize: [0, 8],
            force: {
              repulsion: 260,
              edgeLength: 140,
              gravity: 0.08,
            },
            lineStyle: {
              color: palette.line,
              width: 1.4,
              curveness: 0.15,
            },
            emphasis: {
              focus: "adjacency",
              lineStyle: {
                width: 2,
                color: palette.lineEmphasis,
              },
            },
            label: {
              show: true,
              position: "right",
              color: palette.nodeLabel,
              fontSize: 12,
              formatter: "{b}",
            },
            data: graph.nodes.map((node) => ({
              id: node.id,
              name: node.name,
              label: node.name,
              value: node.supportCount,
              symbolSize: Math.max(38, Math.min(74, 30 + node.supportCount * 6)),
              itemStyle: {
                color: getEntityColor(node.entityType),
                borderColor: palette.nodeBorder,
                borderWidth: 2,
                shadowBlur: 18,
                shadowColor: palette.nodeShadow,
              },
              entityType: node.entityType,
              entityTypeLabel: getEntityLabel(node.entityType),
              supportCount: node.supportCount,
              description: node.description,
            })),
            links: graph.edges.map((edge) => {
              const source = graph.nodes.find((node) => node.id === edge.source);
              const target = graph.nodes.find((node) => node.id === edge.target);

              return {
                id: edge.id,
                source: edge.source,
                target: edge.target,
                value: edge.occurrenceCount,
                label: {
                  show: true,
                  formatter: edge.relation,
                  fontSize: 11,
                  color: palette.edgeLabel,
                  backgroundColor: palette.edgeLabelBg,
                  padding: [2, 5],
                  borderRadius: 999,
                },
                lineStyle: {
                  width: Math.max(1.4, Math.min(4, 1 + edge.occurrenceCount * 0.6)),
                },
                relation: edge.relation,
                description: edge.description,
                occurrenceCount: edge.occurrenceCount,
                sourceName: source?.name ?? "",
                targetName: target?.name ?? "",
              };
            }),
          },
        ],
      });

      chart.on("click", (params: GraphEventPayload) => {
        const data =
          params.data && typeof params.data === "object"
            ? (params.data as Record<string, unknown>)
            : {};

        if (params.dataType === "node") {
          setSelection({
            kind: "node",
            title: String(data.label ?? ""),
            subtitle: String(data.entityTypeLabel ?? ""),
            meta: `关联 ${data.supportCount ?? 0} 个原文分块`,
            description:
              typeof data.description === "string"
                ? data.description
                : null,
          });
          return;
        }

        setSelection({
          kind: "edge",
          title: String(data.relation ?? ""),
          subtitle: `${String(data.sourceName ?? "")} → ${String(data.targetName ?? "")}`,
          meta: `出现 ${data.occurrenceCount ?? 0} 次`,
          description:
            typeof data.description === "string"
              ? data.description
              : null,
        });
      });

      const resizeObserver = new ResizeObserver(() => chart.resize());
      const handleResize = () => chart.resize();
      resizeObserver.observe(chartRef.current);
      window.addEventListener("resize", handleResize);

      cleanup = () => {
        resizeObserver.disconnect();
        window.removeEventListener("resize", handleResize);
        chart.dispose();
      };
    })();

    return () => {
      mounted = false;
      cleanup();
    };
    // `palette` is derived from resolvedTheme, so depending on it is enough to
    // re-mount the chart whenever the theme flips.
  }, [graph, palette]);

  if (graph.nodes.length === 0) {
    return (
      <Card className="border-dashed bg-linear-to-br from-card to-muted/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Orbit className="size-4 text-primary" />
            知识图谱
          </CardTitle>
          <CardDescription>
            上传并完成处理后，这里会展示实体节点和它们之间的关联关系。
          </CardDescription>
        </CardHeader>
        <CardContent className="flex min-h-72 items-center justify-center">
          <div className="max-w-sm text-center text-muted-foreground">
            <Network className="mx-auto mb-4 size-10" />
            <p className="text-sm">当前知识库还没有可视化图谱数据。</p>
            <p className="mt-2 text-xs">
              处理完成的文档会自动抽取实体和关系，并在这里形成可交互的知识网络。
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
      <Card className="overflow-hidden border-border bg-card">
        <CardHeader className="border-b border-border bg-card/60 backdrop-blur">
          <CardTitle className="flex items-center gap-2">
            <Orbit className="size-4 text-primary" />
            知识图谱
          </CardTitle>
          <CardDescription>
            支持拖拽、缩放和点击查看详情，当前展示高连接度实体及其关系。
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          <div className="grid gap-3 border-b border-border px-4 py-4 md:grid-cols-4">
            {[
              { icon: Sparkles, label: "实体", value: graph.summary.entityCount },
              { icon: Radar, label: "关系", value: graph.summary.relationCount },
              { icon: Network, label: "原文分块", value: graph.summary.chunkCount },
              { icon: Orbit, label: "文件", value: graph.summary.fileCount },
            ].map((stat) => (
              <div
                key={stat.label}
                className="rounded-xl bg-muted/40 p-3 ring-1 ring-border"
              >
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <stat.icon className="size-3.5" />
                  {stat.label}
                </div>
                <div className="mt-2 text-2xl font-semibold tabular-nums text-foreground">
                  {stat.value}
                </div>
              </div>
            ))}
          </div>
          {/*
            Chart viewport background flips with the theme via the .dark
            variant — light surface for day mode, charcoal for dark mode.
            Node/edge label colors switch in parallel via the CHART_PALETTES
            map, so labels stay legible on whichever surface is showing.
          */}
          <div
            ref={chartRef}
            className="h-[560px] w-full border-t border-border bg-[radial-gradient(circle_at_top,rgba(73,150,135,0.07),transparent_42%),linear-gradient(180deg,rgba(255,255,255,0.6),rgba(241,245,247,0.35))] dark:bg-[radial-gradient(circle_at_top,rgba(73,184,166,0.1),transparent_42%),linear-gradient(180deg,rgba(255,255,255,0.02),rgba(0,0,0,0.18))]"
          />
        </CardContent>
      </Card>

      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle>图谱详情</CardTitle>
          <CardDescription>
            点击左侧节点或连线后，这里会显示实体类型、关系语义和证据覆盖情况。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {selection ? (
            <>
              <div className="rounded-xl border border-border bg-muted/40 p-4">
                <p className="font-mono text-xs uppercase tracking-[0.2em] text-primary">
                  {selection.kind === "node" ? "Entity" : "Relation"}
                </p>
                <h3 className="mt-2 text-lg font-semibold tracking-tight text-foreground">
                  {selection.title}
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">{selection.subtitle}</p>
                <p className="mt-3 font-mono text-xs tabular-nums text-muted-foreground">
                  {selection.meta}
                </p>
              </div>

              <div className="rounded-xl border border-dashed border-border p-4">
                <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
                  描述
                </p>
                <p className="mt-2 text-sm leading-6 text-foreground/80">
                  {selection.description ?? "当前项暂无补充描述，图谱展示仍可用于快速浏览关系结构。"}
                </p>
              </div>
            </>
          ) : (
            <div className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
              请选择左侧图谱中的节点或关系查看详情。
            </div>
          )}

          <div className="rounded-xl border border-border bg-muted/40 p-4">
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
              图例
            </p>
            <div className="mt-3 space-y-2">
              {Object.entries(ENTITY_TYPE_LABELS).map(([key, label]) => (
                <div key={key} className="flex items-center gap-3 text-sm text-foreground/80">
                  <span
                    className="size-3 rounded-full ring-1 ring-white/10"
                    style={{ backgroundColor: getEntityColor(key) }}
                  />
                  <span>{label}</span>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
