import { useEffect, useState } from "react";
import { FolderOpen, Save, Trash2, X, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";

export default function ProjectDialog({ open, onClose, store }) {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState(store.projectName);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(store.projectName);
    setLoading(true);
    base44.entities.Project.list("-updated_date", 50)
      .then((list) => setProjects(Array.isArray(list) ? list : list?.items || []))
      .catch(() => setProjects([]))
      .finally(() => setLoading(false));
  }, [open, store.projectName]);

  if (!open) return null;

  const handleOpen = async (id) => {
    setBusy(true);
    try {
      await store.loadProject(id);
      toast.success("Project opened");
      onClose();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  };

  const handleSaveAs = async () => {
    setBusy(true);
    try {
      await store.saveProject(name);
      onClose();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (id) => {
    await base44.entities.Project.delete(id);
    setProjects((prev) => prev.filter((p) => p.id !== id));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-border bg-card shadow-2xl animate-fade-up">
        <div className="flex items-center justify-between border-b border-border/70 px-4 py-3">
          <h2 className="font-heading text-[14px] font-semibold text-foreground">Projects</h2>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex items-center gap-2 border-b border-border/70 px-4 py-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Project name"
            className="flex-1 rounded-lg border border-border/80 bg-background/70 px-2.5 py-1.5 text-[12.5px] text-foreground outline-none focus:border-primary/60"
          />
          <button
            type="button"
            onClick={handleSaveAs}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-[12px] font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Save
          </button>
        </div>

        <div className="max-h-[320px] overflow-y-auto p-2">
          {loading ? (
            <div className="py-8 text-center text-[12px] text-muted-foreground">Loading projects…</div>
          ) : projects.length === 0 ? (
            <div className="py-8 text-center text-[12px] text-muted-foreground">
              No saved projects yet.
            </div>
          ) : (
            <ul className="space-y-1">
              {projects.map((project) => (
                <li
                  key={project.id}
                  className="flex items-center gap-2 rounded-xl border border-border/60 bg-background/40 px-3 py-2"
                >
                  <button
                    type="button"
                    onClick={() => handleOpen(project.id)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <div className="truncate text-[12.5px] font-medium text-foreground">{project.name}</div>
                    <div className="font-mono text-[10px] text-muted-foreground">
                      {(project.models || []).length} object(s) ·{" "}
                      {new Date(project.updated_date).toLocaleString("en-US")}
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(project.id)}
                    className="rounded-md border border-border/70 p-1 text-muted-foreground hover:border-destructive/60 hover:text-destructive"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}