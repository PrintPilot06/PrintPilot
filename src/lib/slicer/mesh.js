/**
 * Mesh geometry utilities for PrintPilot: bounds, analysis, repair,
 * orientation search, boolean-free cut, decimation.
 * Pure functions over (positions, indices) typed arrays.
 */

export function computeBounds(positions) {
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i];
    const y = positions[i + 1];
    const z = positions[i + 2];
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    if (z > maxZ) maxZ = z;
  }
  if (!Number.isFinite(minX)) {
    return { min: [0, 0, 0], max: [0, 0, 0], size: [0, 0, 0], center: [0, 0, 0] };
  }
  return {
    min: [minX, minY, minZ],
    max: [maxX, maxY, maxZ],
    size: [maxX - minX, maxY - minY, maxZ - minZ],
    center: [(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2],
  };
}

export function triangleNormal(a, b, c) {
  const ux = b[0] - a[0];
  const uy = b[1] - a[1];
  const uz = b[2] - a[2];
  const vx = c[0] - a[0];
  const vy = c[1] - a[1];
  const vz = c[2] - a[2];
  const nx = uy * vz - uz * vy;
  const ny = uz * vx - ux * vz;
  const nz = ux * vy - uy * vx;
  const len = Math.hypot(nx, ny, nz) || 1;
  return [nx / len, ny / len, nz / len, len / 2];
}

function rotationMatrix(deg) {
  const rx = (deg[0] * Math.PI) / 180;
  const ry = (deg[1] * Math.PI) / 180;
  const rz = (deg[2] * Math.PI) / 180;
  const cx = Math.cos(rx);
  const sx = Math.sin(rx);
  const cy = Math.cos(ry);
  const sy = Math.sin(ry);
  const cz = Math.cos(rz);
  const sz = Math.sin(rz);
  // R = Rx * Ry * Rz  (matches the viewport's XYZ euler order)
  return [
    cy * cz, -cy * sz, sy,
    cx * sz + sx * sy * cz, cx * cz - sx * sy * sz, -sx * cy,
    sx * sz - cx * sy * cz, sx * cz + cx * sy * sz, cx * cy,
  ];
}

export function transformPositions(positions, t = {}) {
  const scale = t.scale || [1, 1, 1];
  const rotation = t.rotation || [0, 0, 0];
  const position = t.position || [0, 0, 0];
  const mirrorX = t.mirrorX ? -1 : 1;
  const m = rotationMatrix(rotation);
  const out = new Float32Array(positions.length);
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i] * scale[0] * mirrorX;
    const y = positions[i + 1] * scale[1];
    const z = positions[i + 2] * scale[2];
    out[i] = m[0] * x + m[1] * y + m[2] * z + position[0];
    out[i + 1] = m[3] * x + m[4] * y + m[5] * z + position[1];
    out[i + 2] = m[6] * x + m[7] * y + m[8] * z + position[2];
  }
  return out;
}

export function signedVolume(positions, indices) {
  let v = 0;
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i] * 3;
    const b = indices[i + 1] * 3;
    const c = indices[i + 2] * 3;
    const ax = positions[a];
    const ay = positions[a + 1];
    const az = positions[a + 2];
    const bx = positions[b];
    const by = positions[b + 1];
    const bz = positions[b + 2];
    const cx = positions[c];
    const cy = positions[c + 1];
    const cz = positions[c + 2];
    v += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
  }
  return v;
}

function weld(positions, indices) {
  const map = new Map();
  const out = [];
  const remap = new Int32Array(positions.length / 3);
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i];
    const y = positions[i + 1];
    const z = positions[i + 2];
    const key = `${Math.round(x * 1e4)}_${Math.round(y * 1e4)}_${Math.round(z * 1e4)}`;
    let id = map.get(key);
    if (id === undefined) {
      id = out.length / 3;
      out.push(x, y, z);
      map.set(key, id);
    }
    remap[i / 3] = id;
  }
  const newIndices = new Uint32Array(indices.length);
  for (let i = 0; i < indices.length; i += 1) newIndices[i] = remap[indices[i]];
  return { positions: new Float32Array(out), indices: newIndices };
}

export function analyzeMesh(positions, indices, overhangAngle = 45) {
  const bounds = computeBounds(positions);
  const triCount = indices.length / 3;
  const w = weld(positions, indices);
  const edges = new Map();
  const faces = new Set();
  let area = 0;
  let overhangArea = 0;
  let degenerate = 0;
  let duplicateFaces = 0;
  const cosLimit = Math.cos((overhangAngle * Math.PI) / 180);

  for (let t = 0; t < triCount; t += 1) {
    const i0 = w.indices[t * 3];
    const i1 = w.indices[t * 3 + 1];
    const i2 = w.indices[t * 3 + 2];
    if (i0 === i1 || i1 === i2 || i0 === i2) {
      degenerate += 1;
      continue;
    }
    const a = [w.positions[i0 * 3], w.positions[i0 * 3 + 1], w.positions[i0 * 3 + 2]];
    const b = [w.positions[i1 * 3], w.positions[i1 * 3 + 1], w.positions[i1 * 3 + 2]];
    const c = [w.positions[i2 * 3], w.positions[i2 * 3 + 1], w.positions[i2 * 3 + 2]];
    const n = triangleNormal(a, b, c);
    if (n[3] < 1e-9) {
      degenerate += 1;
      continue;
    }
    area += n[3];
    if (n[2] < -cosLimit) overhangArea += n[3];

    const faceKey = [i0, i1, i2].sort((p, q) => p - q).join("-");
    if (faces.has(faceKey)) duplicateFaces += 1;
    else faces.add(faceKey);

    const tri = [i0, i1, i2];
    for (let e = 0; e < 3; e += 1) {
      const u = tri[e];
      const v = tri[(e + 1) % 3];
      const key = u < v ? `${u}-${v}` : `${v}-${u}`;
      const entry = edges.get(key);
      if (entry) entry.count += 1;
      else edges.set(key, { count: 1, u, v });
    }
  }

  let boundaryEdges = 0;
  let nonManifoldEdges = 0;
  for (const entry of edges.values()) {
    if (entry.count === 1) boundaryEdges += 1;
    else if (entry.count > 2) nonManifoldEdges += 1;
  }

  // connected components (union-find over welded vertices)
  const parent = new Int32Array(w.positions.length / 3);
  for (let i = 0; i < parent.length; i += 1) parent[i] = i;
  const find = (x) => {
    let r = x;
    while (parent[r] !== r) r = parent[r];
    while (parent[x] !== r) {
      const next = parent[x];
      parent[x] = r;
      x = next;
    }
    return r;
  };
  const union = (x, y) => {
    const rx = find(x);
    const ry = find(y);
    if (rx !== ry) parent[ry] = rx;
  };
  for (let t = 0; t < triCount; t += 1) {
    const i0 = w.indices[t * 3];
    const i1 = w.indices[t * 3 + 1];
    const i2 = w.indices[t * 3 + 2];
    union(i0, i1);
    union(i1, i2);
  }
  const roots = new Set();
  for (let t = 0; t < triCount; t += 1) roots.add(find(w.indices[t * 3]));

  const volume = signedVolume(positions, indices);

  return {
    triCount,
    vertexCount: w.positions.length / 3,
    bounds,
    area,
    volume: Math.abs(volume),
    invertedNormals: volume < 0,
    boundaryEdges,
    nonManifoldEdges,
    degenerate,
    duplicateFaces,
    components: roots.size,
    overhangArea,
    overhangPercent: area > 0 ? (overhangArea / area) * 100 : 0,
    isWatertight: boundaryEdges === 0 && nonManifoldEdges === 0,
  };
}

export function diagnose(analysis, plate) {
  const issues = [];
  if (analysis.nonManifoldEdges > 0) {
    issues.push({
      id: "non-manifold",
      severity: "error",
      title: "Non-manifold edges",
      detail: `${analysis.nonManifoldEdges} edges are shared by more than two faces. Slicers cannot decide which side is solid.`,
    });
  }
  if (analysis.boundaryEdges > 0) {
    issues.push({
      id: "holes",
      severity: "error",
      title: "Open boundaries (holes)",
      detail: `${analysis.boundaryEdges} edges have no neighbouring face, so the surface is not closed.`,
    });
  }
  if (analysis.invertedNormals) {
    issues.push({
      id: "normals",
      severity: "error",
      title: "Inverted normals",
      detail: "The mesh encloses negative volume — faces point inward and the model would slice as a void.",
    });
  }
  if (analysis.degenerate > 0) {
    issues.push({
      id: "degenerate",
      severity: "warning",
      title: "Degenerate triangles",
      detail: `${analysis.degenerate} zero-area triangles can produce stray moves.`,
    });
  }
  if (analysis.duplicateFaces > 0) {
    issues.push({
      id: "duplicate",
      severity: "warning",
      title: "Duplicate faces",
      detail: `${analysis.duplicateFaces} faces appear more than once, which doubles extrusion in those spots.`,
    });
  }
  if (analysis.components > 1) {
    issues.push({
      id: "components",
      severity: "info",
      title: "Multiple shells",
      detail: `${analysis.components} disconnected shells. Loose shells can detach mid-print.`,
    });
  }
  if (analysis.overhangPercent > 12) {
    issues.push({
      id: "overhang",
      severity: "warning",
      title: "Heavy overhangs",
      detail: `${analysis.overhangPercent.toFixed(1)}% of the surface area overhangs beyond 45°, so supports or a better orientation will help.`,
    });
  }
  const size = analysis.bounds.size;
  if (plate && (size[0] > plate.x + 0.01 || size[1] > plate.y + 0.01 || size[2] > plate.z + 0.01)) {
    issues.push({
      id: "bounds",
      severity: "error",
      title: "Larger than the build volume",
      detail: `Model is ${size.map((v) => v.toFixed(1)).join(" × ")} mm but the plate allows ${plate.x} × ${plate.y} × ${plate.z} mm.`,
    });
  }
  return issues;
}

function earClip(points2d) {
  const n = points2d.length;
  if (n < 3) return [];
  let area = 0;
  for (let i = 0; i < n; i += 1) {
    const p = points2d[i];
    const q = points2d[(i + 1) % n];
    area += p[0] * q[1] - q[0] * p[1];
  }
  const order = points2d.map((_, i) => i);
  const reversed = area < 0;
  if (reversed) order.reverse();
  const tris = [];
  let guard = 0;
  while (order.length > 3 && guard < 20000) {
    guard += 1;
    let clipped = false;
    for (let i = 0; i < order.length; i += 1) {
      const i0 = order[(i - 1 + order.length) % order.length];
      const i1 = order[i];
      const i2 = order[(i + 1) % order.length];
      const a = points2d[i0];
      const b = points2d[i1];
      const c = points2d[i2];
      const cross = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
      if (cross <= 1e-10) continue;
      let blocked = false;
      for (const j of order) {
        if (j === i0 || j === i1 || j === i2) continue;
        const p = points2d[j];
        const d1 = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
        const d2 = (c[0] - b[0]) * (p[1] - b[1]) - (c[1] - b[1]) * (p[0] - b[0]);
        const d3 = (a[0] - c[0]) * (p[1] - c[1]) - (a[1] - c[1]) * (p[0] - c[0]);
        if (d1 >= 0 && d2 >= 0 && d3 >= 0) {
          blocked = true;
          break;
        }
      }
      if (blocked) continue;
      tris.push([i0, i1, i2]);
      order.splice(i, 1);
      clipped = true;
      break;
    }
    if (!clipped) break;
  }
  if (order.length === 3) tris.push([order[0], order[1], order[2]]);
  return reversed ? tris.map((t) => [t[0], t[2], t[1]]) : tris;
}

function fillHoles(positions, indices) {
  const w = weld(positions, indices);
  const counts = new Map();
  const directed = new Map();
  for (let t = 0; t < w.indices.length; t += 3) {
    const tri = [w.indices[t], w.indices[t + 1], w.indices[t + 2]];
    for (let e = 0; e < 3; e += 1) {
      const u = tri[e];
      const v = tri[(e + 1) % 3];
      const key = u < v ? `${u}-${v}` : `${v}-${u}`;
      counts.set(key, (counts.get(key) || 0) + 1);
      directed.set(`${u}-${v}`, [u, v]);
    }
  }
  const boundary = new Map();
  for (const [key, count] of counts) {
    if (count !== 1) continue;
    for (const [dkey, pair] of directed) {
      const a = pair[0];
      const b = pair[1];
      const k = a < b ? `${a}-${b}` : `${b}-${a}`;
      if (k === key) {
        boundary.set(`${a}-${b}`, [a, b]);
        break;
      }
    }
  }
  if (!boundary.size) return { positions: w.positions, indices: w.indices, filled: 0 };

  const loops = [];
  const used = new Set();
  for (const startKey of boundary.keys()) {
    if (used.has(startKey)) continue;
    const loop = [];
    let current = boundary.get(startKey);
    let guard = 0;
    while (current && guard < 100000) {
      guard += 1;
      const key = `${current[0]}-${current[1]}`;
      if (used.has(key)) break;
      used.add(key);
      loop.push(current[0]);
      let next = null;
      for (const [k, pair] of boundary) {
        if (used.has(k)) continue;
        if (pair[0] === current[1]) {
          next = pair;
          break;
        }
      }
      current = next;
    }
    if (loop.length >= 3) loops.push(loop);
  }

  const extra = [];
  for (const loop of loops) {
    const pts = loop.map((id) => [
      w.positions[id * 3],
      w.positions[id * 3 + 1],
      w.positions[id * 3 + 2],
    ]);
    let nx = 0;
    let ny = 0;
    let nz = 0;
    for (let i = 0; i < pts.length; i += 1) {
      const p = pts[i];
      const q = pts[(i + 1) % pts.length];
      nx += (p[1] - q[1]) * (p[2] + q[2]);
      ny += (p[2] - q[2]) * (p[0] + q[0]);
      nz += (p[0] - q[0]) * (p[1] + q[1]);
    }
    const ax = Math.abs(nx);
    const ay = Math.abs(ny);
    const az = Math.abs(nz);
    let drop = 2;
    if (ax >= ay && ax >= az) drop = 0;
    else if (ay >= az) drop = 1;
    const project = (p) => (drop === 0 ? [p[1], p[2]] : drop === 1 ? [p[2], p[0]] : [p[0], p[1]]);
    const flat = pts.map(project);
    const tris = earClip(flat);
    for (const tri of tris) {
      extra.push(loop[tri[0]], loop[tri[1]], loop[tri[2]]);
    }
  }

  const outIndices = new Uint32Array(w.indices.length + extra.length);
  outIndices.set(w.indices, 0);
  outIndices.set(extra, w.indices.length);
  return { positions: w.positions, indices: outIndices, filled: loops.length };
}

export function repairMesh(positions, indices) {
  const w = weld(positions, indices);
  const kept = [];
  const seen = new Set();
  for (let t = 0; t < w.indices.length; t += 3) {
    const i0 = w.indices[t];
    const i1 = w.indices[t + 1];
    const i2 = w.indices[t + 2];
    if (i0 === i1 || i1 === i2 || i0 === i2) continue;
    const a = [w.positions[i0 * 3], w.positions[i0 * 3 + 1], w.positions[i0 * 3 + 2]];
    const b = [w.positions[i1 * 3], w.positions[i1 * 3 + 1], w.positions[i1 * 3 + 2]];
    const c = [w.positions[i2 * 3], w.positions[i2 * 3 + 1], w.positions[i2 * 3 + 2]];
    const n = triangleNormal(a, b, c);
    if (n[3] < 1e-9) continue;
    const key = [i0, i1, i2].sort((p, q) => p - q).join("-");
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(i0, i1, i2);
  }
  let idx = new Uint32Array(kept);

  // Consistent orientation via edge-direction propagation.
  const edgeMap = new Map();
  for (let t = 0; t < idx.length; t += 3) {
    for (let e = 0; e < 3; e += 1) {
      const u = idx[t + e];
      const v = idx[t + ((e + 1) % 3)];
      const key = u < v ? `${u}-${v}` : `${v}-${u}`;
      const dir = u < v ? 1 : -1;
      const list = edgeMap.get(key);
      if (list) list.push({ tri: t / 3, dir });
      else edgeMap.set(key, [{ tri: t / 3, dir }]);
    }
  }
  const flips = new Int8Array(idx.length / 3).fill(-1);
  const queue = [];
  for (let t = 0; t < idx.length / 3; t += 1) {
    if (flips[t] !== -1) continue;
    flips[t] = 0;
    queue.push(t);
    while (queue.length) {
      const cur = queue.pop();
      for (let e = 0; e < 3; e += 1) {
        let u = idx[cur * 3 + e];
        let v = idx[cur * 3 + ((e + 1) % 3)];
        if (flips[cur] === 1) [u, v] = [v, u];
        const key = u < v ? `${u}-${v}` : `${v}-${u}`;
        const dir = u < v ? 1 : -1;
        const list = edgeMap.get(key) || [];
        for (const entry of list) {
          if (entry.tri === cur || flips[entry.tri] !== -1) continue;
          flips[entry.tri] = entry.dir === dir ? 1 : 0;
          queue.push(entry.tri);
        }
      }
    }
  }
  const oriented = new Uint32Array(idx.length);
  for (let t = 0; t < idx.length / 3; t += 1) {
    oriented[t * 3] = idx[t * 3];
    if (flips[t] === 1) {
      oriented[t * 3 + 1] = idx[t * 3 + 2];
      oriented[t * 3 + 2] = idx[t * 3 + 1];
    } else {
      oriented[t * 3 + 1] = idx[t * 3 + 1];
      oriented[t * 3 + 2] = idx[t * 3 + 2];
    }
  }
  idx = oriented;

  const filled = fillHoles(w.positions, idx);
  let finalIndices = filled.indices;
  let finalPositions = filled.positions;
  if (signedVolume(finalPositions, finalIndices) < 0) {
    const flipped = new Uint32Array(finalIndices.length);
    for (let t = 0; t < finalIndices.length; t += 3) {
      flipped[t] = finalIndices[t];
      flipped[t + 1] = finalIndices[t + 2];
      flipped[t + 2] = finalIndices[t + 1];
    }
    finalIndices = flipped;
  }
  return {
    positions: finalPositions,
    indices: finalIndices,
    filledLoops: filled.filled,
    removed: positions.length / 9 - finalIndices.length / 3,
  };
}

export function clipMeshByPlane(positions, indices, planeZ, keepLower) {
  const out = [];
  const pushTri = (a, b, c) => out.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
  for (let t = 0; t < indices.length; t += 3) {
    const v = [0, 1, 2].map((k) => {
      const i = indices[t + k] * 3;
      return [positions[i], positions[i + 1], positions[i + 2]];
    });
    const keep = (p) => (keepLower ? p[2] <= planeZ : p[2] >= planeZ);
    const inside = v.filter(keep);
    const outside = v.filter((p) => !keep(p));
    if (inside.length === 3) {
      pushTri(v[0], v[1], v[2]);
    } else if (inside.length === 1 && outside.length === 2) {
      const a = inside[0];
      const i1 = intersectPlane(a, outside[0], planeZ);
      const i2 = intersectPlane(a, outside[1], planeZ);
      pushTri(a, i1, i2);
    } else if (inside.length === 2 && outside.length === 1) {
      const [a, b] = inside;
      const i1 = intersectPlane(a, outside[0], planeZ);
      const i2 = intersectPlane(b, outside[0], planeZ);
      pushTri(a, b, i1);
      pushTri(b, i2, i1);
    }
  }
  const positionsOut = new Float32Array(out);
  const indicesOut = new Uint32Array(positionsOut.length / 3);
  for (let i = 0; i < indicesOut.length; i += 1) indicesOut[i] = i;
  const capped = fillHoles(positionsOut, indicesOut);
  return { positions: capped.positions, indices: capped.indices };
}

function intersectPlane(a, b, planeZ) {
  const t = (planeZ - a[2]) / (b[2] - a[2] || 1e-9);
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, planeZ];
}

export function splitComponents(positions, indices) {
  const w = weld(positions, indices);
  const parent = new Int32Array(w.positions.length / 3);
  for (let i = 0; i < parent.length; i += 1) parent[i] = i;
  const find = (x) => {
    let r = x;
    while (parent[r] !== r) r = parent[r];
    while (parent[x] !== r) {
      const next = parent[x];
      parent[x] = r;
      x = next;
    }
    return r;
  };
  for (let t = 0; t < w.indices.length; t += 3) {
    const a = find(w.indices[t]);
    const b = find(w.indices[t + 1]);
    const c = find(w.indices[t + 2]);
    parent[b] = a;
    parent[c] = a;
  }
  const groups = new Map();
  for (let t = 0; t < w.indices.length; t += 3) {
    const root = find(w.indices[t]);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(w.indices[t], w.indices[t + 1], w.indices[t + 2]);
  }
  const parts = [];
  for (const triList of groups.values()) {
    const remap = new Map();
    const pos = [];
    const idx = [];
    for (const oldIndex of triList) {
      let ni = remap.get(oldIndex);
      if (ni === undefined) {
        ni = pos.length / 3;
        remap.set(oldIndex, ni);
        pos.push(
          w.positions[oldIndex * 3],
          w.positions[oldIndex * 3 + 1],
          w.positions[oldIndex * 3 + 2]
        );
      }
      idx.push(ni);
    }
    if (idx.length >= 9) {
      parts.push({ positions: new Float32Array(pos), indices: new Uint32Array(idx) });
    }
  }
  return parts.sort((a, b) => b.indices.length - a.indices.length);
}

export function simplifyMesh(positions, indices, cellSize) {
  const bounds = computeBounds(positions);
  const diag = Math.hypot(bounds.size[0], bounds.size[1], bounds.size[2]) || 1;
  const cell = Math.max(cellSize || diag * 0.01, 1e-4);
  const map = new Map();
  const pos = [];
  const remap = new Int32Array(positions.length / 3);
  for (let i = 0; i < positions.length; i += 3) {
    const gx = Math.round(positions[i] / cell);
    const gy = Math.round(positions[i + 1] / cell);
    const gz = Math.round(positions[i + 2] / cell);
    const key = `${gx}_${gy}_${gz}`;
    let id = map.get(key);
    if (id === undefined) {
      id = pos.length / 3;
      pos.push(gx * cell, gy * cell, gz * cell);
      map.set(key, id);
    }
    remap[i / 3] = id;
  }
  const idx = [];
  for (let t = 0; t < indices.length; t += 3) {
    const a = remap[indices[t]];
    const b = remap[indices[t + 1]];
    const c = remap[indices[t + 2]];
    if (a === b || b === c || a === c) continue;
    idx.push(a, b, c);
  }
  return { positions: new Float32Array(pos), indices: new Uint32Array(idx) };
}

const ORIENTATIONS = [
  { label: "As imported", rotation: [0, 0, 0] },
  { label: "Lay on front face", rotation: [90, 0, 0] },
  { label: "Upside down", rotation: [180, 0, 0] },
  { label: "Lay on back face", rotation: [-90, 0, 0] },
  { label: "Lay on right face", rotation: [0, 0, 90] },
  { label: "Lay on left face", rotation: [0, 0, -90] },
];

export function bestOrientation(positions, indices, overhangAngle = 45) {
  let best = null;
  for (const candidate of ORIENTATIONS) {
    const rotated = transformPositions(positions, { rotation: candidate.rotation, scale: [1, 1, 1] });
    const analysis = analyzeMesh(rotated, indices, overhangAngle);
    const height = analysis.bounds.size[2];
    const footprint = analysis.bounds.size[0] * analysis.bounds.size[1];
    const score = analysis.overhangArea * 1.0 + height * 12 - footprint * 0.02;
    if (!best || score < best.score) {
      best = { ...candidate, score, overhangArea: analysis.overhangArea, height, analysis };
    }
  }
  return best;
}