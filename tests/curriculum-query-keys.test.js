import test from 'node:test';
import assert from 'node:assert/strict';

import { curriculumGradeQueryKeys, refetchCurriculumGradeQueries } from '../lib/curriculum/queryKeys.js';

test('builds curriculum grade query keys for student + teacher views', () => {
  const keys = curriculumGradeQueryKeys({
    competitionId: 'abc',
    studentId: '42',
    teacherUsername: 'teacher1',
    viewerUsername: 'student1',
  });

  assert.deepEqual(keys.studentGradesSummaryKey, ['curriculum', 'competition', 'abc', 'grades', '42', 'student1']);
  assert.deepEqual(keys.teacherStudentDetailKey, ['curriculum', 'competition', 'abc', 'instructor', 'students', '42', 'teacher1']);
  assert.deepEqual(keys.teacherRosterKey, ['curriculum', 'competition', 'abc', 'instructor', 'roster', 'teacher1']);
});

test('integration: submit grade success triggers all curriculum grade query refetchers', async () => {
  const calls = [];
  await refetchCurriculumGradeQueries({
    refetchStudentGradesSummary: async () => { calls.push('student-summary'); },
    refetchTeacherStudentDetail: async () => { calls.push('teacher-student-detail'); },
    refetchTeacherRoster: async () => { calls.push('teacher-roster'); },
  });

  assert.deepEqual(calls.sort(), ['student-summary', 'teacher-roster', 'teacher-student-detail']);
});
