import { normalizePercentageValue } from './curriculum/grades.js';

export const getStoredUsername = () => {
  if (typeof window === 'undefined') return '';
  return String(window.localStorage.getItem('username') || '').trim();
};

export const getTeacherEndpointError = (status) => {
  if (status === 401) return 'Please sign in';
  if (status === 403) return 'Instructor access required';
  if (status === 404) return 'Curriculum is not enabled for this competition';
  return '';
};

export const normalizeGradingStatus = (status) => {
  const normalized = String(status || '').trim().toLowerCase();
  if (['graded', 'pending_grade', 'not_submitted', 'submitted'].includes(normalized)) return normalized;
  if (['partially_graded', 'partial', 'partial_grade'].includes(normalized)) return 'graded';
  return 'not_submitted';
};

export const getStatusBadgeStyles = (status) => {
  const normalized = normalizeGradingStatus(status);
  if (normalized === 'graded') return { background: '#dcfce7', color: '#166534' };
  if (normalized === 'pending_grade') return { background: '#fef3c7', color: '#92400e' };
  if (normalized === 'submitted') return { background: '#dbeafe', color: '#1d4ed8' };
  return { background: '#e5e7eb', color: '#374151' };
};

export const asPercent = (value) => {
  const numeric = normalizePercentageValue(value);
  return Number.isFinite(numeric) ? `${numeric.toFixed(1)}%` : 'Not graded';
};

export const asLetter = (value) => {
  const normalized = String(value || '').trim();
  if (!normalized) return 'N/A';
  if (normalized.toUpperCase() === 'N/A') return 'N/A';
  return normalized;
};

const numberOrNull = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export const asPoints = (earned, possible) => {
  const parsedEarned = numberOrNull(earned);
  const parsedPossible = numberOrNull(possible);
  if (parsedEarned === null && parsedPossible === null) return '—/—';
  return `${parsedEarned ?? 0}/${parsedPossible ?? 0}`;
};
