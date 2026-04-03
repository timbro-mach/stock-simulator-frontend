import { resolveGradeSummaryByModule, resolveGradeSummaryOverall } from './grades.js';

export const canShowManualGradeAction = (item) => item?.isManuallyGradable === true && Boolean(item?.submissionId);

export const applyGradeResponse = (payload) => ({
  gradeSummary: resolveGradeSummaryOverall(payload),
  gradeSummaryByModule: resolveGradeSummaryByModule(payload),
  items: Array.isArray(payload?.items) ? payload.items : [],
});
