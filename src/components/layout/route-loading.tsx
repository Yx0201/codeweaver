/**
 * Route loading state — a miniature knowledge graph that "weaves" itself.
 *
 * Echoes the CodeWeaver brand mark (interweaving wavy lines): nodes pulse in a
 * signal-radiating pattern from the hub, while edges trace themselves via
 * stroke-dashoffset. Pure SVG + CSS, no client JS, no new dependencies.
 *
 * Drop into any route segment as `loading.tsx`:
 *   export { RouteLoading as default } from "@/components/layout/route-loading";
 */

const GRAPH_CSS = `
@keyframes cw-node-core {
  0%, 100% { opacity: 0.4; }
  50%      { opacity: 1; }
}
@keyframes cw-node-halo {
  0%, 100% { opacity: 0;   transform: scale(0.7); }
  50%      { opacity: 0.55; transform: scale(1.7); }
}
@keyframes cw-edge-trace {
  0%   { stroke-dashoffset: 100; opacity: 0.15; }
  45%  { opacity: 0.85; }
  100% { stroke-dashoffset: 0;   opacity: 0.45; }
}
@keyframes cw-shimmer {
  0%, 100% { opacity: 0.5; }
  50%      { opacity: 1; }
}
.cw-node-core {
  transform-box: fill-box;
  transform-origin: center;
  animation: cw-node-core 2.4s cubic-bezier(0.22, 1, 0.36, 1) infinite;
}
.cw-node-halo {
  transform-box: fill-box;
  transform-origin: center;
  animation: cw-node-halo 2.4s cubic-bezier(0.22, 1, 0.36, 1) infinite;
}
.cw-edge {
  stroke-dasharray: 100;
  animation: cw-edge-trace 2.4s cubic-bezier(0.45, 0, 0.15, 1) infinite;
}
.cw-dot {
  animation: cw-shimmer 1.8s ease-in-out infinite;
}
@media (prefers-reduced-motion: reduce) {
  .cw-node-core, .cw-node-halo, .cw-edge, .cw-dot {
    animation: none;
  }
  .cw-edge { stroke-dashoffset: 0; opacity: 0.5; }
  .cw-node-core { opacity: 0.85; }
}
`;

// Hub at center; five satellites radiate outward. Coordinates tuned for a
// 120×108 viewBox. Edges are quadratic Béziers (control points offset) so they
// read as woven threads, not straight wires — matching the brand mark.
const NODES = {
  hub:  { x: 60, y: 54 },
  top:  { x: 60, y: 18 },
  tr:   { x: 99, y: 36 },
  br:   { x: 91, y: 88 },
  bl:   { x: 29, y: 86 },
  tl:   { x: 21, y: 38 },
} as const;

// Each edge: from → to, with a control-point offset to give a woven curve.
const EDGES: Array<{ from: keyof typeof NODES; to: keyof typeof NODES; cx: number; cy: number; delay: number }> = [
  { from: "hub", to: "top", cx: 54, cy: 34, delay: 0.05 },
  { from: "hub", to: "tr",  cx: 82, cy: 40, delay: 0.15 },
  { from: "hub", to: "br",  cx: 80, cy: 76, delay: 0.25 },
  { from: "hub", to: "bl",  cx: 40, cy: 76, delay: 0.35 },
  { from: "hub", to: "tl",  cx: 38, cy: 40, delay: 0.45 },
  { from: "top", to: "tr",  cx: 82, cy: 22, delay: 0.30 },
  { from: "br",  to: "bl",  cx: 60, cy: 96, delay: 0.50 },
];

export function RouteLoading({ label = "正在编织上下文" }: { label?: string }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-7 px-6">
      <style dangerouslySetInnerHTML={{ __html: GRAPH_CSS }} />

      {/* Woven knowledge graph — signal radiates from the hub outward. */}
      <div className="animate-rise-in relative">
        {/* Soft ambient glow behind the graph, like the hero accent. */}
        <div className="pointer-events-none absolute inset-0 -z-10 rounded-full bg-primary/10 blur-2xl" />

        <svg
          viewBox="0 0 120 108"
          className="h-28 w-28 text-primary"
          fill="none"
          aria-hidden
        >
          {/* Edges — traced as if being woven into existence. */}
          {EDGES.map((edge, i) => {
            const a = NODES[edge.from];
            const b = NODES[edge.to];
            return (
              <path
                key={`edge-${i}`}
                className="cw-edge"
                d={`M ${a.x} ${a.y} Q ${edge.cx} ${edge.cy} ${b.x} ${b.y}`}
                stroke="currentColor"
                strokeWidth={1.25}
                strokeLinecap="round"
                pathLength={100}
                style={{ animationDelay: `${edge.delay}s` }}
              />
            );
          })}

          {/* Satellite nodes — pulse on a delay after their edge arrives. */}
          {(["top", "tr", "br", "bl", "tl"] as const).map((key, i) => {
            const n = NODES[key];
            const delay = 0.4 + i * 0.12;
            return (
              <g key={`node-${key}`}>
                <circle
                  className="cw-node-halo"
                  cx={n.x}
                  cy={n.y}
                  r={4.5}
                  fill="currentColor"
                  style={{ animationDelay: `${delay}s` }}
                />
                <circle
                  className="cw-node-core"
                  cx={n.x}
                  cy={n.y}
                  r={2.6}
                  fill="currentColor"
                  style={{ animationDelay: `${delay}s` }}
                />
              </g>
            );
          })}

          {/* Hub node — the brightest, pulses first (signal origin). */}
          <circle
            className="cw-node-halo"
            cx={NODES.hub.x}
            cy={NODES.hub.y}
            r={6}
            fill="currentColor"
          />
          <circle
            className="cw-node-core"
            cx={NODES.hub.x}
            cy={NODES.hub.y}
            r={3.4}
            fill="currentColor"
          />
        </svg>
      </div>

      {/* Monospace eyebrow label + shimmering trailing dots. */}
      <div
        className="animate-rise-in flex items-center gap-2"
        style={{ animationDelay: "120ms" }}
      >
        <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
          {label}
        </span>
        <span className="flex gap-0.5 text-primary">
          <span className="cw-dot" style={{ animationDelay: "0ms" }}>·</span>
          <span className="cw-dot" style={{ animationDelay: "200ms" }}>·</span>
          <span className="cw-dot" style={{ animationDelay: "400ms" }}>·</span>
        </span>
      </div>
    </div>
  );
}

export default RouteLoading;
