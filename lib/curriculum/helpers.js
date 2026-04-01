export const CURRICULUM_WEEK_MIN = 4;
export const CURRICULUM_WEEK_MAX = 16;

export const toIsoDate = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().split('T')[0];
};

export const calculateCurriculumEndDate = (startDate, weeks) => {
  const parsedWeeks = Number(weeks);
  if (!startDate || !Number.isInteger(parsedWeeks) || parsedWeeks <= 0) return '';
  const date = new Date(startDate);
  if (Number.isNaN(date.getTime())) return '';
  date.setDate(date.getDate() + parsedWeeks * 7 - 1);
  return toIsoDate(date);
};

export const getLetterGrade = (percentage) => {
  const numeric = Number(percentage);
  if (!Number.isFinite(numeric)) return 'N/A';
  if (numeric >= 90) return 'A';
  if (numeric >= 80) return 'B';
  if (numeric >= 70) return 'C';
  if (numeric >= 60) return 'D';
  return 'F';
};

export const formatDisplayDate = (value) => {
  if (!value) return 'TBD';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'TBD';
  return parsed.toLocaleDateString();
};

export const normalizeCurriculumStatus = (status) => {
  const normalized = String(status || '').trim().toLowerCase();
  if (!normalized) return 'Not started';
  if (normalized === 'not_started') return 'Not started';
  if (normalized === 'in_progress') return 'In progress';
  if (normalized === 'submitted') return 'Submitted';
  if (normalized === 'graded') return 'Graded';
  if (normalized === 'late') return 'Late';
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
};
