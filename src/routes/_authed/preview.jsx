import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Download, Layers3 } from "lucide-react";
import AppShell from "@/components/AppShell";
import Viewport3D from "@/components/viewport/Viewport3D";
import SliceStatusBar from "@/components/panels/SliceStatusBar";
import { SectionCard, StatBlock, EmptyHint } from "@/components/controls";
import { usePrint } from "@/lib/printStore";
import { formatDuration } from "@/lib/slicer/slice";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authed/preview")({
  component: PreviewPage,
});

const TYPES = [
  { id: "wall", label: "Walls", color: "bg-cyan-400" },
  { id: "solid", label: "Top/Bottom", color: "bg-sky-400" },
  { id: "infill", label: "Infill", color: "bg-blue-600" },
  { id: "support", label: "Support", color: "bg-amber-500" },
  { id: "skirt", label: "Skirt/Brim", color: "bg-slate-400" },
  { id: "travel", label: "Travel", color: "bg-slate-600" },
];

function PreviewPage() {
  const store = usePrint();
  const navigate = useNavigate();
  const [layer, setLayer] = useState(null);
  const [visible, setVisible] = useState({ wall: true, solid: true, infill: true, support: true, skirt: true, travel: false });

  const result = store.result;
  const totalLayers = result ? result.layers.length : 0;
  const activeLayer = layer == null ? totalLayers : layer;

  const segments = useMemo(() => {
    if (!result) return [];
    return result.segments.filter((s) => visible[s.t]);
  }, [result, visible]);

  const preview = useMemo(
    () => ({ segments, layer: activeLayer }),
    [segments, activeLayer]
  );

  const actions = {
    onImport: () => navigate({ to: "/" }),
    onExport: store.exportGcode,
    onUndo: store.undo,
    onRedo: store.redo,
    onSlice: store.sliceNow,
    onSend: () => navigate({ to: "/device" }),
    canUndo: store.canUndo,
    canRedo: store.canRedo,
    canSend: !!result,
  };

  return (
    <AppShell
      title="Preview"
      subtitle={result ? `${result.stats.layerCount} layers` : "Not sliced"}
      actions={actions}
      status={{ printer: store.printer.name, plateLabel: `Plate 1 · ${store.models.length} object(s)` }}
      right={
        <div className="space-y-3">
          <SectionCard
            title="Toolpaths"
            action={<Layers3 className="h-3.5 w-3.5 text-muted-foreground" />}
          >
            {!result ? (
              <EmptyHint>Slice the plate to generate toolpaths and G-code.</EmptyHint>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <span className="field-label">Layer</span>
                  <span className="metric-value">
                    {Math.min(activeLayer, totalLayers)} / {totalLayers}
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={totalLayers}
                  value={activeLayer}
                  onChange={(e) => setLayer(Number(e.target.value))}
                  className="mt-1.5 h-1 w-full cursor-pointer appearance-none rounded-full bg-secondary accent-[hsl(var(--primary))]"
                />
                <div className="mt-1 flex justify-between font-mono text-[10px] text-muted-foreground">
                  <span>Z {result.layers[0]?.top.toFixed(2)} mm</span>
                  <span>Z {result.layers[totalLayers - 1]?.top.toFixed(2)} mm</span>
                </div>
                <button
                  type="button"
                  onClick={() => setLayer(null)}
                  className="mt-2 w-full rounded-lg border border-border/70 px-2 py-1.5 text-[11.5px] text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
                >
                  Show all layers
                </button>
              </>
            )}
          </SectionCard>

          <SectionCard title="Path types">
            <ul className="space-y-1">
              {TYPES.map((type) => (
                <li key={type.id}>
                  <button
                    type="button"
                    onClick={() => setVisible((prev) => ({ ...prev, [type.id]: !prev[type.id] }))}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-lg px-1.5 py-1 text-[12px] transition-colors",
                      visible[type.id] ? "text-foreground" : "text-muted-foreground/50"
                    )}
                  >
                    <span className={cn("h-1.5 w-1.5 rounded-full", type.color, !visible[type.id] && "opacity-30")} />
                    {type.label}
                    <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                      {result ? result.segments.filter((s) => s.t === type.id).length : 0}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </SectionCard>

          {result && (
            <SectionCard title="Estimates">
              <div className="grid grid-cols-2 gap-2">
                <StatBlock label="Print time" value={formatDuration(result.stats.timeSeconds)} tone="accent" />
                <StatBlock label="Filament" value={result.stats.filamentGrams} unit="g" />
                <StatBlock label="Layers" value={result.stats.layerCount} />
                <StatBlock label="Height" value={result.stats.maxZ} unit="mm" />
                <StatBlock label="Filament length" value={result.stats.filamentLength} unit="mm" />
                <StatBlock label="Line width" value={result.stats.lineWidth} unit="mm" />
              </div>
              {result.warnings.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {result.warnings.map((warning) => (
                    <li key={warning} className="rounded-lg bg-amber-500/10 px-2 py-1.5 text-[11px] leading-snug text-amber-300">
                      {warning}
                    </li>
                  ))}
                </ul>
              )}
              <button
                type="button"
                onClick={store.exportGcode}
                className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-3 py-2 text-[12px] font-semibold text-primary-foreground transition-opacity hover:opacity-90"
              >
                <Download className="h-3.5 w-3.5" />
                Export G-code
              </button>
            </SectionCard>
          )}
        </div>
      }
      bottom={<SliceStatusBar store={store} />}
    >
      <div className="relative h-full w-full">
        <Viewport3D
          models={result ? [] : store.models}
          plate={store.plate}
          preview={result ? preview : null}
          className="h-full w-full"
        />
        {!result && (
          <div className="absolute inset-0 flex items-center justify-center">
            <button
              type="button"
              onClick={store.sliceNow}
              className="rounded-xl border border-primary/40 bg-primary/15 px-4 py-2.5 text-[12.5px] font-semibold text-primary backdrop-blur transition-colors hover:bg-primary/25"
            >
              Slice plate
            </button>
          </div>
        )}
        {result && (
          <div className="pointer-events-none absolute left-4 top-4 rounded-full border border-border/70 bg-background/70 px-2.5 py-1 font-mono text-[10.5px] text-muted-foreground backdrop-blur">
            Showing {Math.min(activeLayer, totalLayers)} of {totalLayers} layers ·{" "}
            {segments.filter((s) => s.l <= activeLayer).length.toLocaleString()} moves
          </div>
        )}
      </div>
    </AppShell>
  );
}