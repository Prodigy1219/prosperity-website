import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { effectiveStatus, validatePreview } from '../lib/property-core.mjs';
import { validateBlockCapture, tallyBlocks, exposedBlocks, estimateBlockWorth } from '../lib/property-build.mjs';
import worthSnapshot from '../data/property-worth.json';
const COLORS = { available: 0x348961, owned: 0x8b909b, leased: 0x3b82ac, unknown: 0xc19a50 };
/** @param {HTMLElement} host @param {import('../lib/property-types').Property[]} properties @param {{onSelect?:(p:import('../lib/property-types').Property)=>void,map?:boolean}} options */
export function createPropertyScene(host, properties, { onSelect, map = false } = {}) {
    // Compute bounds before allocating WebGL resources; no argument-spread ceiling.
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const p of properties)
        for (const [x, z] of p.geometry.points) {
            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x);
            minZ = Math.min(minZ, z);
            maxZ = Math.max(maxZ, z);
        }
    if (!Number.isFinite(minX) || !Number.isFinite(minZ))
        throw Error('No geometry');
    const midX = (minX + maxX) / 2, midZ = (minZ + maxZ) / 2;
    let disposed = false, frame = 0;
    let activeCapture = null;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    const cleanup=[];
    try {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0xe3ece7);
    renderer.domElement.setAttribute('aria-label', map ? 'Property boundary map. Listings also available as text.' : 'Property footprint. Not a building render.');
    host.appendChild(renderer.domElement);
    const scene = new THREE.Scene(), group = new THREE.Group();
    scene.add(group);
    const textures = [];
    cleanup.push(()=>{textures.forEach(t=>t.dispose());scene.traverse(o=>{o.geometry?.dispose();if(o.material)Array.isArray(o.material)?o.material.forEach(m=>m.dispose()):o.material.dispose();});});
    if (map && properties.every(p => p.mapId === 'world')) {
        for (const x of [0, 1])
            for (const z of [-1, 0]) {
                const texture = new THREE.TextureLoader().load(`/property-map/world/x${x}-z${z}.png`, () => { if (disposed)
                    texture.dispose();
                else
                    draw(); }, undefined, () => { });
                textures.push(texture);
                texture.colorSpace = THREE.SRGBColorSpace;
                // BlueMap LOD1: upper half is map RGB, lower half is encoded elevation.
                texture.repeat.set(500/501, 500/1002);
                texture.offset.set(0, 502/1002);
                texture.magFilter = THREE.NearestFilter;
                const plane = new THREE.Mesh(new THREE.PlaneGeometry(500, 500), new THREE.MeshBasicMaterial({ map: texture }));
                plane.rotation.x = -Math.PI / 2;
                plane.position.set(x * 500 + 250 - midX, -.08, z * 500 + 250 - midZ);
                scene.add(plane);
            }
    }
    const camera = new THREE.PerspectiveCamera(40, 1, .1, 100000);
    const controls = new OrbitControls(camera, renderer.domElement);
    cleanup.push(()=>controls.dispose());
    controls.enableDamping = false;
    controls.maxPolarAngle = Math.PI * .48;
    scene.add(new THREE.HemisphereLight(0xffffff, 0x597369, 2.4));
    const sun = new THREE.DirectionalLight(0xffffff, 2);
    sun.position.set(100, 200, 80);
    scene.add(sun);
    for (const p of properties) {
        const path = new THREE.Shape();
        p.geometry.points.forEach((v, i) => i ? path.lineTo(v[0] - midX, -v[1] + midZ) : path.moveTo(v[0] - midX, -v[1] + midZ));
        path.closePath();
        const geometry = new THREE.ShapeGeometry(path);
        geometry.rotateX(-Math.PI / 2);
        const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: COLORS[effectiveStatus(p)], side: THREE.DoubleSide, roughness: 1, transparent: map, opacity: map ? .45 : 1 }));
        mesh.position.y = map ? .05 : 0;
        mesh.userData.property = p;
        group.add(mesh);
        const outline = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(p.geometry.points.map(v => new THREE.Vector3(v[0] - midX, .12, v[1] - midZ))), new THREE.LineBasicMaterial({ color: 0x234e3c }));
        group.add(outline);
    }
    let grid;
    function fit() {
        const b = new THREE.Box3().setFromObject(group), size = b.getSize(new THREE.Vector3()), target = b.getCenter(new THREE.Vector3());
        const span = Math.max(size.x, size.y, size.z, 8);
        if (grid) {
            scene.remove(grid);
            grid.geometry.dispose();
            grid.material.dispose();
        }
        if(!map){
            grid = new THREE.GridHelper(span * 1.5, 16, 0xafc4b8, 0xccd9d0);
            grid.position.set(target.x, -.15, target.z);
            scene.add(grid);
        }
        controls.target.copy(target);
        camera.near = .1;
        camera.far = Math.max(span * 30, 1000);
        const d = span / (2*Math.tan(THREE.MathUtils.degToRad(camera.fov/2))) * 1.25 * Math.max(1,1/camera.aspect);
        const direction=map?new THREE.Vector3(.1,1,.15):new THREE.Vector3(.8,.75,.9);
        camera.position.copy(target).add(direction.normalize().multiplyScalar(d));
        controls.maxDistance = span * 10;
        controls.minDistance = span * .2;
        camera.updateProjectionMatrix();
        controls.update();
        draw();
    }
    function draw() { if (disposed)
        return; renderer.render(scene, camera); }
    function showCapture(capture, minY = capture.origin[1], maxY = capture.origin[1] + capture.size[1] - 1) {
        const subset = {...capture, blocks:capture.blocks.filter(b=>b[1]+capture.origin[1]>=minY && b[1]+capture.origin[1]<=maxY)};
        const blocks=exposedBlocks(subset);
        if(!blocks.length)return false;
        group.traverse(o=>{o.geometry?.dispose();if(o.material)Array.isArray(o.material)?o.material.forEach(m=>m.dispose()):o.material.dispose();});
        group.clear();
        const geometry=new THREE.BoxGeometry(1,1,1),material=new THREE.MeshStandardMaterial({roughness:1});
        const mesh=new THREE.InstancedMesh(geometry,material,blocks.length),matrix=new THREE.Matrix4();
        for(let i=0;i<blocks.length;i++){
            const b=blocks[i];matrix.makeTranslation(b[0]+.5,b[1]-(minY-capture.origin[1])+.5,b[2]+.5);
            mesh.setMatrixAt(i,matrix);mesh.setColorAt(i,new THREE.Color(capture.palette[b[3]].color));
        }
        mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
        mesh.computeBoundingBox();mesh.computeBoundingSphere();group.add(mesh);fit();return true;
    }
    function resize() { if (disposed)
        return; const { width, height } = host.getBoundingClientRect(); renderer.setSize(Math.max(width, 1), Math.max(height, 1)); camera.aspect = Math.max(width, 1) / Math.max(height, 1); camera.updateProjectionMatrix(); draw(); }
    const observer = new ResizeObserver(resize);
    cleanup.push(()=>observer.disconnect());
    observer.observe(host);
    controls.addEventListener('change', draw);
    let down = null;
    const pointerDown = e => { down = [e.clientX, e.clientY]; };
    const pointerUp = e => { if (!onSelect || !down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5)
        return; const r = host.getBoundingClientRect(); const ray = new THREE.Raycaster(); ray.setFromCamera(new THREE.Vector2((e.clientX - r.left) / r.width * 2 - 1, 1 - (e.clientY - r.top) / r.height * 2), camera); const hit = ray.intersectObjects(group.children).find(h => h.object.userData.property); if (hit)
        onSelect(hit.object.userData.property); };
    renderer.domElement.addEventListener('pointerdown', pointerDown);
    renderer.domElement.addEventListener('pointerup', pointerUp);
    resize();
    fit();
    frame = requestAnimationFrame(draw);
    return {
        heightRange(minY,maxY){
            if(!activeCapture||disposed||!Number.isInteger(minY)||!Number.isInteger(maxY)||minY>maxY||
                minY<activeCapture.origin[1]||maxY>=activeCapture.origin[1]+activeCapture.size[1])return false;
            return showCapture(activeCapture,minY,maxY);
        },
        async preview(property, signal) {
            const res = await fetch(property.preview.url, { signal:AbortSignal.any([signal,AbortSignal.timeout(12000)]), credentials: 'omit' });
            if (!res.ok)
                throw Error('Preview not available');
            const declared = Number(res.headers.get('content-length'));
            if (declared > 6000000)
                throw Error('Preview too large');
            // Stream limit applies even when Content-Length is absent or false.
            const reader = res.body.getReader(), chunks = [];
            let length = 0;
            for (;;) {
                const { done, value } = await reader.read();
                if (done)
                    break;
                length += value.length;
                if (length > 6000000) {
                    await reader.cancel();
                    throw Error('Preview too large');
                }
                chunks.push(value);
            }
            const bytes = new Uint8Array(length);
            let offset = 0;
            for (const c of chunks) {
                bytes.set(c, offset);
                offset += c.length;
            }
            const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(v => v.toString(16).padStart(2, '0')).join('');
            if (!property.preview.url.endsWith(`${digest}.json`))
                throw Error('Preview integrity failure');
            const raw = JSON.parse(new TextDecoder().decode(bytes));
            if (raw.propertyId !== property.id)
                throw Error('Wrong property preview');
            const capture = raw.format === 'plot-blocks' ? validateBlockCapture(raw) : null;
            const blocks = capture ? [] : validatePreview(raw);
            const result = capture ? {kind:'blocks',count:capture.blocks.length,materials:tallyBlocks(capture),
                capturedAt:capture.capturedAt,source:capture.source,minY:capture.origin[1],maxY:capture.origin[1]+capture.size[1]-1,
                valuation:estimateBlockWorth(capture,worthSnapshot)} : {kind:'surface'};
            if (disposed || signal.aborted)
                return;
            if(capture){
                activeCapture=capture;showCapture(capture);
                renderer.domElement.setAttribute('aria-label','Full captured block volume, orbit and zoom');
                return result;
            }
            if (!blocks.length) return result;
            group.traverse(o => { o.geometry?.dispose(); if (o.material)
                Array.isArray(o.material) ? o.material.forEach(m => m.dispose()) : o.material.dispose(); });
            group.clear();
            const geometry = new THREE.BoxGeometry(1, 1, 1), material = new THREE.MeshStandardMaterial({ roughness: 1 });
            const mesh = new THREE.InstancedMesh(geometry, material, blocks.length), matrix = new THREE.Matrix4();
            // Serialized integers are block-cell corners, not cube centers.
            blocks.forEach((b, i) => { matrix.makeTranslation(b[0]+.5, b[1]+.5, b[2]+.5); mesh.setMatrixAt(i, matrix); mesh.setColorAt(i, new THREE.Color(b[3])); });
            mesh.instanceMatrix.needsUpdate = true;
            if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
            mesh.computeBoundingBox();
            mesh.computeBoundingSphere();
            group.add(mesh);
            fit();
            renderer.domElement.setAttribute('aria-label', capture ? 'Captured property blocks at every height, orbit and zoom' : 'Captured property surface, orbit and zoom');
            return result;
        },
        dispose() { disposed = true; cancelAnimationFrame(frame); observer.disconnect(); controls.dispose(); textures.forEach(t => t.dispose()); scene.traverse(o => { o.geometry?.dispose(); if (o.material)
            Array.isArray(o.material) ? o.material.forEach(m => m.dispose()) : o.material.dispose(); }); renderer.dispose(); renderer.domElement.remove(); }
    };
    } catch(error) {
        disposed=true;cancelAnimationFrame(frame);
        for(const close of cleanup.reverse()){try{close();}catch{}}
        renderer.dispose();renderer.domElement.remove();throw error;
    }
}
