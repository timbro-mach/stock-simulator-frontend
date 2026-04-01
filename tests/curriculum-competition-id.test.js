import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildCurriculumPath,
  getCanonicalCompetitionId,
} from '../lib/curriculum/competitionId.js';

test('prefers canonical competition_id over account identifiers', () => {
  const account = {
    account_id: 7001,
    id: 9001,
    competition_code: 'SPRING-TRIAL',
    competition_id: 42,
  };

  assert.equal(getCanonicalCompetitionId(account), '42');
  assert.equal(buildCurriculumPath(getCanonicalCompetitionId(account)), '/curriculum/competition/42');
});

test('individual and team contexts resolve to same shared canonical curriculum path', () => {
  const individualAccount = {
    account_id: 10,
    competition_code: 'SIM-ABC',
    competition_id: '501',
  };
  const teamAccount = {
    team_id: 77,
    competition_code: 'SIM-ABC',
    competition_id: '501',
  };

  const individualPath = buildCurriculumPath(getCanonicalCompetitionId(individualAccount), 'modules');
  const teamPath = buildCurriculumPath(getCanonicalCompetitionId(teamAccount), 'modules');

  assert.equal(individualPath, '/curriculum/competition/501/modules');
  assert.equal(teamPath, '/curriculum/competition/501/modules');
  assert.equal(individualPath, teamPath);
});

test('builds user grade route using canonical competition id', () => {
  const path = buildCurriculumPath('88', 'grades/user-123');
  assert.equal(path, '/curriculum/competition/88/grades/user-123');
});
