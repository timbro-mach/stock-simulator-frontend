import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildUpdateDatesPayload,
  canEditCompetitionDates,
  normalizeDateForInput,
  validateDateRange,
} from '../lib/competitionDates.js';

test('canEditCompetitionDates allows admins regardless of ownership', () => {
  const allowed = canEditCompetitionDates({
    isAdmin: true,
    username: 'somebody-else',
    currentUserId: '999',
    competition: { created_by: 42, organizer_username: 'other' },
  });
  assert.equal(allowed, true);
});

test('canEditCompetitionDates allows the organizer when created_by matches user id', () => {
  const allowed = canEditCompetitionDates({
    isAdmin: false,
    username: 'organizer-user',
    currentUserId: '42',
    competition: { created_by: 42, organizer_username: 'organizer-user' },
  });
  assert.equal(allowed, true);
});

test('canEditCompetitionDates allows the organizer when organizer_username matches current username', () => {
  const allowed = canEditCompetitionDates({
    isAdmin: false,
    username: 'organizer-user',
    currentUserId: '',
    competition: { organizer_username: 'Organizer-User' },
  });
  assert.equal(allowed, true);
});

test('canEditCompetitionDates denies non-organizer non-admin users', () => {
  const denied = canEditCompetitionDates({
    isAdmin: false,
    username: 'random-student',
    currentUserId: '7',
    competition: { created_by: 42, organizer_username: 'someone-else' },
  });
  assert.equal(denied, false);
});

test('canEditCompetitionDates denies when competition record is missing', () => {
  assert.equal(
    canEditCompetitionDates({ isAdmin: false, username: 'someone', competition: null }),
    false,
  );
});

test('validateDateRange requires end_date >= start_date when both are set', () => {
  assert.equal(validateDateRange({ startDate: '2026-05-01', endDate: '2026-05-10' }), null);
  assert.equal(validateDateRange({ startDate: '', endDate: '' }), null);
  assert.equal(validateDateRange({ startDate: '2026-05-10', endDate: '2026-05-10' }), null);
  assert.equal(
    validateDateRange({ startDate: '2026-05-10', endDate: '2026-05-01' }),
    'End date must be on or after start date.',
  );
});

test('validateDateRange rejects malformed dates', () => {
  assert.equal(
    validateDateRange({ startDate: '5/1/2026', endDate: '2026-05-10' }),
    'Start date must be in YYYY-MM-DD format.',
  );
  assert.equal(
    validateDateRange({ startDate: '2026-05-01', endDate: 'not-a-date' }),
    'End date must be in YYYY-MM-DD format.',
  );
});

test('normalizeDateForInput coerces values to YYYY-MM-DD', () => {
  assert.equal(normalizeDateForInput('2026-05-10'), '2026-05-10');
  assert.equal(normalizeDateForInput('2026-05-10T00:00:00Z'), '2026-05-10');
  assert.equal(normalizeDateForInput(null), '');
  assert.equal(normalizeDateForInput(''), '');
  assert.equal(normalizeDateForInput('not-a-date'), '');
});

test('buildUpdateDatesPayload prefers competition_code and includes dates', () => {
  const payload = buildUpdateDatesPayload({
    username: 'organizer-user',
    competition: { competition_code: 'ABCD', competition_id: 42 },
    startDate: '2026-05-01',
    endDate: '2026-05-31',
  });
  assert.deepEqual(payload, {
    username: 'organizer-user',
    competition_code: 'ABCD',
    start_date: '2026-05-01',
    end_date: '2026-05-31',
  });
});

test('buildUpdateDatesPayload falls back to competition_id when code is missing', () => {
  const payload = buildUpdateDatesPayload({
    username: 'organizer-user',
    competition: { competition_id: 42 },
    startDate: '2026-05-01',
  });
  assert.deepEqual(payload, {
    username: 'organizer-user',
    competition_id: 42,
    start_date: '2026-05-01',
  });
});

test('buildUpdateDatesPayload sends null to clear a date when requested', () => {
  const payload = buildUpdateDatesPayload({
    username: 'organizer-user',
    competition: { code: 'ABCD' },
    startDate: '',
    endDate: '2026-06-01',
    clearStart: true,
  });
  assert.deepEqual(payload, {
    username: 'organizer-user',
    competition_code: 'ABCD',
    start_date: null,
    end_date: '2026-06-01',
  });
});

test('buildUpdateDatesPayload omits empty fields when no clear flag is set', () => {
  const payload = buildUpdateDatesPayload({
    username: 'organizer-user',
    competition: { code: 'ABCD' },
    startDate: '',
    endDate: '2026-06-01',
  });
  assert.deepEqual(payload, {
    username: 'organizer-user',
    competition_code: 'ABCD',
    end_date: '2026-06-01',
  });
});

test('buildUpdateDatesPayload throws when username is missing', () => {
  assert.throws(
    () => buildUpdateDatesPayload({ competition: { code: 'ABCD' }, startDate: '2026-05-01' }),
    /username is required/,
  );
});

test('buildUpdateDatesPayload throws when neither code nor id is available', () => {
  assert.throws(
    () => buildUpdateDatesPayload({ username: 'x', competition: {}, startDate: '2026-05-01' }),
    /competition_code or competition_id is required/,
  );
});
