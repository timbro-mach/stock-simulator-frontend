import { asPercent, asPoints, normalizeGradingStatus } from '../teacherDashboard.js';

const numberOrNull = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export const getGradeItemStatus = (item) => normalizeGradingStatus(item?.gradingStatus ?? item?.status);

export const getGradeItemDisplayText = (item) => {
  const status = getGradeItemStatus(item);
  if (status === 'pending_grade') return 'Pending teacher grading';
  if (status === 'submitted') return 'Submitted, awaiting grading';
  if (status !== 'graded') return 'Not submitted';

  const earned = item?.pointsEarned ?? item?.points_earned;
  const possible = item?.pointsPossible ?? item?.points_possible;
  const percentage = item?.percentage;

  const pointsText = asPoints(earned, possible);
  const percentText = asPercent(percentage, { pointsPossible: possible });
  if (percentText === 'N/A') return pointsText;
  return `${pointsText} (${percentText})`;
};

export const hasSubmittedOrPendingItems = (items) => (
  (Array.isArray(items) ? items : []).some((item) => {
    const status = getGradeItemStatus(item);
    return status === 'submitted' || status === 'pending_grade';
  })
);

export const shouldShowNoGradedItemsYet = (gradeSummary) => {
  const pointsPossible = numberOrNull(gradeSummary?.totalPointsPossible ?? gradeSummary?.total_points_possible);
  if (pointsPossible !== 0) return false;
  return hasSubmittedOrPendingItems(gradeSummary?.items);
};
