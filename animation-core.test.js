import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateDriverExpression, interpolateKeyframeAmount } from './animation-core.js';

test('evaluates arithmetic and the x input', () => {
  assert.equal(evaluateDriverExpression('x * 2 + 1', 3), 7);
  assert.equal(evaluateDriverExpression('2 ^ 3 ^ 2', 0), 512);
  assert.equal(evaluateDriverExpression('-(x - 4)', 1), 3);
});

test('evaluates the supported math functions', () => {
  assert.equal(evaluateDriverExpression('max(abs(x), sqrt(16))', -3), 4);
  assert.equal(evaluateDriverExpression('round(sin(x))', Math.PI / 2), 1);
});

test('rejects unsupported syntax and non-finite results', () => {
  for (const expression of ['x.constructor', 'window.alert(1)', 'x / 0', 'sqrt(-1)', '']) {
    assert.throws(() => evaluateDriverExpression(expression, 1));
  }
});

test('interpolates supported keyframe easing modes', () => {
  assert.equal(interpolateKeyframeAmount(.25, 'linear'), .25);
  assert.equal(interpolateKeyframeAmount(.25, 'constant'), 0);
  assert.equal(interpolateKeyframeAmount(.25, 'ease'), .15625);
});
