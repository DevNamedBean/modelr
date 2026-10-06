const POSITION_EPSILON_SQ = 1e-10;

function cloneVertex(vertex) {
  return {
    position: [...vertex.position],
    attributes: Object.fromEntries(Object.entries(vertex.attributes || {}).map(([name, values]) => [name, [...values]]))
  };
}

function cloneTriangle(triangle) {
  return { vertices: triangle.vertices.map(cloneVertex), materialIndex: triangle.materialIndex || 0 };
}

function triangle(vertices, materialIndex) {
  return { vertices, materialIndex };
}

function subtract(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function addScaled(point, direction, amount) {
  return point.map((value, index) => value + direction[index] * amount);
}

function length(vector) {
  return Math.hypot(vector[0], vector[1], vector[2]);
}

function interpolateVertex(a, b, amount) {
  const attributes = {};
  for (const [name, values] of Object.entries(a.attributes || {})) {
    const otherValues = b.attributes?.[name];
    attributes[name] = otherValues?.length === values.length
      ? values.map((value, index) => value + (otherValues[index] - value) * amount)
      : [...values];
  }
  return {
    position: a.position.map((value, index) => value + (b.position[index] - value) * amount),
    attributes
  };
}

function samePoint(a, b) {
  return subtract(a, b).reduce((sum, value) => sum + value * value, 0) <= POSITION_EPSILON_SQ;
}

function validateSelection(triangles, selectedIndex) {
  if (!Number.isInteger(selectedIndex) || selectedIndex < 0 || selectedIndex >= triangles.length) {
    throw new RangeError('Select a mesh face first.');
  }
}

export function extrudeTriangle(triangles, selectedIndex, distance) {
  validateSelection(triangles, selectedIndex);
  if (!Number.isFinite(distance) || distance <= 0) throw new RangeError('Extrude distance must be greater than zero.');

  const source = cloneTriangle(triangles[selectedIndex]);
  const [a, b, c] = source.vertices;
  const ab = subtract(b.position, a.position);
  const ac = subtract(c.position, a.position);
  const normal = [
    ab[1] * ac[2] - ab[2] * ac[1],
    ab[2] * ac[0] - ab[0] * ac[2],
    ab[0] * ac[1] - ab[1] * ac[0]
  ];
  const normalLength = length(normal);
  if (normalLength < 1e-8) throw new RangeError('Cannot extrude a degenerate face.');
  const offset = normal.map(value => value / normalLength * distance);
  const top = source.vertices.map(vertex => ({ ...cloneVertex(vertex), position: addScaled(vertex.position, offset, 1) }));
  const [topA, topB, topC] = top;
  const sides = [
    triangle([cloneVertex(a), cloneVertex(b), cloneVertex(topB)], source.materialIndex),
    triangle([cloneVertex(a), cloneVertex(topB), cloneVertex(topA)], source.materialIndex),
    triangle([cloneVertex(b), cloneVertex(c), cloneVertex(topC)], source.materialIndex),
    triangle([cloneVertex(b), cloneVertex(topC), cloneVertex(topB)], source.materialIndex),
    triangle([cloneVertex(c), cloneVertex(a), cloneVertex(topA)], source.materialIndex),
    triangle([cloneVertex(c), cloneVertex(topA), cloneVertex(topC)], source.materialIndex),
    triangle(top, source.materialIndex)
  ];
  const result = triangles.map(cloneTriangle);
  result.splice(selectedIndex, 1, ...sides);
  return { triangles: result, selectedIndex: selectedIndex + 6 };
}

export function insetTriangle(triangles, selectedIndex, innerScale) {
  validateSelection(triangles, selectedIndex);
  if (!Number.isFinite(innerScale) || innerScale <= 0 || innerScale >= 1) {
    throw new RangeError('Inset amount must leave a smaller inner face.');
  }

  const source = cloneTriangle(triangles[selectedIndex]);
  const center = [0, 1, 2].map(axis => source.vertices.reduce((sum, vertex) => sum + vertex.position[axis], 0) / 3);
  const inner = source.vertices.map(vertex => ({
    ...cloneVertex(vertex),
    position: center.map((value, axis) => value + (vertex.position[axis] - value) * innerScale)
  }));
  const [a, b, c] = source.vertices;
  const [innerA, innerB, innerC] = inner;
  const ring = [
    triangle([cloneVertex(a), cloneVertex(b), cloneVertex(innerB)], source.materialIndex),
    triangle([cloneVertex(a), cloneVertex(innerB), cloneVertex(innerA)], source.materialIndex),
    triangle([cloneVertex(b), cloneVertex(c), cloneVertex(innerC)], source.materialIndex),
    triangle([cloneVertex(b), cloneVertex(innerC), cloneVertex(innerB)], source.materialIndex),
    triangle([cloneVertex(c), cloneVertex(a), cloneVertex(innerA)], source.materialIndex),
    triangle([cloneVertex(c), cloneVertex(innerA), cloneVertex(innerC)], source.materialIndex),
    triangle(inner, source.materialIndex)
  ];
  const result = triangles.map(cloneTriangle);
  result.splice(selectedIndex, 1, ...ring);
  return { triangles: result, selectedIndex: selectedIndex + 6 };
}

export function bevelEdge(triangles, edgeA, edgeB, width) {
  if (!Number.isFinite(width) || width <= 0) throw new RangeError('Bevel width must be greater than zero.');
  if (samePoint(edgeA, edgeB)) throw new RangeError('Select a non-zero-length edge.');

  const incident = [];
  triangles.forEach((item, index) => {
    const [a, b, c] = item.vertices.map(vertex => vertex.position);
    const hasA = [a, b, c].some(point => samePoint(point, edgeA));
    const hasB = [a, b, c].some(point => samePoint(point, edgeB));
    if (!hasA || !hasB) return;

    for (let offset = 0; offset < 3; offset++) {
      const start = item.vertices[offset];
      const end = item.vertices[(offset + 1) % 3];
      if (!((samePoint(start.position, edgeA) && samePoint(end.position, edgeB)) ||
        (samePoint(start.position, edgeB) && samePoint(end.position, edgeA)))) continue;
      const third = item.vertices[(offset + 2) % 3];
      const startDistance = length(subtract(start.position, third.position));
      const endDistance = length(subtract(end.position, third.position));
      const amount = Math.min(.45, width / Math.max(1e-8, Math.min(startDistance, endDistance)));
      const cutStart = interpolateVertex(start, third, amount);
      const cutEnd = interpolateVertex(end, third, amount);
      incident.push({
        index,
        source: item,
        trimmed: triangle([cutStart, cutEnd, cloneVertex(third)], item.materialIndex),
        cutA: samePoint(start.position, edgeA) ? cutStart : cutEnd,
        cutB: samePoint(start.position, edgeB) ? cutStart : cutEnd
      });
      break;
    }
  });

  if (incident.length !== 2) throw new RangeError('Bevel requires an edge shared by two faces.');
  const [first, second] = incident;
  const bridge = [
    triangle([cloneVertex(first.cutA), cloneVertex(first.cutB), cloneVertex(second.cutB)], first.source.materialIndex),
    triangle([cloneVertex(first.cutA), cloneVertex(second.cutB), cloneVertex(second.cutA)], first.source.materialIndex)
  ];
  const replacements = new Map(incident.map(item => [item.index, item.trimmed]));
  const result = [];
  let selectedIndex = -1;
  triangles.forEach((item, index) => {
    result.push(replacements.get(index) || cloneTriangle(item));
    if (index === Math.max(first.index, second.index)) {
      selectedIndex = result.length;
      result.push(...bridge);
    }
  });
  return { triangles: result, selectedIndex };
}

function smoothFalloff(distance, radius) {
  const amount = Math.max(0, 1 - distance / radius);
  return amount * amount * (3 - 2 * amount);
}

export function sculptStroke(vertices, adjacency, dabs) {
  if (!Array.isArray(vertices) || !Array.isArray(adjacency) || !Array.isArray(dabs)) {
    throw new TypeError('Sculpt requires vertex, adjacency, and dab arrays.');
  }
  if (dabs.some(dab => !dab || typeof dab !== 'object')) {
    throw new TypeError('Each sculpt dab must be an object.');
  }
  const result = vertices.map(vertex => {
    if (!Array.isArray(vertex) || vertex.length !== 3 || !vertex.every(Number.isFinite)) {
      throw new TypeError('Sculpt vertices must contain finite 3D positions.');
    }
    return [...vertex];
  });
  if (dabs.some(dab => dab.mode === 'smooth')) {
    if (adjacency.length !== vertices.length) {
      throw new TypeError('Smooth sculpting requires one adjacency list per vertex.');
    }
    if (adjacency.some(links =>
      !Array.isArray(links) || links.some(index => !Number.isInteger(index) || index < 0 || index >= vertices.length))) {
      throw new TypeError('Sculpt adjacency contains an invalid vertex reference.');
    }
  }
  for (const dab of dabs) {
    const { center, radius, strength, mode, direction = [0, 0, 1], delta = [0, 0, 0] } = dab;
    if (!Array.isArray(center) || center.length !== 3 || !center.every(Number.isFinite) ||
      !Array.isArray(direction) || direction.length !== 3 || !direction.every(Number.isFinite) ||
      !Array.isArray(delta) || delta.length !== 3 || !delta.every(Number.isFinite)) {
      throw new TypeError('Sculpt center, direction, and drag delta must be finite 3D vectors.');
    }
    if (!Number.isFinite(radius) || radius <= 0 || !Number.isFinite(strength) || strength < 0 || strength > 1) {
      throw new RangeError('Sculpt radius must be positive and strength must be between zero and one.');
    }
    if (!['draw', 'inflate', 'crease', 'grab', 'smooth'].includes(mode)) {
      throw new RangeError('Unsupported sculpt brush.');
    }
    const source = mode === 'smooth' ? result.map(vertex => [...vertex]) : result;
    for (let index = 0; index < result.length; index++) {
      const vertex = source[index];
      const distance = Math.hypot(vertex[0] - center[0], vertex[1] - center[1], vertex[2] - center[2]);
      if (distance >= radius) continue;
      const weight = smoothFalloff(distance, radius) * strength;
      if (mode === 'grab') {
        result[index] = vertex.map((value, axis) => value + delta[axis] * weight);
      } else if (mode === 'smooth') {
        const neighbors = adjacency[index];
        if (!neighbors.length) continue;
        const average = [0, 0, 0];
        neighbors.forEach(neighborIndex => {
          for (let axis = 0; axis < 3; axis++) average[axis] += source[neighborIndex][axis] / neighbors.length;
        });
        result[index] = vertex.map((value, axis) => value + (average[axis] - value) * weight);
      } else {
        const amount = radius * weight * .25 * (mode === 'crease' ? -1 : 1);
        result[index] = vertex.map((value, axis) => value + direction[axis] * amount);
      }
    }
  }
  return result;
}

export function sculptVertices(vertices, adjacency, center, radius, strength, mode, direction = [0, 0, 1], delta = [0, 0, 0]) {
  return sculptStroke(vertices, adjacency, [{ center, radius, strength, mode, direction, delta }]);
}