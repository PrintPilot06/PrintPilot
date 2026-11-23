/**
 * PrintPilot slicing engine.
 * Slices transformed meshes into per-layer contour loops, generates
 * perimeters, top/bottom skins, sparse infill, supports and adhesion, and
 * emits real printer-ready G-code with computed time and material usage.
 */

import { transformPositions, triangleNormal } from "./mesh";

const QUANT = 1e3;

function qkey(x, y) {
  return `${Math.round(x * QUANT)}_${Math.round(y * QUANT)}`;
}

function signedArea(loop) {
  let a = 0;
  for (let i = 0; i < loop.length; i += 1) {
    const p = loop[i];
    const q = loop[(i + 1) % loop.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

function pointInLoops(x, y, loops) {
  let inside = false;
  for (const loop of loops) {
    for (let i = 0, j = loop.length - 1; i < loop.length; j = i, i += 1) {
      const xi = loop[i][0];
      const yi = loop[i][1];
      const xj = loop[j][0];
      const yj = loop[j][1];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi || 1e-12) + xi) {
        inside = !inside;
      }
    }
  }
  return inside;
}

function pointInTriangle(x, y, a, b, c) {
  const d1 = (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]);
  const d2 = (c[0] - b[0]) * (y - b[1]) - (c[1] - b[1]) * (x - b[0]);
  const d3 = (a[0] - c[0]) * (y - c[1]) - (a[1] - c[1]) * (x - c[0]);
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
}

function offsetLoop(pts, distance) {
  const n = pts.length;
  if (n < 3 || Math.abs(distance) < 1e-9) return pts.map((p) => [p[0], p[1]]);
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const prev = pts[(i - 1 + n) % n];
    const cur = pts[i];
    const next = pts[(i + 1) % n];
    let e1x = cur[0] - prev[0];
    let e1y = cur[1] - prev[1];
    let e2x = next[0] - cur[0];
    let e2y = next[1] - cur[1];
    const l1 = Math.hypot(e1x, e1y) || 1e-9;
    const l2 = Math.hypot(e2x, e2y) || 1e-9;
    e1x /= l1;
    e1y /= l1;
    e2x /= l2;
    e2y /= l2;
    const n1x = -e1y;
    const n1y = e1x;
    const n2x = -e2y;
    const n2y = e2x;
    let bx = n1x + n2x;
    let by = n1y + n2y;
    const bl = Math.hypot(bx, by);
    if (bl < 1e-9) continue;
    bx /= bl;
    by /= bl;
    const cosHalf = Math.max(bx * n1x + by * n1y, 0.35);
    const scale = distance / cosHalf;
    out.push([cur[0] + bx * scale, cur[1] + by * scale]);
  }
  if (out.length < 3) return [];
  if (Math.abs(signedArea(out)) < 0.02) return [];
  return out;
}

export function sliceLayer(tris, planeZ) {
  const segments = [];
  for (const tri of tris) {
    const za = tri.a[2];
    const zb = tri.b[2];
    const zc = tri.c[2];
    const minZ = Math.min(za, zb, zc);
    const maxZ = Math.max(za, zb, zc);
    if (planeZ < minZ - 1e-9 || planeZ > maxZ + 1e-9) continue;
    const pts = [];
    const edges = [
      [tri.a, tri.b],
      [tri.b, tri.c],
      [tri.c, tri.a],
    ];
    for (const [p, q] of edges) {
      const pz = p[2];
      const qz = q[2];
      if ((pz < planeZ && qz > planeZ) || (pz > planeZ && qz < planeZ)) {
        const t = (planeZ - pz) / (qz - pz);
        pts.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
      }
    }
    if (pts.length === 2) {
      const [p0, p1] = pts;
      if (Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) > 1e-5) segments.push([p0, p1]);
    }
  }
  if (!segments.length) return [];

  // chain segments into closed loops
  const starts = new Map();
  for (let i = 0; i < segments.length; i += 1) {
    const key = qkey(segments[i][0][0], segments[i][0][1]);
    const list = starts.get(key);
    if (list) list.push(i);
    else starts.set(key, [i]);
  }
  const used = new Uint8Array(segments.length);
  const loops = [];
  for (let i = 0; i < segments.length; i += 1) {
    if (used[i]) continue;
    const loop = [segments[i][0]];
    let cursor = segments[i][1];
    used[i] = 1;
    let guard = 0;
    while (guard < segments.length + 5) {
      guard += 1;
      const candidates = starts.get(qkey(cursor[0], cursor[1])) || [];
      let nextIdx = -1;
      for (const c of candidates) {
        if (!used[c]) {
          nextIdx = c;
          break;
        }
      }
      if (nextIdx === -1) break;
      used[nextIdx] = 1;
      loop.push(cursor);
      cursor = segments[nextIdx][1];
      if (
        Math.abs(cursor[0] - loop[0][0]) < 1e-4 &&
        Math.abs(cursor[1] - loop[0][1]) < 1e-4
      ) {
        break;
      }
    }
    if (loop.length >= 3) {
      if (signedArea(loop) < 0) loop.reverse();
      loops.push(loop);
    }
  }
  return loops;
}

function clipLines(loops, spacing, angleRad) {
  if (!loops.length) return [];
  const cosA = Math.cos(-angleRad);
  const sinA = Math.sin(-angleRad);
  const rotated = loops.map((loop) =>
    loop.map(([x, y]) => [x * cosA - y * sinA, x * sinA + y * cosA])
  );
  let minY = Infinity;
  let maxY = -Infinity;
  for (const loop of rotated) {
    for (const p of loop) {
      if (p[1] < minY) minY = p[1];
      if (p[1] > maxY) maxY = p[1];
    }
  }
  if (!Number.isFinite(minY)) return [];
  const out = [];
  const cosB = Math.cos(angleRad);
  const sinB = Math.sin(angleRad);
  const start = Math.ceil(minY / spacing) * spacing;
  for (let y = start; y <= maxY; y += spacing) {
    const xs = [];
    for (const loop of rotated) {
      for (let i = 0; i < loop.length; i += 1) {
        const a = loop[i];
        const b = loop[(i + 1) % loop.length];
        if (a[1] > y !== b[1] > y) {
          const t = (y - a[1]) / (b[1] - a[1] || 1e-12);
          xs.push(a[0] + t * (b[0] - a[0]));
        }
      }
    }
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const x0 = xs[k];
      const x1 = xs[k + 1];
      if (x1 - x0 < 0.25) continue;
      out.push([
        [x0 * cosB - y * sinB, x0 * sinB + y * cosB],
        [x1 * cosB - y * sinB, x1 * sinB + y * cosB],
      ]);
    }
  }
  return out;
}

function formatGcodeNumber(v, digits = 3) {
  return Number(v.toFixed(digits)).toString();
}

export function buildTriangleSoup(models) {
  const tris = [];
  let zmin = Infinity;
  let zmax = -Infinity;
  let xmin = Infinity;
  let xmax = -Infinity;
  let ymin = Infinity;
  let ymax = -Infinity;
  for (const model of models) {
    const tp = transformPositions(model.positions, model.transform);
    for (let i = 0; i < model.indices.length; i += 3) {
      const ia = model.indices[i] * 3;
      const ib = model.indices[i + 1] * 3;
      const ic = model.indices[i + 2] * 3;
      const a = [tp[ia], tp[ia + 1], tp[ia + 2]];
      const b = [tp[ib], tp[ib + 1], tp[ib + 2]];
      const c = [tp[ic], tp[ic + 1], tp[ic + 2]];
      const n = triangleNormal(a, b, c);
      if (n[3] < 1e-10) continue;
      tris.push({ a, b, c, n });
      for (const p of [a, b, c]) {
        if (p[2] < zmin) zmin = p[2];
        if (p[2] > zmax) zmax = p[2];
        if (p[0] < xmin) xmin = p[0];
        if (p[0] > xmax) xmax = p[0];
        if (p[1] < ymin) ymin = p[1];
        if (p[1] > ymax) ymax = p[1];
      }
    }
  }
  return { tris, zmin, zmax, xmin, xmax, ymin, ymax };
}

class GcodeEmitter {
  constructor({ settings, filament, printer }) {
    this.settings = settings;
    this.filament = filament;
    this.printer = printer;
    this.lines = [];
    this.segments = [];
    this.x = 0;
    this.y = 0;
    this.z = 0;
    this.e = 0;
    this.length = 0;
    this.time = 0;
    this.layer = 0;
    this.retracted = false;
    this.fanOn = false;
    this.filamentArea = Math.PI * Math.pow((filament.diameter || 1.75) / 2, 2);
  }

  comment(text) {
    this.lines.push(`;${text}`);
  }

  raw(text) {
    this.lines.push(text);
  }

  eFor(distance, lineWidth, height) {
    return (distance * lineWidth * height) / this.filamentArea;
  }

  setLayer(index, zTop, height) {
    this.layer = index;
    this.height = height;
    this.lines.push(`;LAYER:${index}`);
    this.lines.push(`;Z:${formatGcodeNumber(zTop, 3)}`);
    const f = Math.round((this.settings.travelSpeed || 150) * 60);
    this.lines.push(`G1 Z${formatGcodeNumber(zTop, 3)} F${f}`);
    this.z = zTop;
    if (index === 1 && !this.fanOn && this.settings.fanSpeed > 0) {
      this.lines.push(`M106 S${Math.round((this.settings.fanSpeed / 100) * 255)}`);
      this.fanOn = true;
    }
  }

  travelTo(nx, ny, speed) {
    const dist = Math.hypot(nx - this.x, ny - this.y);
    if (dist < 1e-4) return;
    const hop = this.settings.zHop || 0;
    const needRetract = dist > 1.2 && (this.settings.retractionLength || 0) > 0;
    if (needRetract && !this.retracted) {
      this.e -= this.settings.retractionLength;
      this.lines.push(`G1 E${formatGcodeNumber(this.e, 5)} F${Math.round(this.settings.retractionSpeed * 60)}`);
      this.retracted = true;
    }
    if (hop > 0 && needRetract) {
      this.lines.push(`G1 Z${formatGcodeNumber(this.z + hop, 3)} F${Math.round(this.settings.travelSpeed * 60)}`);
    }
    const f = Math.round(speed * 60);
    this.lines.push(`G0 X${formatGcodeNumber(nx)} Y${formatGcodeNumber(ny)} F${f}`);
    if (hop > 0 && needRetract) {
      this.lines.push(`G1 Z${formatGcodeNumber(this.z, 3)} F${Math.round(this.settings.travelSpeed * 60)}`);
    }
    if (needRetract && this.retracted) {
      this.e += this.settings.retractionLength;
      this.lines.push(`G1 E${formatGcodeNumber(this.e, 5)} F${Math.round(this.settings.retractionSpeed * 60)}`);
      this.retracted = false;
    }
    this.segments.push({
      a: [this.x, this.y, this.z],
      b: [nx, ny, this.z],
      t: "travel",
      l: this.layer,
    });
    this.time += dist / Math.max(speed, 1) + 0.01;
    this.x = nx;
    this.y = ny;
  }

  extrudeTo(nx, ny, speed, type, lineWidth) {
    const dist = Math.hypot(nx - this.x, ny - this.y);
    if (dist < 1e-4) return;
    const de = this.eFor(dist, lineWidth, this.height);
    this.e += de;
    this.length += de;
    const f = Math.round(speed * 60);
    this.lines.push(`G1 X${formatGcodeNumber(nx)} Y${formatGcodeNumber(ny)} E${formatGcodeNumber(this.e, 5)} F${f}`);
    this.segments.push({
      a: [this.x, this.y, this.z],
      b: [nx, ny, this.z],
      t: type,
      l: this.layer,
    });
    this.time += dist / Math.max(speed, 1) + 0.008;
    this.x = nx;
    this.y = ny;
  }

  drawLoop(points, speed, type, lineWidth, closed = true) {
    if (points.length < 2) return;
    this.travelTo(points[0][0], points[0][1], this.settings.travelSpeed);
    for (let i = 1; i < points.length; i += 1) {
      this.extrudeTo(points[i][0], points[i][1], speed, type, lineWidth);
    }
    if (closed) {
      this.extrudeTo(points[0][0], points[0][1], speed, type, lineWidth);
    }
  }

  drawSegment(seg, speed, type, lineWidth) {
    this.travelTo(seg[0][0], seg[0][1], this.settings.travelSpeed);
    this.extrudeTo(seg[1][0], seg[1][1], speed, type, lineWidth);
  }
}

function buildSupportCells(tris, settings, bounds) {
  if (!settings.supports) return null;
  const cosLimit = Math.cos(((settings.supportAngle || 45) * Math.PI) / 180);
  const cell = 4;
  const map = new Map();
  let found = false;
  for (const tri of tris) {
    if (tri.n[2] >= -cosLimit) continue;
    const minZ = Math.min(tri.a[2], tri.b[2], tri.c[2]);
    if (minZ < settings.firstLayerHeight + 0.05) continue;
    const minX = Math.min(tri.a[0], tri.b[0], tri.c[0]);
    const maxX = Math.max(tri.a[0], tri.b[0], tri.c[0]);
    const minY = Math.min(tri.a[1], tri.b[1], tri.c[1]);
    const maxY = Math.max(tri.a[1], tri.b[1], tri.c[1]);
    for (let x = Math.floor(minX / cell) * cell; x <= maxX; x += cell) {
      for (let y = Math.floor(minY / cell) * cell; y <= maxY; y += cell) {
        if (!pointInTriangle(x + cell / 2, y + cell / 2, tri.a, tri.b, tri.c)) continue;
        const key = `${x}_${y}`;
        const prev = map.get(key);
        if (prev === undefined || minZ < prev) {
          map.set(key, minZ);
          found = true;
        }
      }
    }
  }
  if (!found) return null;
  const cells = [];
  for (const [key, topZ] of map) {
    const [sx, sy] = key.split("_").map(Number);
    if (sx < bounds.xmin - cell || sx > bounds.xmax || sy < bounds.ymin - cell || sy > bounds.ymax) continue;
    cells.push({ x: sx + cell / 2, y: sy + cell / 2, topZ, size: cell });
  }
  return cells;
}

export function slicePlate({ models, printer, filament, settings }) {
  const lineWidth = settings.lineWidth || (printer.nozzle_diameter || 0.4) * 1.125;
  const soup = buildTriangleSoup(models);
  if (!soup.tris.length) throw new Error("Nothing to slice — the plate has no mesh geometry.");
  if (soup.zmax <= 0) throw new Error("The model sits below the build plate. Drop it to the plate first.");

  const firstLayerHeight = settings.firstLayerHeight || settings.layerHeight;
  const layers = [];
  let top = 0;
  let guard = 0;
  while (top < soup.zmax - 1e-6 && guard < 6000) {
    guard += 1;
    const height = layers.length === 0 ? firstLayerHeight : settings.layerHeight;
    top = Number((top + height).toFixed(6));
    layers.push({ index: layers.length, top, height, plane: top - height / 2 });
  }

  const contours = layers.map((layer) => sliceLayer(soup.tris, layer.plane));

  const emitter = new GcodeEmitter({ settings, filament, printer });
  const e = emitter;

  const nozzleTemp = settings.nozzleTemp || filament.nozzle_temp || 210;
  const bedTemp = settings.bedTemp || filament.bed_temp || 60;
  const firstNozzle = settings.firstLayerNozzleTemp || filament.first_layer_nozzle_temp || nozzleTemp;
  const firstBed = settings.firstLayerBedTemp || filament.first_layer_bed_temp || bedTemp;

  e.comment("Generated by PrintPilot — slicing engine output");
  e.comment(`Printer: ${printer.name} | Nozzle: ${printer.nozzle_diameter} mm | Filament: ${filament.name}`);
  e.comment(`Layer height: ${settings.layerHeight} mm | Walls: ${settings.wallCount} | Infill: ${settings.infillDensity}%`);
  e.raw(`M140 S${firstBed}`);
  e.raw(`M104 S${firstNozzle}`);
  e.raw("G21 ; units mm");
  e.raw("G90 ; absolute positioning");
  e.raw("M82 ; absolute extrusion");
  if (printer.start_gcode && printer.start_gcode.trim()) {
    for (const line of printer.start_gcode.split(/\r?\n/)) e.raw(line);
  } else {
    e.raw("G28 ; home all axes");
    e.raw("G92 E0");
    e.raw("G1 Z2 F600");
  }
  e.raw(`M190 S${firstBed}`);
  e.raw(`M109 S${firstNozzle}`);
  e.raw("G92 E0");

  const supportCells = buildSupportCells(soup.tris, settings, soup);
  const warnings = [];
  if (supportCells === null && settings.supports) {
    warnings.push("Supports are on but no overhang needed support at the current angle.");
  }
  if (soup.zmin < -0.05) warnings.push("Part of the model sits below the build plate.");
  if (soup.xmin < -printer.build_x / 2 - 0.01 || soup.xmax > printer.build_x / 2 + 0.01) {
    warnings.push("Model extends beyond the build plate on the X axis.");
  }
  if (soup.ymin < -printer.build_y / 2 - 0.01 || soup.ymax > printer.build_y / 2 + 0.01) {
    warnings.push("Model extends beyond the build plate on the Y axis.");
  }
  if (soup.zmax > printer.build_z + 0.01) warnings.push("Model is taller than the build volume.");

  let layerCount = 0;
  for (let li = 0; li < layers.length; li += 1) {
    const layer = layers[li];
    const loops = contours[li];
    const above = li + 1 < contours.length ? contours[li + 1] : [];
    const below = li > 0 ? contours[li - 1] : [];

    const isFirst = li === 0;
    const height = layer.height;
    const zTop = layer.top;
    const speed = isFirst ? settings.firstLayerSpeed : settings.printSpeed;

    const innerLoops = loops.map((loop) => {
      const shrunk = offsetLoop(loop, -settings.wallCount * lineWidth);
      return shrunk.length >= 3 ? shrunk : [];
    }).filter((l) => l.length >= 3);

    const hasSupport = supportCells
      ? supportCells.some((c) => c.topZ > zTop + 0.2 && !pointInLoops(c.x, c.y, loops))
      : false;

    if (!loops.length && !hasSupport) continue;

    layerCount += 1;
    e.setLayer(layer.index, zTop, height);

    // skirt / brim on the first layer
    if (isFirst && settings.adhesion !== "none" && loops.length) {
      const outer = loops
        .filter((loop) => !loops.some((other) => other !== loop && pointInLoops(loop[0][0], loop[0][1], [other])))
        .sort((a, b) => Math.abs(signedArea(b)) - Math.abs(signedArea(a)));
      const target = outer[0] || loops[0];
      if (settings.adhesion === "skirt") {
        for (let k = 1; k <= (settings.skirtLoops || 2); k += 1) {
          const ring = offsetLoop(target, -(settings.skirtDistance + k * lineWidth));
          if (ring.length >= 3) {
            e.comment("TYPE:Skirt");
            e.drawLoop(ring, settings.firstLayerSpeed, "skirt", lineWidth);
          }
        }
      } else {
        const brimLoops = Math.max(1, Math.round((settings.brimWidth || 5) / lineWidth));
        for (let k = 1; k <= brimLoops; k += 1) {
          const ring = offsetLoop(target, -(k * lineWidth));
          if (ring.length >= 3) {
            e.comment("TYPE:Brim");
            e.drawLoop(ring, settings.firstLayerSpeed, "skirt", lineWidth);
          }
        }
      }
    }

    // perimeters: inner walls first, outer wall last
    if (loops.length) {
      for (let k = settings.wallCount - 1; k >= 0; k -= 1) {
        e.comment(k === 0 ? "TYPE:Outer wall" : "TYPE:Inner wall");
        for (const loop of loops) {
          const off = offsetLoop(loop, -(k + 0.5) * lineWidth);
          if (off.length < 3) continue;
          const ordered = rotateLoopForSeam(off, settings.seam);
          e.drawLoop(ordered, isFirst ? settings.firstLayerSpeed : settings.outerWallSpeed, "wall", lineWidth);
        }
      }
    }

    // infill / skins
    if (innerLoops.length) {
      const areaNow = Math.abs(loops.reduce((sum, l) => sum + signedArea(l), 0));
      const areaAbove = Math.abs(above.reduce((sum, l) => sum + signedArea(l), 0));
      const areaBelow = Math.abs(below.reduce((sum, l) => sum + signedArea(l), 0));
      const needsTopSkin = li === layers.length - 1 || areaNow < areaAbove * 0.995;
      const needsBottomSkin =
        li < settings.bottomLayers || (li > 0 && areaNow < areaBelow * 0.995) || isFirst;
      const density = Math.min(Math.max(settings.infillDensity || 0, 0), 100) / 100;
      const sparseSpacing =
        density > 0.01
          ? Math.max(((settings.infillPattern === "grid" ? 2 : 1) * lineWidth) / density, lineWidth)
          : 0;
      const denseSpacing = lineWidth * 0.98;

      const insideAbove = (pt) => (above.length ? pointInLoops(pt[0], pt[1], above) : false);
      const insideBelow = (pt) => (below.length ? pointInLoops(pt[0], pt[1], below) : true);

      if (needsTopSkin || needsBottomSkin) {
        const patterns = settings.infillPattern === "lines" ? [Math.PI / 4] : [0, Math.PI / 2];
        e.comment("TYPE:Solid infill");
        for (const angle of patterns) {
          for (const seg of clipLines(innerLoops, denseSpacing, angle)) {
            const mid = [(seg[0][0] + seg[1][0]) / 2, (seg[0][1] + seg[1][1]) / 2];
            const isTop = !insideAbove(mid);
            const isBottom = !insideBelow(mid) || li < settings.bottomLayers || isFirst;
            if (!isTop && !isBottom) continue;
            e.drawSegment(seg, settings.infillSpeed, "solid", lineWidth);
          }
        }
      }

      if (density > 0.01) {
        e.comment("TYPE:Sparse infill");
        if (settings.infillPattern === "concentric") {
          let k = 1;
          let rings = innerLoops.map((l) => offsetLoop(l, -(k * sparseSpacing)));
          while (rings.some((r) => r.length >= 3) && k < 200) {
            for (const ring of rings) {
              if (ring.length >= 3) e.drawLoop(ring, settings.infillSpeed, "infill", lineWidth);
            }
            k += 1;
            rings = rings.map((r) => (r.length >= 3 ? offsetLoop(r, -sparseSpacing) : r));
          }
        } else {
          const angle = li % 2 === 0 ? Math.PI / 4 : -Math.PI / 4;
          const angles = settings.infillPattern === "grid" ? [angle, angle + Math.PI / 2] : [angle];
          for (const a of angles) {
            for (const seg of clipLines(innerLoops, sparseSpacing, a)) {
              const mid = [(seg[0][0] + seg[1][0]) / 2, (seg[0][1] + seg[1][1]) / 2];
              if (!insideAbove(mid) && !(li < settings.bottomLayers)) continue;
              if (!insideBelow(mid) && !isFirst) continue;
              e.drawSegment(seg, settings.infillSpeed, "infill", lineWidth);
            }
          }
        }
      }
    }

    // supports
    if (supportCells) {
      e.comment("TYPE:Support");
      for (const cell of supportCells) {
        if (cell.topZ <= zTop + 0.2) continue;
        if (pointInLoops(cell.x, cell.y, loops)) continue;
        const h = cell.size / 2;
        const square = [
          [cell.x - h, cell.y - h],
          [cell.x + h, cell.y - h],
          [cell.x + h, cell.y + h],
          [cell.x - h, cell.y + h],
        ];
        e.drawLoop(square, Math.min(settings.supportSpeed || 60, settings.printSpeed), "support", lineWidth);
      }
    }
  }

  if (printer.end_gcode && printer.end_gcode.trim()) {
    for (const line of printer.end_gcode.split(/\r?\n/)) e.raw(line);
  } else {
    e.raw("G91");
    e.raw("G1 Z10 F600");
    e.raw("G90");
    e.raw("M104 S0");
    e.raw("M140 S0");
    e.raw("M84");
  }
  e.comment(`PrintPilot estimated print time: ${Math.round(e.time)}s`);

  const filamentGrams = (e.length * e.filamentArea * (filament.density || 1.24)) / 1000;
  const timeSeconds = Math.round(e.time * 1.08 + layers.length * 1.2);

  return {
    layers,
    contours,
    segments: e.segments,
    gcode: `${e.lines.join("\n")}\n`,
    stats: {
      layerCount,
      totalLayers: layers.length,
      timeSeconds,
      filamentLength: Math.round(e.length),
      filamentGrams: Number(filamentGrams.toFixed(2)),
      maxZ: Number(soup.zmax.toFixed(2)),
      lineWidth,
      bounds: {
        xmin: soup.xmin,
        xmax: soup.xmax,
        ymin: soup.ymin,
        ymax: soup.ymax,
      },
    },
    warnings,
  };
}

function rotateLoopForSeam(loop, seam) {
  if (loop.length < 3 || seam === "random") return loop;
  let bestIndex = 0;
  let bestValue = -Infinity;
  for (let i = 0; i < loop.length; i += 1) {
    const p = loop[i];
    const value = seam === "front" ? -p[1] : p[1] + Math.abs(p[0]) * 0.001;
    if (value > bestValue) {
      bestValue = value;
      bestIndex = i;
    }
  }
  return [...loop.slice(bestIndex), ...loop.slice(0, bestIndex)];
}

export function formatDuration(seconds) {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}