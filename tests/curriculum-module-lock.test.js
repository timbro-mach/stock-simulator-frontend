import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildModuleLockMessage,
  getModuleLockState,
  isModuleNavigable,
  parseLockedSubmissionError,
} from '../lib/curriculum/moduleLock.js';

test('getModuleLockState reads backend lock contract fields (camelCase)', () => {
  const state = getModuleLockState({
    locked: true,
    timeUnlocked: false,
    prerequisiteMet: false,
    prerequisiteModuleId: 42,
    enforcePrerequisites: true,
    passingThreshold: 70,
    unlocksAt: '2026-05-01',
  });
  assert.deepEqual(state, {
    locked: true,
    timeUnlocked: false,
    prerequisiteMet: false,
    prerequisiteModuleId: 42,
    enforcePrerequisites: true,
    passingThreshold: 70,
    unlocksAt: '2026-05-01',
  });
});

test('getModuleLockState accepts snake_case aliases', () => {
  const state = getModuleLockState({
    locked: false,
    time_unlocked: true,
    prerequisite_met: true,
    prerequisite_module_id: 7,
    enforce_prerequisites: false,
    passing_threshold: 65,
    unlocks_at: '2026-06-01',
  });
  assert.equal(state.prerequisiteModuleId, 7);
  assert.equal(state.passingThreshold, 65);
  assert.equal(state.unlocksAt, '2026-06-01');
});

test('buildModuleLockMessage prefers prerequisite message with week number lookup', () => {
  const modules = [
    { moduleId: 10, weekNumber: 1, locked: false },
    { moduleId: 11, weekNumber: 2, locked: true, prerequisiteMet: false, prerequisiteModuleId: 10, passingThreshold: 70 },
  ];
  const message = buildModuleLockMessage(modules[1], { allModules: modules });
  assert.equal(message, 'Complete Week 1 quiz (>= 70%) to unlock.');
});

test('buildModuleLockMessage falls back to time-unlock message when prerequisite met but time not reached', () => {
  const module = {
    locked: true,
    prerequisiteMet: true,
    timeUnlocked: false,
    unlocksAt: '2026-05-01',
  };
  const message = buildModuleLockMessage(module, {
    formatDate: (value) => `on ${value}`,
  });
  assert.equal(message, 'Unlocks on 2026-05-01.');
});

test('buildModuleLockMessage returns empty string when module is unlocked', () => {
  const message = buildModuleLockMessage({ locked: false });
  assert.equal(message, '');
});

test('isModuleNavigable gates navigation on lock state', () => {
  assert.equal(isModuleNavigable({ locked: true }), false);
  assert.equal(isModuleNavigable({ locked: false }), true);
  assert.equal(isModuleNavigable({}), true);
});

test('parseLockedSubmissionError extracts 423 payload', () => {
  const error = {
    response: {
      status: 423,
      data: {
        message: 'Complete Week 1 quiz first.',
        locked: true,
        prerequisiteMet: false,
        prerequisiteModuleId: 10,
        unlocksAt: null,
      },
    },
  };
  const info = parseLockedSubmissionError(error);
  assert.deepEqual(info, {
    locked: true,
    message: 'Complete Week 1 quiz first.',
    prerequisiteMet: false,
    prerequisiteModuleId: 10,
    unlocksAt: null,
  });
});

test('parseLockedSubmissionError returns null for non-423 errors', () => {
  assert.equal(parseLockedSubmissionError({ response: { status: 500, data: {} } }), null);
  assert.equal(parseLockedSubmissionError({}), null);
  assert.equal(parseLockedSubmissionError(null), null);
});
