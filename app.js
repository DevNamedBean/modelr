import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { OrbitControls } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/geometries/RoundedBoxGeometry.js';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/GLTFLoader.js';
import { GLTFExporter } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/exporters/GLTFExporter.js';
import JSZip from 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm';
import { evaluateDriverExpression, interpolateKeyframeAmount } from './animation-core.js';

const objects = [];
const undoStack = [];
const redoStack = [];
const importedSerialization = new WeakMap();
const collapsedModelFolders = new Set();
const MAX_SCENE_OBJECTS = 300;
const MAX_SCENE_TRIANGLES = 250000;
const MAX_IMPORT_FILE_BYTES = 50 * 1024 * 1024;
const MAX_IMPORT_ARCHIVE_BYTES = 64 * 1024 * 1024;
const MAX_IMPORT_ARCHIVE_ENTRIES = 200;
const MAX_REQUEST_BODY_CHARS = 20 * 1024 * 1024;
const DEFAULT_END_FRAME = 120;
const FRAME_RATE = 24;
let selected = null;
let selectionOutline = null;
let vertexOverlay = null;
let selectedVertexMarker = null;
let selectedVertexIndex = null;
let editorMode = 'object';
let componentMode = 'vertex';
let selectedComponentPoints = [];
let componentOverlay = null;
let currentFrame = 0;
let endFrame = DEFAULT_END_FRAME;
let loopPlayback = false;
let isPlaying = false;
let playbackRequest = 0;
let lastPlaybackTime = 0;
let playbackRemainder = 0;
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
function triangleCount(mesh) { const geometry = mesh.geometry; return Math.floor((geometry.index?.count || geometry.attributes.position?.count || 0) / 3); }
function sceneTriangleCount() { return objects.reduce((total, mesh) => total + triangleCount(mesh), 0); }
function sceneLimitNotice(message) { window.alert(message); }
function addObject(type, color = 0x999999, position = [0, .8, 0]) { if (objects.length >= MAX_SCENE_OBJECTS) { sceneLimitNotice(`This scene is limited to ${MAX_SCENE_OBJECTS} objects to keep the editor responsive.`); return null; } const mesh = makeMesh(type, color); if (sceneTriangleCount() + triangleCount(mesh) > MAX_SCENE_TRIANGLES) { mesh.geometry.dispose(); mesh.material.dispose(); sceneLimitNotice(`This scene is limited to ${MAX_SCENE_TRIANGLES.toLocaleString()} triangles to keep the editor responsive.`); return null; } mesh.position.set(...position); mesh.name = `${type} ${objectIndex++}`; scene.add(mesh); objects.push(mesh); selectObject(mesh); updateList(); return mesh; }
function meshMaterials(mesh) { return (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).filter(Boolean); }
function restoreImportedMesh(item) { const mesh = new THREE.ObjectLoader().parse(item.serialized); mesh.name = item.name || mesh.name; if (item.position) mesh.position.fromArray(item.position); if (item.rotation) mesh.rotation.fromArray(item.rotation); if (item.scale) mesh.scale.fromArray(item.scale); mesh.userData.modelrImported = true; mesh.userData.modelrGroupId ||= 'legacy-imported'; mesh.userData.modelrGroupName ||= 'Imported model'; importedSerialization.set(mesh, item.serialized); scene.add(mesh); objects.push(mesh); return mesh; }
addObject('Cube', 0x999999, [0, .8, 0]).name = 'Cube 1';
let savedScene = null;
try { savedScene = localStorage.getItem('modelrCloudUser') ? null : JSON.parse(localStorage.getItem('modelrSceneV2') || 'null'); } catch (error) { localStorage.removeItem('modelrSceneV2'); }
const validSavedScene = Array.isArray(savedScene) ? savedScene.filter(item => item && (item.serialized || item.geometry || ['Cube', 'Sphere', 'Cylinder', 'Torus', 'Cone', 'Crown'].includes(item.type || item.name?.split(' ')[0])) && (item.serialized || (Array.isArray(item.position) && item.position.length === 3 && item.position.every(Number.isFinite)))).map(item => ({ ...item, type: item.type || item.name?.split(' ')[0] || 'Imported' })) : [];
if (validSavedScene.length) {
  restoreScene(validSavedScene);
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

function importedMeshSnapshot(mesh) { let serialized = importedSerialization.get(mesh); if (!serialized) { const storedMesh = mesh.clone(false); storedMesh.userData.modelrImported = true; serialized = storedMesh.toJSON(); importedSerialization.set(mesh, serialized); } return serialized; }
function keyframesFor(mesh) {
  if (!mesh.userData.modelrAnimationId) mesh.userData.modelrAnimationId = `animation-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  if (!Array.isArray(mesh.userData.modelrKeyframes)) mesh.userData.modelrKeyframes = [];
  return mesh.userData.modelrKeyframes;
}
function isAnimationProperty(path) {
  return /^(position|rotation|scale)\.[xyz]$/.test(path || '');
}
function isValidKeyframe(keyframe) {
  return keyframe && Number.isInteger(keyframe.frame) && keyframe.frame >= 0 && keyframe.frame <= 1200 &&
    [keyframe.position, keyframe.rotation, keyframe.scale].every(values => Array.isArray(values) && values.length === 3 && values.every(Number.isFinite)) &&
    /^#[0-9a-f]{6}$/i.test(keyframe.color || '') &&
    (!keyframe.shapeWeights || Array.isArray(keyframe.shapeWeights) && keyframe.shapeWeights.length <= 256 && keyframe.shapeWeights.every(value => Number.isFinite(value) && value >= 0 && value <= 1));
}
function applyAnimationFrame(frame) {
  objects.forEach(mesh => {
    const keyframes = keyframesFor(mesh);
    const pose = sampleAnimationTrack(keyframes, frame);
    if (pose) {
      mesh.position.fromArray(pose.position);
      mesh.rotation.fromArray(pose.rotation);
      mesh.scale.fromArray(pose.scale);
      const color = new THREE.Color(pose.color);
      meshMaterials(mesh).forEach(material => { if (material.color) material.color.copy(color); });
      applyShapeWeights(mesh, pose.shapeWeights);
    }
    for (const strip of mesh.userData.modelrNlaStrips || []) {
      if (strip.muted || frame < strip.start || !strip.actionId) continue;
      const action = (mesh.userData.modelrActions || []).find(item => item.id === strip.actionId);
      if (!action?.keyframes?.length) continue;
      const duration = Math.max(1, action.keyframes.at(-1).frame - action.keyframes[0].frame);
      const elapsed = (frame - strip.start) / Math.max(.01, strip.scale || 1);
      const cycleLength = duration + 1;
      if (elapsed >= cycleLength * Math.max(1, strip.repeat || 1)) continue;
      const localFrame = action.keyframes[0].frame + elapsed % cycleLength;
      const actionPose = sampleAnimationTrack(action.keyframes, localFrame);
      if (!actionPose) continue;
      const influence = THREE.MathUtils.clamp(strip.influence ?? 1, 0, 1);
      const basePose = pose || {
        position: mesh.position.toArray(), rotation: [mesh.rotation.x, mesh.rotation.y, mesh.rotation.z],
        scale: mesh.scale.toArray(), color: `#${meshMaterials(mesh)[0]?.color?.getHexString() || 'ffffff'}`,
        shapeWeights: mesh.userData.modelrShapeKeys?.map(key => key.value || 0) || []
      };
      mesh.position.fromArray(basePose.position).lerp(new THREE.Vector3().fromArray(actionPose.position), influence);
      mesh.scale.fromArray(basePose.scale).lerp(new THREE.Vector3().fromArray(actionPose.scale), influence);
      const from = new THREE.Quaternion().setFromEuler(new THREE.Euler(...basePose.rotation));
      const to = new THREE.Quaternion().setFromEuler(new THREE.Euler(...actionPose.rotation));
      mesh.quaternion.copy(from.slerp(to, influence));
      const blendedColor = new THREE.Color(basePose.color).lerp(new THREE.Color(actionPose.color), influence);
      meshMaterials(mesh).forEach(material => { if (material.color) material.color.copy(blendedColor); });
      const baseWeights = basePose.shapeWeights || [];
      const actionWeights = actionPose.shapeWeights || [];
      applyShapeWeights(mesh, baseWeights.map((weight, index) => THREE.MathUtils.lerp(weight, actionWeights[index] ?? weight, influence)));
    }
    mesh.updateMatrixWorld(true);
  });
  applyDrivers();
  if (selected) syncInputs();
}
function sampleAnimationTrack(keys, frame) {
  if (!keys?.length) return null;
  const sorted = keys.slice().sort((a, b) => a.frame - b.frame);
  let before = sorted[0];
  let after = sorted.at(-1);
  for (let index = 0; index < sorted.length; index++) {
    if (sorted[index].frame <= frame) before = sorted[index];
    if (sorted[index].frame >= frame) { after = sorted[index]; break; }
  }
  const amount = before === after ? 0 : interpolateKeyframeAmount((frame - before.frame) / (after.frame - before.frame), before.interpolation);
  const fromRotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(...before.rotation));
  const toRotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(...after.rotation));
  const rotation = fromRotation.slerp(toRotation, amount);
  const euler = new THREE.Euler().setFromQuaternion(rotation);
  const fromWeights = before.shapeWeights || [];
  const toWeights = after.shapeWeights || [];
  return {
    position: new THREE.Vector3().fromArray(before.position).lerp(new THREE.Vector3().fromArray(after.position), amount).toArray(),
    rotation: [euler.x, euler.y, euler.z],
    scale: new THREE.Vector3().fromArray(before.scale).lerp(new THREE.Vector3().fromArray(after.scale), amount).toArray(),
    color: `#${new THREE.Color(before.color).lerp(new THREE.Color(after.color), amount).getHexString()}`,
    shapeWeights: fromWeights.map((weight, index) => THREE.MathUtils.lerp(weight, toWeights[index] ?? weight, amount))
  };
}
function applyShapeWeights(mesh, weights = []) {
  const shapeKeys = mesh.userData.modelrShapeKeys || [];
  const position = mesh.geometry.attributes.position;
  const basis = mesh.userData.modelrShapeBasis;
  if (!position || !basis || basis.length !== position.count * 3 || !shapeKeys.length) return;
  const normalized = shapeKeys.map((key, index) => THREE.MathUtils.clamp(weights[index] ?? key.value ?? 0, 0, 1));
  for (let vertex = 0; vertex < position.count; vertex++) {
    const offset = vertex * 3;
    let x = basis[offset], y = basis[offset + 1], z = basis[offset + 2];
    shapeKeys.forEach((key, index) => {
      const target = key.positions;
      const weight = normalized[index];
      if (target?.length !== basis.length || !weight) return;
      x += (target[offset] - basis[offset]) * weight;
      y += (target[offset + 1] - basis[offset + 1]) * weight;
      z += (target[offset + 2] - basis[offset + 2]) * weight;
    });
    position.setXYZ(vertex, x, y, z);
  }
  shapeKeys.forEach((key, index) => { key.value = normalized[index]; });
  position.needsUpdate = true;
  mesh.geometry.computeVertexNormals();
  mesh.geometry.computeBoundingBox();
  mesh.geometry.computeBoundingSphere();
}
function propertyValue(mesh, path) {
  if (!isAnimationProperty(path)) return undefined;
  const [property, axis] = path.split('.');
  return mesh?.[property]?.[axis];
}
function setPropertyValue(mesh, path, value) {
  if (!isAnimationProperty(path) || !Number.isFinite(value)) return;
  const [property, axis] = path.split('.');
  if (!mesh?.[property] || !['x', 'y', 'z'].includes(axis)) return;
  mesh[property][axis] = value;
}
function applyDrivers() {
  objects.forEach(mesh => {
    for (const driver of mesh.userData.modelrDrivers || []) {
      const source = objects.find(item => item.userData.modelrAnimationId === driver.sourceId);
      if (!source) continue;
      try {
        const value = evaluateDriverExpression(driver.expression, propertyValue(source, driver.sourceProperty));
        setPropertyValue(mesh, driver.targetProperty, value);
      } catch (error) {
        driver.error = error.message;
      }
    }
  });
}
function renderGraphEditor() {
  const graph = document.querySelector('#animationGraph');
  const channel = document.querySelector('#graphChannel').value.split(':');
  const keys = selected ? keyframesFor(selected).slice().sort((a, b) => a.frame - b.frame) : [];
  const [property, axisText] = channel;
  const axis = Number(axisText);
  const values = keys.map(key => key[property]?.[axis]).filter(Number.isFinite);
  const width = 800, height = 260, left = 52, right = 18, top = 18, bottom = 34;
  const min = values.length ? Math.min(...values) : -1;
  const max = values.length ? Math.max(...values) : 1;
  const range = Math.max(max - min, .1);
  const low = min - range * .15, high = max + range * .15;
  const x = frame => left + THREE.MathUtils.clamp(frame / endFrame, 0, 1) * (width - left - right);
  const y = value => top + (1 - (value - low) / (high - low)) * (height - top - bottom);
  let markup = '';
  for (let step = 0; step <= 4; step++) {
    const lineY = top + step * (height - top - bottom) / 4;
    const valueLabel = (high - step * (high - low) / 4).toFixed(2);
    markup += `<line class="graph-grid" x1="${left}" y1="${lineY}" x2="${width - right}" y2="${lineY}"/><text class="graph-axis-label" x="4" y="${lineY + 3}">${valueLabel}</text>`;
  }
  for (let step = 0; step <= 6; step++) {
    const frame = Math.round(endFrame * step / 6);
    const lineX = x(frame);
    markup += `<line class="graph-grid" x1="${lineX}" y1="${top}" x2="${lineX}" y2="${height - bottom}"/><text class="graph-axis-label" x="${lineX}" y="${height - 8}" text-anchor="middle">${frame}</text>`;
  }
  if (!keys.length) markup += '<text class="graph-empty" x="400" y="130" text-anchor="middle">Add keyframes to view this channel curve.</text>';
  else {
    const points = [];
    for (let index = 0; index < keys.length; index++) {
      const from = keys[index];
      points.push(`${x(from.frame)},${y(from[property][axis])}`);
      const to = keys[index + 1];
      if (!to) continue;
      for (let sample = 1; sample < 12; sample++) {
        const amount = interpolateKeyframeAmount(sample / 12, from.interpolation);
        points.push(`${x(THREE.MathUtils.lerp(from.frame, to.frame, sample / 12))},${y(THREE.MathUtils.lerp(from[property][axis], to[property][axis], amount))}`);
      }
    }
    markup += `<polyline class="graph-curve" points="${points.join(' ')}"/>`;
    keys.forEach(key => { markup += `<circle class="graph-key" data-frame="${key.frame}" cx="${x(key.frame)}" cy="${y(key[property][axis])}" r="6"><title>Frame ${key.frame}: ${key[property][axis].toFixed(3)}</title></circle>`; });
  }
  graph.innerHTML = markup;
}
function updateAnimationWorkspace() {
  document.querySelector('#animationWorkspaceObject').textContent = selected?.name || 'No object selected';
  renderGraphEditor();
  renderNlaEditor();
  renderDriverEditor();
  renderShapeKeyEditor();
}
function openAnimationWorkspace(tab = 'graph') {
  document.querySelector('#animationWorkspace').classList.add('open');
  document.querySelector('#animationWorkspace').setAttribute('aria-hidden', 'false');
  document.querySelectorAll('[data-animation-tab]').forEach(button => {
    const active = button.dataset.animationTab === tab;
    button.classList.toggle('active', active);
  });
  document.querySelectorAll('.animation-workspace-panel').forEach(panel => panel.classList.toggle('active', panel.id === `animation${tab[0].toUpperCase()}${tab.slice(1)}Panel`));
  updateAnimationWorkspace();
}
function createAction() {
  if (!selected) return;
  const keys = keyframesFor(selected);
  if (!keys.length) { window.alert('Add at least one keyframe before creating an action.'); return; }
  rememberScene();
  const actions = selected.userData.modelrActions ||= [];
  const action = {
    id: `action-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    name: document.querySelector('#actionNameInput').value.trim() || `Action ${actions.length + 1}`,
    keyframes: structuredClone(keys)
  };
  actions.push(action);
  const strips = selected.userData.modelrNlaStrips ||= [];
  strips.push({ id: `strip-${Date.now()}`, actionId: action.id, start: Math.round(currentFrame), repeat: 1, scale: 1, influence: 1, muted: false });
  document.querySelector('#actionNameInput').value = '';
  updateAnimationWorkspace();
}
function renderNlaEditor() {
  const list = document.querySelector('#nlaActionList');
  if (!list) return;
  const actions = selected?.userData.modelrActions || [];
  const strips = selected?.userData.modelrNlaStrips || [];
  list.innerHTML = actions.length ? actions.map(action => {
    const strip = strips.find(item => item.actionId === action.id);
    const duration = Math.max(1, action.keyframes.at(-1).frame - action.keyframes[0].frame);
    const repeated = strip ? `<div class="nla-visual-track"><button class="nla-strip" data-strip-drag="${strip.id}" style="left:${THREE.MathUtils.clamp(strip.start / endFrame, 0, 1) * 100}%;width:${THREE.MathUtils.clamp(duration * strip.repeat * strip.scale / endFrame, .04, 1) * 100}%" title="${escapeListText(action.name)} · ${duration} frames × ${strip.repeat}">▰ ${escapeListText(action.name)}</button></div><label>Start <input type="number" min="0" max="1200" value="${strip.start}" data-strip="${strip.id}" data-field="start"></label><label>Repeat <input type="number" min="1" max="100" value="${strip.repeat}" data-strip="${strip.id}" data-field="repeat"></label><label>Speed <input type="number" min="0.1" max="10" step="0.1" value="${strip.scale}" data-strip="${strip.id}" data-field="scale"></label><label>Mix <input type="range" min="0" max="1" step="0.01" value="${strip.influence}" data-strip="${strip.id}" data-field="influence"></label><label>Mute <input type="checkbox" ${strip.muted ? 'checked' : ''} data-strip="${strip.id}" data-field="muted"></label><button data-action-remove-strip="${strip.id}">Remove strip</button>` : `<button data-action-add-strip="${action.id}">Add NLA strip</button>`;
    return `<div class="animation-row"><b>${escapeListText(action.name)}</b><small>${action.keyframes.length} keys · ${duration} frames</small>${repeated}<button data-action-delete="${action.id}">Delete action</button></div>`;
  }).join('') : '<div class="animation-row"><small>No actions yet. Add keyframes and create an action.</small></div>';
  list.querySelectorAll('[data-action-add-strip]').forEach(button => button.onclick = () => {
    rememberScene();
    (selected.userData.modelrNlaStrips ||= []).push({ id: `strip-${Date.now()}`, actionId: button.dataset.actionAddStrip, start: Math.round(currentFrame), repeat: 1, scale: 1, influence: 1, muted: false });
    updateAnimationWorkspace();
  });
  list.querySelectorAll('[data-action-delete]').forEach(button => button.onclick = () => {
    rememberScene();
    const actionId = button.dataset.actionDelete;
    selected.userData.modelrActions = actions.filter(action => action.id !== actionId);
    selected.userData.modelrNlaStrips = strips.filter(strip => strip.actionId !== actionId);
    updateAnimationWorkspace();
  });
  list.querySelectorAll('[data-action-remove-strip]').forEach(button => button.onclick = () => {
    rememberScene();
    selected.userData.modelrNlaStrips = strips.filter(strip => strip.id !== button.dataset.actionRemoveStrip);
    updateAnimationWorkspace();
  });
  list.querySelectorAll('[data-strip]').forEach(input => {
    const update = () => {
      const strip = strips.find(item => item.id === input.dataset.strip);
      if (!strip) return;
      rememberScene();
      strip[input.dataset.field] = input.type === 'checkbox' ? input.checked : Number(input.value);
      if (input.dataset.field !== 'influence') { applyAnimationFrame(currentFrame); updateAnimationWorkspace(); }
      else applyAnimationFrame(currentFrame);
    };
    input.addEventListener(input.type === 'range' ? 'input' : 'change', update);
  });
  list.querySelectorAll('[data-strip-drag]').forEach(stripElement => stripElement.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    event.preventDefault();
    const strip = strips.find(item => item.id === stripElement.dataset.stripDrag);
    if (!strip) return;
    const startX = event.clientX;
    const originalStart = strip.start;
    const track = stripElement.parentElement.getBoundingClientRect();
    let changed = false;
    const move = pointerEvent => {
      if (!(pointerEvent.buttons & 1)) return finish();
      const nextStart = THREE.MathUtils.clamp(Math.round(originalStart + (pointerEvent.clientX - startX) / track.width * endFrame), 0, endFrame);
      if (nextStart === strip.start) return;
      if (!changed) rememberScene();
      changed = true;
      strip.start = nextStart;
      applyAnimationFrame(currentFrame);
      updateAnimationWorkspace();
    };
    const finish = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', finish);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', finish);
  }));
}
function renderDriverEditor() {
  const sourceSelect = document.querySelector('#driverSourceObject');
  const list = document.querySelector('#driverList');
  if (!sourceSelect || !list) return;
  sourceSelect.innerHTML = objects.map(mesh => `<option value="${mesh.userData.modelrAnimationId}" ${mesh === selected ? 'selected' : ''}>${escapeListText(mesh.name)}</option>`).join('');
  const drivers = selected?.userData.modelrDrivers || [];
  list.innerHTML = drivers.length ? drivers.map(driver => {
    const source = objects.find(mesh => mesh.userData.modelrAnimationId === driver.sourceId);
    return `<div class="animation-row"><b>${escapeListText(driver.targetProperty)}</b><small>${escapeListText(source?.name || 'Missing object')}.${escapeListText(driver.sourceProperty)} → ${escapeListText(driver.expression)}${driver.error ? ` · ${escapeListText(driver.error)}` : ''}</small><button data-driver-delete="${driver.id}">Delete</button></div>`;
  }).join('') : '<div class="animation-row"><small>No drivers on this object.</small></div>';
  list.querySelectorAll('[data-driver-delete]').forEach(button => button.onclick = () => {
    rememberScene();
    selected.userData.modelrDrivers = drivers.filter(driver => driver.id !== button.dataset.driverDelete);
    updateAnimationWorkspace();
    applyDrivers();
  });
}
function addDriver() {
  if (!selected || !objects.length) return;
  const expression = document.querySelector('#driverExpressionInput').value.trim();
  try { evaluateDriverExpression(expression, 1); }
  catch (error) { window.alert(`Invalid driver expression: ${error.message}`); return; }
  rememberScene();
  (selected.userData.modelrDrivers ||= []).push({
    id: `driver-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    sourceId: document.querySelector('#driverSourceObject').value,
    sourceProperty: document.querySelector('#driverSourceProperty').value,
    targetProperty: document.querySelector('#driverTargetProperty').value,
    expression
  });
  updateAnimationWorkspace();
  applyDrivers();
}
function addShapeKey() {
  if (!selected) return;
  const position = selected.geometry.attributes.position;
  const current = Array.from(position.array);
  if (!selected.userData.modelrShapeBasis) {
    rememberScene();
    selected.userData.modelrShapeBasis = current;
    selected.userData.modelrShapeKeys = [{ id: `shape-${Date.now()}`, name: 'Basis', positions: [...current], value: 0, basis: true }];
  } else {
    rememberScene();
    const keys = selected.userData.modelrShapeKeys ||= [];
    keys.push({ id: `shape-${Date.now()}`, name: `Key ${keys.filter(key => !key.basis).length + 1}`, positions: [...selected.userData.modelrShapeBasis], value: 0, basis: false });
  }
  updateAnimationWorkspace();
}
function captureShapeKey(keyId) {
  if (!selected) return;
  const key = (selected.userData.modelrShapeKeys || []).find(item => item.id === keyId && !item.basis);
  if (!key) return;
  rememberScene();
  key.positions = Array.from(selected.geometry.attributes.position.array);
  applyShapeWeights(selected, (selected.userData.modelrShapeKeys || []).map(() => 0));
  updateVertexOverlay();
  updateAnimationWorkspace();
}
function renderShapeKeyEditor() {
  const list = document.querySelector('#shapeKeyList');
  if (!list) return;
  const keys = selected?.userData.modelrShapeKeys || [];
  list.innerHTML = keys.length ? keys.map(key => key.basis
    ? `<div class="animation-row"><b>Basis</b><small>Reference shape</small></div>`
    : `<div class="animation-row"><b>${escapeListText(key.name)}</b><input type="range" min="0" max="1" step="0.01" value="${key.value || 0}" data-shape-value="${key.id}"><span class="row-value">${Number(key.value || 0).toFixed(2)}</span><button data-shape-capture="${key.id}">Capture edited shape</button><button data-shape-delete="${key.id}">Delete</button></div>`).join('') : '<div class="animation-row"><small>No shape keys. Add a Basis and a key, edit vertices, then capture the edited shape.</small></div>';
  list.querySelectorAll('[data-shape-value]').forEach(input => input.addEventListener('input', () => {
    const index = keys.findIndex(key => key.id === input.dataset.shapeValue);
    const weights = keys.map(key => key.value || 0);
    weights[index] = Number(input.value);
    applyShapeWeights(selected, weights);
    input.nextElementSibling.textContent = Number(input.value).toFixed(2);
    if (selectedVertexIndex !== null) updateVertexOverlay();
  }));
  list.querySelectorAll('[data-shape-capture]').forEach(button => button.onclick = () => captureShapeKey(button.dataset.shapeCapture));
  list.querySelectorAll('[data-shape-delete]').forEach(button => button.onclick = () => {
    rememberScene();
    const index = keys.findIndex(key => key.id === button.dataset.shapeDelete);
    if (index >= 0) keys.splice(index, 1);
    applyShapeWeights(selected, keys.map(key => key.value || 0));
    updateAnimationWorkspace();
  });
}
function updateTimeline() {
  const frameInput = document.querySelector('#currentFrameInput');
  const endInput = document.querySelector('#endFrameInput');
  if (!frameInput || !endInput) return;
  frameInput.max = String(endFrame);
  frameInput.value = String(Math.round(currentFrame));
  endInput.value = String(endFrame);
  document.querySelectorAll('#timelineRuler > span').forEach((label, index) => { label.textContent = String(Math.round(endFrame * index / 6)); });
  const percent = endFrame ? THREE.MathUtils.clamp(currentFrame / endFrame, 0, 1) * 100 : 0;
  document.querySelector('#timelinePlayhead').style.left = `${percent}%`;
  const keys = selected ? keyframesFor(selected) : [];
  const markers = document.querySelector('#timelineKeyframes');
  const tracks = ['location', 'rotation', 'scale', 'color'];
  markers.innerHTML = tracks.map(track => `<div class="timeline-track" data-track="${track}">${keys.map(keyframe => {
    const keyPercent = THREE.MathUtils.clamp(keyframe.frame / endFrame, 0, 1) * 100;
    return `<button class="timeline-key" data-frame="${keyframe.frame}" data-easing="${keyframe.interpolation || 'linear'}" title="${track} · Frame ${keyframe.frame}" style="left:${keyPercent}%"></button>`;
  }).join('')}</div>`).join('');
  markers.querySelectorAll('.timeline-key').forEach(marker => {
    marker.addEventListener('pointerdown', event => beginKeyframeDrag(event, marker));
    marker.addEventListener('click', event => {
      event.stopPropagation();
      setCurrentFrame(Number(marker.dataset.frame));
    });
  });
  document.querySelector('#timelineEndLabel').textContent = String(endFrame);
  const hasKey = keys.some(keyframe => keyframe.frame === Math.round(currentFrame));
  document.querySelector('#addKeyframeButton').disabled = !selected;
  document.querySelector('#deleteKeyframeButton').disabled = !hasKey;
  document.querySelector('#addKeyframeButton').classList.toggle('has-key', hasKey);
  document.querySelector('#loopPlaybackInput').checked = loopPlayback;
  const currentKey = keys.find(keyframe => keyframe.frame === Math.round(currentFrame));
  document.querySelector('#interpolationSelect').disabled = !currentKey;
  document.querySelector('#interpolationSelect').value = currentKey?.interpolation || 'linear';
}
function setCurrentFrame(frame, apply = true) {
  currentFrame = THREE.MathUtils.clamp(Number(frame) || 0, 0, endFrame);
  if (apply) applyAnimationFrame(currentFrame);
  updateTimeline();
}
function captureKeyframe(mesh, frame = Math.round(currentFrame)) {
  const keyframe = {
    frame,
    position: mesh.position.toArray(),
    rotation: [mesh.rotation.x, mesh.rotation.y, mesh.rotation.z],
    scale: mesh.scale.toArray(),
    color: `#${meshMaterials(mesh)[0]?.color?.getHexString() || 'ffffff'}`,
    interpolation: document.querySelector('#interpolationSelect').value || 'linear',
    shapeWeights: (mesh.userData.modelrShapeKeys || []).map(key => key.value || 0)
  };
  const keyframes = keyframesFor(mesh);
  const existing = keyframes.findIndex(item => item.frame === frame);
  if (existing >= 0) keyframes[existing] = keyframe;
  else keyframes.push(keyframe);
  keyframes.sort((a, b) => a.frame - b.frame);
}
function insertKeyframe() {
  if (!selected) return;
  stopPlayback();
  setCurrentFrame(Math.round(currentFrame), false);
  rememberScene();
  captureKeyframe(selected);
  updateTimeline();
}
function deleteKeyframe() {
  if (!selected) return;
  stopPlayback();
  const frame = Math.round(currentFrame);
  const keyframes = keyframesFor(selected);
  const index = keyframes.findIndex(keyframe => keyframe.frame === frame);
  if (index < 0) return;
  setCurrentFrame(frame, false);
  rememberScene();
  keyframes.splice(index, 1);
  applyAnimationFrame(currentFrame);
  updateTimeline();
}
function beginKeyframeDrag(event, marker) {
  if (event.button !== 0 || !selected) return;
  event.preventDefault();
  event.stopPropagation();
  const sourceFrame = Number(marker.dataset.frame);
  const keyframe = keyframesFor(selected).find(item => item.frame === sourceFrame);
  if (!keyframe) return;
  stopPlayback();
  const ruler = document.querySelector('#timelineRuler');
  let moved = false;
  const move = pointerEvent => {
    if (!(pointerEvent.buttons & 1)) return finish();
    const rect = ruler.getBoundingClientRect();
    const proposed = Math.round(THREE.MathUtils.clamp((pointerEvent.clientX - rect.left) / rect.width, 0, 1) * endFrame);
    const occupied = new Set(keyframesFor(selected).filter(item => item !== keyframe).map(item => item.frame));
    let next = proposed;
    if (occupied.has(next)) {
      const forward = proposed + 1;
      const backward = proposed - 1;
      next = forward <= endFrame && !occupied.has(forward) ? forward : backward >= 0 && !occupied.has(backward) ? backward : keyframe.frame;
    }
    if (next === keyframe.frame) return;
    if (!moved) rememberScene();
    keyframe.frame = next;
    keyframesFor(selected).sort((a, b) => a.frame - b.frame);
    moved = true;
    setCurrentFrame(next);
  };
  const finish = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', finish);
    if (moved) updateTimeline();
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', finish);
}
function stopPlayback() {
  isPlaying = false;
  if (playbackRequest) cancelAnimationFrame(playbackRequest);
  playbackRequest = 0;
  playbackRemainder = 0;
  document.querySelector('#playAnimationButton').textContent = '▶';
  document.querySelector('#playAnimationButton').title = 'Play animation';
  document.querySelector('#playAnimationButton').setAttribute('aria-label', 'Play animation');
}
function playbackTick(timestamp) {
  if (!isPlaying) return;
  if (!lastPlaybackTime) lastPlaybackTime = timestamp;
  playbackRemainder += timestamp - lastPlaybackTime;
  lastPlaybackTime = timestamp;
  const frameDuration = 1000 / FRAME_RATE;
  const framesToAdvance = Math.floor(playbackRemainder / frameDuration);
  if (framesToAdvance > 0) {
    playbackRemainder -= framesToAdvance * frameDuration;
    const nextFrame = currentFrame + framesToAdvance;
    if (nextFrame >= endFrame && !loopPlayback) {
      setCurrentFrame(endFrame);
      stopPlayback();
      return;
    }
    setCurrentFrame(loopPlayback && nextFrame > endFrame ? nextFrame % (endFrame + 1) : nextFrame);
  }
  playbackRequest = requestAnimationFrame(playbackTick);
}
function togglePlayback() {
  if (isPlaying) { stopPlayback(); return; }
  if (currentFrame >= endFrame) setCurrentFrame(0);
  isPlaying = true;
  lastPlaybackTime = 0;
  document.querySelector('#playAnimationButton').textContent = '❚❚';
  document.querySelector('#playAnimationButton').title = 'Pause animation';
  document.querySelector('#playAnimationButton').setAttribute('aria-label', 'Pause animation');
  playbackRequest = requestAnimationFrame(playbackTick);
}
function serializedTriangleCount(item) {
  const json = item.serialized;
  const geometry = json?.geometries?.find(entry => entry.uuid === json.object?.geometry)?.data;
  if (!geometry) return 0;
  const indexCount = geometry.index?.array?.length;
  const position = geometry.attributes?.position;
  const vertexCount = position?.count || (position?.array?.length / (position?.itemSize || 3));
  return Math.floor((indexCount || vertexCount || 0) / 3);
}
function sceneSnapshot() { return objects.map(mesh => { const material = meshMaterials(mesh)[0]; const snapshot = { name: mesh.name, type: mesh.name.startsWith('Sphere') ? 'Sphere' : mesh.name.startsWith('Cylinder') ? 'Cylinder' : mesh.name.startsWith('Torus') ? 'Torus' : mesh.name.startsWith('Cone') ? 'Cone' : mesh.name.startsWith('Crown') ? 'Crown' : 'Cube', color: material?.color?.getHexString() || '999999', position: mesh.position.toArray(), scale: mesh.scale.toArray(), rotation: mesh.rotation.toArray(), rounding: mesh.userData.rounding || 0, visible: mesh.visible, animationId: mesh.userData.modelrAnimationId, keyframes: (mesh.userData.modelrKeyframes || []).map(keyframe => ({ ...keyframe, position: [...keyframe.position], rotation: [...keyframe.rotation], scale: [...keyframe.scale], shapeWeights: [...(keyframe.shapeWeights || [])] })), actions: structuredClone(mesh.userData.modelrActions || []), nlaStrips: structuredClone(mesh.userData.modelrNlaStrips || []), drivers: structuredClone(mesh.userData.modelrDrivers || []), shapeBasis: mesh.userData.modelrShapeBasis ? [...mesh.userData.modelrShapeBasis] : null, shapeKeys: structuredClone(mesh.userData.modelrShapeKeys || []), timelineFrame: currentFrame, timelineEnd: endFrame, loopPlayback }; if (mesh.userData.modelrImported) { snapshot.type = 'Imported'; snapshot.serialized = importedMeshSnapshot(mesh); } else if (mesh.userData.modelrVertexEdited) { snapshot.geometry = mesh.geometry.toJSON(); } return snapshot; }); }
function rememberScene() { undoStack.push(sceneSnapshot()); if (undoStack.length > 50) undoStack.shift(); redoStack.length = 0; }
function addUserObject(type, color, position) {
  if (objects.length >= MAX_SCENE_OBJECTS) { sceneLimitNotice(`This scene is limited to ${MAX_SCENE_OBJECTS} objects to keep the editor responsive.`); return; }
  const candidate = makeMesh(type, color);
  const exceedsTriangleLimit = sceneTriangleCount() + triangleCount(candidate) > MAX_SCENE_TRIANGLES;
  candidate.geometry.dispose();
  candidate.material.dispose();
  if (exceedsTriangleLimit) { sceneLimitNotice(`This scene is limited to ${MAX_SCENE_TRIANGLES.toLocaleString()} triangles to keep the editor responsive.`); return; }
  rememberScene();
  addObject(type, color, position);
}
function restoreScene(snapshot) {
  stopPlayback();
  currentFrame = 0;
  endFrame = DEFAULT_END_FRAME;
  loopPlayback = false;
  clearVertexOverlay();
  discardSelectionOutline();
  objects.forEach(mesh => { scene.remove(mesh); mesh.geometry.dispose(); meshMaterials(mesh).forEach(material => { for (const value of Object.values(material)) if (value?.isTexture) value.dispose(); material.dispose(); }); });
  objects.length = 0;
  let restoredTriangles = 0;
  let skippedObjects = snapshot.length > MAX_SCENE_OBJECTS;
  snapshot.filter(item => item.serialized || (Array.isArray(item.position) && item.position.length === 3 && item.position.every(Number.isFinite))).slice(0, MAX_SCENE_OBJECTS).forEach((item, index) => {
    const type = item.type || 'Cube';
    if (item.serialized && restoredTriangles + serializedTriangleCount(item) > MAX_SCENE_TRIANGLES) { skippedObjects = true; return; }
    const mesh = item.serialized ? new THREE.ObjectLoader().parse(item.serialized) : makeMesh(type, parseInt(item.color || '999999', 16));
    if (item.geometry && !item.serialized) { mesh.geometry.dispose(); mesh.geometry = new THREE.BufferGeometryLoader().parse(item.geometry); mesh.userData.modelrVertexEdited = true; }
    mesh.name = String(item.name || `${type} ${index + 1}`);
    if (item.position) mesh.position.fromArray(item.position);
    if (item.scale) mesh.scale.fromArray(item.scale);
    if (item.rotation) mesh.rotation.fromArray(item.rotation);
    mesh.visible = item.visible !== false;
    mesh.userData.modelrAnimationId = item.animationId || `animation-${Date.now()}-${index}-${Math.random().toString(36).slice(2)}`;
    const normalizeKeys = keys => Array.isArray(keys) ? keys.filter(isValidKeyframe).slice(0, 1000).map(keyframe => ({
      frame: keyframe.frame, position: [...keyframe.position], rotation: [...keyframe.rotation], scale: [...keyframe.scale],
      color: keyframe.color, shapeWeights: [...(keyframe.shapeWeights || [])],
      interpolation: ['linear', 'ease', 'constant'].includes(keyframe.interpolation) ? keyframe.interpolation : 'linear'
    })) : [];
    mesh.userData.modelrKeyframes = normalizeKeys(item.keyframes);
    mesh.userData.modelrActions = Array.isArray(item.actions) ? item.actions.filter(action => action && typeof action.id === 'string' && typeof action.name === 'string').slice(0, 100).map(action => ({ id: action.id.slice(0, 120), name: action.name.slice(0, 48), keyframes: normalizeKeys(action.keyframes) })).filter(action => action.keyframes.length) : [];
    mesh.userData.modelrNlaStrips = Array.isArray(item.nlaStrips) ? item.nlaStrips.filter(strip => strip && typeof strip.id === 'string' && mesh.userData.modelrActions.some(action => action.id === strip.actionId)).slice(0, 100).map(strip => ({
      id: strip.id.slice(0, 120), actionId: strip.actionId, start: THREE.MathUtils.clamp(Math.round(Number(strip.start) || 0), 0, 1200),
      repeat: THREE.MathUtils.clamp(Math.round(Number(strip.repeat) || 1), 1, 100), scale: THREE.MathUtils.clamp(Number(strip.scale) || 1, .1, 10),
      influence: THREE.MathUtils.clamp(Number(strip.influence ?? 1), 0, 1), muted: Boolean(strip.muted)
    })) : [];
    mesh.userData.modelrDrivers = Array.isArray(item.drivers) ? item.drivers.filter(driver => driver && typeof driver.id === 'string' && typeof driver.sourceId === 'string' && isAnimationProperty(driver.sourceProperty) && isAnimationProperty(driver.targetProperty) && typeof driver.expression === 'string').slice(0, 100).map(driver => ({
      id: driver.id.slice(0, 120), sourceId: driver.sourceId.slice(0, 120), sourceProperty: driver.sourceProperty,
      targetProperty: driver.targetProperty, expression: driver.expression.slice(0, 200)
    })) : [];
    const positionCount = mesh.geometry.attributes.position?.count || 0;
    const validShapePositions = positions => Array.isArray(positions) && positions.length === positionCount * 3 && positions.every(Number.isFinite);
    mesh.userData.modelrShapeBasis = validShapePositions(item.shapeBasis) ? item.shapeBasis : null;
    mesh.userData.modelrShapeKeys = mesh.userData.modelrShapeBasis && Array.isArray(item.shapeKeys) ? item.shapeKeys.filter(key => key && typeof key.name === 'string' && validShapePositions(key.positions)).slice(0, 64).map(key => ({
      id: String(key.id || `shape-${Math.random()}`).slice(0, 120), name: key.name.slice(0, 48), positions: key.positions,
      value: THREE.MathUtils.clamp(Number(key.value) || 0, 0, 1), basis: Boolean(key.basis)
    })) : [];
    if (Number.isFinite(item.timelineFrame)) currentFrame = item.timelineFrame;
    if (Number.isInteger(item.timelineEnd) && item.timelineEnd > 0) endFrame = THREE.MathUtils.clamp(item.timelineEnd, 1, 1200);
    if (typeof item.loopPlayback === 'boolean') loopPlayback = item.loopPlayback;
    if (!item.geometry && item.rounding && mesh.name.startsWith('Cube')) { mesh.userData.rounding = item.rounding; mesh.geometry.dispose(); mesh.geometry = new RoundedBoxGeometry(1.55, 1.55, 1.55, 4, item.rounding); }
    const meshTriangles = triangleCount(mesh);
    if (restoredTriangles + meshTriangles > MAX_SCENE_TRIANGLES) { mesh.geometry.dispose(); meshMaterials(mesh).forEach(material => material.dispose()); skippedObjects = true; return; }
    if (item.serialized) { mesh.userData.modelrImported = true; importedSerialization.set(mesh, item.serialized); }
    restoredTriangles += meshTriangles;
    scene.add(mesh);
    objects.push(mesh);
  });
  if (!objects.length) { const mesh = makeMesh('Cube', 0x999999); mesh.position.set(0, .8, 0); mesh.name = 'Cube 1'; scene.add(mesh); objects.push(mesh); }
  if (skippedObjects) sceneLimitNotice('Some objects were left out because the scene exceeds the editor performance limits.');
  selectObject(objects[0]);
  applyAnimationFrame(currentFrame);
  updateTimeline();
  updateList();
}
function duplicateSelected(exactPosition = false) { if (!selected) return; if (objects.length >= MAX_SCENE_OBJECTS || sceneTriangleCount() + triangleCount(selected) > MAX_SCENE_TRIANGLES) { sceneLimitNotice('This duplicate would exceed the scene performance limits.'); return; } rememberScene(); const duplicate = new THREE.Mesh(selected.geometry.clone(), Array.isArray(selected.material) ? selected.material.map(material => material.clone()) : selected.material.clone()); duplicate.name = `${selected.name} Copy ${objectIndex++}`; duplicate.position.copy(selected.position); if (!exactPosition) duplicate.position.add(new THREE.Vector3(.6, 0, .6)); duplicate.scale.copy(selected.scale); duplicate.rotation.copy(selected.rotation); duplicate.userData = { ...selected.userData, modelrAnimationId: `animation-${Date.now()}-${objectIndex}`, modelrKeyframes: (selected.userData.modelrKeyframes || []).map(keyframe => ({ ...keyframe, position: [...keyframe.position], rotation: [...keyframe.rotation], scale: [...keyframe.scale] })) }; duplicate.castShadow = selected.castShadow; duplicate.receiveShadow = selected.receiveShadow; scene.add(duplicate); objects.push(duplicate); selectObject(duplicate); updateTimeline(); updateList(); }
function undo() { if (!undoStack.length) return; redoStack.push(sceneSnapshot()); restoreScene(undoStack.pop()); }
function redo() { if (!redoStack.length) return; undoStack.push(sceneSnapshot()); restoreScene(redoStack.pop()); }

function updateScaleHandles() {
  const activeTool = document.querySelector('.tool.active')?.dataset.tool;
  moveHandles.forEach(handle => {
    handle.visible = editorMode === 'object' && Boolean(selected) && (activeTool === 'move' || activeTool === 'select');
    if (selected) handle.position.copy(selected.position);
  });
  scaleHandles.forEach(handle => {
    handle.visible = editorMode === 'object' && Boolean(selected) && activeTool === 'scale';
    if (!selected) return;
    const halfSize = selected.geometry.parameters?.width ? new THREE.Vector3(selected.geometry.parameters.width, selected.geometry.parameters.height, selected.geometry.parameters.depth).multiplyScalar(.5) : new THREE.Vector3(.85, .85, .85);
    const localPosition = new THREE.Vector3();
    localPosition[handle.userData.axis] = (halfSize[handle.userData.axis] * selected.scale[handle.userData.axis] + .28) * handle.userData.sign;
    handle.position.copy(selected.localToWorld(localPosition));
  });
  rotateHandles.forEach(handle => {
    handle.visible = editorMode === 'object' && Boolean(selected) && activeTool === 'rotate';
    if (!selected) return;
    handle.position.copy(selected.position);
    handle.scale.setScalar(Math.max(selected.scale.x, selected.scale.y, selected.scale.z));
  });
}
function discardSelectionOutline() { if (!selectionOutline) return; selectionOutline.parent?.remove(selectionOutline); selectionOutline.geometry.dispose(); selectionOutline.material.dispose(); selectionOutline = null; }
function clearVertexOverlay() {
  if (vertexOverlay) { selected?.remove(vertexOverlay); vertexOverlay.material.dispose(); vertexOverlay = null; }
  if (selectedVertexMarker) { selected?.remove(selectedVertexMarker); selectedVertexMarker.geometry.dispose(); selectedVertexMarker.material.dispose(); selectedVertexMarker = null; }
  if (componentOverlay) { selected?.remove(componentOverlay); componentOverlay.geometry.dispose(); componentOverlay.material.dispose(); componentOverlay = null; }
}
function updateVertexOverlay() {
  clearVertexOverlay();
  if (editorMode !== 'edit' || !selected?.geometry.attributes.position) return;
  vertexOverlay = new THREE.Points(selected.geometry, new THREE.PointsMaterial({ color: 0xf28c28, size: .09, sizeAttenuation: true, depthTest: true }));
  vertexOverlay.userData.vertexOverlay = true;
  selected.add(vertexOverlay);
  if (!selectedComponentPoints.length) return;
  const selectedPositions = [];
  selectedComponentPoints.forEach(point => selectedPositions.push(point.x, point.y, point.z));
  const highlightGeometry = new THREE.BufferGeometry();
  highlightGeometry.setAttribute('position', new THREE.Float32BufferAttribute(selectedPositions, 3));
  const highlightMaterial = componentMode === 'face'
    ? new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, transparent: true, opacity: .45, depthWrite: false })
    : componentMode === 'edge'
      ? new THREE.LineBasicMaterial({ color: 0xffffff, depthTest: false })
      : new THREE.PointsMaterial({ color: 0xffffff, size: .17, sizeAttenuation: true, depthTest: false });
  componentOverlay = componentMode === 'face'
    ? new THREE.Mesh(highlightGeometry, highlightMaterial)
    : componentMode === 'edge'
      ? new THREE.LineSegments(highlightGeometry, highlightMaterial)
      : new THREE.Points(highlightGeometry, highlightMaterial);
  componentOverlay.renderOrder = 11;
  selected.add(componentOverlay);
}
function setComponentMode(mode) {
  componentMode = ['vertex', 'edge', 'face'].includes(mode) ? mode : 'vertex';
  selectedComponentPoints = [];
  document.querySelectorAll('[data-component-mode]').forEach(button => {
    const active = button.dataset.componentMode === componentMode;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  updateVertexOverlay();
  if (editorMode === 'edit') document.querySelector('#editorModeLabel').textContent = `${componentMode[0].toUpperCase()}${componentMode.slice(1)} Edit`;
  if (editorMode === 'edit') document.querySelector('.viewport-hint').textContent = `Click a ${componentMode} to select · Drag to move · Tab: Object Mode`;
}
function nearestMeshEdge(mesh, hit) {
  const geometry = mesh.geometry;
  const position = geometry.attributes.position;
  if (!position || !hit?.face) return null;
  const faceIndices = [hit.face.a, hit.face.b, hit.face.c];
  const localA = new THREE.Vector3();
  const localB = new THREE.Vector3();
  const worldA = new THREE.Vector3();
  const worldB = new THREE.Vector3();
  const closestRay = new THREE.Vector3();
  const closestEdge = new THREE.Vector3();
  let nearest = null;
  let nearestDistanceSq = Infinity;
  for (const [a, b] of [[faceIndices[0], faceIndices[1]], [faceIndices[1], faceIndices[2]], [faceIndices[2], faceIndices[0]]]) {
    localA.fromBufferAttribute(position, a);
    localB.fromBufferAttribute(position, b);
    worldA.copy(localA); mesh.localToWorld(worldA);
    worldB.copy(localB); mesh.localToWorld(worldB);
    const distanceSq = raycaster.ray.distanceSqToSegment(worldA, worldB, closestRay, closestEdge);
    if (distanceSq < nearestDistanceSq) {
      nearestDistanceSq = distanceSq;
      nearest = [localA.clone(), localB.clone()];
    }
  }
  const threshold = Math.max(.045, camera.position.distanceTo(mesh.position) * .012);
  return nearest && nearestDistanceSq <= threshold * threshold ? nearest : null;
}
function componentPointsFromHit(hit) {
  if (!hit || !selected) return [];
  const position = selected.geometry.attributes.position;
  if (componentMode === 'vertex') {
    const index = hit.index;
    if (!Number.isInteger(index) || index < 0 || index >= position.count) return [];
    selectedVertexIndex = index;
    return [new THREE.Vector3().fromBufferAttribute(position, index)];
  }
  if (!hit.face) return [];
  return [hit.face.a, hit.face.b, hit.face.c].map(index => new THREE.Vector3().fromBufferAttribute(position, index));
}
function setEditorMode(mode) {
  editorMode = mode === 'edit' ? 'edit' : 'object';
  selectedVertexIndex = null;
  selectedComponentPoints = [];
  document.querySelectorAll('[data-editor-mode]').forEach(button => {
    const active = button.dataset.editorMode === editorMode;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  document.querySelector('#editComponentTools').classList.toggle('open', editorMode === 'edit');
  const label = editorMode === 'edit' ? `${componentMode[0].toUpperCase()}${componentMode.slice(1)} Edit` : 'Object Mode';
  document.querySelector('#editorModeLabel').textContent = label;
  document.querySelector('.viewport-hint').textContent = editorMode === 'edit'
    ? `Click a ${componentMode} to select · Drag to move · Tab: Object Mode`
    : 'Right-click: orbit · Scroll: zoom · Drag: transform · Tab: Edit Mode';
  updateVertexOverlay();
  updateScaleHandles();
}
function selectObject(mesh) { if (!mesh) return; clearVertexOverlay(); discardSelectionOutline(); selected = mesh; selectedVertexIndex = null; selectedComponentPoints = []; keyframesFor(mesh); selectionOutline = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), new THREE.LineBasicMaterial({ color: 0xf26639, transparent: true, opacity: .95, depthTest: false })); selectionOutline.renderOrder = 10; mesh.add(selectionOutline); document.querySelector('#selectionLabel').textContent = mesh.name; document.querySelector('#propertyName').textContent = mesh.name; document.querySelector('#propertyType').textContent = 'MESH'; const hex = `#${meshMaterials(mesh)[0]?.color?.getHexString() || 'ffffff'}`; document.querySelector('#colorPicker').value = hex; document.querySelector('#colorValue').textContent = hex.toUpperCase(); syncInputs(); updateVertexOverlay(); updateTimeline(); updateList(); if (document.querySelector('#animationWorkspace')?.classList.contains('open')) updateAnimationWorkspace(); }
function clearSelection() { clearVertexOverlay(); discardSelectionOutline(); selected = null; selectedVertexIndex = null; document.querySelector('#selectionLabel').textContent = 'No selection'; updateScaleHandles(); updateTimeline(); updateList(); if (document.querySelector('#animationWorkspace')?.classList.contains('open')) updateAnimationWorkspace(); }
function syncInputs() { if (!selected) return; ['x','y','z'].forEach(axis => { document.querySelector(`#pos${axis.toUpperCase()}`).value = selected.position[axis].toFixed(2); document.querySelector(`#scale${axis.toUpperCase()}`).value = selected.scale[axis].toFixed(2); }); const rounding = document.querySelector('#edgeRounding'); if (rounding) { rounding.value = selected.userData.rounding || 0; document.querySelector('#edgeRoundingValue').textContent = Number(rounding.value).toFixed(2); rounding.disabled = !selected.name.startsWith('Cube'); } const color = meshMaterials(selected)[0]?.color?.getHexString() || 'ffffff'; document.querySelector('#selectedDot').style.background = `#${color}`; document.querySelector('#colorPicker').value = `#${color}`; document.querySelector('#colorValue').textContent = `#${color.toUpperCase()}`; updateScaleHandles(); }
function setEdgeRounding(value) { if (!selected || !selected.name.startsWith('Cube')) return; const rounding = Math.min(.7, Math.max(0, Number(value) || 0)); const oldGeometry = selected.geometry; selected.geometry = new RoundedBoxGeometry(1.55, 1.55, 1.55, 4, rounding); selected.geometry.computeVertexNormals(); selected.userData.rounding = rounding; oldGeometry.dispose(); discardSelectionOutline(); selectionOutline = new THREE.LineSegments(new THREE.EdgesGeometry(selected.geometry), new THREE.LineBasicMaterial({ color: 0xf26639, transparent: true, opacity: .95, depthTest: false })); selectionOutline.renderOrder = 10; selected.add(selectionOutline); document.querySelector('#edgeRoundingValue').textContent = rounding.toFixed(2); updateScaleHandles(); }
function escapeListText(value) { return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;'); }
function updateList() {
  const icon = mesh => mesh.name.startsWith('Sphere') ? '●' : mesh.name.startsWith('Cylinder') ? '▱' : mesh.name.startsWith('Torus') ? '○' : mesh.name.startsWith('Cone') ? '△' : mesh.name.startsWith('Crown') ? '♕' : '◇';
  const row = (mesh, className) => `<button class="${className} ${mesh === selected ? 'selected' : ''}" data-name="${escapeListText(mesh.name)}"><span>${icon(mesh)}</span><b>${escapeListText(mesh.name)}</b><small>MESH</small></button>`;
  const list = document.querySelector('#objectList');
  const partsList = document.querySelector('#partsList');
  const rows = `<div class="outliner-collection"><span>▾</span><b>Scene Collection</b><small>${objects.length}</small></div>${objects.map(mesh => `<div class="outliner-entry">${row(mesh, 'object-row')}<button class="outliner-visibility" data-name="${escapeListText(mesh.name)}" title="${mesh.visible ? 'Hide object' : 'Show object'}" aria-label="${mesh.visible ? 'Hide' : 'Show'} ${escapeListText(mesh.name)}">${mesh.visible ? '◉' : '○'}</button></div>`).join('')}`;
  const groups = new Map();
  const standalone = [];
  objects.forEach(mesh => {
    if (!mesh.userData.modelrImported) { standalone.push(mesh); return; }
    const id = mesh.userData.modelrGroupId || 'legacy-imported';
    if (!groups.has(id)) groups.set(id, { name: mesh.userData.modelrGroupName || 'Imported model', meshes: [] });
    groups.get(id).meshes.push(mesh);
  });
  const folderRows = Array.from(groups, ([id, group]) => `<details class="model-folder" data-group="${escapeListText(id)}" ${collapsedModelFolders.has(id) ? '' : 'open'}><summary><span class="model-folder-icon">▰</span><b>${escapeListText(group.name)}</b><small>${group.meshes.length}</small></summary><div class="model-folder-items">${group.meshes.map(mesh => row(mesh, 'part-row')).join('')}</div></details>`).join('');
  if (list) list.innerHTML = rows;
  if (partsList) partsList.innerHTML = `${standalone.map(mesh => row(mesh, 'part-row')).join('')}${folderRows}`;
  partsList?.querySelectorAll('.model-folder').forEach(folder => folder.addEventListener('toggle', () => {
    if (folder.open) collapsedModelFolders.delete(folder.dataset.group);
    else collapsedModelFolders.add(folder.dataset.group);
  }));
  document.querySelector('#objectCount')?.replaceChildren(document.createTextNode(`${objects.length} objects`));
  document.querySelector('#partsCount')?.replaceChildren(document.createTextNode(objects.length));
  document.querySelectorAll('.object-row,.part-row').forEach(item => {
    item.onclick = () => selectObject(objects.find(mesh => mesh.name === item.dataset.name));
    item.ondblclick = () => selectObject(objects.find(mesh => mesh.name === item.dataset.name));
  });
  document.querySelectorAll('.outliner-visibility').forEach(button => {
    button.onclick = event => {
      event.stopPropagation();
      const mesh = objects.find(item => item.name === button.dataset.name);
      if (!mesh) return;
      rememberScene();
      mesh.visible = !mesh.visible;
      updateList();
    };
  });
}
function resize() { const rect = viewport.getBoundingClientRect(); renderer.setSize(rect.width, rect.height, false); camera.aspect = rect.width / rect.height; camera.updateProjectionMatrix(); }
new ResizeObserver(resize).observe(viewport); resize();
const renderScene = () => { controls.update(); applyDrivers(); renderer.render(scene, camera); };
new MutationObserver(() => { if (appShell.getAttribute('aria-hidden') === 'false') requestAnimationFrame(() => { resize(); renderScene(); }); }).observe(appShell, { attributes: true, attributeFilter: ['aria-hidden'] });

document.querySelectorAll('.tool[data-tool]').forEach(button => button.addEventListener('click', () => { document.querySelectorAll('.tool[data-tool]').forEach(item => item.classList.remove('active')); button.classList.add('active'); updateScaleHandles(); }));
document.querySelector('#addCube').onclick = () => addUserObject('Cube', 0x999999, [Math.random() * 3 - 1.5, .8, Math.random() * 2 - 1]);
document.querySelector('#addSphere').onclick = () => addUserObject('Sphere', 0x7692bd, [Math.random() * 3 - 1.5, .85, Math.random() * 2 - 1]);
document.querySelector('#addCylinder').onclick = () => addUserObject('Cylinder', 0x87a479, [Math.random() * 3 - 1.5, .75, Math.random() * 2 - 1]);
document.querySelector('#addTorus').onclick = () => addUserObject('Torus', 0xd6a843, [Math.random() * 3 - 1.5, .9, Math.random() * 2 - 1]);
document.querySelector('#addCone').onclick = () => addUserObject('Cone', 0xc56b45, [Math.random() * 3 - 1.5, .9, Math.random() * 2 - 1]);
document.querySelector('#addCrown').onclick = () => addUserObject('Crown', 0xd6a843, [Math.random() * 3 - 1.5, .9, Math.random() * 2 - 1]);
document.querySelector('#edgeRounding').addEventListener('input', event => { rememberScene(); setEdgeRounding(event.target.value); });
['posX','posY','posZ','scaleX','scaleY','scaleZ'].forEach(id => document.querySelector(`#${id}`).addEventListener('input', event => { if (!selected) return; const prop = id.startsWith('pos') ? 'position' : 'scale'; const axis = id.slice(-1).toLowerCase(); selected[prop][axis] = Number(event.target.value); }));

const raycaster = new THREE.Raycaster();
raycaster.params.Line.threshold = .18;
raycaster.params.Points.threshold = .12;
const pointer = new THREE.Vector2();
const grabPlane = new THREE.Plane();
const grabPoint = new THREE.Vector3();
const grabOffset = new THREE.Vector3();
let dragStart = null;
function snappedRotation(value) { const snap = document.querySelector('#rotationSnap'); const input = document.querySelector('#rotationStep'); if (!snap || !input || !snap.checked) return value; const step = Math.max(1, Number(input.value) || 15) * Math.PI / 180; return Math.round(value / step) * step; }
document.querySelector('#rotationStep')?.addEventListener('input', () => { const snap = document.querySelector('#rotationSnap'); if (snap) snap.checked = true; });
document.querySelectorAll('[data-editor-mode]').forEach(button => button.addEventListener('click', () => setEditorMode(button.dataset.editorMode)));
document.querySelectorAll('[data-component-mode]').forEach(button => button.addEventListener('click', () => setComponentMode(button.dataset.componentMode)));
renderer.domElement.addEventListener('pointerdown', event => {
  if (event.button !== 0) return;
  if (isPlaying) stopPlayback();
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  if (editorMode === 'edit') {
    if (!selected) return;
    selectedComponentPoints = [];
    let hit = null;
    const surfaceHit = raycaster.intersectObject(selected, false)[0] || null;
    if (componentMode === 'vertex' && vertexOverlay) hit = raycaster.intersectObject(vertexOverlay)[0] || null;
    else if (componentMode === 'edge') {
      const edge = nearestMeshEdge(selected, surfaceHit);
      if (edge) hit = { componentPoints: edge };
    } else if (componentMode === 'face') hit = surfaceHit;
    const componentPoints = hit?.componentPoints || componentPointsFromHit(hit);
    if (componentPoints.length) {
      selectedComponentPoints = componentPoints;
      updateVertexOverlay();
      const componentIndex = componentMode === 'vertex' ? ` ${selectedVertexIndex + 1}` : '';
      document.querySelector('#selectionLabel').textContent = `${selected.name} · ${componentMode} ${componentIndex}`.trim();
      const localPosition = componentPoints[0].clone();
      const worldPosition = selected.localToWorld(localPosition.clone());
      const cameraNormal = new THREE.Vector3();
      camera.getWorldDirection(cameraNormal);
      grabPlane.setFromNormalAndCoplanarPoint(cameraNormal, worldPosition);
      const position = selected.geometry.attributes.position;
      const vertexIndices = [];
      const originalPositions = [];
      for (let index = 0; index < position.count; index++) {
        const point = new THREE.Vector3().fromBufferAttribute(position, index);
        if (componentPoints.some(componentPoint => point.distanceToSquared(componentPoint) < 1e-10)) {
          vertexIndices.push(index);
          originalPositions.push(point.toArray());
        }
      }
      dragStart = { kind: 'component', x: event.clientX, y: event.clientY, localPosition, componentPoints: componentPoints.map(point => point.clone()), vertexIndices, originalPositions, changed: false };
      controls.enabled = false;
      return;
    }
    const objectHit = raycaster.intersectObjects(objects, false)[0];
    if (objectHit && objectHit.object !== selected) selectObject(objectHit.object);
    else {
      selectedVertexIndex = null;
      selectedComponentPoints = [];
      if (selected) document.querySelector('#selectionLabel').textContent = selected.name;
      updateVertexOverlay();
    }
    return;
  }
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
  if (dragStart.kind === 'component') {
    if (!dragStart.changed && Math.hypot(event.clientX - dragStart.x, event.clientY - dragStart.y) < 2) return;
    if (!dragStart.changed) {
      rememberScene();
      selected.geometry = selected.geometry.clone();
      importedSerialization.delete(selected);
      selected.userData.modelrVertexEdited = true;
      updateVertexOverlay();
      dragStart.changed = true;
    }
    if (!raycaster.ray.intersectPlane(grabPlane, grabPoint)) return;
    const target = selected.worldToLocal(grabPoint.clone());
    const delta = target.sub(dragStart.localPosition);
    const position = selected.geometry.attributes.position;
    selectedComponentPoints = dragStart.componentPoints.map(point => point.clone().add(delta));
    dragStart.vertexIndices.forEach((index, offset) => {
      const original = dragStart.originalPositions[offset];
      position.setXYZ(index, original[0] + delta.x, original[1] + delta.y, original[2] + delta.z);
    });
    position.needsUpdate = true;
    selected.geometry.computeVertexNormals();
    selected.geometry.computeBoundingBox();
    selected.geometry.computeBoundingSphere();
    if (selectedVertexMarker) {
      const markerPosition = selectedVertexMarker.geometry.attributes.position;
      markerPosition.setXYZ(0, position.getX(selectedVertexIndex), position.getY(selectedVertexIndex), position.getZ(selectedVertexIndex));
      markerPosition.needsUpdate = true;
      selectedVertexMarker.geometry.computeBoundingSphere();
    }
    if (componentOverlay) {
      const overlayPosition = componentOverlay.geometry.attributes.position;
      selectedComponentPoints.forEach((point, index) => overlayPosition.setXYZ(index, point.x, point.y, point.z));
      overlayPosition.needsUpdate = true;
      if (componentMode === 'face') componentOverlay.geometry.computeVertexNormals();
      componentOverlay.geometry.computeBoundingSphere();
    }
    return;
  }
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
    const delta = axis === 'y' ? dx : -dy;
    selected.rotation[axis] = snappedRotation(dragStart.rotation[axis] + delta);
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
window.addEventListener('pointerup', () => {
  if (dragStart?.kind === 'component' && dragStart.changed && selected) {
    discardSelectionOutline();
    selectionOutline = new THREE.LineSegments(new THREE.EdgesGeometry(selected.geometry), new THREE.LineBasicMaterial({ color: 0xf26639, transparent: true, opacity: .95, depthTest: false }));
    selectionOutline.renderOrder = 10;
    selected.add(selectionOutline);
    updateVertexOverlay();
    updateList();
  }
  dragStart = null;
  controls.enabled = true;
});
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
  if (key === 'tab' && !event.target.matches('input, textarea')) { event.preventDefault(); setEditorMode(editorMode === 'object' ? 'edit' : 'object'); return; }
  if (key === ' ' && !event.target.matches('input, textarea, button')) { event.preventDefault(); togglePlayback(); return; }
  if (key === 'i' && !event.target.matches('input, textarea, button') && selected) { event.preventDefault(); insertKeyframe(); return; }
  const cameraMovement = { w: 'forward', arrowup: 'forward', s: 'backward', arrowdown: 'backward', a: 'left', arrowleft: 'left', d: 'right', arrowright: 'right' }[key];
  if (cameraMovement && !event.target.matches('input, textarea')) { event.preventDefault(); cameraKeys.add(key); return; }
  if ((event.ctrlKey || event.metaKey) && key === 'd' && !event.target.matches('input, textarea')) { event.preventDefault(); duplicateSelected(); return; }
  if (!(event.ctrlKey || event.metaKey) || !['z', 'y'].includes(key) || event.target.matches('input, textarea')) return;
  event.preventDefault();
  if (key === 'y' || (key === 'z' && event.shiftKey)) redo();
  else undo();
});
document.querySelector('#previousFrameButton').addEventListener('click', () => { stopPlayback(); setCurrentFrame(Math.round(currentFrame) - 1); });
document.querySelector('#nextFrameButton').addEventListener('click', () => { stopPlayback(); setCurrentFrame(Math.round(currentFrame) + 1); });
document.querySelector('#playAnimationButton').addEventListener('click', togglePlayback);
document.querySelector('#addKeyframeButton').addEventListener('click', insertKeyframe);
document.querySelector('#deleteKeyframeButton').addEventListener('click', deleteKeyframe);
document.querySelector('#currentFrameInput').addEventListener('change', event => { stopPlayback(); setCurrentFrame(Math.round(Number(event.target.value))); });
document.querySelector('#endFrameInput').addEventListener('change', event => {
  const maximumKeyframe = objects.reduce((max, mesh) => keyframesFor(mesh).reduce((trackMax, keyframe) => Math.max(trackMax, keyframe.frame), max), 0);
  rememberScene();
  endFrame = THREE.MathUtils.clamp(Math.max(Math.round(Number(event.target.value) || DEFAULT_END_FRAME), maximumKeyframe, 1), 1, 1200);
  setCurrentFrame(currentFrame);
});
document.querySelector('#loopPlaybackInput').addEventListener('change', event => {
  rememberScene();
  loopPlayback = event.target.checked;
});
document.querySelector('#interpolationSelect').addEventListener('change', event => {
  if (!selected) return;
  const keyframe = keyframesFor(selected).find(item => item.frame === Math.round(currentFrame));
  if (!keyframe) return;
  rememberScene();
  keyframe.interpolation = ['linear', 'ease', 'constant'].includes(event.target.value) ? event.target.value : 'linear';
  applyAnimationFrame(currentFrame);
  updateTimeline();
});
document.querySelector('#animationWorkspaceButton').addEventListener('click', () => openAnimationWorkspace('graph'));
document.querySelector('#closeAnimationWorkspace').addEventListener('click', () => {
  document.querySelector('#animationWorkspace').classList.remove('open');
  document.querySelector('#animationWorkspace').setAttribute('aria-hidden', 'true');
});
document.querySelectorAll('[data-animation-tab]').forEach(button => button.addEventListener('click', () => openAnimationWorkspace(button.dataset.animationTab)));
document.querySelector('#graphChannel').addEventListener('change', renderGraphEditor);
document.querySelector('#createActionButton').addEventListener('click', createAction);
document.querySelector('#addDriverButton').addEventListener('click', addDriver);
document.querySelector('#addShapeKeyButton').addEventListener('click', addShapeKey);
document.querySelector('#animationGraph').addEventListener('pointerdown', event => {
  const marker = event.target.closest('.graph-key');
  if (!marker || !selected) return;
  event.preventDefault();
  const keyframe = keyframesFor(selected).find(key => key.frame === Number(marker.dataset.frame));
  if (!keyframe) return;
  const [property, axisText] = document.querySelector('#graphChannel').value.split(':');
  const axis = Number(axisText);
  const svg = event.currentTarget;
  const rect = svg.getBoundingClientRect();
  const currentValues = keyframesFor(selected).map(key => key[property][axis]);
  const min = currentValues.length ? Math.min(...currentValues) : -1;
  const max = currentValues.length ? Math.max(...currentValues) : 1;
  const range = Math.max(max - min, .1);
  const low = min - range * .15, high = max + range * .15;
  const initial = keyframe[property][axis];
  let changed = false;
  const move = pointerEvent => {
    if (!(pointerEvent.buttons & 1)) return finish();
    const viewY = (pointerEvent.clientY - rect.top) * 260 / rect.height;
    const amount = THREE.MathUtils.clamp((viewY - 18) / (260 - 18 - 34), 0, 1);
    const value = high - amount * (high - low);
    if (!changed) rememberScene();
    changed = true;
    keyframe[property][axis] = value;
    applyAnimationFrame(currentFrame);
    renderGraphEditor();
  };
  const finish = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', finish);
    if (changed) { updateTimeline(); updateAnimationWorkspace(); }
  };
  if (Number.isFinite(initial)) {
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', finish);
  }
});
document.querySelector('#timelineKeyframes').addEventListener('contextmenu', event => {
  const marker = event.target.closest('.timeline-key');
  if (!marker || !selected) return;
  event.preventDefault();
  const frame = Number(marker.dataset.frame);
  rememberScene();
  selected.userData.modelrKeyframes = keyframesFor(selected).filter(keyframe => keyframe.frame !== frame);
  setCurrentFrame(frame);
});
document.querySelector('#timelineRuler').addEventListener('pointerdown', event => {
  if (event.target.closest('.timeline-key')) return;
  event.preventDefault();
  stopPlayback();
  const ruler = event.currentTarget;
  const seek = pointerEvent => {
    const rect = ruler.getBoundingClientRect();
    setCurrentFrame(Math.round(THREE.MathUtils.clamp((pointerEvent.clientX - rect.left) / rect.width, 0, 1) * endFrame));
  };
  seek(event);
  const finishSeek = () => {
    window.removeEventListener('pointermove', seek);
    window.removeEventListener('pointerup', finishSeek);
  };
  window.addEventListener('pointermove', seek);
  window.addEventListener('pointerup', finishSeek);
});
window.addEventListener('keyup', event => cameraKeys.delete(String(event.key || '').toLowerCase()));
window.addEventListener('blur', () => cameraKeys.clear());
function applySelectedColor(value) { if (!selected || !/^#[0-9a-f]{6}$/i.test(value)) return; meshMaterials(selected).forEach(material => { if (material.color) material.color.set(value); material.needsUpdate = true; }); importedSerialization.delete(selected); document.querySelector('#colorValue').textContent = value.toUpperCase(); document.querySelector('#selectedDot').style.background = value; updateList(); }
document.querySelector('#colorPicker').addEventListener('input', event => applySelectedColor(event.target.value));
document.querySelector('#colorPicker').addEventListener('change', event => applySelectedColor(event.target.value));
const partContext = document.querySelector('#partContext');
let contextPart = null;
document.querySelector('#partsList').addEventListener('contextmenu', event => { const row = event.target.closest('.part-row'); if (!row) return; event.preventDefault(); contextPart = objects.find(item => item.name === row.dataset.name); if (!contextPart) return; selectObject(contextPart); partContext.style.left = `${Math.min(event.clientX, window.innerWidth - 140)}px`; partContext.style.top = `${Math.min(event.clientY, window.innerHeight - 90)}px`; partContext.classList.add('open'); });
document.addEventListener('click', event => { if (!event.target.closest('#partContext')) partContext.classList.remove('open'); });
document.querySelector('#renamePart').onclick = () => { if (!contextPart) return; const name = window.prompt('New name for this part:', contextPart.name); if (name?.trim()) { contextPart.name = name.trim(); selectObject(contextPart); updateList(); } partContext.classList.remove('open'); };
document.querySelector('#duplicatePart').onclick = () => { if (!contextPart) return; selectObject(contextPart); duplicateSelected(true); contextPart = selected; partContext.classList.remove('open'); };
document.querySelector('#deletePart').onclick = () => { if (!contextPart) return; rememberScene(); const index = objects.indexOf(contextPart); if (index >= 0) objects.splice(index, 1); scene.remove(contextPart); if (!objects.length) addObject('Cube', 0x999999, [0, .8, 0]); selectObject(objects[Math.max(0, index - 1)] || objects[0]); updateList(); contextPart = null; partContext.classList.remove('open'); };
[['roughness','roughnessValue'],['metallic','metallicValue']].forEach(([id, output]) => document.querySelector(`#${id}`).addEventListener('input', event => { if (selected) { meshMaterials(selected).forEach(material => { material[id] = Number(event.target.value); }); importedSerialization.delete(selected); } document.querySelector(`#${output}`).textContent = Number(event.target.value).toFixed(2); }));

function generatedCode() {
  const geometryCode = mesh => {
    if (mesh.name.startsWith('Sphere')) return 'new THREE.SphereGeometry(.85, 32, 20)';
    if (mesh.name.startsWith('Cylinder')) return 'new THREE.CylinderGeometry(.65, .65, 1.5, 32)';
    if (mesh.name.startsWith('Torus')) return 'new THREE.TorusGeometry(.72, .18, 18, 48)';
    if (mesh.name.startsWith('Cone')) return 'new THREE.ConeGeometry(.72, 1.45, 32)';
    if (mesh.name.startsWith('Crown')) return "new THREE.ExtrudeGeometry(new THREE.Shape().setFromPoints([new THREE.Vector2(-.78, -.55), new THREE.Vector2(.78, -.55), new THREE.Vector2(.68, .45), new THREE.Vector2(.36, .05), new THREE.Vector2(0, .72), new THREE.Vector2(-.36, .05), new THREE.Vector2(-.68, .45)]), { depth: .48, bevelEnabled: true, bevelSegments: 2, bevelSize: .06, bevelThickness: .06 })";
    return `new RoundedBoxGeometry(1.55, 1.55, 1.55, 4, ${(mesh.userData.rounding || .04).toFixed(2)})`;
  };
  return `// modelr scene\nimport * as THREE from 'three';\nimport { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';\n\nconst scene = new THREE.Scene();\n\n${objects.map(mesh => { const name = String(mesh.name || 'Object').toLowerCase().replace(/[^a-z0-9_$]/g, '_'); const rotation = mesh.rotation.toArray().slice(0, 3); return `const ${name} = new THREE.Mesh(\n  ${geometryCode(mesh)},\n  new THREE.MeshStandardMaterial({ color: '#${mesh.material.color.getHexString()}', roughness: ${mesh.material.roughness.toFixed(2)}, metalness: ${mesh.material.metalness.toFixed(2)} })\n);\n${name}.position.set(${mesh.position.toArray().map(value => value.toFixed(3)).join(', ')});\n${name}.rotation.set(${rotation.map(value => value.toFixed(3)).join(', ')});\n${name}.scale.set(${mesh.scale.toArray().map(value => value.toFixed(3)).join(', ')});\nscene.add(${name});`; }).join('\n\n')}`;
}
document.querySelector('#codeButton').onclick = () => { document.querySelector('#generatedCode').value = generatedCode(); document.querySelector('#codeStatus').textContent = ''; document.querySelector('#codeModal').classList.add('open'); };
document.querySelector('#closeModal').onclick = () => document.querySelector('#codeModal').classList.remove('open');
document.querySelector('#copyCode').onclick = async () => { await navigator.clipboard?.writeText(document.querySelector('#generatedCode').value); document.querySelector('#copyCode').firstChild.textContent = 'Copied '; };
document.querySelector('#applyCode').onclick = () => {
  const code = document.querySelector('#generatedCode').value;
  const parsed = [];
  const meshPattern = /const\s+([A-Za-z_$][\w$]*)\s*=\s*new THREE\.Mesh\(\s*new THREE\.(RoundedBox|Box|Sphere|Cylinder|Torus|Cone)Geometry\(([^)]+)\),\s*new THREE\.MeshStandardMaterial\(\{([\s\S]*?)\}\)\s*\);([\s\S]*?)scene\.add\(\1\)/g;
  for (const match of code.matchAll(meshPattern)) {
    const colorMatch = match[4].match(/color\s*:\s*['"]#?([0-9a-fA-F]{6})['"]/);
    const positionMatch = match[5].match(/\.position\.set\(\s*([^,]+),\s*([^,]+),\s*([^)]+)\)/);
    if (!colorMatch || !positionMatch) continue;
    const rotationMatch = match[5].match(/\.rotation\.set\(\s*([^,]+),\s*([^,]+),\s*([^)]+)\)/);
    const scaleMatch = match[5].match(/\.scale\.set\(\s*([^,]+),\s*([^,]+),\s*([^)]+)\)/);
    parsed.push({ name: match[1], type: match[2] === 'Box' || match[2] === 'RoundedBox' ? 'Cube' : match[2], color: parseInt(colorMatch[1], 16), position: positionMatch.slice(1).map(Number), rotation: rotationMatch?.slice(1).map(Number), scale: scaleMatch?.slice(1).map(Number) });
  }
  if (!parsed.length) { document.querySelector('#codeStatus').textContent = 'No supported THREE.Mesh code found. Use Box, RoundedBox, Sphere, Cylinder, Torus, or Cone geometry.'; return; }
  if (parsed.length > MAX_SCENE_OBJECTS) { document.querySelector('#codeStatus').textContent = `A scene can contain at most ${MAX_SCENE_OBJECTS} objects.`; return; }
  let parsedTriangles = 0;
  for (const item of parsed) {
    const mesh = makeMesh(item.type, item.color);
    parsedTriangles += triangleCount(mesh);
    mesh.geometry.dispose();
    mesh.material.dispose();
    if (parsedTriangles > MAX_SCENE_TRIANGLES) { document.querySelector('#codeStatus').textContent = `A scene can contain at most ${MAX_SCENE_TRIANGLES.toLocaleString()} triangles.`; return; }
  }
  rememberScene();
  restoreScene(parsed.map(item => ({ ...item, name: item.name })));
  document.querySelector('#codeStatus').textContent = 'Scene applied.';
};

document.querySelector('#avatarButton').onclick = async () => { try { await apiRequest('/api/auth/logout', { method: 'POST' }); } catch (error) { } localStorage.removeItem('modelrUser'); appShell.setAttribute('aria-hidden', 'true'); authScreen.style.display = 'grid'; document.querySelector('#passwordInput').value = ''; };
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
async function apiRequest(path, options = {}) {
  const response = await fetch(path, { credentials: 'same-origin', ...options });
  let result = {};
  try { result = await response.json(); } catch (error) { }
  if (!response.ok) { const failure = new Error(result.error || 'Cloud request failed.'); failure.status = response.status; throw failure; }
  return result;
}
function prepareJsonRequest(data) {
  const body = JSON.stringify(data);
  if (body.length > MAX_REQUEST_BODY_CHARS) throw new Error('This scene or migration is too large to upload. Reduce its size first.');
  return body;
}
async function syncCloudProjects() {
  const cloudProjects = await apiRequest('/api/projects');
  localStorage.setItem('modelrProjects', JSON.stringify(cloudProjects));
  const previousName = localStorage.getItem('modelrProjectName');
  const activeProject = cloudProjects.find(project => project.name === previousName) || cloudProjects[0];
  if (activeProject) {
    const fullProject = await apiRequest(`/api/projects/${encodeURIComponent(activeProject.id)}`);
    currentProjectName = activeProject.name;
    localStorage.setItem('modelrProjectName', currentProjectName);
    localStorage.removeItem('modelrSceneV2');
    document.querySelector('#projectName').textContent = currentProjectName;
    restoreScene(fullProject.scene);
  } else {
    currentProjectName = '';
    localStorage.removeItem('modelrProjectName');
    localStorage.removeItem('modelrSceneV2');
    restoreScene([]);
    document.querySelector('#projectName').textContent = 'Untitled scene';
  }
}
function renderProjects() {
  const list = document.querySelector('#projectList');
  const saved = projects();
  list.innerHTML = saved.length ? saved.map(project => `<button class="project-row" data-project="${project.id}" title="Double-click to open or save here">◈ <span><b>${project.name}</b><small>Last update: ${project.updatedAt ? new Date(project.updatedAt).toLocaleString('en-US') : 'Unknown'}</small></span><small>${project.objects} objects</small></button>`).join('') : '<div class="project-empty">No saved projects yet.</div>';
  list.querySelectorAll('.project-row').forEach(row => row.ondblclick = async () => {
    const project = projects().find(item => item.id === row.dataset.project);
    if (!project) return;
    if (projectModalMode === 'confirm') {
      const updatedProject = { ...project, objects: objects.length, scene: sceneSnapshot() };
      try {
        const savedProject = await apiRequest('/api/projects', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: prepareJsonRequest(updatedProject) });
        const { scene, ...projectMetadata } = savedProject;
        localStorage.setItem('modelrProjects', JSON.stringify(projects().map(item => item.id === project.id ? projectMetadata : item)));
        localStorage.removeItem('modelrSceneV2');
        currentProjectName = project.name;
        localStorage.setItem('modelrProjectName', currentProjectName);
        document.querySelector('#projectName').textContent = currentProjectName;
        closeAfterSave = false;
        projectModal.classList.remove('open');
        projectModal.style.display = 'none';
      } catch (error) { projectStatus.textContent = error.message; }
      return;
    }
    openProjectWithLoader(project);
  });
}
async function openProjectWithLoader(project) {
  const loader = document.querySelector('#projectLoading');
  loader.classList.add('open');
  loader.setAttribute('aria-hidden', 'false');
  try {
    const fullProject = await apiRequest(`/api/projects/${encodeURIComponent(project.id)}`);
    restoreScene(fullProject.scene);
    localStorage.removeItem('modelrSceneV2');
    currentProjectName = fullProject.name;
    localStorage.setItem('modelrProjectName', currentProjectName);
    document.querySelector('#projectName').textContent = currentProjectName;
    projectModal.classList.remove('open');
    projectModal.style.display = 'none';
    authScreen.style.display = 'none';
    appShell.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(() => { resize(); renderScene(); });
  } catch (error) {
    projectStatus.textContent = `Could not open project: ${error.message}`;
  } finally {
    loader.classList.remove('open');
    loader.setAttribute('aria-hidden', 'true');
  }
}
function openProjectModal(mode) { projectModalMode = mode; document.querySelector('#projectModalEyebrow').textContent = mode === 'confirm' ? 'CLOSE PROJECT' : mode === 'projects' ? 'PROJECTS' : 'SAVE PROJECT'; document.querySelector('#projectModalTitle').textContent = mode === 'confirm' ? 'Do you want to save this project?' : mode === 'projects' ? 'Your projects.' : 'Save your project.'; document.querySelector('#projectModalHelp').textContent = mode === 'confirm' ? 'Your changes will not be saved.' : mode === 'projects' ? 'Open a previously saved project.' : 'Give your project a name so you can open it later.'; projectInput.style.display = mode === 'save' ? 'block' : 'none'; document.querySelector('#confirmProjectModal').textContent = mode === 'confirm' ? 'Yes, save' : mode === 'projects' ? 'Close' : 'Save project'; document.querySelector('#cancelProjectModal').textContent = mode === 'confirm' ? 'No, close' : 'Cancel'; projectStatus.textContent = ''; if (mode === 'save') projectInput.value = currentProjectName; renderProjects(); projectModal.classList.add('open'); projectModal.style.display = 'grid'; }
function showProjectList() { authScreen.style.display = 'none'; appShell.setAttribute('aria-hidden', 'true'); openProjectModal('projects'); projectModal.classList.add('open'); projectModal.style.setProperty('display', 'grid', 'important'); projectModal.style.setProperty('visibility', 'visible', 'important'); projectModal.style.setProperty('opacity', '1', 'important'); projectModal.style.setProperty('z-index', '9999', 'important'); const card = document.querySelector('.project-card'); card.style.setProperty('display', 'block', 'important'); card.style.setProperty('visibility', 'visible', 'important'); card.style.setProperty('opacity', '1', 'important'); }
async function saveProject() {
  const name = projectInput.value.trim();
  if (!name) { projectStatus.textContent = 'Enter a project name first.'; projectInput.focus(); return; }
  const scene = sceneSnapshot();
  const existing = projects().find(project => project.name === name);
  const project = { id: existing?.id || `${Date.now()}-${name}`, name, objects: objects.length, updatedAt: new Date().toISOString(), scene };
  try {
    const requestBody = prepareJsonRequest(project);
    const savedProject = await apiRequest('/api/projects', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: requestBody });
    const { scene: savedScene, ...projectMetadata } = savedProject;
    const saved = projects().filter(item => item.id !== savedProject.id);
    saved.unshift(projectMetadata);
    localStorage.setItem('modelrProjects', JSON.stringify(saved));
    localStorage.removeItem('modelrSceneV2');
    localStorage.setItem('modelrProjectName', name);
  } catch (error) { projectStatus.textContent = `Could not save to cloud: ${error.message}`; return; }
  currentProjectName = name;
  document.querySelector('#projectName').textContent = name;
  if (closeAfterSave) { closeAfterSave = false; showProjectList(); }
  else { projectModal.classList.remove('open'); projectModal.style.display = 'none'; }
}
function autoSaveScene() { if (localStorage.getItem('modelrCloudUser')) return; try { localStorage.setItem('modelrSceneV2', JSON.stringify(sceneSnapshot())); } catch (error) { /* Keep the editor usable when browser storage is unavailable. */ } }
function closeProject() { showProjectList(); }
document.querySelector('#fileMenuButton').onclick = event => { event.stopPropagation(); fileDropdown.classList.toggle('open'); };
document.addEventListener('click', event => { if (!event.target.closest('.file-menu')) fileDropdown.classList.remove('open'); });
const modelImportInput = document.querySelector('#modelImportInput');
document.querySelector('#importModelButton').onclick = () => { fileDropdown.classList.remove('open'); modelImportInput.click(); };
modelImportInput.addEventListener('change', async event => {
  const files = Array.from(event.target.files || []);
  event.target.value = '';
  if (!files.length) return;
  const objectUrls = new Set();
  const fileUrls = new Map();
  const archiveUrls = new Map();
  try {
    let modelFileName;
    let modelContent;
    let modelPath = '';
    const zipFile = files.find(file => /\.zip$/i.test(file.name));
    if (zipFile) {
      if (zipFile.size > MAX_IMPORT_FILE_BYTES) throw new Error(`ZIP files must be smaller than ${MAX_IMPORT_FILE_BYTES / 1024 / 1024} MB.`);
      const archive = await JSZip.loadAsync(await zipFile.arrayBuffer());
      const entries = Object.values(archive.files).filter(entry => !entry.dir);
      if (entries.length > MAX_IMPORT_ARCHIVE_ENTRIES) throw new Error(`ZIP files may contain at most ${MAX_IMPORT_ARCHIVE_ENTRIES} files.`);
      const uncompressedSize = entries.reduce((total, entry) => total + (entry._data?.uncompressedSize || 0), 0);
      if (uncompressedSize > MAX_IMPORT_ARCHIVE_BYTES) throw new Error(`Unpacked ZIP files must total less than ${MAX_IMPORT_ARCHIVE_BYTES / 1024 / 1024} MB.`);
      const modelEntry = entries.find(entry => /\.(gltf|glb)$/i.test(entry.name));
      if (!modelEntry) throw new Error('No .gltf or .glb model was found in this ZIP.');
      modelFileName = modelEntry.name;
      modelContent = await modelEntry.async(modelFileName.toLowerCase().endsWith('.glb') ? 'arraybuffer' : 'text');
      const modelDirectory = modelFileName.includes('/') ? modelFileName.slice(0, modelFileName.lastIndexOf('/') + 1) : '';
      modelPath = `https://modelr-import.local/${modelDirectory.split('/').filter(Boolean).map(encodeURIComponent).join('/')}${modelDirectory ? '/' : ''}`;
      await Promise.all(entries.filter(entry => entry !== modelEntry).map(async entry => {
        const extension = entry.name.split('.').pop().toLowerCase();
        const contentType = ({ png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', bin: 'application/octet-stream', ktx2: 'image/ktx2' })[extension] || 'application/octet-stream';
        const url = URL.createObjectURL(new Blob([await entry.async('uint8array')], { type: contentType }));
        objectUrls.add(url);
        archiveUrls.set(entry.name, url);
      }));
    } else {
      const importSize = files.reduce((total, file) => total + file.size, 0);
      if (importSize > MAX_IMPORT_FILE_BYTES) throw new Error(`Selected model and texture files must total less than ${MAX_IMPORT_FILE_BYTES / 1024 / 1024} MB.`);
      const modelFile = files.find(file => /\.(gltf|glb)$/i.test(file.name));
      if (!modelFile) return;
      modelFileName = modelFile.name;
      modelContent = await modelFile.arrayBuffer();
      if (modelFile.name.toLowerCase().endsWith('.gltf')) modelContent = new TextDecoder().decode(modelContent);
      files.forEach(file => {
        const url = URL.createObjectURL(file);
        objectUrls.add(url);
        fileUrls.set(file.name, url);
      });
    }
    const manager = new THREE.LoadingManager();
    manager.setURLModifier(url => {
      const parsedUrl = new URL(url, document.baseURI);
      const assetPath = decodeURIComponent(parsedUrl.pathname).replace(/^\/+/, '');
      const fileName = assetPath.split('/').pop();
      return archiveUrls.get(assetPath) || fileUrls.get(fileName) || url;
    });
    const loader = new GLTFLoader(manager);
    const gltf = await new Promise((resolve, reject) => loader.parse(modelContent, modelPath, resolve, reject));
    const root = gltf.scene || gltf.scenes[0];
    if (!root) throw new Error('The selected file contains no scene.');
    root.updateMatrixWorld(true);
    let importedCount = 0;
    let importedTriangles = 0;
    root.traverse(node => {
      if (!node.isMesh) return;
      importedCount++;
      importedTriangles += triangleCount(node);
      if (objects.length + importedCount > MAX_SCENE_OBJECTS) throw new Error(`A scene can contain at most ${MAX_SCENE_OBJECTS} objects.`);
      if (sceneTriangleCount() + importedTriangles > MAX_SCENE_TRIANGLES) throw new Error(`A scene can contain at most ${MAX_SCENE_TRIANGLES.toLocaleString()} triangles.`);
    });
    const imported = [];
    const modelGroupName = modelFileName.split('/').pop().replace(/\.(gltf|glb)$/i, '') || 'Imported model';
    const modelGroupId = `model-${Date.now()}-${objectIndex}`;
    root.traverse(node => {
      if (!node.isMesh) return;
      const mesh = node.clone(false);
      node.matrixWorld.decompose(mesh.position, mesh.quaternion, mesh.scale);
      const baseName = node.name?.trim() || modelFileName.split('/').pop().replace(/\.(gltf|glb)$/i, '');
      mesh.name = `${baseName} ${objectIndex++}`;
      mesh.userData = { ...mesh.userData, modelrImported: true, modelrGroupId: modelGroupId, modelrGroupName: modelGroupName };
      imported.push(mesh);
    });
    if (!imported.length) throw new Error('No mesh objects were found in this file.');
    rememberScene();
    imported.forEach(mesh => { scene.add(mesh); objects.push(mesh); });
    selectObject(imported[0]);
    updateList();
  } catch (error) {
    window.alert(`Could not import model: ${error.message || error}`);
  } finally {
    objectUrls.forEach(url => URL.revokeObjectURL(url));
  }
});
document.querySelector('#exportModelButton').onclick = async () => {
  fileDropdown.classList.remove('open');
  if (!objects.length) return;
  const exportScene = new THREE.Scene();
  objects.forEach(mesh => exportScene.add(mesh.clone(false)));
  try {
    const result = await new Promise((resolve, reject) => new GLTFExporter().parse(exportScene, resolve, reject, { binary: true }));
    const downloadUrl = URL.createObjectURL(new Blob([result], { type: 'model/gltf-binary' }));
    const link = document.createElement('a');
    const projectFileName = (currentProjectName || 'modelr-scene').trim().replace(/[^a-z0-9_-]+/gi, '-').replace(/^-|-$/g, '') || 'modelr-scene';
    link.href = downloadUrl;
    link.download = `${projectFileName}.glb`;
    link.click();
    URL.revokeObjectURL(downloadUrl);
  } catch (error) {
    window.alert(`Could not export model: ${error.message || error}`);
  }
};
document.querySelector('#closeProjectButton').onclick = () => { fileDropdown.classList.remove('open'); openProjectModal('confirm'); };
document.querySelector('#projectsButton').onclick = () => { fileDropdown.classList.remove('open'); openProjectModal('projects'); };
document.querySelector('#newProjectButton').onclick = () => { fileDropdown.classList.remove('open'); currentProjectName = ''; document.querySelector('#projectName').textContent = 'Untitled scene'; restoreScene([]); };
document.querySelector('#deleteProjectButton').onclick = async () => { fileDropdown.classList.remove('open'); if (currentProjectName && !window.confirm(`Delete project "${currentProjectName}"?`)) return; const deleting = projects().filter(project => project.name === currentProjectName); try { for (const project of deleting) await apiRequest(`/api/projects/${encodeURIComponent(project.id)}`, { method: 'DELETE' }); } catch (error) { window.alert(`Could not delete cloud project: ${error.message}`); return; } const saved = projects().filter(project => project.name !== currentProjectName); localStorage.setItem('modelrProjects', JSON.stringify(saved)); localStorage.removeItem('modelrSceneV2'); localStorage.removeItem('modelrProjectName'); currentProjectName = ''; document.querySelector('#projectName').textContent = 'Untitled scene'; restoreScene([]); };
document.querySelector('#closeProjectModal').onclick = () => { projectModal.classList.remove('open'); projectModal.style.display = 'none'; };
document.querySelector('#cancelProjectModal').onclick = () => { if (projectModalMode === 'confirm') closeProject(); else { projectModal.classList.remove('open'); projectModal.style.display = 'none'; } };
document.querySelector('#confirmProjectModal').onclick = () => { if (projectModalMode === 'confirm') { closeAfterSave = true; openProjectModal('save'); } else if (projectModalMode === 'projects') { projectModal.classList.remove('open'); projectModal.style.display = 'none'; } else saveProject(); };
document.querySelector('#saveButton').onclick = () => { openProjectModal('save'); };
window.addEventListener('beforeunload', autoSaveScene);
function animate() { requestAnimationFrame(animate); updateCameraMovement(); renderScene(); } animate();

const authForm = document.querySelector('#authForm');
const authError = document.querySelector('#authError');
let authMode = 'signup';
function enterStudio(email) {
  localStorage.removeItem('modelrUser');
  document.querySelector('#emailInput').value = email;
  authScreen.style.display = 'none';
  appShell.setAttribute('aria-hidden', 'false');
}
async function migrateLocalProjectsForAccount(email, password) {
  const cachedUser = localStorage.getItem('modelrCloudUser');
  if (cachedUser && cachedUser !== email) return;
  let legacyUsers = {};
  try { legacyUsers = JSON.parse(localStorage.getItem('modelrUsers') || '{}'); } catch (error) { }
  if (legacyUsers[email] !== password) return;
  const localProjects = projects().filter(project => Array.isArray(project.scene));
  if (!localProjects.length) return;
  const cloudProjects = await apiRequest('/api/projects');
  const cloudIds = new Set(cloudProjects.map(project => project.id));
  for (const project of localProjects) {
    const id = typeof project.id === 'string' ? project.id : `${Date.now()}-${project.name}`;
    if (cloudIds.has(id)) continue;
    await apiRequest('/api/projects', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: prepareJsonRequest({ ...project, id })
    });
  }
}
document.querySelectorAll('.auth-tab').forEach(tab => tab.addEventListener('click', () => {
  authMode = tab.dataset.auth;
  document.querySelectorAll('.auth-tab').forEach(item => item.classList.toggle('active', item === tab));
  document.querySelector('#authSubmitText').textContent = authMode === 'login' ? 'Continue to studio' : 'Start creating';
  document.querySelector('#passwordInput').setAttribute('autocomplete', authMode === 'login' ? 'current-password' : 'new-password');
  authError.textContent = '';
}));
authForm.addEventListener('submit', async event => {
  event.preventDefault();
  const email = document.querySelector('#emailInput').value.trim().toLowerCase();
  const password = document.querySelector('#passwordInput').value;
  const submitButton = authForm.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  authError.textContent = '';
  try {
    let result;
    if (authMode === 'signup') {
      const cachedUser = localStorage.getItem('modelrCloudUser');
      const migrationProjects = !cachedUser || cachedUser === email ? projects() : [];
      result = await apiRequest('/api/auth/signup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: prepareJsonRequest({ email, password, projects: migrationProjects }) });
    } else {
      try {
        result = await apiRequest('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: prepareJsonRequest({ email, password }) });
      } catch (loginError) {
        let legacyUsers = {};
        try { legacyUsers = JSON.parse(localStorage.getItem('modelrUsers') || '{}'); } catch (error) { }
        if (loginError.status !== 401 || legacyUsers[email] !== password) throw loginError;
        const cachedUser = localStorage.getItem('modelrCloudUser');
        const migrationProjects = !cachedUser || cachedUser === email ? projects() : [];
        result = await apiRequest('/api/auth/signup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: prepareJsonRequest({ email, password, projects: migrationProjects }) });
      }
      await migrateLocalProjectsForAccount(email, password);
    }
    localStorage.removeItem('modelrUsers');
    await syncCloudProjects();
    localStorage.setItem('modelrCloudUser', result.email || email);
    enterStudio(result.email || email);
  } catch (error) {
    authError.textContent = error.message === 'Cloud storage is not configured. Set DATABASE_URL on the server.'
      ? 'Cloud storage is not connected yet. Configure DATABASE_URL on the server.'
      : error.message;
  } finally {
    submitButton.disabled = false;
  }
});
(async () => {
  try {
    const session = await apiRequest('/api/auth/session');
    await syncCloudProjects();
    localStorage.setItem('modelrCloudUser', session.email);
    enterStudio(session.email);
  } catch (error) {
    if (error.status && error.status !== 401) authError.textContent = error.message;
  }
})();