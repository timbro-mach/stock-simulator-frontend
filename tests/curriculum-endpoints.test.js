import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildCanonicalCurriculumEndpoints,
  mapCurriculumRequestError,
  normalizeCurriculumRouteParams,
} from '../lib/curriculum/endpoints.js';

test('normalizes route params from snake_case and camelCase fields', () => {
  const snakeCase = normalizeCurriculumRouteParams({
    competitionSources: [{ competition_id: '501' }],
    userSources: [{ user_id: '42' }],
    username: 'student1',
  });
  const camelCase = normalizeCurriculumRouteParams({
    competitionSources: [{ competitionId: '501' }],
    userSources: [{ userId: '42' }],
    username: 'student1',
  });

  assert.deepEqual(snakeCase, {
    competition_id: '501',
    user_id: '42',
    username: 'student1',
    isReady: true,
  });
  assert.deepEqual(camelCase, snakeCase);
});

test('guards fetches when required identifiers are missing', () => {
  const missingUser = normalizeCurriculumRouteParams({
    competitionSources: [{ competition_id: '501' }],
    userSources: [{}],
    username: 'student1',
  });

  assert.equal(missingUser.isReady, false);
  assert.equal(missingUser.user_id, '');
});

test('builds a single canonical request URL per dependency (no waterfall aliases)', () => {
  const endpoints = buildCanonicalCurriculumEndpoints({
    baseUrl: 'https://api.example.com',
    competition_id: '501',
    user_id: '77',
    username: 'student1',
  });

  assert.deepEqual(endpoints.studentGrades, {
    endpoint: '/curriculum/competition/501/grades/77',
    url: 'https://api.example.com/curriculum/competition/501/grades/77',
    params: { username: 'student1' },
  });
  assert.deepEqual(endpoints.instructorOverview, {
    endpoint: '/curriculum/competition/501/instructor-overview',
    url: 'https://api.example.com/curriculum/competition/501/instructor-overview',
    params: { username: 'student1' },
  });
  assert.deepEqual(endpoints.writtenSubmissions, {
    endpoint: '/curriculum/competition/501/written-submissions',
    url: 'https://api.example.com/curriculum/competition/501/written-submissions',
    params: { username: 'student1' },
  });
});

test('maps curriculum error statuses to explicit UI messages', () => {
  assert.match(mapCurriculumRequestError({ status: 401, responseMessage: 'expired' }), /sign in again/i);
  assert.match(mapCurriculumRequestError({ status: 403, responseMessage: 'forbidden' }), /insufficient permissions/i);
  assert.match(mapCurriculumRequestError({ status: 404, responseMessage: 'missing' }), /not found or not enabled/i);
});
