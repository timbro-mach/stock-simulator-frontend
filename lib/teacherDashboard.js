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
  return Number.isFinite(numeric) ? `${numeric.toFixed(1)}%` : '0.0%';
};
