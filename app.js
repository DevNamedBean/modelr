import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { OrbitControls } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/geometries/RoundedBoxGeometry.js';

const objects = [];
const undoStack = [];
const redoStack = [];
let selected = null;
let selectionOutline = null;
let objectIndex = 1;
const authScreen = document.querySelector('#authScreen');
const appShell = document.querySelector('#appShell');
const viewport = document.querySelector('#viewport');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1c1b);
const camera = new THREE.PerspectiveCamera(42, 1, .1, 100);
camera.position.set(7, 5.4, 8);
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
} catch (error) {
  const canvas = document.createElement('canvas');
  canvas.className = 'fallback-renderer';
  const context = canvas.getContext('2d');
  renderer = {
    domElement: canvas,
    shadowMap: { enabled: false },
    setPixelRatio() {},
    setClearColor() {},
    setSize(width, height) { canvas.width = Math.max(1, width * devicePixelRatio); canvas.height = Math.max(1, height * devicePixelRatio); canvas.style.width = `${width}px`; canvas.style.height = `${height}px`; },
    render() { context.fillStyle = '#202020'; context.fillRect(0, 0, canvas.width, canvas.height); }
  };
}
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setClearColor(0x1a1c1b, 1);
viewport.appendChild(renderer.domElement);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.mouseButtons.LEFT = THREE.MOUSE.PAN;
controls.mouseButtons.RIGHT = THREE.MOUSE.ROTATE;
controls.mouseButtons.MIDDLE = THREE.MOUSE.DOLLY;
controls.enableZoom = true;
controls.target.set(0, .7, 0);
scene.add(new THREE.HemisphereLight(0xdfe5d8, 0x252b26, 2.4));
const keyLight = new THREE.DirectionalLight(0xffe2ca, 4.2);
keyLight.position.set(4, 7, 5); keyLight.castShadow = true; scene.add(keyLight);
const fillLight = new THREE.PointLight(0x7da8d6, 2.5); fillLight.position.set(-4, 3, -3); scene.add(fillLight);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.MeshStandardMaterial({ color: 0x202421, roughness: .9 }));
floor.rotation.x = -Math.PI / 2; floor.position.y = -.02; floor.receiveShadow = true; scene.add(floor);
const grid = new THREE.GridHelper(20, 20, 0x465047, 0x2b302c); grid.position.y = .01; scene.add(grid);
const scaleHandles = [];
const rotateHandles = [];
const moveHandles = [];
['x', 'y', 'z'].forEach(axis => [-1, 1].forEach(sign => {
  const handle = new THREE.Mesh(new THREE.SphereGeometry(.14, 18, 12), new THREE.MeshStandardMaterial({ color: 0xf26639, emissive: 0x4c1709, emissiveIntensity: .4 }));
  handle.userData = { scaleHandle: true, axis, sign };
  handle.visible = false;
  scene.add(handle);
  scaleHandles.push(handle);
}));
[['x', 0xe05d5d, new THREE.Euler(0, Math.PI / 2, 0)], ['y', 0x72c987, new THREE.Euler(Math.PI / 2, 0, 0)], ['z', 0x5b91d8, new THREE.Euler(0, 0, 0)]].forEach(([axis, color, rotation]) => {
  const rotateHandle = new THREE.Mesh(new THREE.TorusGeometry(1.35, .06, 12, 96), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .42, depthTest: false }));
  rotateHandle.userData = { rotateHandle: true, axis };
  rotateHandle.material.userData = { baseOpacity: .42, baseScale: 1 };
  rotateHandle.rotation.copy(rotation);
  rotateHandle.visible = false;
  rotateHandle.renderOrder = 9;
  scene.add(rotateHandle);
  rotateHandles.push(rotateHandle);
});
[['x', new THREE.Vector3(1, 0, 0), 0xe05d5d], ['y', new THREE.Vector3(0, 1, 0), 0x72c987], ['z', new THREE.Vector3(0, 0, 1), 0x5b91d8]].forEach(([axis, direction, color]) => {
  const handle = new THREE.ArrowHelper(direction, new THREE.Vector3(), 1.8, color, .28, .14);
  handle.userData = { moveHandle: true, axis };
  handle.visible = false;
  scene.add(handle);
  moveHandles.push(handle);
});

function makeMesh(type, color) {
  let geometry;
  if (type === 'Sphere') geometry = new THREE.SphereGeometry(.85, 32, 20);
  else if (type === 'Cylinder') geometry = new THREE.CylinderGeometry(.65, .65, 1.5, 32);
  else if (type === 'Torus') geometry = new THREE.TorusGeometry(.72, .18, 18, 48);
  else if (type === 'Cone') geometry = new THREE.ConeGeometry(.72, 1.45, 32);
  else if (type === 'Crown') {
     const shape = new THREE.Shape();
     shape.moveTo(-.78, -.55); shape.lineTo(.78, -.55); shape.lineTo(.68, .45); shape.lineTo(.36, .05); shape.lineTo(0, .72); shape.lineTo(-.36, .05); shape.lineTo(-.68, .45); shape.closePath();
    geometry = new THREE.ExtrudeGeometry(shape, { depth: .48, bevelEnabled: true, bevelSegments: 2, bevelSize: .06, bevelThickness: .06 });
    geometry.center();
  } else geometry = new RoundedBoxGeometry(1.55, 1.55, 1.55, 3, .04);
  const material = new THREE.MeshStandardMaterial({ color, roughness: .32, metalness: .08 });
  const mesh = new THREE.Mesh(geometry, material); mesh.userData.rounding = type === 'Cube' ? .04 : 0; mesh.castShadow = true; mesh.receiveShadow = true; return mesh;
}
function addObject(type, color = 0x999999, position = [0, .8, 0]) { const mesh = makeMesh(type, color); mesh.position.set(...position); mesh.name = `${type} ${objectIndex++}`; scene.add(mesh); objects.push(mesh); selectObject(mesh); updateList(); return mesh; }
addObject('Cube', 0x999999, [0, .8, 0]).name = 'Cube 1';
let savedScene = null;
try { savedScene = JSON.parse(localStorage.getItem('modelrSceneV2') || 'null'); } catch (error) { localStorage.removeItem('modelrSceneV2'); }
const validSavedScene = Array.isArray(savedScene) ? savedScene.filter(item => item && ['Cube', 'Sphere', 'Cylinder', 'Torus', 'Cone', 'Crown'].includes(item.type || item.name?.split(' ')[0]) && Array.isArray(item.position) && item.position.length === 3 && item.position.every(Number.isFinite)).map(item => ({ ...item, type: item.type || item.name.split(' ')[0] })) : [];
if (validSavedScene.length) {
  objects.splice(0).forEach(mesh => scene.remove(mesh));
  validSavedScene.forEach(item => { const mesh = addObject(item.name.split(' ')[0], parseInt(item.color || '999999', 16), item.position); mesh.name = item.name; if (Array.isArray(item.scale)) mesh.scale.fromArray(item.scale); if (item.rounding && mesh.name.startsWith('Cube')) { mesh.userData.rounding = item.rounding; mesh.geometry.dispose(); mesh.geometry = new RoundedBoxGeometry(1.55, 1.55, 1.55, 4, item.rounding); } });
  selectObject(objects[0]);
}
else {
  selectObject(objects[0]);
}
if (!objects.length) addObject('Cube', 0x999999, [0, .8, 0]);
objects.forEach(mesh => { mesh.visible = true; if (!mesh.position.toArray().every(Number.isFinite)) mesh.position.set(0, .8, 0); if (!mesh.scale.toArray().every(value => Number.isFinite(value) && value > 0)) mesh.scale.set(1, 1, 1); });
camera.position.set(6, 4.5, 7);
controls.target.set(0, .8, 0);
controls.update();
camera.lookAt(0, .8, 0);

function sceneSnapshot() { return objects.map(mesh => ({ name: mesh.name, type: mesh.name.startsWith('Sphere') ? 'Sphere' : mesh.name.startsWith('Cylinder') ? 'Cylinder' : mesh.name.startsWith('Torus') ? 'Torus' : mesh.name.startsWith('Cone') ? 'Cone' : mesh.name.startsWith('Crown') ? 'Crown' : 'Cube', color: mesh.material.color.getHexString(), position: mesh.position.toArray(), scale: mesh.scale.toArray(), rotation: mesh.rotation.toArray(), rounding: mesh.userData.rounding || 0 })); }
function rememberScene() { undoStack.push(sceneSnapshot()); if (undoStack.length > 50) undoStack.shift(); redoStack.length = 0; }
function restoreScene(snapshot) { objects.forEach(mesh => scene.remove(mesh)); objects.length = 0; snapshot.filter(item => Array.isArray(item.position) && item.position.length === 3 && item.position.every(Number.isFinite)).forEach((item, index) => { const type = item.type || 'Cube'; const mesh = addObject(type, parseInt(item.color || '999999', 16), item.position); mesh.name = String(item.name || `${type} ${index + 1}`); if (Array.isArray(item.scale)) mesh.scale.fromArray(item.scale); if (item.rotation) mesh.rotation.fromArray(item.rotation); }); if (!objects.length) addObject('Cube', 0x999999, [0, .8, 0]); selectObject(objects[0]); updateList(); }
function duplicateSelected(exactPosition = false) { if (!selected) return; rememberScene(); const duplicate = new THREE.Mesh(selected.geometry.clone(), selected.material.clone()); duplicate.name = `${selected.name} Copy ${objectIndex++}`; duplicate.position.copy(selected.position); if (!exactPosition) duplicate.position.add(new THREE.Vector3(.6, 0, .6)); duplicate.scale.copy(selected.scale); duplicate.rotation.copy(selected.rotation); duplicate.userData = { ...selected.userData }; duplicate.castShadow = selected.castShadow; duplicate.receiveShadow = selected.receiveShadow; scene.add(duplicate); objects.push(duplicate); selectObject(duplicate); updateList(); }
function undo() { if (!undoStack.length) return; redoStack.push(sceneSnapshot()); restoreScene(undoStack.pop()); }
function redo() { if (!redoStack.length) return; undoStack.push(sceneSnapshot()); restoreScene(redoStack.pop()); }

function updateScaleHandles() {
  const activeTool = document.querySelector('.tool.active')?.dataset.tool;
  moveHandles.forEach(handle => {
    handle.visible = Boolean(selected) && (activeTool === 'move' || activeTool === 'select');
    if (selected) handle.position.copy(selected.position);
  });
  scaleHandles.forEach(handle => {
    handle.visible = Boolean(selected) && activeTool === 'scale';
    if (!selected) return;
    const halfSize = selected.geometry.parameters?.width ? new THREE.Vector3(selected.geometry.parameters.width, selected.geometry.parameters.height, selected.geometry.parameters.depth).multiplyScalar(.5) : new THREE.Vector3(.85, .85, .85);
    const localPosition = new THREE.Vector3();
    localPosition[handle.userData.axis] = (halfSize[handle.userData.axis] * selected.scale[handle.userData.axis] + .28) * handle.userData.sign;
    handle.position.copy(selected.localToWorld(localPosition));
  });
  rotateHandles.forEach(handle => {
    handle.visible = Boolean(selected) && activeTool === 'rotate';
    if (!selected) return;
    handle.position.copy(selected.position);
    handle.scale.setScalar(Math.max(selected.scale.x, selected.scale.y, selected.scale.z));
  });
}
function selectObject(mesh) { if (!mesh) return; if (selectionOutline?.parent) selectionOutline.parent.remove(selectionOutline); selected = mesh; selectionOutline = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), new THREE.LineBasicMaterial({ color: 0xf26639, transparent: true, opacity: .95, depthTest: false })); selectionOutline.renderOrder = 10; mesh.add(selectionOutline); document.querySelector('#selectionLabel').textContent = mesh.name; document.querySelector('#propertyName').textContent = mesh.name; document.querySelector('#propertyType').textContent = 'MESH'; const hex = `#${mesh.material.color.getHexString()}`; document.querySelector('#colorPicker').value = hex; document.querySelector('#colorValue').textContent = hex.toUpperCase(); syncInputs(); updateList(); }
function clearSelection() { if (selectionOutline?.parent) selectionOutline.parent.remove(selectionOutline); selectionOutline = null; selected = null; document.querySelector('#selectionLabel').textContent = 'No selection'; updateScaleHandles(); updateList(); }
function syncInputs() { if (!selected) return; ['x','y','z'].forEach(axis => { document.querySelector(`#pos${axis.toUpperCase()}`).value = selected.position[axis].toFixed(2); document.querySelector(`#scale${axis.toUpperCase()}`).value = selected.scale[axis].toFixed(2); }); const rounding = document.querySelector('#edgeRounding'); if (rounding) { rounding.value = selected.userData.rounding || 0; document.querySelector('#edgeRoundingValue').textContent = Number(rounding.value).toFixed(2); rounding.disabled = !selected.name.startsWith('Cube'); } document.querySelector('#selectedDot').style.background = `#${selected.material.color.getHexString()}`; updateScaleHandles(); }
function setEdgeRounding(value) { if (!selected || !selected.name.startsWith('Cube')) return; const rounding = Math.min(.7, Math.max(0, Number(value) || 0)); const oldGeometry = selected.geometry; selected.geometry = new RoundedBoxGeometry(1.55, 1.55, 1.55, 4, rounding); selected.geometry.computeVertexNormals(); selected.userData.rounding = rounding; oldGeometry.dispose(); if (selectionOutline?.parent) selectionOutline.parent.remove(selectionOutline); selectionOutline = new THREE.LineSegments(new THREE.EdgesGeometry(selected.geometry), new THREE.LineBasicMaterial({ color: 0xf26639, transparent: true, opacity: .95, depthTest: false })); selectionOutline.renderOrder = 10; selected.add(selectionOutline); document.querySelector('#edgeRoundingValue').textContent = rounding.toFixed(2); updateScaleHandles(); }
function updateList() { const icon = mesh => mesh.name.startsWith('Sphere') ? '●' : mesh.name.startsWith('Cylinder') ? '▱' : mesh.name.startsWith('Torus') ? '○' : mesh.name.startsWith('Cone') ? '△' : mesh.name.startsWith('Crown') ? '♕' : '◇'; const list = document.querySelector('#objectList'); const partsList = document.querySelector('#partsList'); const rows = objects.map(mesh => `<button class="object-row ${mesh === selected ? 'selected' : ''}" data-name="${mesh.name}"><span>${icon(mesh)}</span><b>${mesh.name}</b><small>MESH</small></button>`).join(''); const partRows = objects.map(mesh => `<button class="part-row ${mesh === selected ? 'selected' : ''}" data-name="${mesh.name}"><span>${icon(mesh)}</span><b>${mesh.name}</b><small>MESH</small></button>`).join(''); if (list) list.innerHTML = rows; if (partsList) partsList.innerHTML = partRows; document.querySelector('#objectCount')?.replaceChildren(document.createTextNode(`${objects.length} objects`)); document.querySelector('#partsCount')?.replaceChildren(document.createTextNode(objects.length)); document.querySelectorAll('.object-row,.part-row').forEach(row => { row.onclick = () => selectObject(objects.find(item => item.name === row.dataset.name)); row.ondblclick = () => selectObject(objects.find(item => item.name === row.dataset.name)); }); }
function resize() { const rect = viewport.getBoundingClientRect(); renderer.setSize(rect.width, rect.height, false); camera.aspect = rect.width / rect.height; camera.updateProjectionMatrix(); }
new ResizeObserver(resize).observe(viewport); resize();
const renderScene = () => { controls.update(); renderer.render(scene, camera); };
new MutationObserver(() => { if (appShell.getAttribute('aria-hidden') === 'false') requestAnimationFrame(() => { resize(); renderScene(); }); }).observe(appShell, { attributes: true, attributeFilter: ['aria-hidden'] });

document.querySelectorAll('.tool[data-tool]').forEach(button => button.addEventListener('click', () => { document.querySelectorAll('.tool[data-tool]').forEach(item => item.classList.remove('active')); button.classList.add('active'); updateScaleHandles(); }));
document.querySelector('#addCube').onclick = () => { rememberScene(); addObject('Cube', 0x999999, [Math.random() * 3 - 1.5, .8, Math.random() * 2 - 1]); };
document.querySelector('#addSphere').onclick = () => { rememberScene(); addObject('Sphere', 0x7692bd, [Math.random() * 3 - 1.5, .85, Math.random() * 2 - 1]); };
document.querySelector('#addCylinder').onclick = () => { rememberScene(); addObject('Cylinder', 0x87a479, [Math.random() * 3 - 1.5, .75, Math.random() * 2 - 1]); };
document.querySelector('#addTorus').onclick = () => { rememberScene(); addObject('Torus', 0xd6a843, [Math.random() * 3 - 1.5, .9, Math.random() * 2 - 1]); };
document.querySelector('#addCone').onclick = () => { rememberScene(); addObject('Cone', 0xc56b45, [Math.random() * 3 - 1.5, .9, Math.random() * 2 - 1]); };
document.querySelector('#addCrown').onclick = () => { rememberScene(); addObject('Crown', 0xd6a843, [Math.random() * 3 - 1.5, .9, Math.random() * 2 - 1]); };
document.querySelector('#edgeRounding').addEventListener('input', event => { rememberScene(); setEdgeRounding(event.target.value); });
['posX','posY','posZ','scaleX','scaleY','scaleZ'].forEach(id => document.querySelector(`#${id}`).addEventListener('input', event => { if (!selected) return; const prop = id.startsWith('pos') ? 'position' : 'scale'; const axis = id.slice(-1).toLowerCase(); selected[prop][axis] = Number(event.target.value); }));

const raycaster = new THREE.Raycaster();
raycaster.params.Line.threshold = .18;
const pointer = new THREE.Vector2();
const grabPlane = new THREE.Plane();
const grabPoint = new THREE.Vector3();
const grabOffset = new THREE.Vector3();
let dragStart = null;
function snappedRotation(value) { const snap = document.querySelector('#rotationSnap'); const input = document.querySelector('#rotationStep'); if (!snap || !input || !snap.checked) return value; const step = Math.max(1, Number(input.value) || 15) * Math.PI / 180; return Math.round(value / step) * step; }
document.querySelector('#rotationStep')?.addEventListener('input', () => { const snap = document.querySelector('#rotationSnap'); if (snap) snap.checked = true; });
renderer.domElement.addEventListener('pointerdown', event => {
  if (event.button !== 0) return;
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const activeTool = document.querySelector('.tool.active')?.dataset.tool;
  const handleHit = activeTool === 'scale' ? raycaster.intersectObjects(scaleHandles, true)[0] : null;
  if (handleHit && selected) {
    rememberScene();
    event.preventDefault();
    dragStart = { kind: 'scale', x: event.clientX, y: event.clientY, scale: selected.scale.clone(), position: selected.position.clone(), rotation: selected.rotation.clone(), handle: handleHit.object };
    controls.enabled = false;
    return;
  }
  const rotateHit = activeTool === 'rotate' ? raycaster.intersectObjects(rotateHandles)[0] : null;
  if (rotateHit && selected) {
    rememberScene();
    dragStart = { x: event.clientX, y: event.clientY, rotation: selected.rotation.clone(), handle: rotateHit.object };
    controls.enabled = false;
    return;
  }
  const moveHit = (activeTool === 'move' || activeTool === 'select') ? raycaster.intersectObjects(moveHandles, true)[0] : null;
  let moveHandle = moveHit?.object || null;
  while (moveHandle && !moveHandle.userData?.moveHandle) moveHandle = moveHandle.parent;
  if (moveHandle && selected) {
    rememberScene();
    dragStart = { x: event.clientX, y: event.clientY, position: selected.position.clone(), moveAxis: moveHandle.userData.axis };
    controls.enabled = false;
    return;
  }
  const hit = raycaster.intersectObjects(objects)[0];
  if (hit) {
    selectObject(hit.object);
    rememberScene();
    controls.enabled = false;
    if (activeTool === 'select') {
      const cameraNormal = new THREE.Vector3();
      camera.getWorldDirection(cameraNormal);
      grabPlane.setFromNormalAndCoplanarPoint(cameraNormal, hit.object.position);
      if (raycaster.ray.intersectPlane(grabPlane, grabPoint)) grabOffset.copy(hit.object.position).sub(grabPoint);
      dragStart = { kind: 'grab', position: hit.object.position.clone() };
    } else {
      dragStart = { x: event.clientX, y: event.clientY, position: hit.object.position.clone(), scale: hit.object.scale.clone() };
    }
  } else if (activeTool === 'select') {
    clearSelection();
  }
});
renderer.domElement.addEventListener('pointermove', event => {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const rotateHover = raycaster.intersectObjects(rotateHandles)[0]?.object;
  rotateHandles.forEach(handle => {
    const hovered = handle === rotateHover;
    handle.material.opacity = hovered ? .95 : handle.material.userData.baseOpacity;
    const objectScale = Math.max(selected?.scale.x || 1, selected?.scale.y || 1, selected?.scale.z || 1);
    handle.scale.setScalar(objectScale);
  });
  if (!dragStart || !selected) return;
  const dx = (event.clientX - dragStart.x) * .012;
  const dy = (event.clientY - dragStart.y) * .012;
  if (dragStart.kind === 'grab') {
    if (raycaster.ray.intersectPlane(grabPlane, grabPoint)) selected.position.copy(grabPoint).add(grabOffset);
    syncInputs();
    return;
  }
  if (dragStart.moveAxis) {
    const axis = dragStart.moveAxis;
    selected.position[axis] = dragStart.position[axis] + (axis === 'y' ? -dy : dx);
    syncInputs();
    return;
  }
  if (dragStart.handle?.userData.rotateHandle) {
    const axis = dragStart.handle.userData.axis;
    selected.rotation[axis] = snappedRotation(dragStart.rotation[axis] + (axis === 'y' ? -dy : dx));
    syncInputs();
    return;
  }
  if (dragStart.kind === 'scale') {
    const axis = dragStart.handle.userData.axis;
    const sign = dragStart.handle.userData.sign;
    const delta = axis === 'y' ? -dy : dx;
    const nextScale = Math.max(.1, dragStart.scale[axis] + delta * sign);
    const scaleDelta = nextScale - dragStart.scale[axis];
    const baseHalfSize = selected.geometry.parameters?.width ? new THREE.Vector3(selected.geometry.parameters.width, selected.geometry.parameters.height, selected.geometry.parameters.depth).multiplyScalar(.5)[axis] : .85;
    selected.scale[axis] = nextScale;
    selected.rotation.copy(dragStart.rotation);
    const localShift = new THREE.Vector3();
    localShift[axis] = scaleDelta * baseHalfSize * sign;
    selected.position.copy(dragStart.position).add(localShift.applyQuaternion(selected.quaternion));
    syncInputs();
    return;
  }
  const activeTool = document.querySelector('.tool.active')?.dataset.tool;
  if (activeTool === 'scale') { const delta = (dx - dy) * .5; const uniformScale = Math.max(.1, dragStart.scale.x + delta); selected.scale.set(uniformScale, uniformScale, uniformScale); }
  else if (activeTool === 'rotate') { selected.rotation.y = snappedRotation(dragStart.rotation?.y + dx || dx); }
  else selected.position.set(dragStart.position.x + dx, dragStart.position.y - dy, dragStart.position.z);
  syncInputs();
});
window.addEventListener('pointerup', () => { dragStart = null; controls.enabled = true; });
function moveCamera(direction, distance = .12) {
  const forward = new THREE.Vector3();
  camera.getWorldDirection(forward);
  forward.normalize();
  const right = new THREE.Vector3().crossVectors(forward, camera.up).normalize();
  const movement = new THREE.Vector3();
  if (direction === 'forward') movement.copy(forward);
  if (direction === 'backward') movement.copy(forward).multiplyScalar(-1);
  if (direction === 'left') movement.copy(right).multiplyScalar(-1);
  if (direction === 'right') movement.copy(right);
  movement.multiplyScalar(distance);
  camera.position.add(movement);
  controls.target.add(movement);
  controls.update();
}
const cameraKeys = new Set();
function updateCameraMovement() {
  if (cameraKeys.has('w') || cameraKeys.has('arrowup')) moveCamera('forward');
  if (cameraKeys.has('s') || cameraKeys.has('arrowdown')) moveCamera('backward');
  if (cameraKeys.has('a') || cameraKeys.has('arrowleft')) moveCamera('left');
  if (cameraKeys.has('d') || cameraKeys.has('arrowright')) moveCamera('right');
}
window.addEventListener('keydown', event => {
  const key = String(event.key || '').toLowerCase();
  const cameraMovement = { w: 'forward', arrowup: 'forward', s: 'backward', arrowdown: 'backward', a: 'left', arrowleft: 'left', d: 'right', arrowright: 'right' }[key];
  if (cameraMovement && !event.target.matches('input, textarea')) { event.preventDefault(); cameraKeys.add(key); return; }
  if ((event.ctrlKey || event.metaKey) && key === 'd' && !event.target.matches('input, textarea')) { event.preventDefault(); duplicateSelected(); return; }
  if (!(event.ctrlKey || event.metaKey) || !['z', 'y'].includes(key) || event.target.matches('input, textarea')) return;
  event.preventDefault();
  if (key === 'y' || (key === 'z' && event.shiftKey)) redo();
  else undo();
});
window.addEventListener('keyup', event => cameraKeys.delete(String(event.key || '').toLowerCase()));
window.addEventListener('blur', () => cameraKeys.clear());
function applySelectedColor(value) { if (!selected || !/^#[0-9a-f]{6}$/i.test(value)) return; selected.material.color.set(value); selected.material.needsUpdate = true; document.querySelector('#colorValue').textContent = value.toUpperCase(); document.querySelector('#selectedDot').style.background = value; updateList(); }
document.querySelector('#colorPicker').addEventListener('input', event => applySelectedColor(event.target.value));
document.querySelector('#colorPicker').addEventListener('change', event => applySelectedColor(event.target.value));
const partContext = document.querySelector('#partContext');
let contextPart = null;
document.querySelector('#partsList').addEventListener('contextmenu', event => { const row = event.target.closest('.part-row'); if (!row) return; event.preventDefault(); contextPart = objects.find(item => item.name === row.dataset.name); if (!contextPart) return; selectObject(contextPart); partContext.style.left = `${Math.min(event.clientX, window.innerWidth - 140)}px`; partContext.style.top = `${Math.min(event.clientY, window.innerHeight - 90)}px`; partContext.classList.add('open'); });
document.addEventListener('click', event => { if (!event.target.closest('#partContext')) partContext.classList.remove('open'); });
document.querySelector('#renamePart').onclick = () => { if (!contextPart) return; const name = window.prompt('New name for this part:', contextPart.name); if (name?.trim()) { contextPart.name = name.trim(); selectObject(contextPart); updateList(); } partContext.classList.remove('open'); };
document.querySelector('#duplicatePart').onclick = () => { if (!contextPart) return; selectObject(contextPart); duplicateSelected(true); contextPart = selected; partContext.classList.remove('open'); };
document.querySelector('#deletePart').onclick = () => { if (!contextPart) return; rememberScene(); const index = objects.indexOf(contextPart); if (index >= 0) objects.splice(index, 1); scene.remove(contextPart); if (!objects.length) addObject('Cube', 0x999999, [0, .8, 0]); selectObject(objects[Math.max(0, index - 1)] || objects[0]); updateList(); contextPart = null; partContext.classList.remove('open'); };
[['roughness','roughnessValue'],['metallic','metallicValue']].forEach(([id, output]) => document.querySelector(`#${id}`).addEventListener('input', event => { if (selected) selected.material[id] = Number(event.target.value); document.querySelector(`#${output}`).textContent = Number(event.target.value).toFixed(2); }));

function generatedCode() { return `// modelr scene\nconst scene = new THREE.Scene();\n\n${objects.map(mesh => { const name = String(mesh.name || 'Object').toLowerCase().replaceAll(' ', '_'); return `const ${name} = new THREE.Mesh(\n  new THREE.${mesh.name.startsWith('Sphere') ? 'Sphere' : mesh.name.startsWith('Cylinder') ? 'Cylinder' : 'Box'}Geometry(${mesh.name.startsWith('Sphere') ? '.85, 32, 20' : mesh.name.startsWith('Cylinder') ? '.65, .65, 1.5, 32' : '1.55, 1.55, 1.55'}),\n  new THREE.MeshStandardMaterial({ color: '${mesh.material.color.getHexString()}', roughness: ${mesh.material.roughness.toFixed(2)}, metalness: ${mesh.material.metalness.toFixed(2)} })\n);\n${name}.position.set(${mesh.position.x.toFixed(2)}, ${mesh.position.y.toFixed(2)}, ${mesh.position.z.toFixed(2)});\nscene.add(${name});`; }).join('\n\n')}`; }
document.querySelector('#codeButton').onclick = () => { document.querySelector('#generatedCode').value = generatedCode(); document.querySelector('#codeStatus').textContent = ''; document.querySelector('#codeModal').classList.add('open'); };
document.querySelector('#closeModal').onclick = () => document.querySelector('#codeModal').classList.remove('open');
document.querySelector('#copyCode').onclick = async () => { await navigator.clipboard?.writeText(document.querySelector('#generatedCode').value); document.querySelector('#copyCode').firstChild.textContent = 'Copied '; };
document.querySelector('#applyCode').onclick = () => {
  const code = document.querySelector('#generatedCode').value;
  const parsed = [...code.matchAll(/new THREE\.(Box|Sphere|Cylinder)Geometry\(([^)]+)\)[\s\S]*?color:\s*['"]#?([0-9a-fA-F]{6})['"][\s\S]*?\}\);[\s\S]*?\.position\.set\(([^)]+)\)/g)];
  if (!parsed.length) { document.querySelector('#codeStatus').textContent = 'No recognizable Box, Sphere, or Cylinder code found.'; return; }
  rememberScene();
  objects.forEach(mesh => scene.remove(mesh)); objects.length = 0;
  parsed.forEach((match, index) => { const type = match[1] === 'Box' ? 'Cube' : match[1]; const position = match[4].split(',').map(Number); addObject(type, parseInt(match[3], 16), position.length === 3 ? position : [0, .8, 0]); objects[index].name = `${type} ${index + 1}`; });
  selectObject(objects[0]); updateList(); document.querySelector('#codeStatus').textContent = 'Scene applied.';
};

document.querySelector('#avatarButton').onclick = () => { localStorage.removeItem('modelrUser'); appShell.setAttribute('aria-hidden', 'true'); authScreen.style.display = 'grid'; document.querySelector('#passwordInput').value = ''; };
const workspace = document.querySelector('.workspace');
document.querySelector('#sidebarToggle').onclick = () => { const collapsed = workspace.classList.toggle('sidebar-collapsed'); document.querySelector('#sidebarToggle').textContent = collapsed ? '‹' : '›'; document.querySelector('#sidebarToggle').title = collapsed ? 'Zijpaneel openen' : 'Zijpaneel inklappen'; setTimeout(resize, 220); };
let sidebarDrag = false;
document.querySelector('#sidebarResize').addEventListener('pointerdown', event => { sidebarDrag = true; event.preventDefault(); });
window.addEventListener('pointermove', event => { if (!sidebarDrag || workspace.classList.contains('sidebar-collapsed')) return; const width = Math.min(480, Math.max(240, window.innerWidth - event.clientX)); workspace.style.setProperty('--sidebar-width', `${width}px`); resize(); });
window.addEventListener('pointerup', () => { sidebarDrag = false; });
const fileDropdown = document.querySelector('#fileDropdown');
const projectModal = document.querySelector('#projectModal');
const projectInput = document.querySelector('#projectNameInput');
const projectStatus = document.querySelector('#projectStatus');
let projectModalMode = 'save';
let closeAfterSave = false;
let currentProjectName = localStorage.getItem('modelrProjectName') || '';
if (currentProjectName) document.querySelector('#projectName').textContent = currentProjectName;
function projects() { try { const saved = JSON.parse(localStorage.getItem('modelrProjects') || '[]'); return Array.isArray(saved) ? saved : []; } catch (error) { localStorage.removeItem('modelrProjects'); return []; } }
function renderProjects() { const list = document.querySelector('#projectList'); const saved = projects(); list.innerHTML = saved.length ? saved.map(project => `<button class="project-row" data-project="${project.id}" title="Double-click to open">◈ <span><b>${project.name}</b><small>Last update: ${project.updatedAt ? new Date(project.updatedAt).toLocaleString('en-US') : 'Unknown'}</small></span><small>${project.objects} objects</small></button>`).join('') : '<div class="project-empty">No saved projects yet.</div>'; list.querySelectorAll('.project-row').forEach(row => row.ondblclick = () => { const project = projects().find(item => item.id === row.dataset.project); if (!project) return; restoreScene(project.scene); localStorage.setItem('modelrSceneV2', JSON.stringify(project.scene)); currentProjectName = project.name; localStorage.setItem('modelrProjectName', currentProjectName); document.querySelector('#projectName').textContent = currentProjectName; projectModal.classList.remove('open'); projectModal.style.display = 'none'; authScreen.style.display = 'none'; appShell.setAttribute('aria-hidden', 'false'); requestAnimationFrame(() => { resize(); renderScene(); }); }); }
function openProjectModal(mode) { projectModalMode = mode; document.querySelector('#projectModalEyebrow').textContent = mode === 'confirm' ? 'CLOSE PROJECT' : mode === 'projects' ? 'PROJECTS' : 'SAVE PROJECT'; document.querySelector('#projectModalTitle').textContent = mode === 'confirm' ? 'Do you want to save this project?' : mode === 'projects' ? 'Your projects.' : 'Save your project.'; document.querySelector('#projectModalHelp').textContent = mode === 'confirm' ? 'Your changes will not be saved.' : mode === 'projects' ? 'Open a previously saved project.' : 'Give your project a name so you can open it later.'; projectInput.style.display = mode === 'save' ? 'block' : 'none'; document.querySelector('#confirmProjectModal').textContent = mode === 'confirm' ? 'Yes, save' : mode === 'projects' ? 'Close' : 'Save project'; document.querySelector('#cancelProjectModal').textContent = mode === 'confirm' ? 'No, close' : 'Cancel'; projectStatus.textContent = ''; if (mode === 'save') projectInput.value = currentProjectName; renderProjects(); projectModal.classList.add('open'); projectModal.style.display = 'grid'; }
function showProjectList() { authScreen.style.display = 'none'; appShell.setAttribute('aria-hidden', 'true'); openProjectModal('projects'); projectModal.classList.add('open'); projectModal.style.setProperty('display', 'grid', 'important'); projectModal.style.setProperty('visibility', 'visible', 'important'); projectModal.style.setProperty('opacity', '1', 'important'); projectModal.style.setProperty('z-index', '9999', 'important'); const card = document.querySelector('.project-card'); card.style.setProperty('display', 'block', 'important'); card.style.setProperty('visibility', 'visible', 'important'); card.style.setProperty('opacity', '1', 'important'); }
function saveProject() { const name = projectInput.value.trim(); if (!name) { projectStatus.textContent = 'Enter a project name first.'; projectInput.focus(); return; } const scene = sceneSnapshot(); const saved = projects().filter(project => project.name !== name); saved.unshift({ id: `${Date.now()}-${name}`, name, objects: objects.length, updatedAt: new Date().toISOString(), scene }); try { localStorage.setItem('modelrProjects', JSON.stringify(saved)); localStorage.setItem('modelrSceneV2', JSON.stringify(scene)); localStorage.setItem('modelrProjectName', name); } catch (error) { projectStatus.textContent = 'Could not save. Browser storage may be full.'; return; } currentProjectName = name; document.querySelector('#projectName').textContent = name; if (closeAfterSave) { closeAfterSave = false; showProjectList(); } else { projectModal.classList.remove('open'); projectModal.style.display = 'none'; } }
function autoSaveScene() { try { localStorage.setItem('modelrSceneV2', JSON.stringify(sceneSnapshot())); } catch (error) { /* Keep the editor usable when browser storage is unavailable. */ } }
function closeProject() { showProjectList(); }
document.querySelector('#fileMenuButton').onclick = event => { event.stopPropagation(); fileDropdown.classList.toggle('open'); };
document.addEventListener('click', event => { if (!event.target.closest('.file-menu')) fileDropdown.classList.remove('open'); });
document.querySelector('#closeProjectButton').onclick = () => { fileDropdown.classList.remove('open'); openProjectModal('confirm'); };
document.querySelector('#projectsButton').onclick = () => { fileDropdown.classList.remove('open'); openProjectModal('projects'); };
document.querySelector('#newProjectButton').onclick = () => { fileDropdown.classList.remove('open'); currentProjectName = ''; document.querySelector('#projectName').textContent = 'Untitled scene'; restoreScene([]); };
document.querySelector('#deleteProjectButton').onclick = () => { fileDropdown.classList.remove('open'); if (currentProjectName && !window.confirm(`Delete project "${currentProjectName}"?`)) return; const saved = projects().filter(project => project.name !== currentProjectName); localStorage.setItem('modelrProjects', JSON.stringify(saved)); localStorage.removeItem('modelrSceneV2'); localStorage.removeItem('modelrProjectName'); currentProjectName = ''; document.querySelector('#projectName').textContent = 'Untitled scene'; restoreScene([]); };
document.querySelector('#closeProjectModal').onclick = () => { projectModal.classList.remove('open'); projectModal.style.display = 'none'; };
document.querySelector('#cancelProjectModal').onclick = () => { if (projectModalMode === 'confirm') closeProject(); else { projectModal.classList.remove('open'); projectModal.style.display = 'none'; } };
document.querySelector('#confirmProjectModal').onclick = () => { if (projectModalMode === 'confirm') { closeAfterSave = true; openProjectModal('save'); } else if (projectModalMode === 'projects') { projectModal.classList.remove('open'); projectModal.style.display = 'none'; } else saveProject(); };
document.querySelector('#saveButton').onclick = () => { openProjectModal('save'); };
window.addEventListener('beforeunload', autoSaveScene);
function animate() { requestAnimationFrame(animate); updateCameraMovement(); renderScene(); } animate();