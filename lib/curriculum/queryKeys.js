const toKeyPart = (value) => String(value ?? '').trim();

export const curriculumGradeQueryKeys = ({
  competitionId,
  studentId,
  teacherUsername,
  viewerUsername,
}) => {
  const competitionKey = toKeyPart(competitionId);
  const studentKey = toKeyPart(studentId);
  return {
    studentGradesSummaryKey: ['curriculum', 'competition', competitionKey, 'grades', studentKey, toKeyPart(viewerUsername)],
    teacherStudentDetailKey: ['curriculum', 'competition', competitionKey, 'instructor', 'students', studentKey, toKeyPart(teacherUsername)],
    teacherRosterKey: ['curriculum', 'competition', competitionKey, 'instructor', 'roster', toKeyPart(teacherUsername)],
  };
};

export const refetchCurriculumGradeQueries = async ({
  refetchStudentGradesSummary,
  refetchTeacherStudentDetail,
  refetchTeacherRoster,
}) => {
  await Promise.all([
    typeof refetchStudentGradesSummary === 'function' ? refetchStudentGradesSummary() : Promise.resolve(),
    typeof refetchTeacherStudentDetail === 'function' ? refetchTeacherStudentDetail() : Promise.resolve(),
    typeof refetchTeacherRoster === 'function' ? refetchTeacherRoster() : Promise.resolve(),
  ]);
};
