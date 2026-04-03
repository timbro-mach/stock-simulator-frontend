const numberOrNull = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const toObject = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {});

export const normalizePercentageValue = (value) => {
  const numeric = numberOrNull(value);
  if (numeric === null) return null;
  if (numeric >= 0 && numeric <= 1) return numeric * 100;
  return numeric;
};

const normalizeGradeSummaryShape = (summary) => {
  if (!summary || typeof summary !== 'object') return null;
  const percentage = normalizePercentageValue(
    summary?.percentage ?? summary?.curriculumPercentage ?? summary?.curriculum_percentage,
  );
  const totalPointsEarned = numberOrNull(summary?.totalPointsEarned ?? summary?.total_points_earned);
  const totalPointsPossible = numberOrNull(summary?.totalPointsPossible ?? summary?.total_points_possible);
  const completedItems = numberOrNull(
    summary?.completedItems
    ?? summary?.completed_items
    ?? summary?.completedCurriculumItems
    ?? summary?.completed_curriculum_items,
  );
  const totalItems = numberOrNull(
    summary?.totalItems
    ?? summary?.total_items
    ?? summary?.totalCurriculumItems
    ?? summary?.total_curriculum_items,
  );
  const progressPercentage = normalizePercentageValue(summary?.progressPercentage ?? summary?.progress_percentage);

  return {
    ...summary,
    percentage,
    curriculumPercentage: percentage,
    curriculum_percentage: percentage,
    totalPointsEarned,
    total_points_earned: totalPointsEarned,
    totalPointsPossible,
    total_points_possible: totalPointsPossible,
    letterGrade: summary?.letterGrade ?? summary?.letter_grade ?? '',
    letter_grade: summary?.letter_grade ?? summary?.letterGrade ?? '',
    completedItems,
    completed_items: completedItems,
    completedCurriculumItems: completedItems,
    completed_curriculum_items: completedItems,
    totalItems,
    total_items: totalItems,
    totalCurriculumItems: totalItems,
    total_curriculum_items: totalItems,
    progressPercentage,
    progress_percentage: progressPercentage,
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

export const getSummaryByModule = (data) => {
  const source = toObject(data);
  const modules = source.gradeSummaryByModule ?? source.grade_summary_by_module ?? [];
  return Array.isArray(modules) ? modules : [];
};

export const getSummaryOverall = (data) => {
  const source = toObject(data);
  const summary = source.gradeSummaryOverall ?? source.grade_summary_overall ?? {};
  return toObject(summary);
};

export const resolveGradeSummaryByModule = (payload) => {
  const modulesFromCanonicalKeys = getSummaryByModule(payload);
  const modules = modulesFromCanonicalKeys.length > 0
    ? modulesFromCanonicalKeys
    : resolveFirstArray(payload, [
      'moduleGradeSummary',
      'module_grade_summary',
      'moduleGrades',
      'module_grades',
    ]);
  return modules.map((moduleSummary) => normalizeModuleBreakdownShape(moduleSummary)).filter(Boolean);
};

export const resolveProgressPercentage = ({
  progressPercentage,
  completedItems,
  totalItems,
}) => {
  const explicitProgress = normalizePercentageValue(progressPercentage);
  if (explicitProgress !== null) return explicitProgress;
  const completed = numberOrNull(completedItems);
  const total = numberOrNull(totalItems);
  if (completed === null || total === null || total <= 0) return 0;
  return (completed / total) * 100;
};
