/** Small procedural meshes used for the local preview model. */

export function boxMesh(w, d, h, cx = 0, cy = 0, cz = 0) {
  const x0 = cx - w / 2;
  const x1 = cx + w / 2;
  const y0 = cy - d / 2;
  const y1 = cy + d / 2;
  const z0 = cz;
  const z1 = cz + h;
  const p = [
    [x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0],
    [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1],
  ];
  const faces = [
    [0, 2, 1], [0, 3, 2],
    [4, 5, 6], [4, 6, 7],
    [0, 1, 5], [0, 5, 4],
    [1, 2, 6], [1, 6, 5],
    [2, 3, 7], [2, 7, 6],
    [3, 0, 4], [3, 4, 7],
  ];
  const positions = [];
  const indices = [];
  for (const f of faces) {
    const base = positions.length / 3;
    for (const vi of f) positions.push(p[vi][0], p[vi][1], p[vi][2]);
    indices.push(base, base + 1, base + 2);
  }
  return { positions: new Float32Array(positions), indices: new Uint32Array(indices) };
}

export function cylinderMesh(radius, height, segments = 64, cx = 0, cy = 0, cz = 0) {
  const positions = [];
  const indices = [];
  const ring = [];
  for (let i = 0; i < segments; i += 1) {
    const a = (i / segments) * Math.PI * 2;
    ring.push([cx + Math.cos(a) * radius, cy + Math.sin(a) * radius]);
  }
  for (let i = 0; i < segments; i += 1) {
    const [x0, y0] = ring[i];
    const [x1, y1] = ring[(i + 1) % segments];
    const base = positions.length / 3;
    positions.push(x0, y0, cz, x1, y1, cz, x1, y1, cz + height, x0, y0, cz + height);
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  for (const [z, flip] of [[cz, true], [cz + height, false]]) {
    const centerIndex = positions.length / 3;
    positions.push(cx, cy, z);
    const start = positions.length / 3;
    for (let i = 0; i < segments; i += 1) positions.push(ring[i][0], ring[i][1], z);
    for (let i = 0; i < segments; i += 1) {
      const a = start + i;
      const b = start + ((i + 1) % segments);
      if (flip) indices.push(centerIndex, b, a);
      else indices.push(centerIndex, a, b);
    }
  }
  return { positions: new Float32Array(positions), indices: new Uint32Array(indices) };
}

export function sampleTower() {
  const base = boxMesh(64, 64, 5, 0, 0, 0);
  const body = cylinderMesh(26, 44, 72, 0, 0, 5);
  const positions = new Float32Array(base.positions.length + body.positions.length);
  positions.set(base.positions, 0);
  positions.set(body.positions, base.positions.length);
  const offset = base.positions.length / 3;
  const indices = new Uint32Array(base.indices.length + body.indices.length);
  indices.set(base.indices, 0);
  for (let i = 0; i < body.indices.length; i += 1) {
    indices[base.indices.length + i] = body.indices[i] + offset;
  }
  return { positions, indices };
}