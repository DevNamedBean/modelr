import test from 'node:test';
import assert from 'node:assert/strict';
import { bevelEdge, extrudeTriangle, insetTriangle } from './modeling-core.js';

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