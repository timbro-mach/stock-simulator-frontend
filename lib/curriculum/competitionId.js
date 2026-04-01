const toCleanString = (value) => String(value ?? '').trim();

export const getCanonicalCompetitionId = (value) => {
  if (!value || typeof value !== 'object') return '';
  const candidate = toCleanString(
    value?.competition_id
    ?? value?.competitionId
    ?? value?.competition?.id
    ?? value?.competition?.competition_id
    ?? value?.competition?.competitionId
    ?? value?.competitionIdCanonical
    ?? value?.canonical_competition_id
    ?? value?.canonicalCompetitionId
    ?? value?.id_competition,
  );
  return candidate;
};

export const getCompetitionCode = (value) => {
  if (!value || typeof value !== 'object') return '';
  return toCleanString(
    value?.code
    ?? value?.competition_code
    ?? value?.competitionCode
    ?? value?.competition?.code
    ?? value?.competition?.competition_code
    ?? value?.competition?.competitionCode,
  );
};

export const buildCurriculumPath = (competitionId, suffix = '') => {
  const trimmedId = toCleanString(competitionId);
  if (!trimmedId) return '';
  const cleanSuffix = toCleanString(suffix).replace(/^\/+/, '');
  return cleanSuffix
    ? `/curriculum/competition/${encodeURIComponent(trimmedId)}/${cleanSuffix}`
    : `/curriculum/competition/${encodeURIComponent(trimmedId)}`;
};
