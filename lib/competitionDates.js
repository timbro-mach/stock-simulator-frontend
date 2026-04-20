const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const toTrimmedString = (value) => String(value ?? '').trim();

const toLowerOrEmpty = (value) => toTrimmedString(value).toLowerCase();

export const normalizeDateForInput = (value) => {
  if (value === null || value === undefined) return '';
  const raw = toTrimmedString(value);
  if (!raw) return '';
  if (ISO_DATE_RE.test(raw)) return raw;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return '';
  const year = parsed.getUTCFullYear();
  const month = String(parsed.getUTCMonth() + 1).padStart(2, '0');
  const day = String(parsed.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const validateDateRange = ({ startDate, endDate }) => {
  const start = toTrimmedString(startDate);
  const end = toTrimmedString(endDate);
  if (start && !ISO_DATE_RE.test(start)) return 'Start date must be in YYYY-MM-DD format.';
  if (end && !ISO_DATE_RE.test(end)) return 'End date must be in YYYY-MM-DD format.';
  if (start && end && end < start) return 'End date must be on or after start date.';
  return null;
};

export const canEditCompetitionDates = ({
  isAdmin = false,
  username = '',
  currentUserId = '',
  competition = null,
} = {}) => {
  if (isAdmin) return true;
  if (!competition) return false;

  const userId = toTrimmedString(currentUserId);
  if (userId) {
    const ownerIds = [
      competition?.created_by,
      competition?.createdBy,
      competition?.organizer_id,
      competition?.organizerId,
      competition?.owner_id,
      competition?.ownerId,
      competition?.creator_id,
      competition?.creatorId,
    ]
      .map(toTrimmedString)
      .filter(Boolean);
    if (ownerIds.includes(userId)) return true;
  }

  const name = toLowerOrEmpty(username);
  if (!name) return false;
  const ownerNames = [
    competition?.organizer_username,
    competition?.organizerUsername,
    competition?.organizer,
    competition?.owner_username,
    competition?.ownerUsername,
    competition?.owner,
    competition?.created_by,
    competition?.createdBy,
    competition?.creator_username,
    competition?.creatorUsername,
    competition?.instructor_username,
    competition?.instructorUsername,
    competition?.instructor,
  ]
    .map(toLowerOrEmpty)
    .filter(Boolean);
  return ownerNames.includes(name);
};

export const buildUpdateDatesPayload = ({
  username,
  competition,
  startDate,
  endDate,
  clearStart = false,
  clearEnd = false,
} = {}) => {
  const user = toTrimmedString(username);
  if (!user) throw new Error('username is required');

  const payload = { username: user };

  const code = toTrimmedString(
    competition?.competition_code ?? competition?.competitionCode ?? competition?.code,
  );
  const idCandidate = competition?.competition_id ?? competition?.competitionId ?? competition?.id;
  const id = idCandidate === null || idCandidate === undefined ? '' : toTrimmedString(idCandidate);
  if (code) {
    payload.competition_code = code;
  } else if (id) {
    const numeric = Number(id);
    payload.competition_id = Number.isFinite(numeric) && String(numeric) === id ? numeric : id;
  } else {
    throw new Error('competition_code or competition_id is required');
  }

  if (clearStart) {
    payload.start_date = null;
  } else {
    const start = toTrimmedString(startDate);
    if (start) payload.start_date = start;
  }

  if (clearEnd) {
    payload.end_date = null;
  } else {
    const end = toTrimmedString(endDate);
    if (end) payload.end_date = end;
  }

  return payload;
};
