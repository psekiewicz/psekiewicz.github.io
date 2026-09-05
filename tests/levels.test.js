import { test } from 'node:test';
import assert from 'node:assert/strict';
import { xpForLevel, levelFromXp } from '../js/levels.js';

test('xpForLevel matches the documented curve (100*(L-1)^2)', () => {
  assert.equal(xpForLevel(1), 0);
  assert.equal(xpForLevel(2), 100);
  assert.equal(xpForLevel(3), 400);
  assert.equal(xpForLevel(4), 900);
  assert.equal(xpForLevel(5), 1600);
});

test('levelFromXp places 0 xp at level 1 with no progress', () => {
  const result = levelFromXp(0);
  assert.equal(result.level, 1);
  assert.equal(result.xpIntoLevel, 0);
  assert.equal(result.progress, 0);
});

test('levelFromXp treats negative or missing xp as 0', () => {
  assert.equal(levelFromXp(-500).level, 1);
  assert.equal(levelFromXp(undefined).level, 1);
  assert.equal(levelFromXp(null).level, 1);
});

test('levelFromXp is stable at each level boundary (no off-by-one)', () => {
  for (const level of [2, 3, 4, 5, 10]) {
    const boundary = xpForLevel(level);
    assert.equal(levelFromXp(boundary).level, level, `${boundary} xp should be level ${level}`);
    assert.equal(levelFromXp(boundary - 1).level, level - 1, `${boundary - 1} xp should still be level ${level - 1}`);
  }
});

test('levelFromXp breakdown is internally consistent', () => {
  const total = 500;
  const result = levelFromXp(total);
  assert.equal(result.xp, total);
  assert.equal(total - result.xpIntoLevel, xpForLevel(result.level));
  assert.equal(total + result.xpToNextLevel, xpForLevel(result.level + 1));
  assert.ok(result.progress >= 0 && result.progress <= 1);
});

test('levelFromXp never lets progress exceed 1, even exactly on a boundary', () => {
  const result = levelFromXp(xpForLevel(4));
  assert.equal(result.progress, 0);
});
