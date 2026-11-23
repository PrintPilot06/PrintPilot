/**
 * Mesh file parsing for PrintPilot.
 * Supports binary STL, ASCII STL and OBJ. Returns plain position/index arrays
 * that the slicer and the 3D viewport both consume.
 */

function parseBinarySTL(buffer) {
  const view = new DataView(buffer);
  const triCount = view.getUint32(80, true);
  if (triCount <= 0) throw new Error("STL file contains no triangles.");
  const positions = new Float32Array(triCount * 9);
  const indices = new Uint32Array(triCount * 3);
  let offset = 84;
  for (let t = 0; t < triCount; t += 1) {
    offset += 12; // facet normal, recomputed later
    for (let v = 0; v < 3; v += 1) {
      const base = (t * 3 + v) * 3;
      positions[base] = view.getFloat32(offset, true);
      positions[base + 1] = view.getFloat32(offset + 4, true);
      positions[base + 2] = view.getFloat32(offset + 8, true);
      indices[t * 3 + v] = t * 3 + v;
      offset += 12;
    }
    offset += 2;
  }
  return { positions, indices, name: "" };
}

function parseAsciiSTL(text) {
  const verts = [];
  const re = /vertex\s+(-?[\d.eE+]+)\s+(-?[\d.eE+]+)\s+(-?[\d.eE+]+)/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    verts.push(parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3]));
  }
  if (!verts.length) throw new Error("ASCII STL file contains no vertices.");
  const positions = new Float32Array(verts);
  const indices = new Uint32Array(positions.length / 3);
  for (let i = 0; i < indices.length; i += 1) indices[i] = i;
  const nameMatch = text.match(/solid\s+([^\r\n]+)/i);
  return { positions, indices, name: nameMatch ? nameMatch[1].trim() : "" };
}

export function parseSTL(buffer) {
  if (buffer.byteLength >= 84) {
    const view = new DataView(buffer);
    const triCount = view.getUint32(80, true);
    if (84 + triCount * 50 === buffer.byteLength) return parseBinarySTL(buffer);
  }
  const text = new TextDecoder().decode(buffer);
  if (/facet\s+normal/i.test(text)) return parseAsciiSTL(text);
  if (buffer.byteLength >= 84) {
    const view = new DataView(buffer);
    const triCount = view.getUint32(80, true);
    if (triCount > 0 && 84 + triCount * 50 <= buffer.byteLength) return parseBinarySTL(buffer);
  }
  throw new Error("This file is not a valid STL mesh.");
}

export function parseOBJ(text) {
  const positions = [];
  const indices = [];
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("v ")) {
      const p = trimmed.slice(2).trim().split(/\s+/);
      positions.push(parseFloat(p[0]), parseFloat(p[1]), parseFloat(p[2]));
    } else if (trimmed.startsWith("f ")) {
      const parts = trimmed.slice(2).trim().split(/\s+/);
      const idx = parts.map((p) => {
        const raw = parseInt(p.split("/")[0], 10);
        return raw > 0 ? raw - 1 : positions.length / 3 + raw;
      });
      for (let i = 1; i < idx.length - 1; i += 1) {
        indices.push(idx[0], idx[i], idx[i + 1]);
      }
    }
  }
  if (!indices.length) throw new Error("This OBJ file contains no faces.");
  return { positions: new Float32Array(positions), indices: new Uint32Array(indices), name: "" };
}

export function parseMeshFile(fileName, buffer) {
  const lower = String(fileName || "").toLowerCase();
  if (lower.endsWith(".obj")) return parseOBJ(new TextDecoder().decode(buffer));
  if (lower.endsWith(".stl")) return parseSTL(buffer);
  if (lower.endsWith(".3mf")) {
    throw new Error("3MF projects are imported through PrintPilot projects; mesh import supports STL and OBJ.");
  }
  throw new Error("Unsupported mesh format. PrintPilot imports STL and OBJ meshes.");
}