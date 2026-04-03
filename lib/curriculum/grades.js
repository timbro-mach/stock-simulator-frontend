const numberOrNull = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export const normalizePercentageValue = (value) => {
  const numeric = numberOrNull(value);
  if (numeric === null) return null;
  if (numeric >= 0 && numeric <= 1) return numeric * 100;
  return numeric;
};

const normalizeGradeSummaryShape = (summary) => {
  if (!summary || typeof summary !== 'object') return null;
  const percentage = normalizePercentageValue(summary?.percentage);
  const totalPointsEarned = numberOrNull(summary?.totalPointsEarned ?? summary?.total_points_earned);
  const totalPointsPossible = numberOrNull(summary?.totalPointsPossible ?? summary?.total_points_possible);

  return {
    ...summary,
    percentage,
    totalPointsEarned,
    total_points_earned: totalPointsEarned,
    totalPointsPossible,
    total_points_possible: totalPointsPossible,
    letterGrade: summary?.letterGrade ?? summary?.letter_grade ?? '',
    letter_grade: summary?.letter_grade ?? summary?.letterGrade ?? '',
    completedItems: numberOrNull(summary?.completedItems ?? summary?.completed_items),
    completed_items: numberOrNull(summary?.completedItems ?? summary?.completed_items),
    totalItems: numberOrNull(summary?.totalItems ?? summary?.total_items),
    total_items: numberOrNull(summary?.totalItems ?? summary?.total_items),
  };
};

const normalizeModuleBreakdownShape = (moduleSummary) => {
  if (!moduleSummary || typeof moduleSummary !== 'object') return null;
  return {
    ...moduleSummary,
    moduleId: moduleSummary?.moduleId ?? moduleSummary?.module_id ?? moduleSummary?.id ?? '',
    module_id: moduleSummary?.module_id ?? moduleSummary?.moduleId ?? moduleSummary?.id ?? '',
    moduleTitle: moduleSummary?.moduleTitle ?? moduleSummary?.module_title ?? moduleSummary?.title ?? '',
    module_title: moduleSummary?.module_title ?? moduleSummary?.moduleTitle ?? moduleSummary?.title ?? '',
    weekNumber: moduleSummary?.weekNumber ?? moduleSummary?.week_number ?? null,
    week_number: moduleSummary?.week_number ?? moduleSummary?.weekNumber ?? null,
    percentage: normalizePercentageValue(moduleSummary?.percentage),
    totalPointsEarned: numberOrNull(moduleSummary?.totalPointsEarned ?? moduleSummary?.total_points_earned),
    total_points_earned: numberOrNull(moduleSummary?.totalPointsEarned ?? moduleSummary?.total_points_earned),
    totalPointsPossible: numberOrNull(moduleSummary?.totalPointsPossible ?? moduleSummary?.total_points_possible),
    total_points_possible: numberOrNull(moduleSummary?.totalPointsPossible ?? moduleSummary?.total_points_possible),
    letterGrade: moduleSummary?.letterGrade ?? moduleSummary?.letter_grade ?? '',
    letter_grade: moduleSummary?.letter_grade ?? moduleSummary?.letterGrade ?? '',
  };
};

const resolveFirstObject = (payload, keys) => {
  const source = payload && typeof payload === 'object' ? payload : {};
  for (const key of keys) {
    const candidate = source?.[key];
    if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) return candidate;
  }
  return null;
};

const resolveFirstArray = (payload, keys) => {
  const source = payload && typeof payload === 'object' ? payload : {};
  for (const key of keys) {
    const candidate = source?.[key];
    if (Array.isArray(candidate)) return candidate;
  }
  return [];
};

export const resolveGradeSummaryOverall = (payload) => {
  const candidate = resolveFirstObject(payload, [
    'gradeSummaryOverall',
    'grade_summary_overall',
    'gradeSummary',
    'grade_summary',
    'grade_summary_total',
    'gradeSummaryTotal',
  ]);
  if (candidate) return normalizeGradeSummaryShape(candidate);
  if (payload && typeof payload === 'object') return normalizeGradeSummaryShape(payload);
  return null;
};

export const resolveGradeSummaryByModule = (payload) => {
  const modules = resolveFirstArray(payload, [
    'gradeSummaryByModule',
    'grade_summary_by_module',
    'moduleGradeSummary',
    'module_grade_summary',
    'moduleGrades',
    'module_grades',
  ]);
  return modules.map((moduleSummary) => normalizeModuleBreakdownShape(moduleSummary)).filter(Boolean);
};
