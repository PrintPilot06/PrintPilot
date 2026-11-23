import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Wand2, Gauge, Zap, Sparkles, ArrowRight, Check } from "lucide-react";
import { toast } from "sonner";
import AppShell from "@/components/AppShell";
import SliceStatusBar from "@/components/panels/SliceStatusBar";
import { SectionCard, StatBlock, EmptyHint } from "@/components/controls";
import { usePrint } from "@/lib/printStore";
import { formatDuration } from "@/lib/slicer/slice";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authed/optimize")({
  component: OptimizePage,
});

const MODES = [
  { id: "quality", label: "Quality", icon: Sparkles, blurb: "Surface finish and dimensional accuracy first." },
  { id: "balanced", label: "Balanced", icon: Gauge, blurb: "Quality, speed and filament in proportion." },
  { id: "speed", label: "Speed", icon: Zap, blurb: "Shortest print time with acceptable quality." },
];

const LABELS = {
  layerHeight: "Layer height (mm)",
  wallCount: "Wall count",
  infillDensity: "Infill density (%)",
  printSpeed: "Print speed (mm/s)",
  outerWallSpeed: "Outer wall speed (mm/s)",
  infillSpeed: "Infill speed (mm/s)",
  fanSpeed: "Fan speed (%)",
};

function buildPatch(mode, store) {
  const nozzle = store.printer.nozzle_diameter || 0.4;
  const maxSpeed = store.printer.max_speed || 300;
  const presets = {
    quality: { layerHeight: 0.12, wallCount: 4, infillDensity: 20, printSpeed: 60, outerWallSpeed: 35, infillSpeed: 80, fanSpeed: 100 },
    balanced: { layerHeight: Math.min(0.2, nozzle * 0.5), wallCount: 3, infillDensity: 20, printSpeed: 120, outerWallSpeed: 60, infillSpeed: 150, fanSpeed: 100 },
    speed: { layerHeight: Math.min(0.28, nozzle * 0.7), wallCount: 2, infillDensity: 10, printSpeed: 180, outerWallSpeed: 90, infillSpeed: 220, fanSpeed: 100 },
  };
  const target = presets[mode];
  const patch = {};
  for (const [key, value] of Object.entries(target)) {
    let next = value;
    if (key.endsWith("Speed")) next = Math.min(next, maxSpeed);
    if (key === "layerHeight") next = Number(Math.min(next, nozzle * 0.8).toFixed(2));
    if (Math.abs((store.settings[key] ?? 0) - next) > 1e-6) patch[key] = next;
  }
  return patch;
}

function OptimizePage() {
  const store = usePrint();
  const navigate = useNavigate();
  const [mode, setMode] = useState("balanced");
  const [report, setReport] = useState(null);
  const [running, setRunning] = useState(false);
  const [chosen, setChosen] = useState({});

  const actions = {
    onImport: () => navigate({ to: "/" }),
    onExport: store.exportGcode,
    onUndo: store.undo,
    onRedo: store.redo,
    onSlice: store.sliceNow,
    onSend: () => navigate({ to: "/device" }),
    canUndo: store.canUndo,
    canRedo: store.canRedo,
    canSend: !!store.result,
  };

  const analyze = () => {
    if (!store.models.length) {
      toast.error("Import a model first.");
      return;
    }
    setRunning(true);
    try {
      const patch = buildPatch(mode, store);
      const baseline = store.runSlice();
      const candidate = Object.keys(patch).length
        ? store.runSlice({ ...store.settings, ...patch })
        : baseline;
      setReport({ patch, baseline, candidate });
      setChosen(Object.fromEntries(Object.keys(patch).map((key) => [key, true])));
      if (!Object.keys(patch).length) {
        toast.info("Current settings already match this mode.");
      }
    } catch (error) {
      toast.error(error.message);
    } finally {
      setRunning(false);
    }
  };

  const applySelected = () => {
    const subset = Object.fromEntries(Object.entries(report.patch).filter(([key]) => chosen[key]));
    if (!Object.keys(subset).length) {
      toast.error("Select at least one change.");
      return;
    }
    store.patchSettings(subset);
    toast.success(`Applied ${Object.keys(subset).length} change(s)`);
    setReport(null);
  };

  const timeDelta = report ? report.candidate.stats.timeSeconds - report.baseline.stats.timeSeconds : 0;
  const gramsDelta = report ? report.candidate.stats.filamentGrams - report.baseline.stats.filamentGrams : 0;

  return (
    <AppShell
      title="AI Optimize"
      subtitle={store.projectName}
      actions={actions}
      status={{ printer: store.printer.name, plateLabel: `Plate 1 · ${store.models.length} object(s)` }}
      right={
        <div className="space-y-3">
          <SectionCard title="Optimization mode">
            <div className="space-y-1.5">
              {MODES.map((item) => {
                const Icon = item.icon;
                const active = mode === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setMode(item.id)}
                    className={cn(
                      "w-full rounded-xl border px-3 py-2 text-left transition-colors",
                      active ? "border-primary/50 bg-primary/[0.08]" : "border-border/60 bg-background/30 hover:border-border"
                    )}
                  >
                    <span className={cn("flex items-center gap-2 text-[12.5px] font-medium", active ? "text-primary" : "text-foreground")}>
                      <Icon className="h-3.5 w-3.5" strokeWidth={1.9} />
                      {item.label}
                    </span>
                    <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">{item.blurb}</span>
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={analyze}
              disabled={running}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-3 py-2 text-[12.5px] font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              <Wand2 className="h-3.5 w-3.5" />
              {running ? "Slicing twice to compare…" : "Analyze project"}
            </button>
          </SectionCard>

          {report && (
            <SectionCard title="Estimated impact">
              <div className="grid grid-cols-2 gap-2">
                <StatBlock label="Time saved" value={formatDuration(Math.abs(timeDelta))} tone={timeDelta < 0 ? "accent" : "default"} />
                <StatBlock label="Filament saved" value={`${Math.abs(gramsDelta).toFixed(1)}`} unit="g" />
                <StatBlock label="Layers now" value={report.baseline.stats.layerCount} />
                <StatBlock label="Layers after" value={report.candidate.stats.layerCount} />
              </div>
              <p className="mt-2 text-[10.5px] leading-relaxed text-muted-foreground/80">
                These numbers come from slicing the plate twice with the real engine, not from a formula.
                They are estimates; the printer's own acceleration behaviour will shift the final time.
              </p>
            </SectionCard>
          )}
        </div>
      }
      bottom={<SliceStatusBar store={store} />}
    >
      <div className="h-full overflow-y-auto p-4">
        <div className="mx-auto max-w-4xl space-y-4">
          <div className="rounded-2xl border border-border/70 bg-card/60 p-4">
            <h2 className="font-heading text-[15px] font-semibold text-foreground">Recommendations</h2>
            <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
              Pick a mode and run the analysis. Every recommendation is validated by slicing the plate with
              the proposed settings, so the savings shown are measured.
            </p>

            {!report ? (
              <div className="mt-3">
                <EmptyHint>
                  No comparison yet. Choose a mode and press “Analyze project”.
                </EmptyHint>
              </div>
            ) : (
              <>
                <div className="mt-3 overflow-hidden rounded-xl border border-border/60">
                  <table className="w-full text-[12px]">
                    <thead className="bg-secondary/40 text-[10.5px] uppercase tracking-[0.1em] text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">Apply</th>
                        <th className="px-3 py-2 text-left font-medium">Setting</th>
                        <th className="px-3 py-2 text-right font-medium">Current</th>
                        <th className="px-3 py-2 text-right font-medium">Recommended</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(report.patch).map(([key, value]) => (
                        <tr key={key} className="border-t border-border/50">
                          <td className="px-3 py-2">
                            <button
                              type="button"
                              onClick={() => setChosen((prev) => ({ ...prev, [key]: !prev[key] }))}
                              className={cn(
                                "flex h-4 w-4 items-center justify-center rounded border",
                                chosen[key] ? "border-primary bg-primary text-primary-foreground" : "border-border"
                              )}
                            >
                              {chosen[key] && <Check className="h-3 w-3" />}
                            </button>
                          </td>
                          <td className="px-3 py-2 text-foreground">{LABELS[key] || key}</td>
                          <td className="px-3 py-2 text-right font-mono text-muted-foreground">
                            {store.settings[key]}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-primary">{value}</td>
                        </tr>
                      ))}
                      {Object.keys(report.patch).length === 0 && (
                        <tr>
                          <td colSpan={4} className="px-3 py-4 text-center text-[12px] text-muted-foreground">
                            The current settings already match this mode.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  <div className="rounded-xl border border-border/60 bg-background/40 px-3 py-2">
                    <div className="metric-label">Print time now</div>
                    <div className="font-mono text-[13px] text-foreground">
                      {formatDuration(report.baseline.stats.timeSeconds)}
                    </div>
                  </div>
                  <div className="rounded-xl border border-border/60 bg-background/40 px-3 py-2">
                    <div className="metric-label">Print time after</div>
                    <div className="font-mono text-[13px] text-primary">
                      {formatDuration(report.candidate.stats.timeSeconds)}
                    </div>
                  </div>
                  <div className="rounded-xl border border-border/60 bg-background/40 px-3 py-2">
                    <div className="metric-label">Filament after</div>
                    <div className="font-mono text-[13px] text-foreground">
                      {report.candidate.stats.filamentGrams} g
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={applySelected}
                  className="mt-3 inline-flex items-center gap-2 rounded-xl bg-primary px-3.5 py-2 text-[12.5px] font-semibold text-primary-foreground transition-opacity hover:opacity-90"
                >
                  Apply selected changes
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </>
            )}
          </div>

          <div className="rounded-2xl border border-primary/25 bg-primary/[0.05] p-4">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <h2 className="font-heading text-[14px] font-semibold text-foreground">Let PrintPilot AI explain it</h2>
            </div>
            <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
              The assistant can reason about this specific model's geometry, choose an orientation, and apply
              the settings through real slicer tools.
            </p>
            <button
              type="button"
              onClick={() => navigate({ to: "/ai" })}
              className="mt-2.5 inline-flex items-center gap-2 rounded-xl border border-border/70 bg-background/50 px-3 py-1.5 text-[12px] text-foreground transition-colors hover:border-primary/50"
            >
              Open AI Assistant
              <ArrowRight className="h-3.5 w-3.5 text-primary" />
            </button>
          </div>
        </div>
      </div>
    </AppShell>
  );
}