import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { Upload, LayoutGrid, RotateCw, Maximize2, Minimize2, MoveDown, FlipHorizontal2 } from "lucide-react";
import { toast } from "sonner";
import AppShell from "@/components/AppShell";
import Viewport3D from "@/components/viewport/Viewport3D";
import ProjectDialog from "@/components/ProjectDialog";
import SliceStatusBar from "@/components/panels/SliceStatusBar";
import ModelListCard from "@/components/panels/ModelListCard";
import { PrinterCard, FilamentCard, QuickSettings, AiHintCard } from "@/components/panels/PlatePanels";
import { usePrint } from "@/lib/printStore";

export const Route = createFileRoute("/_authed/")({
  component: PreparePage,
});

function ToolButton({ icon: Icon, label, onClick, disabled }) {
  return (
    <button
      type="button"
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="rounded-lg border border-border/70 bg-background/70 p-1.5 text-muted-foreground backdrop-blur transition-colors hover:border-primary/50 hover:text-primary disabled:opacity-40"
    >
      <Icon className="h-3.5 w-3.5" strokeWidth={1.9} />
    </button>
  );
}

function PreparePage() {
  const store = usePrint();
  const navigate = useNavigate();
  const fileRef = useRef(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const model = store.selectedModel;

  const onImport = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      await store.importFile(file);
      toast.success(`${file.name} imported`);
    } catch (error) {
      toast.error(error.message);
    }
  };

  const rotate = (axis, degrees) => {
    if (!model) return;
    const rotation = [...model.transform.rotation];
    rotation[axis] += degrees;
    store.updateTransform(model.id, { rotation });
  };

  const scaleBy = (factor) => {
    if (!model) return;
    store.updateTransform(model.id, { scale: model.transform.scale.map((s) => Number((s * factor).toFixed(3))) });
  };

  const actions = {
    onNew: () => {
      store.newProject();
      toast.success("New project");
    },
    onOpen: () => setDialogOpen(true),
    onSave: async () => {
      try {
        await store.saveProject();
      } catch (error) {
        toast.error(error.message);
      }
    },
    onImport: () => fileRef.current?.click(),
    onExport: store.exportGcode,
    onUndo: store.undo,
    onRedo: store.redo,
    onSlice: () => {
      const output = store.sliceNow();
      if (output) navigate({ to: "/preview" });
    },
    onSend: () => navigate({ to: "/device" }),
    canUndo: store.canUndo,
    canRedo: store.canRedo,
    canSend: !!store.result,
  };

  return (
    <>
      <AppShell
        title="Prepare"
        subtitle={store.projectName}
        actions={actions}
        status={{ printer: store.printer.name, plateLabel: `Plate 1 · ${store.models.length} object(s)` }}
        right={
          <div className="space-y-3">
            <ModelListCard store={store} />
            <PrinterCard store={store} />
            <FilamentCard store={store} />
            <QuickSettings store={store} />
            <AiHintCard store={store} onOpen={() => navigate({ to: "/ai" })} />
          </div>
        }
        bottom={<SliceStatusBar store={store} />}
      >
        <div className="relative h-full w-full">
          <Viewport3D
            models={store.models}
            plate={store.plate}
            selectedId={store.selectedId}
            onSelect={store.setSelectedId}
            className="h-full w-full"
          />

          <div className="pointer-events-none absolute left-4 top-4 flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-border/70 bg-background/70 px-2.5 py-1 font-mono text-[10.5px] text-muted-foreground backdrop-blur">
              {store.plate.x} × {store.plate.y} × {store.plate.z} mm
            </span>
            <span className="rounded-full border border-border/70 bg-background/70 px-2.5 py-1 font-mono text-[10.5px] text-muted-foreground backdrop-blur">
              {store.models.length} object{store.models.length === 1 ? "" : "s"}
            </span>
            {model && (
              <span className="rounded-full border border-primary/40 bg-primary/10 px-2.5 py-1 font-mono text-[10.5px] text-primary backdrop-blur">
                {model.analysis.bounds.size.map((v) => v.toFixed(1)).join(" × ")} mm
              </span>
            )}
          </div>

          {store.models.length === 0 && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="pointer-events-auto rounded-2xl border border-border/70 bg-background/80 px-6 py-5 text-center backdrop-blur">
                <div className="font-heading text-[14px] font-semibold text-foreground">
                  Your build plate is empty
                </div>
                <p className="mt-1 max-w-[260px] text-[12px] leading-relaxed text-muted-foreground">
                  Import an STL or OBJ mesh to inspect it, repair it and slice it.
                </p>
                <div className="mt-3 flex items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="inline-flex items-center gap-2 rounded-xl bg-primary px-3.5 py-2 text-[12px] font-semibold text-primary-foreground transition-opacity hover:opacity-90"
                  >
                    <Upload className="h-3.5 w-3.5" />
                    Import model
                  </button>
                  <button
                    type="button"
                    onClick={store.loadSample}
                    className="rounded-xl border border-border/70 px-3 py-2 text-[12px] text-foreground transition-colors hover:border-primary/50"
                  >
                    Load sample model
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="absolute bottom-4 left-4 flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="inline-flex items-center gap-2 rounded-xl border border-border/70 bg-background/80 px-3 py-2 text-[12px] font-medium text-foreground backdrop-blur transition-colors hover:border-primary/50"
            >
              <Upload className="h-3.5 w-3.5 text-primary" />
              Import
            </button>
            <div className="flex items-center gap-1.5 rounded-xl border border-border/70 bg-background/80 p-1.5 backdrop-blur">
              <ToolButton icon={RotateCw} label="Rotate X 90°" onClick={() => rotate(0, 90)} disabled={!model} />
              <ToolButton icon={RotateCw} label="Rotate Y 90°" onClick={() => rotate(1, 90)} disabled={!model} />
              <ToolButton icon={RotateCw} label="Rotate Z 90°" onClick={() => rotate(2, 90)} disabled={!model} />
              <span className="h-4 w-px bg-border" />
              <ToolButton icon={Maximize2} label="Scale up 10%" onClick={() => scaleBy(1.1)} disabled={!model} />
              <ToolButton icon={Minimize2} label="Scale down 10%" onClick={() => scaleBy(1 / 1.1)} disabled={!model} />
              <ToolButton
                icon={FlipHorizontal2}
                label="Mirror on X"
                onClick={() => model && store.geometryOps.mirror(model.id, "x")}
                disabled={!model}
              />
              <span className="h-4 w-px bg-border" />
              <ToolButton
                icon={MoveDown}
                label="Drop to plate"
                onClick={() => model && store.dropToPlate(model.id)}
                disabled={!model}
              />
              <ToolButton icon={LayoutGrid} label="Arrange all" onClick={store.arrangeAll} disabled={!store.models.length} />
            </div>
          </div>

          <input ref={fileRef} type="file" accept=".stl,.obj" className="hidden" onChange={onImport} />
        </div>
      </AppShell>
      <ProjectDialog open={dialogOpen} onClose={() => setDialogOpen(false)} store={store} />
    </>
  );
}