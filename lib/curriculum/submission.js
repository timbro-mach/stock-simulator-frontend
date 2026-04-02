const normalizeBooleanFlag = (value) => {
  if (value === true || value === false) return value;
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') {
    if (value === 1) return true;
    if (value === 0) return false;
    return null;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'y'].includes(normalized)) return true;
    if (['false', '0', 'no', 'n'].includes(normalized)) return false;
  }
  return null;
};

export const normalizeAssignmentIdKey = (assignmentId) => String(assignmentId || '').trim();

export const canManageCurriculumGradesForCompetition = ({ isAdmin, username, competitionRecord }) => {
  if (isAdmin) return true;

  const instructorFlag = normalizeBooleanFlag(
    competitionRecord?.is_instructor_for_competition ?? competitionRecord?.isInstructorForCompetition,
  );
  if (instructorFlag !== null) return instructorFlag;

  const possibleOwner = [
    competitionRecord?.organizer_username,
    competitionRecord?.organizer,
    competitionRecord?.owner_username,
    competitionRecord?.owner,
    competitionRecord?.created_by,
    competitionRecord?.creator_username,
    competitionRecord?.instructor_username,
    competitionRecord?.instructor,
  ]
    .map((value) => String(value || '').trim().toLowerCase())
    .filter(Boolean);

  if (!username) return false;
  return possibleOwner.includes(String(username).trim().toLowerCase());
};

export const buildAssignmentSubmissionPayload = ({ assignmentType, questions, quizAnswers, writtenAnswers }) => {
  const normalizedQuestions = Array.isArray(questions) ? questions : [];

  if (assignmentType === 'assignment') {
    return {
      answers: normalizedQuestions.map((question, index) => {
        const questionId = question?.questionId || question?.id || `q-${index}`;
        const parts = Array.isArray(question?.parts) ? question.parts : [];
        if (parts.length === 0) {
          return {
            questionId,
            response: writtenAnswers?.[questionId] || '',
          };
        }

        const multipartResponses = parts.map((part, partIndex) => {
          const partId = part?.partId || part?.id || `part-${partIndex}`;
          const partKey = `${questionId}-part-${partId}`;
          return {
            partId,
            response: writtenAnswers?.[partKey] || '',
          };
        });

        return {
          questionId,
          parts: multipartResponses,
        };
      }),
    };
  }

  return {
    answers: normalizedQuestions.map((question, index) => {
      const questionId = question?.questionId || question?.id || `q-${index}`;
      return {
        questionId,
        selectedChoice: quizAnswers?.[questionId] || '',
      };
    }),
  };
};
