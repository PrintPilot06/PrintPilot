import { Copy, Trash2, MoveDown, Crosshair, Boxes } from "lucide-react";
import { SectionCard, EmptyHint } from "@/components/controls";
import { cn } from "@/lib/utils";

function IconButton({ icon: Icon, label, onClick }) {
  return (
    <button
      type="button"
      title={label}
      onClick={onClick}
      className="rounded-md border border-border/70 p-1 text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
    >
      <Icon className="h-3 w-3" strokeWidth={1.9} />
    </button>
  );
}

export default function ModelListCard({ store }) {
  const { models, selectedId, setSelectedId, removeModel, duplicateModel, dropToPlate, centerOnPlate } = store;

  return (
    <SectionCard title={`Objects · ${models.length}`} action={<Boxes className="h-3.5 w-3.5 text-muted-foreground" />}>
      {models.length === 0 ? (
        <EmptyHint>No objects yet. Import an STL or OBJ to begin.</EmptyHint>
      ) : (
        <ul className="space-y-1">
          {models.map((model) => {
            const active = model.id === selectedId;
            const size = model.analysis.bounds.size;
            return (
              <li
                key={model.id}
                className={cn(
                  "group rounded-xl border px-2.5 py-2 transition-colors",
                  active ? "border-primary/50 bg-primary/[0.07]" : "border-border/60 bg-background/30 hover:border-border"
                )}
              >
                <button type="button" onClick={() => setSelectedId(model.id)} className="block w-full text-left">
                  <div className="truncate text-[12px] font-medium text-foreground">{model.name}</div>
                  <div className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                    {size.map((v) => v.toFixed(1)).join(" × ")} mm · {model.analysis.triCount.toLocaleString()} tris
                  </div>
                </button>
                <div className="mt-1.5 flex items-center gap-1 opacity-70 transition-opacity group-hover:opacity-100">
                  <IconButton icon={Copy} label="Duplicate" onClick={() => duplicateModel(model.id)} />
                  <IconButton icon={MoveDown} label="Drop to plate" onClick={() => dropToPlate(model.id)} />
                  <IconButton icon={Crosshair} label="Center on plate" onClick={() => centerOnPlate(model.id)} />
                  <span className="flex-1" />
                  <IconButton icon={Trash2} label="Remove" onClick={() => removeModel(model.id)} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </SectionCard>
  );
}