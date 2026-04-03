const toCleanString = (value) => String(value ?? '').trim();

const pickFromSources = (sources, fields, { positiveInteger = false } = {}) => {
  const sourceList = Array.isArray(sources) ? sources : [];
  for (const source of sourceList) {
    if (!source || typeof source !== 'object') continue;
    for (const field of fields) {
      const raw = toCleanString(source?.[field]);
      if (!raw) continue;
      if (!positiveInteger) return raw;
      const parsed = Number.parseInt(raw, 10);
      if (Number.isInteger(parsed) && parsed > 0) return String(parsed);
    }
  }
  return '';
};

export const normalizeCurriculumRouteParams = ({
  competitionSources,
  userSources,
  username,
}) => {
  const competition_id = pickFromSources(
    competitionSources,
    ['competition_id', 'competitionId'],
  );
  const user_id = pickFromSources(
    userSources,
    ['user_id', 'userId', 'competition_member_id', 'competitionMemberId', 'member_id', 'memberId', 'membership_id', 'membershipId', 'participant_id', 'participantId', 'id'],
    { positiveInteger: true },
  );
  const normalizedUsername = toCleanString(username);

  return {
    competition_id,
    user_id,
    username: normalizedUsername,
    isReady: Boolean(competition_id && user_id && normalizedUsername),
  };
};

export const buildCanonicalCurriculumEndpoints = ({ baseUrl, competition_id, user_id, username }) => {
  const base = String(baseUrl || '').replace(/\/+$/, '');
  const encodedCompetitionId = encodeURIComponent(toCleanString(competition_id));
  const encodedUserId = encodeURIComponent(toCleanString(user_id));
  const normalizedUsername = toCleanString(username);

  return {
    studentGrades: {
      endpoint: `/curriculum/competition/${encodedCompetitionId}/grades/${encodedUserId}`,
      url: `${base}/curriculum/competition/${encodedCompetitionId}/grades/${encodedUserId}`,
      params: { username: normalizedUsername },
    },
    instructorOverview: {
      endpoint: `/curriculum/competition/${encodedCompetitionId}/instructor-overview`,
      url: `${base}/curriculum/competition/${encodedCompetitionId}/instructor-overview`,
      params: { username: normalizedUsername },
    },
    writtenSubmissions: {
      endpoint: `/curriculum/competition/${encodedCompetitionId}/written-submissions`,
      url: `${base}/curriculum/competition/${encodedCompetitionId}/written-submissions`,
      params: { username: normalizedUsername },
    },
  };
};

export const mapCurriculumRequestError = ({ status, responseMessage }) => {
  const details = [status ? `HTTP ${status}` : '', toCleanString(responseMessage)].filter(Boolean).join(' — ');
  if (status === 401) {
    return details
      ? `Your session expired. Please sign in again. (${details})`
      : 'Your session expired. Please sign in again.';
  }
  if (status === 403) {
    return details
      ? `Insufficient permissions to access curriculum data. (${details})`
      : 'Insufficient permissions to access curriculum data.';
  }
  if (status === 404) {
    return details
      ? `Curriculum resource not found or not enabled for this competition. (${details})`
      : 'Curriculum resource not found or not enabled for this competition.';
  }
  return details
    ? `Curriculum request failed. (${details})`
    : 'Curriculum request failed.';
};

export const logCurriculumRequestFailure = ({ endpoint, competition_id, user_id, username, status, response_message }) => {
  console.error('[curriculum][request-failed]', {
    endpoint,
    competition_id: competition_id || null,
    user_id: user_id || null,
    username: username || null,
    status: status ?? null,
    response_message: response_message || '',
  });
};
