import { resolveGradeSummaryByModule, resolveGradeSummaryOverall } from './grades.js';

export const canShowManualGradeAction = (item) => item?.isManuallyGradable === true && Boolean(item?.submissionId);

export const applyGradeResponse = (payload) => ({
  gradeSummary: resolveGradeSummaryOverall(payload),
  gradeSummaryByModule: resolveGradeSummaryByModule(payload),
  items: Array.isArray(payload?.items) ? payload.items : [],
});

const numberOrNull = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const resolveSubmissionAnswers = (item) => {
  const submissionContent = item?.submissionContent || item?.submission || {};
  if (Array.isArray(submissionContent?.answers)) return submissionContent.answers;
  if (Array.isArray(submissionContent?.submission?.answers)) return submissionContent.submission.answers;
  return [];
};

export const getQuestionGradeRows = (item) => {
  const questionGrades = Array.isArray(item?.questionGrades) ? item.questionGrades : [];
  if (questionGrades.length > 0) {
    return questionGrades.map((grade, index) => ({
      questionId: String(grade?.questionId || `q-${index + 1}`),
      pointsAwarded: numberOrNull(grade?.pointsAwarded),
      pointsPossible: numberOrNull(grade?.pointsPossible) ?? 0,
      feedback: String(grade?.feedback || ''),
    }));
  }

  const answers = resolveSubmissionAnswers(item);
  if (answers.length > 0) {
    return answers.map((answer, index) => ({
      questionId: String(answer?.questionId || answer?.id || `q-${index + 1}`),
      pointsAwarded: null,
      pointsPossible: numberOrNull(answer?.pointsPossible ?? answer?.maxPoints) ?? 10,
      feedback: '',
    }));
  }

  const q1 = numberOrNull(item?.question1Score);
  const q2 = numberOrNull(item?.question2Score);
  if (q1 !== null || q2 !== null) {
    return [
      { questionId: 'q1', pointsAwarded: q1, pointsPossible: 10, feedback: '' },
      { questionId: 'q2', pointsAwarded: q2, pointsPossible: 10, feedback: '' },
    ];
  }

  return [];
};

export const validateQuestionGrades = (grades) => {
  if (!Array.isArray(grades) || grades.length === 0) return 'Add at least one question grade.';
  for (let index = 0; index < grades.length; index += 1) {
    const grade = grades[index] || {};
    const awarded = numberOrNull(grade?.pointsAwarded);
    const possible = numberOrNull(grade?.pointsPossible);
    if (awarded === null || possible === null) return `Question ${index + 1}: numeric scores are required.`;
    if (awarded < 0 || possible < 0) return `Question ${index + 1}: values must be non-negative.`;
    if (awarded > possible) return `Question ${index + 1}: awarded points cannot exceed possible points.`;
  }
  return '';
};

export const toQuestionGradePayload = ({ username, grades, finalFeedback, rubricNotes }) => ({
  username,
  grades: (Array.isArray(grades) ? grades : []).map((grade) => ({
    questionId: String(grade?.questionId || '').trim(),
    pointsAwarded: Number(grade?.pointsAwarded),
    pointsPossible: Number(grade?.pointsPossible),
    feedback: String(grade?.feedback || ''),
  })).filter((grade) => grade.questionId),
  finalFeedback: String(finalFeedback || ''),
  rubricNotes: String(rubricNotes || ''),
});
