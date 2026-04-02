import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildAssignmentSubmissionPayload,
  canManageCurriculumGradesForCompetition,
  normalizeAssignmentIdKey,
} from '../lib/curriculum/submission.js';

test('permission gating prefers explicit instructor flag when present', () => {
  const allowed = canManageCurriculumGradesForCompetition({
    isAdmin: false,
    username: 'student1',
    competitionRecord: {
      is_instructor_for_competition: true,
      organizer_username: 'someone-else',
    },
  });
  const denied = canManageCurriculumGradesForCompetition({
    isAdmin: false,
    username: 'owner-user',
    competitionRecord: {
      is_instructor_for_competition: false,
      organizer_username: 'owner-user',
    },
  });

  assert.equal(allowed, true);
  assert.equal(denied, false);
});

test('permission gating falls back to owner heuristic when explicit flag missing', () => {
  const canManage = canManageCurriculumGradesForCompetition({
    isAdmin: false,
    username: 'creator-user',
    competitionRecord: {
      creator_username: 'creator-user',
    },
  });

  assert.equal(canManage, true);
});

test('builds multipart written payload with part-level responses', () => {
  const payload = buildAssignmentSubmissionPayload({
    assignmentType: 'assignment',
    questions: [
      {
        id: 'q1',
        parts: [{ id: 'a' }, { id: 'b' }],
      },
      {
        id: 'q2',
      },
    ],
    writtenAnswers: {
      'q1-part-a': 'First part',
      'q1-part-b': 'Second part',
      q2: 'Single answer',
    },
  });

  assert.deepEqual(payload, {
    answers: [
      {
        questionId: 'q1',
        parts: [
          { partId: 'a', response: 'First part' },
          { partId: 'b', response: 'Second part' },
        ],
      },
      {
        questionId: 'q2',
        response: 'Single answer',
      },
    ],
  });
});

test('normalizes assignment IDs to strings for submission map keys', () => {
  assert.equal(normalizeAssignmentIdKey(42), '42');
  assert.equal(normalizeAssignmentIdKey('  abc  '), 'abc');
});
