import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizePercentageValue,
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
import { asPercent, normalizeGradingStatus } from '../lib/teacherDashboard.js';

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

test('null-safe percentage rendering returns Not graded', () => {
  assert.equal(asPercent(null), 'Not graded');
  assert.equal(asPercent(undefined), 'Not graded');
  assert.equal(asPercent(0.8), '80.0%');
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
