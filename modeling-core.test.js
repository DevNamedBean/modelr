import test from 'node:test';
import assert from 'node:assert/strict';
import { bevelEdge, extrudeTriangle, insetTriangle, sculptVertices } from './modeling-core.js';

function vertex(position, uv = [0, 0]) {
  return { position, attributes: { uv } };
}

function triangle(a, b, c, materialIndex = 0) {
  return { vertices: [vertex(a), vertex(b), vertex(c)], materialIndex };
}

const sourceFace = triangle([0, 0, 0], [1, 0, 0], [0, 1, 0], 2);

test('extrudes a selected triangle and selects the new cap', () => {
  const result = extrudeTriangle([sourceFace], 0, .5);
  assert.equal(result.triangles.length, 7);
  assert.equal(result.selectedIndex, 6);
  assert.equal(result.triangles[6].materialIndex, 2);
  assert.deepEqual(result.triangles[6].vertices.map(item => item.position[2]), [.5, .5, .5]);
  assert.equal(result.triangles[6].vertices[0].attributes.uv[0], 0);
});

test('insets a selected triangle and preserves its inner face', () => {
  const result = insetTriangle([sourceFace], 0, .5);
  assert.equal(result.triangles.length, 7);
  assert.equal(result.selectedIndex, 6);
  assert.equal(result.triangles[6].materialIndex, 2);
  assert.deepEqual(result.triangles[6].vertices[0].position, [1 / 6, 1 / 6, 0]);
  assert.ok(result.triangles[6].vertices[0].attributes.uv);
});

test('bevels a shared edge with a connecting chamfer face', () => {
  const faces = [
    triangle([0, 0, 0], [1, 0, 0], [0, 1, 0]),
    triangle([1, 0, 0], [0, 0, 0], [0, 0, 1])
  ];
  const result = bevelEdge(faces, [0, 0, 0], [1, 0, 0], .1);
  assert.equal(result.triangles.length, 4);
  assert.equal(result.selectedIndex, 2);
  assert.ok(result.triangles.flatMap(item => item.vertices).every(item => item.position.every(Number.isFinite)));
});

test('rejects invalid face and edge operations', () => {
  assert.throws(() => extrudeTriangle([sourceFace], 2, .5), RangeError);
  assert.throws(() => insetTriangle([sourceFace], 0, 1), RangeError);
  assert.throws(() => bevelEdge([sourceFace], [0, 0, 0], [1, 0, 0], .1), /shared by two faces/);
});

const sculptMesh = [
  [0, 0, 0],
  [1, 0, 0],
  [0, 1, 0],
  [1, 1, 0]
];
const sculptNeighbors = [[1, 2], [0, 2, 3], [0, 1, 3], [1, 2]];

test('sculpt draw, inflate, and crease use a soft radial falloff without mutating input', () => {
  const source = sculptMesh.map(vertex => [...vertex]);
  const drawn = sculptVertices(source, sculptNeighbors, [0, 0, 0], 1.5, 1, 'draw');
  assert.ok(drawn[0][2] > drawn[3][2]);
  assert.deepEqual(source, sculptMesh);
  assert.ok(sculptVertices(sculptMesh, sculptNeighbors, [0, 0, 0], 1.5, .5, 'inflate')[0][2] > 0);
  assert.ok(sculptVertices(sculptMesh, sculptNeighbors, [0, 0, 0], 1.5, .5, 'crease')[0][2] < 0);
});

test('sculpt grab moves nearby vertices and smooth blends toward adjacent vertices', () => {
  const grabbed = sculptVertices(sculptMesh, sculptNeighbors, [0, 0, 0], 1.5, 1, 'grab', [0, 0, 1], [0, 0, 2]);
  assert.ok(grabbed[0][2] > grabbed[3][2]);
  const smoothed = sculptVertices(sculptMesh, sculptNeighbors, [0, 0, 0], 1.5, 1, 'smooth');
  assert.ok(smoothed[0][0] > sculptMesh[0][0]);
  assert.ok(smoothed[0][1] > sculptMesh[0][1]);
});

test('rejects invalid sculpt settings and adjacency references', () => {
  assert.throws(() => sculptVertices(sculptMesh, sculptNeighbors, [0, 0, 0], 0, .5, 'draw'), RangeError);
  assert.throws(() => sculptVertices(sculptMesh, sculptNeighbors, [0, 0, 0], 1, .5, 'dyntopo'), /Unsupported sculpt brush/);
  assert.throws(() => sculptVertices(sculptMesh, [[9], [], [], []], [0, 0, 0], 1, .5, 'smooth'), /invalid vertex reference/);
});