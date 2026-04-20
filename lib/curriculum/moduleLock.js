const toBool = (value, fallback = false) => {
  if (typeof value === 'boolean') return value;
  if (value === null || value === undefined) return fallback;
  const str = String(value).trim().toLowerCase();
  if (['true', '1', 'yes'].includes(str)) return true;
  if (['false', '0', 'no'].includes(str)) return false;
  return fallback;
};

const numericOrNull = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const hasExplicitValue = (value) => value !== null && value !== undefined && value !== '';

const computeTimeUnlockedFromDate = (unlocksAt) => {
  if (!unlocksAt) return true;
  const unlockMs = new Date(unlocksAt).getTime();
  if (!Number.isFinite(unlockMs)) return true;
  return Date.now() >= unlockMs;
};

export const getModuleLockState = (module) => {
  const explicitLocked = module?.locked;
  const explicitTimeUnlocked = module?.timeUnlocked ?? module?.time_unlocked;
  const prerequisiteMet = toBool(module?.prerequisiteMet ?? module?.prerequisite_met, true);
  const prerequisiteModuleId = module?.prerequisiteModuleId ?? module?.prerequisite_module_id ?? null;
  const enforcePrerequisites = toBool(module?.enforcePrerequisites ?? module?.enforce_prerequisites, false);
  const passingThreshold = numericOrNull(module?.passingThreshold ?? module?.passing_threshold);
  const unlocksAt = module?.unlocksAt
    ?? module?.unlocks_at
    ?? module?.unlockDate
    ?? module?.unlock_date
    ?? null;
  const timeUnlocked = hasExplicitValue(explicitTimeUnlocked)
    ? toBool(explicitTimeUnlocked, true)
    : computeTimeUnlockedFromDate(unlocksAt);
  const baseLocked = toBool(explicitLocked, false);
  // Fold time and prerequisite gates into the effective lock so modules with a future
  // unlockDate are treated as locked even when the backend omits an explicit `locked`.
  const locked = baseLocked
    || !timeUnlocked
    || (enforcePrerequisites && !prerequisiteMet);
  return {
    locked,
    timeUnlocked,
    prerequisiteMet,
    prerequisiteModuleId,
    enforcePrerequisites,
    passingThreshold,
    unlocksAt,
  };
};

const getWeekNumber = (module) => module?.weekNumber ?? module?.week_number ?? null;
const getModuleId = (module) => module?.moduleId ?? module?.module_id ?? module?.id ?? null;

const findPrerequisiteWeek = (prerequisiteModuleId, allModules) => {
  if (prerequisiteModuleId === null || prerequisiteModuleId === undefined) return null;
  if (!Array.isArray(allModules)) return null;
  const target = String(prerequisiteModuleId);
  for (const candidate of allModules) {
    if (String(getModuleId(candidate) ?? '') === target) {
      return getWeekNumber(candidate);
    }
  }
  return null;
};

export const buildModuleLockMessage = (module, { allModules, formatDate } = {}) => {
  const state = getModuleLockState(module);
  if (!state.locked) return '';
  if (!state.prerequisiteMet) {
    const prereqWeek = findPrerequisiteWeek(state.prerequisiteModuleId, allModules);
    const threshold = state.passingThreshold !== null ? `${state.passingThreshold}%` : 'the required score';
    if (prereqWeek !== null && prereqWeek !== undefined && prereqWeek !== '') {
      return `Complete Week ${prereqWeek} quiz (>= ${threshold}) to unlock.`;
    }
    return `Complete the prerequisite quiz (>= ${threshold}) to unlock.`;
  }
  if (!state.timeUnlocked) {
    const formatter = typeof formatDate === 'function' ? formatDate : (value) => value;
    return `Unlocks ${formatter(state.unlocksAt) || 'soon'}.`;
  }
  return 'Locked.';
};

export const isModuleNavigable = (module) => !getModuleLockState(module).locked;

export const parseLockedSubmissionError = (error) => {
  const response = error?.response;
  if (!response || response.status !== 423) return null;
  const data = response.data || {};
  return {
    locked: true,
    message: typeof data.message === 'string' ? data.message : 'This module is locked.',
    prerequisiteMet: toBool(data.prerequisiteMet ?? data.prerequisite_met, true),
    prerequisiteModuleId: data.prerequisiteModuleId ?? data.prerequisite_module_id ?? null,
    unlocksAt: data.unlocksAt ?? data.unlocks_at ?? null,
  };
};

