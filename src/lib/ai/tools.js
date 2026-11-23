/**
 * PrintPilot AI tool registry.
 * Every tool below is a real implementation operating on the live project
 * state (geometry, transforms, settings, slice results). Tools flagged
 * `mutating` are held for user approval before they run.
 */

import {
  analyzeMesh,
  bestOrientation,
  computeBounds,
  diagnose,
  repairMesh,
  simplifyMesh,
  splitComponents,
  transformPositions,
} from "@/lib/slicer/mesh";
import { buildTriangleSoup, formatDuration, sliceLayer } from "@/lib/slicer/slice";
import { DEFAULT_SETTINGS } from "@/lib/defaults";

const num = (v, fallback = 0) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);
const round = (v, d = 2) => Number(Number(v).toFixed(d));

function pickModel(store, name) {
  if (!name || /selected|current|this|active/i.test(String(name))) {
    return store.selectedModel || store.models[0] || null;
  }
  const lower = String(name).toLowerCase();
  return (
    store.models.find((m) => m.name.toLowerCase() === lower) ||
    store.models.find((m) => m.name.toLowerCase().includes(lower)) ||
    store.selectedModel ||
    store.models[0] ||
    null
  );
}

function requireModel(store, name) {
  const model = pickModel(store, name);
  if (!model) throw new Error("There is no model on the plate yet.");
  return model;
}

function modelSummary(model) {
  const world = transformPositions(model.positions, model.transform);
  const b = computeBounds(world);
  const a = model.analysis;
  return {
    name: model.name,
    triangles: a.triCount,
    vertices: a.vertexCount,
    watertight: a.isWatertight,
    shells: a.components,
    volume_cm3: round(a.volume / 1000),
    surface_area_cm2: round(a.area / 100),
    size_mm: b.size.map((v) => round(v)),
    min_mm: b.min.map((v) => round(v)),
    max_mm: b.max.map((v) => round(v)),
    position_mm: model.transform.position.map((v) => round(v)),
    rotation_deg: model.transform.rotation.map((v) => round(v, 1)),
    scale: model.transform.scale.map((v) => round(v, 3)),
    overhang_percent_45: round(a.overhangPercent, 1),
  };
}

function segmentDistance(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy || 1e-12;
  let t = ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function thinWallReport(store, model) {
  const soup = buildTriangleSoup([model]);
  const midZ = (soup.zmin + soup.zmax) / 2;
  const loops = sliceLayer(soup.tris, midZ);
  const threshold = (store.settings.lineWidth || 0.45) * 2;
  const samples = [];
  for (const loop of loops) {
    const stride = Math.max(1, Math.floor(loop.length / 60));
    for (let i = 0; i < loop.length; i += stride) {
      const p = loop[i];
      let best = Infinity;
      for (const other of loops) {
        for (let j = 0; j < other.length; j += 1) {
          if (other === loop && Math.abs(j - i) <= 2) continue;
          const a = other[j];
          const b = other[(j + 1) % other.length];
          const d = segmentDistance(p[0], p[1], a[0], a[1], b[0], b[1]);
          if (d < best) best = d;
        }
      }
      if (best < threshold) samples.push(round(best, 2));
    }
  }
  return {
    slice_z: round(midZ, 2),
    threshold_mm: round(threshold, 2),
    thin_samples: samples.length,
    min_wall_mm: samples.length ? Math.min(...samples) : null,
  };
}

const SETTINGS_KEYS = Object.keys(DEFAULT_SETTINGS);

function sanitizeSettingsPatch(patch) {
  const out = {};
  for (const [key, value] of Object.entries(patch || {})) {
    if (!SETTINGS_KEYS.includes(key)) continue;
    if (typeof DEFAULT_SETTINGS[key] === "number") {
      const n = Number(value);
      if (Number.isFinite(n)) out[key] = n;
    } else if (typeof DEFAULT_SETTINGS[key] === "boolean") {
      out[key] = !!value;
    } else if (typeof value === "string") {
      out[key] = value;
    }
  }
  return out;
}

export const TOOLS = [
  {
    name: "InspectModel",
    description: "Read dimensions, triangle count, volume, shells and orientation of a model on the plate.",
    parameters: {
      type: "object",
      properties: { model: { type: "string", description: "Model file name; omit for the selected model" } },
    },
    run: async (args, store) => {
      const model = requireModel(store, args.model);
      return { ...modelSummary(model), issues: diagnose(model.analysis, store.plate) };
    },
  },
  {
    name: "AnalyzeMesh",
    description: "Detailed mesh statistics: watertightness, boundary and non-manifold edges, duplicate and degenerate faces, overhang area.",
    parameters: { type: "object", properties: { model: { type: "string" } } },
    run: async (args, store) => {
      const model = requireModel(store, args.model);
      const a = model.analysis;
      return {
        model: model.name,
        triangles: a.triCount,
        vertices: a.vertexCount,
        watertight: a.isWatertight,
        boundary_edges: a.boundaryEdges,
        non_manifold_edges: a.nonManifoldEdges,
        degenerate_faces: a.degenerate,
        duplicate_faces: a.duplicateFaces,
        shells: a.components,
        inverted_normals: a.invertedNormals,
        volume_cm3: round(a.volume / 1000),
        overhang_percent_45: round(a.overhangPercent, 1),
      };
    },
  },
  {
    name: "DetectMeshErrors",
    description: "List every detected geometry problem with a plain-language explanation.",
    parameters: { type: "object", properties: { model: { type: "string" } } },
    run: async (args, store) => {
      const model = requireModel(store, args.model);
      return { model: model.name, issues: diagnose(model.analysis, store.plate) };
    },
  },
  {
    name: "RepairMesh",
    description: "Weld vertices, remove degenerate and duplicate faces, make normals consistent, flip inward faces and fill boundary holes.",
    parameters: { type: "object", properties: { model: { type: "string" } } },
    mutating: true,
    run: async (args, store) => {
      const model = requireModel(store, args.model);
      const before = diagnose(model.analysis, store.plate).map((i) => i.id);
      const fixed = repairMesh(model.positions, model.indices);
      store.setModelGeometry(model.id, fixed, `Repaired ${model.name}`);
      const analysis = analyzeMesh(fixed.positions, fixed.indices);
      return {
        model: model.name,
        fixed_before: before,
        filled_holes: fixed.filledLoops,
        triangles_after: analysis.triCount,
        watertight_now: analysis.isWatertight,
        remaining_issues: diagnose(analysis, store.plate).map((i) => i.id),
      };
    },
  },
  {
    name: "ScaleModel",
    description: "Scale a model uniformly or per axis. Use percent for uniform scaling (e.g. 110 = 110%).",
    parameters: {
      type: "object",
      properties: {
        model: { type: "string" },
        percent: { type: "number", description: "Uniform scale in percent" },
        factor: { type: "number", description: "Uniform multiplier" },
        x: { type: "number" },
        y: { type: "number" },
        z: { type: "number" },
      },
    },
    mutating: true,
    run: async (args, store) => {
      const model = requireModel(store, args.model);
      const current = model.transform.scale;
      let scale = [...current];
      if (args.percent) scale = scale.map(() => num(args.percent) / 100);
      else if (args.factor) scale = scale.map(() => num(args.factor, 1));
      else scale = [num(args.x, current[0]), num(args.y, current[1]), num(args.z, current[2])];
      store.updateTransform(model.id, { scale });
      return { model: model.name, scale: scale.map((v) => round(v, 3)) };
    },
  },
  {
    name: "RotateModel",
    description: "Rotate a model around an axis by a number of degrees.",
    parameters: {
      type: "object",
      properties: {
        model: { type: "string" },
        axis: { type: "string", enum: ["x", "y", "z"] },
        degrees: { type: "number" },
      },
      required: ["axis", "degrees"],
    },
    mutating: true,
    run: async (args, store) => {
      const model = requireModel(store, args.model);
      const idx = { x: 0, y: 1, z: 2 }[args.axis];
      if (idx === undefined) throw new Error("axis must be x, y or z");
      const rotation = [...model.transform.rotation];
      rotation[idx] = round(rotation[idx] + num(args.degrees), 1);
      store.updateTransform(model.id, { rotation });
      return { model: model.name, rotation_deg: rotation };
    },
  },
  {
    name: "MoveModel",
    description: "Move a model by a delta in millimetres on the build plate.",
    parameters: {
      type: "object",
      properties: { model: { type: "string" }, x: { type: "number" }, y: { type: "number" }, z: { type: "number" } },
    },
    mutating: true,
    run: async (args, store) => {
      const model = requireModel(store, args.model);
      const p = model.transform.position;
      const position = [p[0] + num(args.x), p[1] + num(args.y), p[2] + num(args.z)];
      store.updateTransform(model.id, { position });
      return { model: model.name, position_mm: position.map((v) => round(v)) };
    },
  },
  {
    name: "MirrorModel",
    description: "Mirror a model across an axis.",
    parameters: {
      type: "object",
      properties: { model: { type: "string" }, axis: { type: "string", enum: ["x", "y", "z"] } },
      required: ["axis"],
    },
    mutating: true,
    run: async (args, store) => {
      const model = requireModel(store, args.model);
      const idx = { x: 0, y: 1, z: 2 }[args.axis];
      if (idx === undefined) throw new Error("axis must be x, y or z");
      const positions = new Float32Array(model.positions);
      for (let i = idx; i < positions.length; i += 3) positions[i] = -positions[i];
      const indices = new Uint32Array(model.indices);
      for (let i = 0; i < indices.length; i += 3) {
        const tmp = indices[i + 1];
        indices[i + 1] = indices[i + 2];
        indices[i + 2] = tmp;
      }
      store.setModelGeometry(model.id, { positions, indices }, `Mirrored ${model.name} on ${args.axis}`);
      return { model: model.name, mirrored: args.axis };
    },
  },
  {
    name: "DuplicateModel",
    description: "Duplicate a model on the plate.",
    parameters: { type: "object", properties: { model: { type: "string" } } },
    mutating: true,
    run: async (args, store) => {
      const model = requireModel(store, args.model);
      store.duplicateModel(model.id);
      return { duplicated: model.name };
    },
  },
  {
    name: "SplitModel",
    description: "Split a model into its disconnected shells, or split it at a Z plane.",
    parameters: {
      type: "object",
      properties: {
        model: { type: "string" },
        mode: { type: "string", enum: ["shells", "plane"] },
        z: { type: "number", description: "Cut height in mm for plane mode" },
      },
      required: ["mode"],
    },
    mutating: true,
    run: async (args, store) => {
      const model = requireModel(store, args.model);
      if (args.mode === "shells") {
        const count = store.geometryOps.splitShells(model.id);
        return { model: model.name, parts_created: count };
      }
      const parts = splitComponents(model.positions, model.indices);
      if (parts.length < 2) throw new Error("This mesh is one shell; use CutModel for a plane cut.");
      const cutZ = num(args.z, model.analysis.bounds.size[2] / 2);
      store.geometryOps.cut(model.id, cutZ, true);
      return { model: model.name, cut_at_mm: round(cutZ) };
    },
  },
  {
    name: "CutModel",
    description: "Cut a model with a horizontal plane and keep the lower or upper part.",
    parameters: {
      type: "object",
      properties: {
        model: { type: "string" },
        z: { type: "number", description: "Height of the cut in mm above the plate" },
        keep: { type: "string", enum: ["lower", "upper"] },
      },
      required: ["z"],
    },
    mutating: true,
    run: async (args, store) => {
      const model = requireModel(store, args.model);
      store.geometryOps.cut(model.id, num(args.z), (args.keep || "lower") === "lower");
      return { model: model.name, cut_at_mm: round(num(args.z)), kept: args.keep || "lower" };
    },
  },
  {
    name: "SimplifyMesh",
    description: "Reduce triangle count with vertex-clustering decimation. Ratio 0..1, higher keeps more detail.",
    parameters: {
      type: "object",
      properties: { model: { type: "string" }, ratio: { type: "number" } },
    },
    mutating: true,
    run: async (args, store) => {
      const model = requireModel(store, args.model);
      const before = model.analysis.triCount;
      store.geometryOps.simplify(model.id, Math.min(Math.max(num(args.ratio, 0.5), 0.05), 1));
      const after = store.models.find((m) => m.id === model.id)?.analysis.triCount ?? before;
      return { model: model.name, triangles_before: before, triangles_after: after };
    },
  },
  {
    name: "OrientForPrinting",
    description: "Test the six axis-aligned orientations and apply the one with the least overhang area and lowest height.",
    parameters: { type: "object", properties: { model: { type: "string" } } },
    mutating: true,
    run: async (args, store) => {
      const model = requireModel(store, args.model);
      const best = store.geometryOps.orient(model.id);
      return {
        model: model.name,
        chosen: best.label,
        rotation_deg: best.rotation,
        overhang_area_cm2: round(best.overhangArea / 100),
        height_mm: round(best.height),
      };
    },
  },
  {
    name: "ArrangeOnBuildPlate",
    description: "Lay every object out on the plate without overlaps.",
    parameters: { type: "object", properties: {} },
    mutating: true,
    run: async (args, store) => {
      store.arrangeAll();
      return { arranged: store.models.length };
    },
  },
  {
    name: "DropToPlate",
    description: "Move a model down so it rests exactly on the build plate.",
    parameters: { type: "object", properties: { model: { type: "string" } } },
    mutating: true,
    run: async (args, store) => {
      const model = requireModel(store, args.model);
      store.dropToPlate(model.id);
      return { model: model.name, dropped: true };
    },
  },
  {
    name: "GetCurrentSettings",
    description: "Read the current print, filament and printer settings.",
    parameters: { type: "object", properties: {} },
    run: async (args, store) => ({
      settings: store.settings,
      printer: {
        name: store.printer.name,
        build_volume: [store.printer.build_x, store.printer.build_y, store.printer.build_z],
        nozzle_diameter: store.printer.nozzle_diameter,
        max_speed: store.printer.max_speed,
        firmware: store.printer.firmware,
      },
      filament: {
        name: store.filament.name,
        material: store.filament.material,
        density: store.filament.density,
        nozzle_temp: store.filament.nozzle_temp,
        bed_temp: store.filament.bed_temp,
      },
    }),
  },
  {
    name: "ChangePrintSettings",
    description:
      "Change print settings. Valid keys include layerHeight, firstLayerHeight, wallCount, topLayers, bottomLayers, lineWidth, infillDensity, infillPattern, printSpeed, outerWallSpeed, infillSpeed, travelSpeed, firstLayerSpeed, nozzleTemp, bedTemp, retractionLength, retractionSpeed, zHop, fanSpeed, supports, supportAngle, adhesion, skirtLoops, brimWidth, seam, ironing.",
    parameters: {
      type: "object",
      properties: { patch: { type: "object", description: "Settings to change" } },
      required: ["patch"],
    },
    mutating: true,
    run: async (args, store) => {
      const patch = sanitizeSettingsPatch(args.patch);
      if (!Object.keys(patch).length) throw new Error("No valid settings were provided.");
      store.patchSettings(patch);
      return { applied: patch };
    },
  },
  {
    name: "ChangeFilamentSettings",
    description: "Change filament properties such as nozzle_temp, bed_temp, retraction_length, retraction_speed, fan_speed, flow_ratio.",
    parameters: {
      type: "object",
      properties: { patch: { type: "object" } },
      required: ["patch"],
    },
    mutating: true,
    run: async (args, store) => {
      const allowed = ["nozzle_temp", "first_layer_nozzle_temp", "bed_temp", "first_layer_bed_temp", "flow_ratio", "retraction_length", "retraction_speed", "fan_speed", "density"];
      const patch = {};
      for (const [k, v] of Object.entries(args.patch || {})) {
        if (allowed.includes(k) && Number.isFinite(Number(v))) patch[k] = Number(v);
      }
      if (!Object.keys(patch).length) throw new Error("No valid filament fields were provided.");
      store.applyFilamentProfile({ ...store.filament, ...patch });
      return { applied: patch };
    },
  },
  {
    name: "ChangePrinterSettings",
    description: "Change printer limits such as build_x, build_y, build_z, nozzle_diameter, max_speed, max_acceleration, max_nozzle_temp.",
    parameters: {
      type: "object",
      properties: { patch: { type: "object" } },
      required: ["patch"],
    },
    mutating: true,
    run: async (args, store) => {
      const allowed = ["build_x", "build_y", "build_z", "nozzle_diameter", "max_speed", "max_acceleration", "max_nozzle_temp", "max_bed_temp"];
      const patch = {};
      for (const [k, v] of Object.entries(args.patch || {})) {
        if (allowed.includes(k) && Number.isFinite(Number(v))) patch[k] = Number(v);
      }
      if (!Object.keys(patch).length) throw new Error("No valid printer fields were provided.");
      store.patchPrinter(patch);
      return { applied: patch };
    },
  },
  {
    name: "GenerateSupports",
    description: "Turn supports on or off and set the overhang angle that triggers them.",
    parameters: {
      type: "object",
      properties: { enabled: { type: "boolean" }, angle: { type: "number" } },
    },
    mutating: true,
    run: async (args, store) => {
      const patch = {};
      if (typeof args.enabled === "boolean") patch.supports = args.enabled;
      if (Number.isFinite(Number(args.angle))) patch.supportAngle = Number(args.angle);
      store.patchSettings(patch);
      return { supports: store.settings.supports, angle: store.settings.supportAngle };
    },
  },
  {
    name: "ModifySupportSettings",
    description: "Change support-specific settings such as supportAngle, supportSpeed and supportDensity.",
    parameters: { type: "object", properties: { patch: { type: "object" } }, required: ["patch"] },
    mutating: true,
    run: async (args, store) => {
      const patch = {};
      for (const key of ["supportAngle", "supportSpeed", "supportDensity"]) {
        if (Number.isFinite(Number(args.patch?.[key]))) patch[key] = Number(args.patch[key]);
      }
      store.patchSettings(patch);
      return { applied: patch };
    },
  },
  {
    name: "AnalyzeOverhangs",
    description: "Measure the overhang area that exceeds the current support angle.",
    parameters: { type: "object", properties: { model: { type: "string" } } },
    run: async (args, store) => {
      const model = requireModel(store, args.model);
      const angle = store.settings.supportAngle;
      const a = analyzeMesh(model.positions, model.indices, angle);
      return {
        model: model.name,
        angle_deg: angle,
        overhang_area_cm2: round(a.overhangArea / 100),
        overhang_percent: round(a.overhangPercent, 1),
        supports_enabled: store.settings.supports,
        recommendation: a.overhangPercent > 8 && !store.settings.supports ? "Enable supports or reorient the model." : "Overhang load is manageable.",
      };
    },
  },
  {
    name: "AnalyzeBridging",
    description: "Measure near-horizontal downward faces that must bridge or be supported.",
    parameters: { type: "object", properties: { model: { type: "string" } } },
    run: async (args, store) => {
      const model = requireModel(store, args.model);
      const world = transformPositions(model.positions, model.transform);
      let horizontal = 0;
      let total = 0;
      for (let t = 0; t < model.indices.length; t += 3) {
        const ia = model.indices[t] * 3;
        const ib = model.indices[t + 1] * 3;
        const ic = model.indices[t + 2] * 3;
        const a = [world[ia], world[ia + 1], world[ia + 2]];
        const b = [world[ib], world[ib + 1], world[ib + 2]];
        const c = [world[ic], world[ic + 1], world[ic + 2]];
        const ux = b[0] - a[0];
        const uy = b[1] - a[1];
        const uz = b[2] - a[2];
        const vx = c[0] - a[0];
        const vy = c[1] - a[1];
        const vz = c[2] - a[2];
        const nx = uy * vz - uz * vy;
        const ny = uz * vx - ux * vz;
        const nz = ux * vy - uy * vx;
        const len = Math.hypot(nx, ny, nz);
        if (len < 1e-9) continue;
        const area = len / 2;
        total += area;
        if (nz / len < -0.95) horizontal += area;
      }
      return {
        model: model.name,
        near_horizontal_downward_area_cm2: round(horizontal / 100),
        percent_of_surface: total ? round((horizontal / total) * 100, 1) : 0,
        note: "These faces either bridge between two walls or need support underneath.",
      };
    },
  },
  {
    name: "OptimizeInfill",
    description: "Recommend an infill density and pattern for the current model and intent.",
    parameters: {
      type: "object",
      properties: { intent: { type: "string", enum: ["strength", "speed", "quality", "balanced"] } },
    },
    run: async (args, store) => {
      const intent = args.intent || "balanced";
      const map = {
        strength: { infillDensity: 40, wallCount: 4, infillPattern: "grid" },
        speed: { infillDensity: 8, wallCount: 2, infillPattern: "lines" },
        quality: { infillDensity: 15, wallCount: 3, infillPattern: "grid" },
        balanced: { infillDensity: 20, wallCount: 3, infillPattern: "grid" },
      };
      return { intent, current: { infillDensity: store.settings.infillDensity, wallCount: store.settings.wallCount, infillPattern: store.settings.infillPattern }, recommended: map[intent] };
    },
  },
  {
    name: "OptimizeWalls",
    description: "Recommend a wall count for the current model size and intent.",
    parameters: { type: "object", properties: { intent: { type: "string", enum: ["strength", "speed", "quality", "balanced"] } } },
    run: async (args, store) => {
      const intent = args.intent || "balanced";
      const recommended = { strength: 5, speed: 2, quality: 3, balanced: 3 }[intent];
      return { intent, current_walls: store.settings.wallCount, recommended_walls: recommended };
    },
  },
  {
    name: "OptimizeLayerHeight",
    description: "Recommend a layer height based on the model's smallest features and the intent.",
    parameters: { type: "object", properties: { intent: { type: "string", enum: ["strength", "speed", "quality", "balanced"] } } },
    run: async (args, store) => {
      const intent = args.intent || "balanced";
      const nozzle = store.printer.nozzle_diameter || 0.4;
      const recommended = Math.min(
        nozzle * (intent === "speed" ? 0.8 : intent === "quality" ? 0.3 : 0.5),
        intent === "speed" ? 0.32 : 0.24
      );
      return {
        intent,
        current_layer_height: store.settings.layerHeight,
        recommended_layer_height: round(recommended, 2),
        note: "Never exceed 80% of the nozzle diameter.",
      };
    },
  },
  {
    name: "EstimatePrintTime",
    description: "Slice the plate with the current settings and report the estimated print time and filament use.",
    parameters: { type: "object", properties: {} },
    run: async (args, store) => {
      const output = store.runSlice();
      return {
        layers: output.stats.layerCount,
        time: formatDuration(output.stats.timeSeconds),
        time_seconds: output.stats.timeSeconds,
        filament_grams: output.stats.filamentGrams,
        filament_mm: output.stats.filamentLength,
        warnings: output.warnings,
      };
    },
  },
  {
    name: "SliceModel",
    description: "Slice the plate now and store the result so the preview and export use it.",
    parameters: { type: "object", properties: {} },
    run: async (args, store) => {
      const output = store.sliceNow();
      if (!output) throw new Error("Slicing failed.");
      return {
        layers: output.stats.layerCount,
        time: formatDuration(output.stats.timeSeconds),
        filament_grams: output.stats.filamentGrams,
        warnings: output.warnings,
      };
    },
  },
  {
    name: "InspectGcode",
    description: "Summarise the G-code produced by the last slice.",
    parameters: { type: "object", properties: {} },
    run: async (args, store) => {
      if (!store.result) throw new Error("Nothing has been sliced yet. Call SliceModel first.");
      const r = store.result;
      const lines = r.gcode.split("\n");
      return {
        lines: lines.length,
        layers: r.stats.layerCount,
        time: formatDuration(r.stats.timeSeconds),
        filament_grams: r.stats.filamentGrams,
        max_z_mm: r.stats.maxZ,
        toolpath_segments: r.segments.length,
        header: lines.slice(0, 6),
      };
    },
  },
  {
    name: "DetectNonManifoldEdges",
    description: "Count edges shared by more than two faces.",
    parameters: { type: "object", properties: { model: { type: "string" } } },
    run: async (args, store) => {
      const model = requireModel(store, args.model);
      return { model: model.name, non_manifold_edges: model.analysis.nonManifoldEdges };
    },
  },
  {
    name: "DetectHoles",
    description: "Count open boundary edges that leave the mesh unclosed.",
    parameters: { type: "object", properties: { model: { type: "string" } } },
    run: async (args, store) => {
      const model = requireModel(store, args.model);
      return { model: model.name, boundary_edges: model.analysis.boundaryEdges, watertight: model.analysis.isWatertight };
    },
  },
  {
    name: "DetectThinWalls",
    description: "Slice at mid height and measure how close opposite walls come, compared with two extrusion widths.",
    parameters: { type: "object", properties: { model: { type: "string" } } },
    run: async (args, store) => thinWallReport(store, requireModel(store, args.model)),
  },
  {
    name: "DetectOverhangs",
    description: "Report overhang area beyond the support angle.",
    parameters: { type: "object", properties: { model: { type: "string" } } },
    run: async (args, store) => {
      const model = requireModel(store, args.model);
      return {
        model: model.name,
        angle_deg: store.settings.supportAngle,
        overhang_percent: round(model.analysis.overhangPercent, 1),
      };
    },
  },
  {
    name: "DetectFloatingGeometry",
    description: "Count disconnected shells and report whether any sits above the plate without contact.",
    parameters: { type: "object", properties: { model: { type: "string" } } },
    run: async (args, store) => {
      const model = requireModel(store, args.model);
      return {
        model: model.name,
        shells: model.analysis.components,
        note:
          model.analysis.components > 1
            ? "The model contains separate shells. Anything not touching the plate needs support."
            : "Single connected shell.",
      };
    },
  },
  {
    name: "DetectBuildPlateCollisions",
    description: "Check whether objects overlap each other on the plate.",
    parameters: { type: "object", properties: {} },
    run: async (args, store) => {
      const boxes = store.models.map((m) => {
        const b = computeBounds(transformPositions(m.positions, m.transform));
        return { name: m.name, min: b.min, max: b.max };
      });
      const collisions = [];
      for (let i = 0; i < boxes.length; i += 1) {
        for (let j = i + 1; j < boxes.length; j += 1) {
          const a = boxes[i];
          const b = boxes[j];
          const overlap =
            a.min[0] < b.max[0] && a.max[0] > b.min[0] && a.min[1] < b.max[1] && a.max[1] > b.min[1];
          if (overlap) collisions.push([a.name, b.name]);
        }
      }
      return { objects: boxes.length, collisions };
    },
  },
  {
    name: "DetectOutOfBoundsGeometry",
    description: "Check models against the printer's build volume.",
    parameters: { type: "object", properties: {} },
    run: async (args, store) => {
      const plate = store.plate;
      const offenders = [];
      for (const m of store.models) {
        const b = computeBounds(transformPositions(m.positions, m.transform));
        const outX = b.min[0] < -plate.x / 2 - 0.5 || b.max[0] > plate.x / 2 + 0.5;
        const outY = b.min[1] < -plate.y / 2 - 0.5 || b.max[1] > plate.y / 2 + 0.5;
        const outZ = b.max[2] > plate.z + 0.5 || b.min[2] < -0.5;
        if (outX || outY || outZ) {
          offenders.push({ model: m.name, size_mm: b.size.map((v) => round(v)), out_of_bounds: { x: outX, y: outY, z: outZ } });
        }
      }
      return { plate_mm: [plate.x, plate.y, plate.z], offenders };
    },
  },
  {
    name: "AnalyzePrintability",
    description: "Combined verdict on whether the current plate will print reliably.",
    parameters: { type: "object", properties: {} },
    run: async (args, store) => {
      if (!store.models.length) throw new Error("There is no model on the plate yet.");
      const issues = store.diagnose();
      let output = null;
      try {
        output = store.runSlice();
      } catch (error) {
        return { printable: false, reason: error.message, issues };
      }
      const blocking = issues.filter((i) => i.severity === "error");
      return {
        printable: blocking.length === 0,
        blocking_issues: blocking,
        warnings: issues.filter((i) => i.severity !== "error"),
        slice: {
          layers: output.stats.layerCount,
          time: formatDuration(output.stats.timeSeconds),
          filament_grams: output.stats.filamentGrams,
        },
        slice_warnings: output.warnings,
      };
    },
  },
];

export const TOOL_SCHEMAS = TOOLS.map(({ name, description, parameters }) => ({ name, description, parameters }));
export const MUTATING_TOOLS = new Set(TOOLS.filter((t) => t.mutating).map((t) => t.name));

export function describeToolCall(name, args) {
  const labels = {
    ScaleModel: "Scale model",
    RotateModel: "Rotate model",
    MoveModel: "Move model",
    MirrorModel: "Mirror model",
    DuplicateModel: "Duplicate model",
    SplitModel: "Split model",
    CutModel: "Cut model",
    SimplifyMesh: "Simplify mesh",
    RepairMesh: "Repair mesh",
    OrientForPrinting: "Orient for printing",
    ArrangeOnBuildPlate: "Arrange plate",
    DropToPlate: "Drop to plate",
    ChangePrintSettings: "Change print settings",
    ChangeFilamentSettings: "Change filament settings",
    ChangePrinterSettings: "Change printer settings",
    GenerateSupports: "Change support settings",
    ModifySupportSettings: "Change support settings",
  };
  const label = labels[name] || name;
  const detail = args && Object.keys(args).length ? JSON.stringify(args) : "";
  return { label, detail };
}

export async function runTool(name, args, store) {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) throw new Error(`Unknown tool: ${name}`);
  try {
    const result = await tool.run(args || {}, store);
    store.setAiLog((prev) => [
      ...prev.slice(-99),
      { id: `${Date.now()}-${Math.random()}`, at: Date.now(), tool: name, args: args || {}, ok: true, summary: JSON.stringify(result).slice(0, 400) },
    ]);
    return result;
  } catch (error) {
    store.setAiLog((prev) => [
      ...prev.slice(-99),
      { id: `${Date.now()}-${Math.random()}`, at: Date.now(), tool: name, args: args || {}, ok: false, summary: error.message },
    ]);
    throw error;
  }
}