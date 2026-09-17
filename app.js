import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { OrbitControls } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/controls/OrbitControls.js';

const objects = [];
const undoStack = [];
const redoStack = [];
let selected = null;
let objectIndex = 1;
const authScreen = document.querySelector('#authScreen');
const appShell = document.querySelector('#appShell');
const viewport = document.querySelector('#viewport');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1c1b);
const camera = new THREE.PerspectiveCamera(42, 1, .1, 100);
camera.position.set(7, 5.4, 8);
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.outputColorSpace = THREE.SRGBColorSpace;
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
['x', 'y', 'z'].forEach(axis => [-1, 1].forEach(sign => {
  const handle = new THREE.Mesh(new THREE.SphereGeometry(.14, 18, 12), new THREE.MeshStandardMaterial({ color: 0xf26639, emissive: 0x4c1709, emissiveIntensity: .4 }));
  handle.userData = { scaleHandle: true, axis, sign };
  handle.visible = false;
  scene.add(handle);
  scaleHandles.push(handle);
}));

function makeMesh(type, color) {
  const geometry = type === 'Sphere' ? new THREE.SphereGeometry(.85, 32, 20) : type === 'Cylinder' ? new THREE.CylinderGeometry(.65, .65, 1.5, 32) : new THREE.BoxGeometry(1.55, 1.55, 1.55);
  const material = new THREE.MeshStandardMaterial({ color, roughness: .32, metalness: .08 });
  const mesh = new THREE.Mesh(geometry, material); mesh.castShadow = true; mesh.receiveShadow = true; return mesh;
}
function addObject(type, color = 0x999999, position = [0, .8, 0]) { const mesh = makeMesh(type, color); mesh.position.set(...position); mesh.name = `${type} ${objectIndex++}`; scene.add(mesh); objects.push(mesh); selectObject(mesh); updateList(); return mesh; }
addObject('Cube', 0x999999, [0, .8, 0]).name = 'Cube 1';
const savedScene = JSON.parse(localStorage.getItem('modelrSceneV2') || 'null');
if (Array.isArray(savedScene) && savedScene.length) {
  objects.splice(0).forEach(mesh => scene.remove(mesh));
  savedScene.forEach(item => { const mesh = addObject(item.name.split(' ')[0], parseInt(item.color, 16), item.position); mesh.name = item.name; mesh.scale.fromArray(item.scale); });
  selectObject(objects[0]);
}
else {
  selectObject(objects[0]);
}
if (!objects.length) addObject('Cube', 0x999999, [0, .8, 0]);

function sceneSnapshot() { return objects.map(mesh => ({ name: mesh.name, type: mesh.name.startsWith('Sphere') ? 'Sphere' : mesh.name.startsWith('Cylinder') ? 'Cylinder' : 'Cube', color: mesh.material.color.getHexString(), position: mesh.position.toArray(), scale: mesh.scale.toArray(), rotation: mesh.rotation.toArray() })); }
function rememberScene() { undoStack.push(sceneSnapshot()); if (undoStack.length > 50) undoStack.shift(); redoStack.length = 0; }
function restoreScene(snapshot) { objects.forEach(mesh => scene.remove(mesh)); objects.length = 0; snapshot.forEach(item => { const mesh = addObject(item.type, parseInt(item.color, 16), item.position); mesh.name = item.name; mesh.scale.fromArray(item.scale); if (item.rotation) mesh.rotation.fromArray(item.rotation); }); if (objects[0]) selectObject(objects[0]); updateList(); }
function undo() { if (!undoStack.length) return; redoStack.push(sceneSnapshot()); restoreScene(undoStack.pop()); }
function redo() { if (!redoStack.length) return; undoStack.push(sceneSnapshot()); restoreScene(redoStack.pop()); }

function updateScaleHandles() {
  scaleHandles.forEach(handle => {
    handle.visible = Boolean(selected) && document.querySelector('.tool.active')?.dataset.tool === 'scale';
    if (!selected) return;
    const halfSize = selected.geometry.parameters?.width ? new THREE.Vector3(selected.geometry.parameters.width, selected.geometry.parameters.height, selected.geometry.parameters.depth).multiplyScalar(.5) : new THREE.Vector3(.85, .85, .85);
    const localPosition = new THREE.Vector3();
    localPosition[handle.userData.axis] = halfSize[handle.userData.axis] * selected.scale[handle.userData.axis] * handle.userData.sign;
    handle.position.copy(selected.localToWorld(localPosition));
  });
}
function selectObject(mesh) { selected = mesh; document.querySelector('#selectionLabel').textContent = mesh.name; document.querySelector('#propertyName').textContent = mesh.name; document.querySelector('#propertyType').textContent = 'MESH'; const hex = `#${mesh.material.color.getHexString()}`; document.querySelector('#colorPicker').value = hex; document.querySelector('#colorValue').textContent = hex.toUpperCase(); syncInputs(); updateList(); }
function syncInputs() { if (!selected) return; ['x','y','z'].forEach(axis => { document.querySelector(`#pos${axis.toUpperCase()}`).value = selected.position[axis].toFixed(2); document.querySelector(`#scale${axis.toUpperCase()}`).value = selected.scale[axis].toFixed(2); }); document.querySelector('#selectedDot').style.background = `#${selected.material.color.getHexString()}`; updateScaleHandles(); }
function updateList() { const list = document.querySelector('#objectList'); list.innerHTML = objects.map(mesh => `<button class="object-row ${mesh === selected ? 'selected' : ''}" data-name="${mesh.name}"><span>${mesh.name.startsWith('Sphere') ? '●' : mesh.name.startsWith('Cylinder') ? '▱' : '◇'}</span><b>${mesh.name}</b><small>MESH</small></button>`).join(''); document.querySelector('#objectCount').textContent = `${objects.length} objects`; list.querySelectorAll('.object-row').forEach(row => row.onclick = () => selectObject(objects.find(item => item.name === row.dataset.name))); }
function resize() { const rect = viewport.getBoundingClientRect(); renderer.setSize(rect.width, rect.height, false); camera.aspect = rect.width / rect.height; camera.updateProjectionMatrix(); }
new ResizeObserver(resize).observe(viewport); resize();

document.querySelectorAll('.tool[data-tool]').forEach(button => button.addEventListener('click', () => { document.querySelectorAll('.tool[data-tool]').forEach(item => item.classList.remove('active')); button.classList.add('active'); updateScaleHandles(); }));
document.querySelector('#addCube').onclick = () => { rememberScene(); addObject('Cube', 0x999999, [Math.random() * 3 - 1.5, .8, Math.random() * 2 - 1]); };
document.querySelector('#addSphere').onclick = () => { rememberScene(); addObject('Sphere', 0x7692bd, [Math.random() * 3 - 1.5, .85, Math.random() * 2 - 1]); };
document.querySelector('#addCylinder').onclick = () => { rememberScene(); addObject('Cylinder', 0x87a479, [Math.random() * 3 - 1.5, .75, Math.random() * 2 - 1]); };
['posX','posY','posZ','scaleX','scaleY','scaleZ'].forEach(id => document.querySelector(`#${id}`).addEventListener('input', event => { if (!selected) return; const prop = id.startsWith('pos') ? 'position' : 'scale'; const axis = id.slice(-1).toLowerCase(); selected[prop][axis] = Number(event.target.value); }));

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let dragStart = null;
renderer.domElement.addEventListener('pointerdown', event => {
  if (event.button !== 0) return;
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const handleHit = raycaster.intersectObjects(scaleHandles)[0];
  if (handleHit && selected) {
    rememberScene();
    dragStart = { x: event.clientX, y: event.clientY, scale: selected.scale.clone(), position: selected.position.clone(), handle: handleHit.object };
    controls.enabled = false;
    return;
  }
  const hit = raycaster.intersectObjects(objects)[0];
  if (hit) { selectObject(hit.object); rememberScene(); dragStart = { x: event.clientX, y: event.clientY, position: hit.object.position.clone(), scale: hit.object.scale.clone() }; }
});
renderer.domElement.addEventListener('pointermove', event => {
  if (!dragStart || !selected) return;
  const dx = (event.clientX - dragStart.x) * .012;
  const dy = (event.clientY - dragStart.y) * .012;
  if (dragStart.handle) {
    const axis = dragStart.handle.userData.axis;
    const sign = dragStart.handle.userData.sign;
    const delta = axis === 'y' ? -dy : dx;
    const nextScale = Math.max(.1, dragStart.scale[axis] + delta * sign);
    const scaleDelta = nextScale - dragStart.scale[axis];
    selected.scale[axis] = nextScale;
    selected.position[axis] = dragStart.position[axis] + scaleDelta * sign * (selected.geometry.parameters?.width ? selected.geometry.parameters[axis === 'x' ? 'width' : axis === 'y' ? 'height' : 'depth'] / 2 : .85);
    syncInputs();
    return;
  }
  const activeTool = document.querySelector('.tool.active')?.dataset.tool;
  if (activeTool === 'scale') selected.scale.set(Math.max(.1, dragStart.scale.x + dx), Math.max(.1, dragStart.scale.y - dy), Math.max(.1, dragStart.scale.z + dx));
  else if (activeTool === 'rotate') selected.rotation.y = dx;
  else selected.position.set(dragStart.position.x + dx, dragStart.position.y - dy, dragStart.position.z);
  syncInputs();
});
window.addEventListener('pointerup', () => { dragStart = null; controls.enabled = true; });
window.addEventListener('keydown', event => {
  const key = event.key.toLowerCase();
  if (!(event.ctrlKey || event.metaKey) || !['z', 'y'].includes(key) || event.target.matches('input, textarea')) return;
  event.preventDefault();
  if (key === 'y' || (key === 'z' && event.shiftKey)) redo();
  else undo();
});
document.querySelector('#colorPicker').addEventListener('input', event => { if (!selected) return; selected.material.color.set(event.target.value); document.querySelector('#colorValue').textContent = event.target.value.toUpperCase(); document.querySelector('#selectedDot').style.background = event.target.value; updateList(); });
[['roughness','roughnessValue'],['metallic','metallicValue']].forEach(([id, output]) => document.querySelector(`#${id}`).addEventListener('input', event => { if (selected) selected.material[id] = Number(event.target.value); document.querySelector(`#${output}`).textContent = Number(event.target.value).toFixed(2); }));

function generatedCode() { return `// modelr scene\nconst scene = new THREE.Scene();\n\n${objects.map(mesh => `const ${mesh.name.toLowerCase().replaceAll(' ', '_')} = new THREE.Mesh(\n  new THREE.${mesh.name.startsWith('Sphere') ? 'Sphere' : mesh.name.startsWith('Cylinder') ? 'Cylinder' : 'Box'}Geometry(${mesh.name.startsWith('Sphere') ? '.85, 32, 20' : mesh.name.startsWith('Cylinder') ? '.65, .65, 1.5, 32' : '1.55, 1.55, 1.55'}),\n  new THREE.MeshStandardMaterial({ color: '${mesh.material.color.getHexString()}', roughness: ${mesh.material.roughness.toFixed(2)}, metalness: ${mesh.material.metalness.toFixed(2)} })\n);\n${mesh.name.toLowerCase().replaceAll(' ', '_')}.position.set(${mesh.position.x.toFixed(2)}, ${mesh.position.y.toFixed(2)}, ${mesh.position.z.toFixed(2)});\nscene.add(${mesh.name.toLowerCase().replaceAll(' ', '_')});`).join('\n\n')}`; }
document.querySelector('#codeButton').onclick = () => { document.querySelector('#generatedCode').value = generatedCode(); document.querySelector('#codeStatus').textContent = ''; document.querySelector('#codeModal').classList.add('open'); };
document.querySelector('#closeModal').onclick = () => document.querySelector('#codeModal').classList.remove('open');
document.querySelector('#copyCode').onclick = async () => { await navigator.clipboard?.writeText(document.querySelector('#generatedCode').value); document.querySelector('#copyCode').firstChild.textContent = 'Copied '; };
document.querySelector('#applyCode').onclick = () => {
  const code = document.querySelector('#generatedCode').value;
  const parsed = [...code.matchAll(/new THREE\.(Box|Sphere|Cylinder)Geometry\(([^)]+)\)[\s\S]*?color:\s*['"]#?([0-9a-fA-F]{6})['"][\s\S]*?\}\);[\s\S]*?\.position\.set\(([^)]+)\)/g)];
  if (!parsed.length) { document.querySelector('#codeStatus').textContent = 'Geen herkenbare Box, Sphere of Cylinder code gevonden.'; return; }
  rememberScene();
  objects.forEach(mesh => scene.remove(mesh)); objects.length = 0;
  parsed.forEach((match, index) => { const type = match[1] === 'Box' ? 'Cube' : match[1]; const position = match[4].split(',').map(Number); addObject(type, parseInt(match[3], 16), position.length === 3 ? position : [0, .8, 0]); objects[index].name = `${type} ${index + 1}`; });
  selectObject(objects[0]); updateList(); document.querySelector('#codeStatus').textContent = 'Scene toegepast.';
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
function projects() { return JSON.parse(localStorage.getItem('modelrProjects') || '[]'); }
function renderProjects() { const list = document.querySelector('#projectList'); const saved = projects(); list.innerHTML = saved.length ? saved.map(project => `<button class="project-row" data-project="${project.id}" title="Dubbelklik om te openen">◈ <span><b>${project.name}</b><small>Last update: ${project.updatedAt ? new Date(project.updatedAt).toLocaleString('nl-NL') : 'Onbekend'}</small></span><small>${project.objects} objects</small></button>`).join('') : '<div class="project-empty">Nog geen opgeslagen projecten.</div>'; list.querySelectorAll('.project-row').forEach(row => row.ondblclick = () => { const project = projects().find(item => item.id === row.dataset.project); if (!project) return; restoreScene(project.scene); currentProjectName = project.name; localStorage.setItem('modelrProjectName', currentProjectName); document.querySelector('#projectName').textContent = currentProjectName; projectModal.classList.remove('open'); authScreen.style.display = 'none'; appShell.setAttribute('aria-hidden', 'false'); }); }
function openProjectModal(mode) { projectModalMode = mode; document.querySelector('#projectModalEyebrow').textContent = mode === 'confirm' ? 'CLOSE PROJECT' : mode === 'projects' ? 'PROJECTS' : 'SAVE PROJECT'; document.querySelector('#projectModalTitle').textContent = mode === 'confirm' ? 'Do you want to save this project?' : mode === 'projects' ? 'Your projects.' : 'Save your project.'; document.querySelector('#projectModalHelp').textContent = mode === 'confirm' ? 'Je wijzigingen worden anders niet opgeslagen.' : mode === 'projects' ? 'Open een eerder opgeslagen project.' : 'Geef je project een naam zodat je het later kunt openen.'; projectInput.style.display = mode === 'save' ? 'block' : 'none'; document.querySelector('#confirmProjectModal').textContent = mode === 'confirm' ? 'Yes, save' : mode === 'projects' ? 'Close' : 'Save project'; document.querySelector('#cancelProjectModal').textContent = mode === 'confirm' ? 'No, close' : 'Cancel'; projectStatus.textContent = ''; if (mode === 'save') projectInput.value = currentProjectName; renderProjects(); projectModal.classList.add('open'); }
function showProjectList() { authScreen.style.display = 'none'; appShell.setAttribute('aria-hidden', 'false'); openProjectModal('projects'); }
function saveProject() { const name = projectInput.value.trim(); if (!name) { projectStatus.textContent = 'Geef je project eerst een naam.'; projectInput.focus(); return; } const saved = projects().filter(project => project.name !== name); saved.unshift({ id: `${Date.now()}-${name}`, name, objects: objects.length, updatedAt: new Date().toISOString(), scene: sceneSnapshot() }); localStorage.setItem('modelrProjects', JSON.stringify(saved)); localStorage.setItem('modelrSceneV2', JSON.stringify(sceneSnapshot())); localStorage.setItem('modelrProjectName', name); currentProjectName = name; document.querySelector('#projectName').textContent = name; if (closeAfterSave) { closeAfterSave = false; showProjectList(); } else projectModal.classList.remove('open'); }
function closeProject() { showProjectList(); }
document.querySelector('#fileMenuButton').onclick = event => { event.stopPropagation(); fileDropdown.classList.toggle('open'); };
document.addEventListener('click', event => { if (!event.target.closest('.file-menu')) fileDropdown.classList.remove('open'); });
document.querySelector('#closeProjectButton').onclick = () => { fileDropdown.classList.remove('open'); openProjectModal('confirm'); };
document.querySelector('#projectsButton').onclick = () => { fileDropdown.classList.remove('open'); openProjectModal('projects'); };
document.querySelector('#newProjectButton').onclick = () => { fileDropdown.classList.remove('open'); currentProjectName = ''; document.querySelector('#projectName').textContent = 'Untitled scene'; restoreScene([]); addObject('Cube', 0x999999, [0, .8, 0]); };
document.querySelector('#closeProjectModal').onclick = () => projectModal.classList.remove('open');
document.querySelector('#cancelProjectModal').onclick = () => projectModalMode === 'confirm' ? closeProject() : projectModal.classList.remove('open');
document.querySelector('#confirmProjectModal').onclick = () => { if (projectModalMode === 'confirm') { closeAfterSave = true; openProjectModal('save'); } else if (projectModalMode === 'projects') { projectModal.classList.remove('open'); } else saveProject(); };
document.querySelector('#saveButton').onclick = event => { const button = event.currentTarget; if (!currentProjectName) { openProjectModal('save'); return; } saveProject(); button.innerHTML = '✓&nbsp; Saved'; setTimeout(() => button.innerHTML = '↥&nbsp; Save', 1300); };
function animate() { requestAnimationFrame(animate); controls.update(); renderer.render(scene, camera); } animate();