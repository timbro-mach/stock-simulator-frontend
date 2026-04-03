import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getSummaryByModule,
  getSummaryOverall,
  normalizePercentageValue,
  resolveProgressPercentage,
  resolveGradeSummaryByModule,
  resolveGradeSummaryOverall,
} from '../lib/curriculum/grades.js';
import {
  applyGradeResponse,
  canShowManualGradeAction,
  getQuestionGradeRows,
  toQuestionGradePayload,
  validateQuestionGrades,
} from '../lib/curriculum/teacherDetail.js';
import { asLetter, asPercent, normalizeGradingStatus } from '../lib/teacherDashboard.js';

test('grade summary mapping prefers new keys with legacy fallback', () => {
  const withNewKeys = resolveGradeSummaryOverall({
    gradeSummaryOverall: {
      percentage: 0.95,
      totalPointsEarned: 19,
      totalPointsPossible: 20,
      letterGrade: 'A',
    },
    grade_summary: {
      percentage: 10,
      total_points_earned: 1,
      total_points_possible: 10,
      letter_grade: 'F',
    },
    moduleGrades: [
      { moduleId: 'm-1', quiz: 18, writtenAssignment: 17, tradeParticipation: 10, moduleTotalPoints: 45 },
    ],
  });
  const withLegacyOnly = resolveGradeSummaryOverall({
    grade_summary: {
      percentage: 87.5,
      total_points_earned: 35,
      total_points_possible: 40,
      letter_grade: 'B',
    },
  });

  assert.equal(withNewKeys?.percentage, 95);
  assert.equal(withNewKeys?.totalPointsEarned, 19);
  assert.equal(withNewKeys?.totalPointsPossible, 20);
  assert.equal(withNewKeys?.letterGrade, 'A');
  assert.equal(withLegacyOnly?.percentage, 87.5);
  assert.equal(withLegacyOnly?.letterGrade, 'B');
  assert.equal(withNewKeys?.moduleGrades?.[0]?.quiz, 18);
  assert.equal(withNewKeys?.moduleGrades?.[0]?.writtenAssignment, 17);
  assert.equal(withNewKeys?.moduleGrades?.[0]?.tradeParticipation, 10);
  assert.equal(withNewKeys?.moduleGrades?.[0]?.moduleTotalPoints, 45);
});

test('module breakdown mapping supports new and fallback keys', () => {
  const withNewKeys = resolveGradeSummaryByModule({
    gradeSummaryByModule: [
      { moduleId: 'm-1', weekNumber: 1, totalPointsEarned: 45, totalPointsPossible: 50, percentage: 0.9, letterGrade: 'A-' },
    ],
  });
  const withLegacyKeys = resolveGradeSummaryByModule({
    module_grade_summary: [
      { module_id: 'm-2', week_number: 2, total_points_earned: 40, total_points_possible: 50, percentage: 80, letter_grade: 'B-' },
    ],
  });

  assert.equal(withNewKeys.length, 1);
  assert.equal(withNewKeys[0].percentage, 90);
  assert.equal(withLegacyKeys.length, 1);
  assert.equal(withLegacyKeys[0].moduleId, 'm-2');
  assert.equal(withLegacyKeys[0].percentage, 80);
});

test('overall grade summary falls back to item point totals when aggregate totals are omitted', () => {
  const summary = resolveGradeSummaryOverall({
    grade_summary_overall: {
      completed_items: 1,
      total_items: 18,
      items: [
        { gradingStatus: 'graded', points_earned: 14, points_possible: 20 },
      ],
    },
  });

  assert.equal(summary?.totalPointsEarned, 14);
  assert.equal(summary?.totalPointsPossible, 20);
  assert.equal(summary?.percentage, 70);
});

test('module breakdown supports week + points snake_case aliases', () => {
  const summary = resolveGradeSummaryByModule({
    module_grade_summary: [
      { module_id: 'm-1', week: 1, module_title: 'Week 1: Intro', points_earned: 14, points_possible: 20 },
    ],
  });

  assert.equal(summary.length, 1);
  assert.equal(summary[0].weekNumber, 1);
  assert.equal(summary[0].totalPointsEarned, 14);
  assert.equal(summary[0].totalPointsPossible, 20);
});

test('module breakdown maps alternate component-score aliases for quiz/written/trading tiles', () => {
  const summary = resolveGradeSummaryByModule({
    module_grade_summary: [
      {
        module_id: 'm-2',
        week_number: 2,
        quiz_points_earned: 17,
        assignment_points_earned: 16,
        trade_points: 8,
        total_points_earned: 41,
        total_points_possible: 50,
      },
    ],
  });

  assert.equal(summary.length, 1);
  assert.equal(summary[0].quiz, 17);
  assert.equal(summary[0].writtenAssignment, 16);
  assert.equal(summary[0].tradeParticipation, 8);
});

test('summary helper supports camelCase and snake_case keys', () => {
  const camelModules = getSummaryByModule({
    gradeSummaryByModule: [{ moduleId: 'm-1' }],
  });
  const snakeModules = getSummaryByModule({
    grade_summary_by_module: [{ module_id: 'm-2' }],
  });
  const camelOverall = getSummaryOverall({
    gradeSummaryOverall: { totalPointsEarned: 10 },
  });
  const snakeOverall = getSummaryOverall({
    grade_summary_overall: { total_points_earned: 12 },
  });

  assert.equal(camelModules.length, 1);
  assert.equal(snakeModules.length, 1);
  assert.equal(camelOverall.totalPointsEarned, 10);
  assert.equal(snakeOverall.total_points_earned, 12);
});

test('manual grade action visibility respects manual gradable + submission id', () => {
  assert.equal(canShowManualGradeAction({ isManuallyGradable: true, submissionId: 'sub-1' }), true);
  assert.equal(canShowManualGradeAction({ isManuallyGradable: true }), false);
  assert.equal(canShowManualGradeAction({ isManuallyGradable: false, submissionId: 'sub-1' }), false);
});

test('post-grade response mapping can update status + summaries', () => {
  const result = applyGradeResponse({
    gradeSummaryOverall: { percentage: 0.9, totalPointsEarned: 90, totalPointsPossible: 100, letterGrade: 'A-' },
    gradeSummaryByModule: [{ moduleId: 'm-1', percentage: 100, totalPointsEarned: 50, totalPointsPossible: 50 }],
    items: [{ assignmentId: 'a-1', gradingStatus: 'graded', submissionId: 'sub-1' }],
  });

  assert.equal(result.gradeSummary?.percentage, 90);
  assert.equal(result.gradeSummaryByModule.length, 1);
  assert.equal(result.items[0].gradingStatus, 'graded');
});

test('percentage normalization handles ratio and percent values consistently for cross-view totals', () => {
  assert.equal(normalizePercentageValue(0.95), 95);
  assert.equal(normalizePercentageValue(95), 95);
});

test('progress percentage prefers explicit payload then falls back to completion ratio', () => {
  assert.equal(resolveProgressPercentage({ progressPercentage: 0.25, completedItems: 0, totalItems: 0 }), 25);
  assert.equal(resolveProgressPercentage({ completedItems: 3, totalItems: 4 }), 75);
  assert.equal(resolveProgressPercentage({ completedItems: 2, totalItems: 0 }), 0);
});

test('null-safe percentage rendering returns N/A', () => {
  assert.equal(asPercent(null), 'N/A');
  assert.equal(asPercent(undefined), 'N/A');
  assert.equal(asPercent(0.8), '80.0%');
});

test('zero-denominator summaries do not display derived percent or letter grades', () => {
  assert.equal(asPercent(100, { pointsPossible: 0 }), 'N/A');
  assert.equal(asPercent(null, { pointsPossible: 0 }), 'N/A');
  assert.equal(asLetter('A', { percentage: null, pointsPossible: 0 }), 'N/A');
  assert.equal(asLetter('A', { percentage: null }), 'N/A');
  assert.equal(asLetter('A', { percentage: 95, pointsPossible: 100 }), 'A');
});

test('question grade helper prefers authoritative questionGrades and supports fallback rows', () => {
  const authoritative = getQuestionGradeRows({
    questionGrades: [{ questionId: 'a1', pointsAwarded: 8, pointsPossible: 10, feedback: 'Nice job' }],
  });
  const fallback = getQuestionGradeRows({
    submissionContent: { answers: [{ questionId: 'a1' }, { questionId: 'a2', pointsPossible: 12 }] },
  });

  assert.equal(authoritative.length, 1);
  assert.deepEqual(authoritative[0], { questionId: 'a1', pointsAwarded: 8, pointsPossible: 10, feedback: 'Nice job' });
  assert.equal(fallback.length, 2);
  assert.equal(fallback[0].pointsPossible, 10);
  assert.equal(fallback[1].pointsPossible, 12);
});

test('question grade validation catches numeric and range constraints', () => {
  assert.equal(validateQuestionGrades([]), 'Add at least one question grade.');
  assert.match(validateQuestionGrades([{ pointsAwarded: 'x', pointsPossible: 10 }]), /numeric/);
  assert.match(validateQuestionGrades([{ pointsAwarded: 11, pointsPossible: 10 }]), /cannot exceed/);
  assert.equal(validateQuestionGrades([{ pointsAwarded: 8, pointsPossible: 10 }]), '');
});

test('question grade payload maps overall and rubric feedback fields', () => {
  const payload = toQuestionGradePayload({
    username: 'teacher1',
    grades: [{ questionId: 'a1', pointsAwarded: '8', pointsPossible: '10', feedback: 'Great work' }],
    finalFeedback: 'Overall comments',
    rubricNotes: 'Rubric notes',
  });

  assert.deepEqual(payload, {
    username: 'teacher1',
    grades: [{ questionId: 'a1', pointsAwarded: 8, pointsPossible: 10, feedback: 'Great work' }],
    finalFeedback: 'Overall comments',
    rubricNotes: 'Rubric notes',
  });
});

test('partial grading statuses are treated as graded', () => {
  assert.equal(normalizeGradingStatus('partially_graded'), 'graded');
});
