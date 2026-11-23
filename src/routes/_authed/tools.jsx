import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Wrench, ShieldCheck, Scissors, Layers, AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { toast } from "sonner";
import AppShell from "@/components/AppShell";
import SliceStatusBar from "@/components/panels/SliceStatusBar";
import { SectionCard, NumberField, EmptyHint, StatBlock } from "@/components/controls";
import { usePrint } from "@/lib/printStore";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authed/tools")({
  component: ToolsPage,
});

const SEVERITY = {
  error: { icon: AlertTriangle, className: "text-destructive", bg: "bg-destructive/10" },
  warning: { icon: AlertTriangle, className: "text-amber-400", bg: "bg-amber-500/10" },
  info: { icon: Info, className: "text-sky-400", bg: "bg-sky-500/10" },
};

function ToolsPage() {
  const store = usePrint();
  const navigate = useNavigate();
  const [cutZ, setCutZ] = useState(10);
  const model = store.selectedModel;
  const issues = store.diagnose();

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

  const run = (fn, message) => {
    try {
      fn();
      toast.success(message);
    } catch (error) {
      toast.error(error.message);
    }
  };

  return (
    <AppShell
      title="Model Tools"
      subtitle={model ? model.name : "No selection"}
      actions={actions}
      status={{ printer: store.printer.name, plateLabel: `Plate 1 · ${store.models.length} object(s)` }}
      right={
        <div className="space-y-3">
          <SectionCard title="Mesh statistics" action={<ShieldCheck className="h-3.5 w-3.5 text-muted-foreground" />}>
            {!model ? (
              <EmptyHint>Select an object on the plate to inspect it.</EmptyHint>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <StatBlock label="Triangles" value={model.analysis.triCount.toLocaleString()} />
                <StatBlock label="Vertices" value={model.analysis.vertexCount.toLocaleString()} />
                <StatBlock label="Volume" value={(model.analysis.volume / 1000).toFixed(2)} unit="cm³" />
                <StatBlock label="Surface" value={(model.analysis.area / 100).toFixed(1)} unit="cm²" />
                <StatBlock label="Shells" value={model.analysis.components} />
                <StatBlock
                  label="Watertight"
                  value={model.analysis.isWatertight ? "Yes" : "No"}
                  tone={model.analysis.isWatertight ? "accent" : "default"}
                />
              </div>
            )}
          </SectionCard>

          <SectionCard title="Dimensions">
            {!model ? (
              <EmptyHint>No model selected.</EmptyHint>
            ) : (
              <div className="space-y-1">
                {["X", "Y", "Z"].map((axis, i) => (
                  <div key={axis} className="field-row">
                    <span className="field-label">{axis} size</span>
                    <span className="metric-value">{model.analysis.bounds.size[i].toFixed(2)} mm</span>
                  </div>
                ))}
                <div className="field-row">
                  <span className="field-label">Overhang area</span>
                  <span className="metric-value">{model.analysis.overhangPercent.toFixed(1)}%</span>
                </div>
              </div>
            )}
          </SectionCard>

          <SectionCard title="Transform">
            {!model ? (
              <EmptyHint>No model selected.</EmptyHint>
            ) : (
              <div className="space-y-1">
                <NumberField
                  label="Position X"
                  value={model.transform.position[0]}
                  step={1}
                  unit="mm"
                  onChange={(v) => store.updateTransform(model.id, { position: [v, model.transform.position[1], model.transform.position[2]] }, { record: false })}
                />
                <NumberField
                  label="Position Y"
                  value={model.transform.position[1]}
                  step={1}
                  unit="mm"
                  onChange={(v) => store.updateTransform(model.id, { position: [model.transform.position[0], v, model.transform.position[2]] }, { record: false })}
                />
                <NumberField
                  label="Position Z"
                  value={model.transform.position[2]}
                  step={1}
                  unit="mm"
                  onChange={(v) => store.updateTransform(model.id, { position: [model.transform.position[0], model.transform.position[1], v] }, { record: false })}
                />
                <NumberField
                  label="Rotate X"
                  value={model.transform.rotation[0]}
                  step={15}
                  unit="°"
                  onChange={(v) => store.updateTransform(model.id, { rotation: [v, model.transform.rotation[1], model.transform.rotation[2]] }, { record: false })}
                />
                <NumberField
                  label="Rotate Y"
                  value={model.transform.rotation[1]}
                  step={15}
                  unit="°"
                  onChange={(v) => store.updateTransform(model.id, { rotation: [model.transform.rotation[0], v, model.transform.rotation[2]] }, { record: false })}
                />
                <NumberField
                  label="Rotate Z"
                  value={model.transform.rotation[2]}
                  step={15}
                  unit="°"
                  onChange={(v) => store.updateTransform(model.id, { rotation: [model.transform.rotation[0], model.transform.rotation[1], v] }, { record: false })}
                />
                <NumberField
                  label="Scale"
                  value={model.transform.scale[0]}
                  step={0.05}
                  unit="×"
                  onChange={(v) => store.updateTransform(model.id, { scale: [v, v, v] }, { record: false })}
                />
              </div>
            )}
          </SectionCard>
        </div>
      }
      bottom={<SliceStatusBar store={store} />}
    >
      <div className="h-full overflow-y-auto p-4">
        <div className="mx-auto max-w-4xl space-y-4">
          <div className="rounded-2xl border border-border/70 bg-card/60 p-4">
            <div className="flex items-center gap-2">
              <Wrench className="h-4 w-4 text-primary" strokeWidth={1.9} />
              <h2 className="font-heading text-[15px] font-semibold text-foreground">Inspection &amp; repair</h2>
            </div>
            <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
              Every check below runs on the actual mesh geometry on the plate.
            </p>

            <div className="mt-3 space-y-2">
              {issues.length === 0 ? (
                <div className="flex items-center gap-2 rounded-xl bg-emerald-500/10 px-3 py-2.5 text-[12px] text-emerald-300">
                  <CheckCircle2 className="h-4 w-4" />
                  No geometry problems detected in the current selection.
                </div>
              ) : (
                issues.map((issue) => {
                  const style = SEVERITY[issue.severity] || SEVERITY.info;
                  const Icon = style.icon;
                  return (
                    <div key={`${issue.id}-${issue.modelName}`} className={cn("rounded-xl px-3 py-2.5", style.bg)}>
                      <div className={cn("flex items-center gap-2 text-[12px] font-medium", style.className)}>
                        <Icon className="h-3.5 w-3.5" />
                        {issue.title}
                        <span className="ml-auto font-mono text-[10px] opacity-70">{issue.modelName}</span>
                      </div>
                      <p className="mt-1 text-[11.5px] leading-relaxed text-muted-foreground">{issue.detail}</p>
                    </div>
                  );
                })
              )}
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={!model}
                onClick={() => run(() => store.geometryOps.repair(model.id), "Mesh repaired")}
                className="rounded-xl bg-primary px-3 py-1.5 text-[12px] font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                One-click repair
              </button>
              <button
                type="button"
                disabled={!model}
                onClick={() => run(() => store.geometryOps.simplify(model.id, 0.5), "Mesh simplified")}
                className="rounded-xl border border-border/70 px-3 py-1.5 text-[12px] text-foreground transition-colors hover:border-primary/50 disabled:opacity-40"
              >
                Simplify mesh
              </button>
              <button
                type="button"
                disabled={!model}
                onClick={() => run(() => store.geometryOps.splitShells(model.id), "Split into shells")}
                className="rounded-xl border border-border/70 px-3 py-1.5 text-[12px] text-foreground transition-colors hover:border-primary/50 disabled:opacity-40"
              >
                Split shells
              </button>
              <button
                type="button"
                disabled={!model}
                onClick={() => run(() => store.geometryOps.orient(model.id), "Best orientation applied")}
                className="rounded-xl border border-border/70 px-3 py-1.5 text-[12px] text-foreground transition-colors hover:border-primary/50 disabled:opacity-40"
              >
                Auto-orient
              </button>
              <button
                type="button"
                onClick={() => run(() => store.arrangeAll(), "Plate arranged")}
                className="rounded-xl border border-border/70 px-3 py-1.5 text-[12px] text-foreground transition-colors hover:border-primary/50 disabled:opacity-40"
                disabled={!store.models.length}
              >
                Arrange plate
              </button>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-border/70 bg-card/60 p-4">
              <div className="flex items-center gap-2">
                <Scissors className="h-4 w-4 text-primary" strokeWidth={1.9} />
                <h2 className="font-heading text-[14px] font-semibold text-foreground">Cut model</h2>
              </div>
              <p className="mt-1 text-[11.5px] leading-relaxed text-muted-foreground">
                Cuts at a height above the plate and caps the cross-section so the result still slices.
              </p>
              <div className="mt-2">
                <NumberField label="Cut height" value={cutZ} step={1} unit="mm" onChange={setCutZ} />
              </div>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  disabled={!model}
                  onClick={() => run(() => store.geometryOps.cut(model.id, cutZ, true), "Lower part kept")}
                  className="flex-1 rounded-xl border border-border/70 px-3 py-1.5 text-[12px] text-foreground transition-colors hover:border-primary/50 disabled:opacity-40"
                >
                  Keep lower
                </button>
                <button
                  type="button"
                  disabled={!model}
                  onClick={() => run(() => store.geometryOps.cut(model.id, cutZ, false), "Upper part kept")}
                  className="flex-1 rounded-xl border border-border/70 px-3 py-1.5 text-[12px] text-foreground transition-colors hover:border-primary/50 disabled:opacity-40"
                >
                  Keep upper
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-border/70 bg-card/60 p-4">
              <div className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-primary" strokeWidth={1.9} />
                <h2 className="font-heading text-[14px] font-semibold text-foreground">Mirror &amp; duplicate</h2>
              </div>
              <p className="mt-1 text-[11.5px] leading-relaxed text-muted-foreground">
                Mirroring bakes into the mesh with corrected winding, so the part stays watertight.
              </p>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {["x", "y", "z"].map((axis) => (
                  <button
                    key={axis}
                    type="button"
                    disabled={!model}
                    onClick={() => run(() => store.geometryOps.mirror(model.id, axis), `Mirrored on ${axis.toUpperCase()}`)}
                    className="rounded-xl border border-border/70 px-3 py-1.5 text-[12px] uppercase text-foreground transition-colors hover:border-primary/50 disabled:opacity-40"
                  >
                    {axis}
                  </button>
                ))}
              </div>
              <button
                type="button"
                disabled={!model}
                onClick={() => run(() => store.duplicateModel(model.id), "Model duplicated")}
                className="mt-2 w-full rounded-xl border border-border/70 px-3 py-1.5 text-[12px] text-foreground transition-colors hover:border-primary/50 disabled:opacity-40"
              >
                Duplicate model
              </button>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}