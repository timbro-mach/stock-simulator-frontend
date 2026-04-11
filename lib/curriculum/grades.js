const numberOrNull = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const toObject = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {});

const resolveGradingStatus = ({ explicitStatus, earnedPoints, hasSubmissionSignal }) => {
  const normalized = String(explicitStatus || '').trim().toLowerCase();
  if (normalized) return normalized;
  if (hasSubmissionSignal) return 'submitted';
  if (earnedPoints !== null) return 'graded';
  return 'not_submitted';
};

export const normalizePercentageValue = (value) => {
  const numeric = numberOrNull(value);
  if (numeric === null) return null;
  if (numeric >= 0 && numeric <= 1) return numeric * 100;
  return numeric;
};

const normalizeGradeSummaryShape = (summary) => {
  if (!summary || typeof summary !== 'object') return null;
  const items = Array.isArray(summary?.items)
    ? summary.items
    : (Array.isArray(summary?.gradeItems) ? summary.gradeItems : (Array.isArray(summary?.grade_items) ? summary.grade_items : []));
  const derivedFromItems = items.reduce((accumulator, item) => {
    const earned = numberOrNull(item?.pointsEarned ?? item?.points_earned ?? item?.score);
    const possible = numberOrNull(item?.pointsPossible ?? item?.points_possible ?? item?.maxPoints ?? item?.max_points);
    return {
      totalEarned: accumulator.totalEarned + (earned ?? 0),
      totalPossible: accumulator.totalPossible + (possible ?? 0),
      hasAnyPossible: accumulator.hasAnyPossible || (possible !== null && possible > 0),
      hasAnyEarned: accumulator.hasAnyEarned || earned !== null,
    };
  }, {
    totalEarned: 0,
    totalPossible: 0,
    hasAnyPossible: false,
    hasAnyEarned: false,
  });
  const percentage = normalizePercentageValue(
    summary?.percentage ?? summary?.curriculumPercentage ?? summary?.curriculum_percentage,
  );
  const explicitTotalPointsEarned = numberOrNull(
    summary?.totalPointsEarned
    ?? summary?.total_points_earned
    ?? summary?.pointsEarned
    ?? summary?.points_earned,
  );
  const explicitTotalPointsPossible = numberOrNull(
    summary?.totalPointsPossible
    ?? summary?.total_points_possible
    ?? summary?.pointsPossible
    ?? summary?.points_possible,
  );
  const totalPointsEarned = explicitTotalPointsEarned ?? (derivedFromItems.hasAnyEarned ? derivedFromItems.totalEarned : null);
  const totalPointsPossible = explicitTotalPointsPossible ?? (derivedFromItems.hasAnyPossible ? derivedFromItems.totalPossible : null);
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
  const resolvedPercentage = percentage ?? (
    totalPointsPossible && totalPointsPossible > 0 && totalPointsEarned !== null
      ? (totalPointsEarned / totalPointsPossible) * 100
      : null
  );

  return {
    ...summary,
    percentage: resolvedPercentage,
    curriculumPercentage: resolvedPercentage,
    curriculum_percentage: resolvedPercentage,
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
  const quizObject = toObject(moduleSummary?.quiz);
  const writtenObject = toObject(moduleSummary?.writtenAssignment ?? moduleSummary?.written_assignment);
  const tradingObject = toObject(moduleSummary?.tradeParticipation ?? moduleSummary?.trade_participation);
  const quizScore = numberOrNull(
    quizObject?.score
    ?? quizObject?.pointsEarned
    ?? quizObject?.points_earned
    ?? moduleSummary?.quiz
    ?? moduleSummary?.quizScore
    ?? moduleSummary?.quiz_score
    ?? moduleSummary?.quizPoints
    ?? moduleSummary?.quiz_points
    ?? moduleSummary?.quizPointsEarned
    ?? moduleSummary?.quiz_points_earned
    ?? moduleSummary?.quizScoreEarned
    ?? moduleSummary?.quiz_score_earned
    ?? moduleSummary?.quizGrade
    ?? moduleSummary?.quiz_grade,
  );
  const writtenAssignment = numberOrNull(
    writtenObject?.totalScore
    ?? writtenObject?.score
    ?? writtenObject?.pointsEarned
    ?? writtenObject?.points_earned
    ?? moduleSummary?.writtenAssignment
    ?? moduleSummary?.written_assignment
    ?? moduleSummary?.writtenTotal
    ?? moduleSummary?.written_total
    ?? moduleSummary?.written
    ?? moduleSummary?.writtenScore
    ?? moduleSummary?.written_score
    ?? moduleSummary?.writtenPoints
    ?? moduleSummary?.written_points
    ?? moduleSummary?.assignmentScore
    ?? moduleSummary?.assignment_score
    ?? moduleSummary?.assignmentPoints
    ?? moduleSummary?.assignment_points
    ?? moduleSummary?.writtenAssignmentScore
    ?? moduleSummary?.written_assignment_score
    ?? moduleSummary?.writtenPointsEarned
    ?? moduleSummary?.written_points_earned
    ?? moduleSummary?.assignmentPointsEarned
    ?? moduleSummary?.assignment_points_earned
  );
  const tradeParticipation = numberOrNull(
    tradingObject?.tradePoints
    ?? tradingObject?.trade_points
    ?? tradingObject?.score
    ?? tradingObject?.pointsEarned
    ?? tradingObject?.points_earned
    ?? moduleSummary?.tradeParticipation
    ?? moduleSummary?.trade_participation
    ?? moduleSummary?.trading
    ?? moduleSummary?.tradingParticipation
    ?? moduleSummary?.trading_participation
    ?? moduleSummary?.tradeParticipationScore
    ?? moduleSummary?.trade_participation_score
    ?? moduleSummary?.tradingParticipationScore
    ?? moduleSummary?.trading_participation_score
    ?? moduleSummary?.tradePoints
    ?? moduleSummary?.trade_points
    ?? moduleSummary?.tradingPoints
    ?? moduleSummary?.trading_points
  );
  const moduleTotalPoints = numberOrNull(
    moduleSummary?.moduleTotalPoints
    ?? moduleSummary?.module_total_points
    ?? moduleSummary?.moduleTotal
    ?? moduleSummary?.module_total
    ?? moduleSummary?.totalPointsEarned
    ?? moduleSummary?.total_points_earned
    ?? moduleSummary?.pointsEarned
    ?? moduleSummary?.points_earned,
  );
  const totalPointsPossible = numberOrNull(
    moduleSummary?.modulePointsPossible
    ?? moduleSummary?.module_points_possible
    ?? moduleSummary?.totalPointsPossible
    ?? moduleSummary?.total_points_possible
    ?? moduleSummary?.pointsPossible
    ?? moduleSummary?.points_possible,
  );
  const totalPointsEarned = numberOrNull(
    moduleSummary?.totalPointsEarned
    ?? moduleSummary?.total_points_earned
    ?? moduleSummary?.pointsEarned
    ?? moduleSummary?.points_earned,
  );
  const quizStatus = resolveGradingStatus({
    explicitStatus: quizObject?.gradingStatus ?? quizObject?.grading_status ?? moduleSummary?.quizGradingStatus ?? moduleSummary?.quiz_grading_status,
    earnedPoints: quizScore,
    hasSubmissionSignal: Boolean(quizObject?.submittedAt ?? quizObject?.submitted_at),
  });
  const writtenStatus = resolveGradingStatus({
    explicitStatus: writtenObject?.gradingStatus ?? writtenObject?.grading_status ?? moduleSummary?.writtenGradingStatus ?? moduleSummary?.written_grading_status,
    earnedPoints: writtenAssignment,
    hasSubmissionSignal: Boolean(writtenObject?.submittedAt ?? writtenObject?.submitted_at),
  });
  const tradeStatus = resolveGradingStatus({
    explicitStatus: tradingObject?.gradingStatus ?? tradingObject?.grading_status ?? moduleSummary?.tradeGradingStatus ?? moduleSummary?.trade_grading_status,
    earnedPoints: tradeParticipation,
    hasSubmissionSignal: Boolean(tradingObject?.submittedAt ?? tradingObject?.submitted_at),
  });
  return {
    ...moduleSummary,
    moduleId: moduleSummary?.moduleId ?? moduleSummary?.module_id ?? moduleSummary?.id ?? '',
    module_id: moduleSummary?.module_id ?? moduleSummary?.moduleId ?? moduleSummary?.id ?? '',
    moduleTitle: moduleSummary?.moduleTitle ?? moduleSummary?.module_title ?? moduleSummary?.title ?? '',
    module_title: moduleSummary?.module_title ?? moduleSummary?.moduleTitle ?? moduleSummary?.title ?? '',
    weekNumber: moduleSummary?.weekNumber ?? moduleSummary?.week_number ?? moduleSummary?.week ?? moduleSummary?.module_week ?? null,
    week_number: moduleSummary?.week_number ?? moduleSummary?.weekNumber ?? moduleSummary?.week ?? moduleSummary?.module_week ?? null,
    percentage: normalizePercentageValue(moduleSummary?.percentage),
    modulePercentage: normalizePercentageValue(moduleSummary?.modulePercentage ?? moduleSummary?.module_percentage ?? moduleSummary?.percentage),
    module_percentage: normalizePercentageValue(moduleSummary?.modulePercentage ?? moduleSummary?.module_percentage ?? moduleSummary?.percentage),
    totalPointsEarned,
    total_points_earned: totalPointsEarned,
    totalPointsPossible,
    total_points_possible: totalPointsPossible,
    modulePointsPossible: numberOrNull(moduleSummary?.modulePointsPossible ?? moduleSummary?.module_points_possible ?? totalPointsPossible),
    module_points_possible: numberOrNull(moduleSummary?.modulePointsPossible ?? moduleSummary?.module_points_possible ?? totalPointsPossible),
    letterGrade: moduleSummary?.letterGrade ?? moduleSummary?.letter_grade ?? '',
    letter_grade: moduleSummary?.letter_grade ?? moduleSummary?.letterGrade ?? '',
    quizScore,
    quiz_score: quizScore,
    quizPointsEarned: quizScore,
    quiz_points_earned: quizScore,
    quiz: {
      ...quizObject,
      score: quizScore,
      pointsPossible: numberOrNull(
        quizObject?.pointsPossible
        ?? quizObject?.points_possible
        ?? moduleSummary?.quizPointsPossible
        ?? moduleSummary?.quiz_points_possible,
      ),
      gradingStatus: quizStatus,
    },
    writtenAssignmentScore: writtenAssignment,
    written_assignment_score: writtenAssignment,
    writtenTotal: writtenAssignment,
    written_total: writtenAssignment,
    writtenAssignment: {
      ...writtenObject,
      totalScore: writtenAssignment,
      pointsPossible: numberOrNull(
        writtenObject?.pointsPossible
        ?? writtenObject?.points_possible
        ?? moduleSummary?.writtenPointsPossible
        ?? moduleSummary?.written_points_possible,
      ),
      question1Score: numberOrNull(
        writtenObject?.question1Score
        ?? writtenObject?.question_1_score
        ?? writtenObject?.question1
        ?? writtenObject?.question_1
        ?? writtenObject?.q1Score
        ?? writtenObject?.q1_score
        ?? moduleSummary?.written_q1_score
        ?? moduleSummary?.question_1_score
      ),
      question2Score: numberOrNull(
        writtenObject?.question2Score
        ?? writtenObject?.question_2_score
        ?? writtenObject?.question2
        ?? writtenObject?.question_2
        ?? writtenObject?.q2Score
        ?? writtenObject?.q2_score
        ?? moduleSummary?.written_q2_score
        ?? moduleSummary?.question_2_score
      ),
      gradingStatus: writtenStatus,
    },
    written_assignment: {
      ...writtenObject,
      totalScore: writtenAssignment,
      pointsPossible: numberOrNull(
        writtenObject?.pointsPossible
        ?? writtenObject?.points_possible
        ?? moduleSummary?.writtenPointsPossible
        ?? moduleSummary?.written_points_possible,
      ),
      question1Score: numberOrNull(
        writtenObject?.question1Score
        ?? writtenObject?.question_1_score
        ?? writtenObject?.question1
        ?? writtenObject?.question_1
        ?? writtenObject?.q1Score
        ?? writtenObject?.q1_score
        ?? moduleSummary?.written_q1_score
        ?? moduleSummary?.question_1_score
      ),
      question2Score: numberOrNull(
        writtenObject?.question2Score
        ?? writtenObject?.question_2_score
        ?? writtenObject?.question2
        ?? writtenObject?.question_2
        ?? writtenObject?.q2Score
        ?? writtenObject?.q2_score
        ?? moduleSummary?.written_q2_score
        ?? moduleSummary?.question_2_score
      ),
      gradingStatus: writtenStatus,
    },
    tradeParticipationScore: tradeParticipation,
    trade_participation_score: tradeParticipation,
    trading: tradeParticipation,
    tradeParticipation: {
      ...tradingObject,
      tradePoints: tradeParticipation,
      pointsPossible: numberOrNull(
        tradingObject?.pointsPossible
        ?? tradingObject?.points_possible
        ?? moduleSummary?.tradingPointsPossible
        ?? moduleSummary?.trading_points_possible
        ?? moduleSummary?.tradePointsPossible
        ?? moduleSummary?.trade_points_possible,
      ),
      gradingStatus: tradeStatus,
    },
    trade_participation: {
      ...tradingObject,
      tradePoints: tradeParticipation,
      pointsPossible: numberOrNull(
        tradingObject?.pointsPossible
        ?? tradingObject?.points_possible
        ?? moduleSummary?.tradingPointsPossible
        ?? moduleSummary?.trading_points_possible
        ?? moduleSummary?.tradePointsPossible
        ?? moduleSummary?.trade_points_possible,
      ),
      gradingStatus: tradeStatus,
    },
    moduleTotalPoints,
    module_total_points: moduleTotalPoints,
    moduleTotal: moduleTotalPoints,
    module_total: moduleTotalPoints,
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

const resolveModuleGradesArray = (payload) => {
  const fromModuleGrades = resolveFirstArray(payload, [
    'moduleGrades',
    'module_grades',
    'moduleGradeSummary',
    'module_grade_summary',
  ]);
  if (fromModuleGrades.length > 0) return fromModuleGrades;
  const nestedSummary = resolveFirstObject(payload, [
    'gradeSummaryOverall',
    'grade_summary_overall',
    'gradeSummary',
    'grade_summary',
    'grade_summary_total',
    'gradeSummaryTotal',
  ]);
  if (nestedSummary) {
    const nestedModuleGrades = resolveFirstArray(nestedSummary, [
      'moduleGrades',
      'module_grades',
      'moduleGradeSummary',
      'module_grade_summary',
    ]);
    if (nestedModuleGrades.length > 0) return nestedModuleGrades;
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
  const moduleGrades = resolveModuleGradesArray(payload)
    .map((moduleSummary) => normalizeModuleBreakdownShape(moduleSummary))
    .filter(Boolean);
  if (candidate) {
    const normalizedCandidate = normalizeGradeSummaryShape(candidate);
    if (!normalizedCandidate) return normalizedCandidate;
    return {
      ...normalizedCandidate,
      moduleGrades,
      module_grades: moduleGrades,
    };
  }
  if (payload && typeof payload === 'object') {
    const normalizedPayload = normalizeGradeSummaryShape(payload);
    if (!normalizedPayload) return normalizedPayload;
    return {
      ...normalizedPayload,
      moduleGrades,
      module_grades: moduleGrades,
    };
  }
  return null;
};

export const getSummaryByModule = (data) => {
  const source = toObject(data);
  const modules = source.gradeSummaryByModule
    ?? source.grade_summary_by_module
    ?? source.moduleGradeSummary
    ?? source.module_grade_summary
    ?? [];
  return Array.isArray(modules) ? modules : [];
};

export const getSummaryOverall = (data) => {
  const source = toObject(data);
  const summary = source.gradeSummaryOverall ?? source.grade_summary_overall ?? {};
  return toObject(summary);
};

export const resolveGradeSummaryByModule = (payload) => {
  const modules = getSummaryByModule(payload);
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
  if (completed === null || total === null) return null;
  if (total <= 0) return 0;
  return (completed / total) * 100;
};
