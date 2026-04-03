import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getGradeItemDisplayText,
  getGradeItemStatus,
  hasSubmittedOrPendingItems,
  shouldShowNoGradedItemsYet,
} from '../lib/curriculum/statusDisplay.js';

test('Case A: graded quiz + pending written assignment keeps status-driven item copy and graded score display', () => {
  const gradedQuiz = {
    title: 'Quiz 1',
    gradingStatus: 'graded',
    pointsEarned: 18,
    pointsPossible: 20,
    percentage: 90,
  };
  const pendingWritten = {
    title: 'Written Assignment 1',
    gradingStatus: 'pending_grade',
    pointsEarned: 0,
    pointsPossible: 20,
  };

  assert.equal(getGradeItemStatus(gradedQuiz), 'graded');
  assert.equal(getGradeItemDisplayText(gradedQuiz), '18/20 (90.0%)');

  assert.equal(getGradeItemStatus(pendingWritten), 'pending_grade');
  assert.equal(getGradeItemDisplayText(pendingWritten), 'Pending teacher grading');

  assert.equal(hasSubmittedOrPendingItems([gradedQuiz, pendingWritten]), true);
  assert.equal(shouldShowNoGradedItemsYet({ totalPointsPossible: 20, items: [gradedQuiz, pendingWritten] }), false);
});

test('Case B: submitted/pending items with no graded totals shows no-graded state and awaiting copy', () => {
  const submittedItem = { title: 'Quiz 2', gradingStatus: 'submitted' };
  const pendingItem = { title: 'Essay 2', gradingStatus: 'pending_grade' };

  assert.equal(getGradeItemDisplayText(submittedItem), 'Submitted, awaiting grading');
  assert.equal(getGradeItemDisplayText(pendingItem), 'Pending teacher grading');

  assert.equal(
    shouldShowNoGradedItemsYet({ totalPointsPossible: 0, items: [submittedItem, pendingItem] }),
    true,
  );
});
