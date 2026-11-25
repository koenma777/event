import assert from 'node:assert/strict';
import test from 'node:test';
import { isPortraitImage } from '../image-layout.js';

test('a portrait image is taller than it is wide', () => {
  assert.equal(isPortraitImage(910, 1287), true);
  assert.equal(isPortraitImage(1920, 1080), false);
  assert.equal(isPortraitImage(800, 800), false);
  assert.equal(isPortraitImage(0, 1200), false);
  assert.equal(isPortraitImage(undefined, 100), false);
  assert.equal(isPortraitImage(100, Number.NaN), false);
});
