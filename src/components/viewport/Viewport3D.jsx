import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const SEGMENT_COLORS = {
  wall: 0x22d3ee,
  solid: 0x60a5fa,
  infill: 0x2563eb,
  support: 0xf59e0b,
  skirt: 0x94a3b8,
  travel: 0x3b4a5c,
};

/**
 * Interactive build-plate viewport.
 * models: [{ id, positions, indices, transform: { position:[x,y,z], rotation:[x,y,z] deg, scale:[x,y,z], mirrorX } }]
 * preview: { segments: [{ a:[x,y,z], b:[x,y,z], t, l }], layer?: number }
 */
export default function Viewport3D({
  models = [],
  plate = { x: 220, y: 220, z: 250 },
  selectedId = null,
  onSelect,
  preview = null,
  className = "",
}) {
  const mountRef = useRef(null);
  const coreRef = useRef(null);
  const selectRef = useRef(onSelect);
  const [ready, setReady] = useState(false);

  selectRef.current = onSelect;

  useEffect(() => {
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    const el = mountRef.current;
    if (!el) return undefined;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x090d12);

    const camera = new THREE.PerspectiveCamera(
      40,
      Math.max(el.clientWidth, 1) / Math.max(el.clientHeight, 1),
      0.5,
      12000
    );
    camera.position.set(plate.x * 1.2, plate.z * 0.95, plate.y * 1.3);

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(el.clientWidth, el.clientHeight);
    renderer.domElement.style.display = "block";
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.touchAction = "none";
    el.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.09;
    controls.minDistance = 15;
    controls.maxDistance = 2600;
    controls.maxPolarAngle = Math.PI * 0.496;
    controls.target.set(0, Math.min(plate.z * 0.16, 40), 0);

    scene.add(new THREE.HemisphereLight(0xc7dcff, 0x080c12, 1.1));
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.9);
    keyLight.position.set(240, 420, 200);
    scene.add(keyLight);
    const rimLight = new THREE.DirectionalLight(0x22d3ee, 0.9);
    rimLight.position.set(-280, 200, -240);
    scene.add(rimLight);
    const fillLight = new THREE.DirectionalLight(0x60a5fa, 0.45);
    fillLight.position.set(-140, 80, 280);
    scene.add(fillLight);

    const bedGeo = new THREE.BoxGeometry(plate.x, 3, plate.y);
    const bed = new THREE.Mesh(
      bedGeo,
      new THREE.MeshStandardMaterial({ color: 0x101822, roughness: 0.94, metalness: 0.06 })
    );
    bed.position.y = -1.5;
    scene.add(bed);

    const bedEdges = new THREE.LineSegments(
      new THREE.EdgesGeometry(bedGeo),
      new THREE.LineBasicMaterial({ color: 0x2b3f52 })
    );
    bedEdges.position.y = -1.5;
    scene.add(bedEdges);

    const grid = new THREE.GridHelper(Math.max(plate.x, plate.y), 20, 0x1d2b38, 0x131c25);
    grid.position.y = 0.08;
    scene.add(grid);

    const volumeGeo = new THREE.BoxGeometry(plate.x, plate.z, plate.y);
    const volume = new THREE.LineSegments(
      new THREE.EdgesGeometry(volumeGeo),
      new THREE.LineBasicMaterial({ color: 0x1b4a5c, transparent: true, opacity: 0.5 })
    );
    volume.position.y = plate.z / 2;
    scene.add(volume);

    const modelsGroup = new THREE.Group();
    const previewGroup = new THREE.Group();
    scene.add(modelsGroup);
    scene.add(previewGroup);

    const meshes = new Map();
    const raycaster = new THREE.Raycaster();

    const syncModels = (list, selId) => {
      const seen = new Set();
      for (const m of list) {
        seen.add(m.id);
        let mesh = meshes.get(m.id);
        if (!mesh) {
          const geo = new THREE.BufferGeometry();
          geo.setAttribute("position", new THREE.Float32BufferAttribute(m.positions, 3));
          if (m.indices) geo.setIndex(new THREE.BufferAttribute(new Uint32Array(m.indices), 1));
          geo.computeVertexNormals();
          mesh = new THREE.Mesh(
            geo,
            new THREE.MeshStandardMaterial({ color: 0x9dc3dd, roughness: 0.44, metalness: 0.2 })
          );
          mesh.userData.modelId = m.id;
          modelsGroup.add(mesh);
          meshes.set(m.id, mesh);
        }
        const t = m.transform || {};
        const p = t.position || [0, 0, 0];
        const r = t.rotation || [0, 0, 0];
        const s = t.scale || [1, 1, 1];
        mesh.position.set(p[0], p[1], p[2]);
        mesh.rotation.set(
          THREE.MathUtils.degToRad(r[0]),
          THREE.MathUtils.degToRad(r[1]),
          THREE.MathUtils.degToRad(r[2])
        );
        mesh.scale.set(s[0] * (t.mirrorX ? -1 : 1), s[1], s[2]);
        const isSel = m.id === selId;
        mesh.material.color.setHex(isSel ? 0x2ad4ee : 0x9dc3dd);
        mesh.material.emissive.setHex(isSel ? 0x08343d : 0x000000);
        mesh.material.needsUpdate = true;
      }
      for (const [id, mesh] of Array.from(meshes.entries())) {
        if (!seen.has(id)) {
          modelsGroup.remove(mesh);
          mesh.geometry.dispose();
          mesh.material.dispose();
          meshes.delete(id);
        }
      }
    };

    const clearPreview = () => {
      while (previewGroup.children.length) {
        const child = previewGroup.children.pop();
        previewGroup.remove(child);
        child.geometry?.dispose();
        child.material?.dispose();
      }
    };

    const setPreview = (pv) => {
      clearPreview();
      if (!pv || !pv.segments || !pv.segments.length) return;
      const limit = pv.layer == null ? Number.POSITIVE_INFINITY : pv.layer;
      const positions = [];
      const colors = [];
      const color = new THREE.Color();
      for (const seg of pv.segments) {
        if (seg.l > limit) continue;
        positions.push(seg.a[0], seg.a[1], seg.a[2], seg.b[0], seg.b[1], seg.b[2]);
        color.setHex(SEGMENT_COLORS[seg.t] ?? 0x22d3ee);
        colors.push(color.r, color.g, color.b, color.r, color.g, color.b);
      }
      if (!positions.length) return;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
      previewGroup.add(
        new THREE.LineSegments(
          geo,
          new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.92 })
        )
      );
    };

    let downX = 0;
    let downY = 0;
    const onPointerDown = (e) => {
      downX = e.clientX;
      downY = e.clientY;
    };
    const onPointerUp = (e) => {
      if (!selectRef.current) return;
      if (Math.hypot(e.clientX - downX, e.clientY - downY) > 5) return;
      const rect = renderer.domElement.getBoundingClientRect();
      const ndc = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      );
      raycaster.setFromCamera(ndc, camera);
      const hits = raycaster.intersectObjects(modelsGroup.children, false);
      selectRef.current(hits.length ? hits[0].object.userData.modelId : null);
    };
    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("pointerup", onPointerUp);

    let raf = 0;
    const animate = () => {
      raf = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    const resize = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (!w || !h) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(el);

    coreRef.current = { syncModels, setPreview, camera, controls };

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointerup", onPointerUp);
      controls.dispose();
      meshes.forEach((mesh) => {
        mesh.geometry.dispose();
        mesh.material.dispose();
      });
      meshes.clear();
      clearPreview();
      bedGeo.dispose();
      volumeGeo.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === el) el.removeChild(renderer.domElement);
      coreRef.current = null;
    };
  }, [ready, plate.x, plate.y, plate.z]);

  useEffect(() => {
    coreRef.current?.syncModels?.(models, selectedId);
  }, [models, selectedId, ready]);

  useEffect(() => {
    coreRef.current?.setPreview?.(preview);
  }, [preview, ready]);

  return (
    <div className={`relative ${className}`}>
      <div ref={mountRef} className="h-full w-full" />
    </div>
  );
}