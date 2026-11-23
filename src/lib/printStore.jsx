import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { parseMeshFile } from "@/lib/stl";
import {
  analyzeMesh,
  bestOrientation,
  clipMeshByPlane,
  computeBounds,
  diagnose,
  repairMesh,
  simplifyMesh,
  splitComponents,
  transformPositions,
} from "@/lib/slicer/mesh";
import { slicePlate } from "@/lib/slicer/slice";
import { DEFAULT_FILAMENT, DEFAULT_PRINTER, DEFAULT_SETTINGS, tempsFromFilament } from "@/lib/defaults";
import { sampleTower } from "@/lib/sampleMeshes";

const PrintContext = createContext(null);

let modelCounter = 0;

function normalize(positions) {
  const b = computeBounds(positions);
  const out = new Float32Array(positions);
  for (let i = 0; i < out.length; i += 3) {
    out[i] -= b.center[0];
    out[i + 1] -= b.center[1];
    out[i + 2] -= b.min[2];
  }
  return out;
}

function createModel({ name, positions, indices, fileUri }) {
  modelCounter += 1;
  const normalized = normalize(positions);
  return {
    id: `model-${Date.now()}-${modelCounter}`,
    name: name || `Model ${modelCounter}`,
    positions: normalized,
    indices: new Uint32Array(indices),
    transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], mirrorX: false },
    fileUri: fileUri || null,
    analysis: analyzeMesh(normalized, indices),
  };
}

function cloneTransform(t) {
  return {
    position: [...(t.position || [0, 0, 0])],
    rotation: [...(t.rotation || [0, 0, 0])],
    scale: [...(t.scale || [1, 1, 1])],
    mirrorX: !!t.mirrorX,
  };
}

function snapshotOf(models, settings, printer, filament) {
  return {
    models: models.map((m) => ({ ...m, transform: cloneTransform(m.transform) })),
    settings: { ...settings },
    printer: { ...printer },
    filament: { ...filament },
  };
}

export function PrintProvider({ children }) {
  const [models, setModels] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [printer, setPrinter] = useState(DEFAULT_PRINTER);
  const [filament, setFilament] = useState(DEFAULT_FILAMENT);
  const [settings, setSettings] = useState({ ...DEFAULT_SETTINGS, ...tempsFromFilament(DEFAULT_FILAMENT) });
  const [result, setResult] = useState(null);
  const [slicing, setSlicing] = useState(false);
  const [logs, setLogs] = useState([]);
  const [aiLog, setAiLog] = useState([]);
  const [mode, setMode] = useState("beginner");
  const [projectId, setProjectId] = useState(null);
  const [projectName, setProjectName] = useState("Untitled project");
  const [aiConfig, setAiConfig] = useState(null);
  const [, bump] = useState(0);
  const undoStack = useRef([]);
  const redoStack = useRef([]);

  const plate = useMemo(
    () => ({ x: printer.build_x || 220, y: printer.build_y || 220, z: printer.build_z || 250 }),
    [printer]
  );

  const addLog = useCallback((message, level = "info") => {
    setLogs((prev) => [...prev.slice(-199), { id: `${Date.now()}-${Math.random()}`, message, level, at: Date.now() }]);
  }, []);

  const snapshot = useCallback(
    () => snapshotOf(models, settings, printer, filament),
    [models, settings, printer, filament]
  );

  const pushUndo = useCallback(() => {
    undoStack.current.push(snapshot());
    if (undoStack.current.length > 40) undoStack.current.shift();
    redoStack.current = [];
    bump((v) => v + 1);
  }, [snapshot]);

  const applySnapshot = useCallback((snap) => {
    setModels(snap.models);
    setSettings(snap.settings);
    setPrinter(snap.printer);
    setFilament(snap.filament);
  }, []);

  const undo = useCallback(() => {
    const prev = undoStack.current.pop();
    if (!prev) return;
    redoStack.current.push(snapshot());
    applySnapshot(prev);
    bump((v) => v + 1);
    addLog("Undo applied");
  }, [snapshot, applySnapshot, addLog]);

  const redo = useCallback(() => {
    const next = redoStack.current.pop();
    if (!next) return;
    undoStack.current.push(snapshot());
    applySnapshot(next);
    bump((v) => v + 1);
    addLog("Redo applied");
  }, [snapshot, applySnapshot, addLog]);

  const selectedModel = useMemo(() => models.find((m) => m.id === selectedId) || null, [models, selectedId]);

  const addModel = useCallback(
    (model, { record = true } = {}) => {
      if (record) pushUndo();
      setModels((prev) => [...prev, model]);
      setSelectedId(model.id);
      addLog(`Added ${model.name} — ${model.analysis.triCount.toLocaleString()} triangles`);
    },
    [pushUndo, addLog]
  );

  const importFile = useCallback(
    async (file) => {
      const buffer = await file.arrayBuffer();
      const mesh = parseMeshFile(file.name, buffer);
      let fileUri = null;
      try {
        const uploaded = await base44.integrations.Core.UploadPrivateFile({ file });
        fileUri = uploaded.file_uri;
      } catch {
        fileUri = null;
      }
      const model = createModel({ name: file.name, positions: mesh.positions, indices: mesh.indices, fileUri });
      addModel(model);
      return model;
    },
    [addModel]
  );

  const loadSample = useCallback(() => {
    const sample = sampleTower();
    addModel(
      createModel({
        name: "PrintPilot sample tower.stl",
        positions: sample.positions,
        indices: sample.indices,
      })
    );
  }, [addModel]);

  const removeModel = useCallback(
    (id) => {
      pushUndo();
      setModels((prev) => prev.filter((m) => m.id !== id));
      setSelectedId((cur) => (cur === id ? null : cur));
      setResult(null);
      addLog("Model removed");
    },
    [pushUndo, addLog]
  );

  const duplicateModel = useCallback(
    (id) => {
      const source = models.find((m) => m.id === id);
      if (!source) return;
      pushUndo();
      modelCounter += 1;
      const copy = {
        ...source,
        id: `model-${Date.now()}-${modelCounter}`,
        name: `${source.name.replace(/\.(stl|obj)$/i, "")} copy`,
        transform: { ...cloneTransform(source.transform), position: [source.transform.position[0] + 12, source.transform.position[1] + 12, source.transform.position[2]] },
      };
      setModels((prev) => [...prev, copy]);
      setSelectedId(copy.id);
      addLog(`Duplicated ${source.name}`);
    },
    [models, pushUndo, addLog]
  );

  const updateTransform = useCallback(
    (id, patch, { record = true } = {}) => {
      if (record) pushUndo();
      setModels((prev) =>
        prev.map((m) => (m.id === id ? { ...m, transform: { ...m.transform, ...patch } } : m))
      );
      setResult(null);
    },
    [pushUndo]
  );

  const setModelGeometry = useCallback(
    (id, { positions, indices }, label = "Geometry updated") => {
      pushUndo();
      setModels((prev) =>
        prev.map((m) => {
          if (m.id !== id) return m;
          const pos = normalize(positions);
          return { ...m, positions: pos, indices: new Uint32Array(indices), analysis: analyzeMesh(pos, indices) };
        })
      );
      setResult(null);
      addLog(label);
    },
    [pushUndo, addLog]
  );

  const dropToPlate = useCallback(
    (id) => {
      const model = models.find((m) => m.id === id);
      if (!model) return;
      const tp = transformPositions(model.positions, model.transform);
      const b = computeBounds(tp);
      updateTransform(id, {
        position: [model.transform.position[0], model.transform.position[1], model.transform.position[2] - b.min[2]],
      });
      addLog(`${model.name} dropped to the build plate`);
    },
    [models, updateTransform, addLog]
  );

  const centerOnPlate = useCallback(
    (id) => {
      const model = models.find((m) => m.id === id);
      if (!model) return;
      const tp = transformPositions(model.positions, model.transform);
      const b = computeBounds(tp);
      updateTransform(id, {
        position: [
          model.transform.position[0] - b.center[0],
          model.transform.position[1] - b.center[1],
          model.transform.position[2] - b.min[2],
        ],
      });
      addLog(`${model.name} centered on the plate`);
    },
    [models, updateTransform, addLog]
  );

  const arrangeAll = useCallback(() => {
    if (!models.length) return;
    pushUndo();
    const gap = 6;
    const sizes = models.map((m) => {
      const tp = transformPositions(m.positions, m.transform);
      const b = computeBounds(tp);
      return { id: m.id, w: b.size[0], d: b.size[1] };
    });
    const maxRow = Math.max(plate.x, 120);
    let cursorX = 0;
    let cursorY = 0;
    let rowDepth = 0;
    const placements = {};
    for (const size of sizes) {
      if (cursorX > 0 && cursorX + size.w > maxRow - 4) {
        cursorX = 0;
        cursorY += rowDepth + gap;
        rowDepth = 0;
      }
      placements[size.id] = [cursorX + size.w / 2 - maxRow / 2 + 2, cursorY + size.d / 2 - plate.y / 2 + 2];
      cursorX += size.w + gap;
      rowDepth = Math.max(rowDepth, size.d);
    }
    setModels((prev) =>
      prev.map((m) => {
        const p = placements[m.id];
        if (!p) return m;
        const tp = transformPositions(m.positions, { ...m.transform, position: [0, 0, 0] });
        const b = computeBounds(tp);
        return {
          ...m,
          transform: { ...m.transform, position: [p[0] - b.center[0], p[1] - b.center[1], -b.min[2]] },
        };
      })
    );
    setResult(null);
    addLog("Arranged all objects on the plate");
  }, [models, plate, pushUndo, addLog]);

  const patchSettings = useCallback(
    (patch, { record = true } = {}) => {
      if (record) pushUndo();
      setSettings((prev) => ({ ...prev, ...patch }));
      setResult(null);
    },
    [pushUndo]
  );

  const patchPrinter = useCallback(
    (patch, { record = true } = {}) => {
      if (record) pushUndo();
      setPrinter((prev) => ({ ...prev, ...patch }));
      setResult(null);
    },
    [pushUndo]
  );

  const applyPrinterProfile = useCallback(
    (profile) => {
      pushUndo();
      setPrinter({
        name: profile.name,
        manufacturer: profile.manufacturer || "",
        build_x: profile.build_x,
        build_y: profile.build_y,
        build_z: profile.build_z,
        nozzle_diameter: profile.nozzle_diameter,
        filament_diameter: profile.filament_diameter,
        max_nozzle_temp: profile.max_nozzle_temp,
        max_bed_temp: profile.max_bed_temp,
        max_speed: profile.max_speed,
        max_acceleration: profile.max_acceleration,
        firmware: profile.firmware,
        start_gcode: profile.start_gcode || "",
        end_gcode: profile.end_gcode || "",
      });
      setSettings((prev) => ({ ...prev, lineWidth: Number(((profile.nozzle_diameter || 0.4) * 1.125).toFixed(3)) }));
      setResult(null);
      addLog(`Printer profile applied: ${profile.name}`);
    },
    [pushUndo, addLog]
  );

  const applyFilamentProfile = useCallback(
    (profile) => {
      pushUndo();
      setFilament({ ...profile });
      setSettings((prev) => ({ ...prev, ...tempsFromFilament(profile) }));
      setResult(null);
      addLog(`Filament profile applied: ${profile.name}`);
    },
    [pushUndo, addLog]
  );

  const runSlice = useCallback(
    (overrideSettings) => {
      const activeSettings = overrideSettings || settings;
      if (!models.length) throw new Error("Import a model before slicing.");
      return slicePlate({ models, printer, filament, settings: activeSettings });
    },
    [models, printer, filament, settings]
  );

  const sliceNow = useCallback(() => {
    if (!models.length) {
      toast.error("Import a model first.");
      return null;
    }
    setSlicing(true);
    try {
      const output = runSlice();
      setResult(output);
      addLog(
        `Sliced ${output.stats.layerCount} layers · ${output.stats.filamentGrams} g · ${Math.round(output.stats.timeSeconds / 60)} min`
      );
      output.warnings.forEach((w) => addLog(w, "warn"));
      toast.success(`Sliced ${output.stats.layerCount} layers`);
      return output;
    } catch (error) {
      addLog(`Slice failed: ${error.message}`, "error");
      toast.error(error.message);
      return null;
    } finally {
      setSlicing(false);
    }
  }, [models, runSlice, addLog]);

  const exportGcode = useCallback(() => {
    if (!result) {
      toast.error("Slice the plate before exporting G-code.");
      return;
    }
    const blob = new Blob([result.gcode], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(projectName || "printpilot").replace(/\s+/g, "-")}.gcode`;
    a.click();
    URL.revokeObjectURL(url);
    addLog("G-code exported");
  }, [result, projectName, addLog]);

  const newProject = useCallback(() => {
    pushUndo();
    setModels([]);
    setSelectedId(null);
    setResult(null);
    setProjectId(null);
    setProjectName("Untitled project");
    addLog("New project started");
  }, [pushUndo, addLog]);

  const saveProject = useCallback(
    async (name) => {
      const title = (name || projectName || "Untitled project").trim();
      const payload = {
        name: title,
        models: models.map((m) => ({ name: m.name, file_uri: m.fileUri, transform: m.transform })),
        settings,
        printer,
        filament,
        slice_stats: result ? result.stats : null,
      };
      if (projectId) {
        await base44.entities.Project.update(projectId, payload);
        addLog(`Project saved: ${title}`);
      } else {
        const record = await base44.entities.Project.create(payload);
        setProjectId(record.id);
        addLog(`Project created: ${title}`);
      }
      setProjectName(title);
      toast.success("Project saved");
    },
    [projectId, projectName, models, settings, printer, filament, result, addLog]
  );

  const loadProject = useCallback(
    async (id) => {
      const record = await base44.entities.Project.get(id);
      const loaded = [];
      for (const entry of record.models || []) {
        if (!entry.file_uri) continue;
        try {
          const { signed_url } = await base44.integrations.Core.CreateFileSignedUrl({ file_uri: entry.file_uri });
          const response = await fetch(signed_url);
          const buffer = await response.arrayBuffer();
          const mesh = parseMeshFile(entry.name || "model.stl", buffer);
          const model = createModel({
            name: entry.name,
            positions: mesh.positions,
            indices: mesh.indices,
            fileUri: entry.file_uri,
          });
          if (entry.transform) model.transform = cloneTransform(entry.transform);
          loaded.push(model);
        } catch (error) {
          addLog(`Could not restore ${entry.name}: ${error.message}`, "error");
        }
      }
      setModels(loaded);
      setSelectedId(loaded[0]?.id || null);
      setSettings({ ...DEFAULT_SETTINGS, ...(record.settings || {}) });
      setPrinter({ ...DEFAULT_PRINTER, ...(record.printer || {}) });
      setFilament({ ...DEFAULT_FILAMENT, ...(record.filament || {}) });
      setProjectId(record.id);
      setProjectName(record.name);
      setResult(null);
      addLog(`Opened project: ${record.name}`);
      return loaded.length;
    },
    [addLog]
  );

  const geometryOps = useMemo(
    () => ({
      repair: (id) => {
        const model = models.find((m) => m.id === id);
        if (!model) throw new Error("Select a model first.");
        const fixed = repairMesh(model.positions, model.indices);
        setModelGeometry(id, fixed, "Mesh repaired");
        return fixed;
      },
      simplify: (id, ratio = 0.5) => {
        const model = models.find((m) => m.id === id);
        if (!model) throw new Error("Select a model first.");
        const diag = Math.hypot(...model.analysis.bounds.size) || 1;
        const simplified = simplifyMesh(model.positions, model.indices, diag * (0.004 + ratio * 0.02));
        setModelGeometry(id, simplified, "Mesh simplified");
        return simplified;
      },
      splitShells: (id) => {
        const model = models.find((m) => m.id === id);
        if (!model) throw new Error("Select a model first.");
        const parts = splitComponents(model.positions, model.indices);
        if (parts.length < 2) throw new Error("This mesh is a single connected shell — nothing to split.");
        pushUndo();
        const created = parts.map((part, i) =>
          createModel({
            name: `${model.name.replace(/\.(stl|obj)$/i, "")} part ${i + 1}`,
            positions: part.positions,
            indices: part.indices,
          })
        );
        setModels((prev) => [...prev.filter((m) => m.id !== id), ...created]);
        setSelectedId(created[0].id);
        setResult(null);
        addLog(`Split into ${created.length} shells`);
        return created.length;
      },
      cut: (id, planeZ, keepLower) => {
        const model = models.find((m) => m.id === id);
        if (!model) throw new Error("Select a model first.");
        const worldZ = planeZ + model.transform.position[2];
        const cut = clipMeshByPlane(model.positions, model.indices, worldZ, keepLower);
        if (!cut.indices.length) throw new Error("The cut plane is outside the model.");
        setModelGeometry(id, cut, `Cut at Z ${planeZ.toFixed(1)} mm`);
        return cut;
      },
      mirror: (id, axis = "x") => {
        const model = models.find((m) => m.id === id);
        if (!model) throw new Error("Select a model first.");
        const idx = { x: 0, y: 1, z: 2 }[axis] ?? 0;
        const positions = new Float32Array(model.positions);
        for (let i = idx; i < positions.length; i += 3) positions[i] = -positions[i];
        const indices = new Uint32Array(model.indices);
        for (let i = 0; i < indices.length; i += 3) {
          const tmp = indices[i + 1];
          indices[i + 1] = indices[i + 2];
          indices[i + 2] = tmp;
        }
        setModelGeometry(id, { positions, indices }, `Mirrored ${model.name} on ${axis}`);
      },
      orient: (id) => {
        const model = models.find((m) => m.id === id);
        if (!model) throw new Error("Select a model first.");
        const best = bestOrientation(model.positions, model.indices, settings.supportAngle);
        pushUndo();
        const tp = transformPositions(model.positions, { rotation: best.rotation, scale: [1, 1, 1] });
        const b = computeBounds(tp);
        setModels((prev) =>
          prev.map((m) =>
            m.id === id
              ? {
                  ...m,
                  transform: {
                    ...m.transform,
                    rotation: best.rotation,
                    position: [0, 0, -b.min[2]],
                  },
                }
              : m
          )
        );
        setResult(null);
        addLog(`Oriented for printing: ${best.label}`);
        return best;
      },
    }),
    [models, settings.supportAngle, setModelGeometry, pushUndo, addLog]
  );

  const value = useMemo(
    () => ({
      models,
      selectedModel,
      selectedId,
      setSelectedId,
      printer,
      filament,
      settings,
      mode,
      setMode,
      plate,
      result,
      slicing,
      logs,
      aiLog,
      setAiLog,
      aiConfig,
      setAiConfig,
      projectId,
      projectName,
      setProjectName,
      addLog,
      addModel,
      loadSample,
      importFile,
      removeModel,
      duplicateModel,
      updateTransform,
      setModelGeometry,
      dropToPlate,
      centerOnPlate,
      arrangeAll,
      patchSettings,
      patchPrinter,
      applyPrinterProfile,
      applyFilamentProfile,
      runSlice,
      sliceNow,
      exportGcode,
      newProject,
      saveProject,
      loadProject,
      undo,
      redo,
      canUndo: undoStack.current.length > 0,
      canRedo: redoStack.current.length > 0,
      pushUndo,
      geometryOps,
      diagnose: () =>
        models.flatMap((m) => diagnose(m.analysis, plate).map((issue) => ({ ...issue, modelName: m.name }))),
    }),
    [
      models,
      selectedModel,
      selectedId,
      printer,
      filament,
      settings,
      mode,
      plate,
      result,
      slicing,
      logs,
      aiLog,
      aiConfig,
      projectId,
      projectName,
      addLog,
      addModel,
      loadSample,
      importFile,
      removeModel,
      duplicateModel,
      updateTransform,
      setModelGeometry,
      dropToPlate,
      centerOnPlate,
      arrangeAll,
      patchSettings,
      patchPrinter,
      applyPrinterProfile,
      applyFilamentProfile,
      runSlice,
      sliceNow,
      exportGcode,
      newProject,
      saveProject,
      loadProject,
      undo,
      redo,
      pushUndo,
      geometryOps,
    ]
  );

  return <PrintContext.Provider value={value}>{children}</PrintContext.Provider>;
}

export function usePrint() {
  const ctx = useContext(PrintContext);
  if (!ctx) throw new Error("usePrint must be used inside PrintProvider");
  return ctx;
}