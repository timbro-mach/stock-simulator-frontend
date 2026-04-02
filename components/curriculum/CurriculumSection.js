import React, { useMemo, useState } from 'react';
import { formatDisplayDate, getLetterGrade, normalizeCurriculumStatus } from '../../lib/curriculum/helpers';
import { buildAssignmentSubmissionPayload, normalizeAssignmentIdKey } from '../../lib/curriculum/submission';

const progressShell = {
  width: '100%',
  background: '#e2e8f0',
  height: 10,
  borderRadius: 999,
  overflow: 'hidden',
};

const progressFill = (value) => ({
  width: `${Math.max(0, Math.min(100, Number(value) || 0))}%`,
  background: '#0b63b6',
  height: '100%',
});

const detailShell = {
  border: '1px solid var(--border-color)',
  borderRadius: 8,
  padding: 10,
};

const lessonShell = {
  border: '1px solid #cbd5e1',
  background: '#f8fafc',
  borderRadius: 8,
  padding: 16,
  maxHeight: 420,
  overflowY: 'auto',
  whiteSpace: 'pre-wrap',
  lineHeight: 1.6,
};

const gradeGrid = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(165px, 1fr))',
  gap: 8,
};

const gradeTile = {
  border: '1px solid #cbd5e1',
  borderRadius: 8,
  padding: 8,
  background: '#f8fafc',
};

const getModuleId = (module) => module?.moduleId || module?.id || module?.week_number || module?.weekNumber;
const getAssignmentId = (assignment) => normalizeAssignmentIdKey(assignment?.assignmentId || assignment?.id);

const getAssignments = (module) => {
  if (Array.isArray(module?.assignments)) return module.assignments;
  if (Array.isArray(module?.items)) return module.items;
  return [];
};

const getQuestions = (content) => {
  if (Array.isArray(content?.questions)) return content.questions;
  return [];
};

const getQuestionPrompt = (question) => {
  if (typeof question === 'string') return question;
  return question?.prompt || question?.question || question?.text || 'Question';
};

const getQuestionId = (question, index) => question?.questionId || question?.id || `q-${index}`;

const getChoices = (question) => {
  if (Array.isArray(question?.choices)) return question.choices;
  if (Array.isArray(question?.options)) return question.options;
  return [];
};

const getChoiceLabel = (choice) => {
  if (typeof choice === 'string') return choice;
  return choice?.label || choice?.text || choice?.value || choice?.id || 'Choice';
};

const getChoiceValue = (choice, index) => {
  if (typeof choice === 'string') return choice;
  return choice?.value || choice?.id || choice?.label || `choice-${index}`;
};

const getCorrectChoice = (question) => (
  question?.correctChoice
  || question?.correct_choice
  || question?.correctAnswer
  || question?.correct_answer
  || question?.answer
  || ''
);

const getAssignmentType = (assignment) => String(assignment?.type || '').trim().toLowerCase();
const isWrittenAssignment = (assignment) => getAssignmentType(assignment) === 'assignment';
const isQuizAssignment = (assignment) => ['quiz', 'final_exam', 'final-exam', 'exam', 'test'].includes(getAssignmentType(assignment));
const isFinalExam = (assignment) => {
  const type = getAssignmentType(assignment);
  if (['final_exam', 'final-exam'].includes(type)) return true;
  return String(assignment?.title || '').toLowerCase().includes('final exam');
};

const getItemStatus = (assignment, submittedMap) => {
  const assignmentId = getAssignmentId(assignment);
  const rawStatus = String(assignment?.status || '').trim().toLowerCase();
  if (rawStatus) return normalizeCurriculumStatus(rawStatus);
  if (submittedMap?.[assignmentId]) return 'Submitted';
  return 'Not started';
};

const numberOrNull = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const pickNumber = (...candidates) => {
  for (const candidate of candidates) {
    const parsed = numberOrNull(candidate);
    if (parsed !== null) return parsed;
  }
  return null;
};

const getModuleGradeBreakdown = (module) => {
  const grade = module?.grade || module?.grading || module?.score_breakdown || module?.grades || {};
  const quiz = pickNumber(grade?.quiz_score, grade?.quiz_points, grade?.quiz, module?.quiz_score, module?.quiz_points);
  const writtenQ1 = pickNumber(
    grade?.written_q1_score,
    grade?.written_question_1,
    grade?.assignment_q1_score,
    grade?.question_1_score,
    module?.written_q1_score,
  );
  const writtenQ2 = pickNumber(
    grade?.written_q2_score,
    grade?.written_question_2,
    grade?.assignment_q2_score,
    grade?.question_2_score,
    module?.written_q2_score,
  );
  const writtenTotal = pickNumber(
    grade?.written_total,
    grade?.written_assignment_score,
    grade?.assignment_score,
    grade?.written,
    module?.written_total,
  );
  const trading = pickNumber(
    grade?.trade_participation_score,
    grade?.trading_participation_score,
    grade?.trade_points,
    grade?.participation_score,
    module?.trade_participation_score,
  );
  const moduleTotal = pickNumber(
    grade?.module_total,
    grade?.total,
    grade?.total_score,
    module?.module_total,
    module?.total_score,
  );
  const tradesCompletedRaw = grade?.trade_activity_completed ?? grade?.trades_completed ?? module?.trade_activity_completed ?? module?.trades_completed;
  const tradesCompleted = typeof tradesCompletedRaw === 'boolean'
    ? tradesCompletedRaw
    : (typeof tradesCompletedRaw === 'string'
      ? ['true', 'yes', '1', 'completed'].includes(tradesCompletedRaw.toLowerCase())
      : null);

  const resolvedWrittenTotal = writtenTotal ?? ((writtenQ1 ?? 0) + (writtenQ2 ?? 0));
  const resolvedModuleTotal = moduleTotal ?? ((quiz ?? 0) + (resolvedWrittenTotal ?? 0) + (trading ?? 0));

  return {
    quiz,
    writtenQ1,
    writtenQ2,
    trading,
    tradesCompleted,
    resolvedWrittenTotal,
    resolvedModuleTotal,
  };
};

const getSubmissionQuestionResponses = (submission) => {
  const answers = submission?.answers || submission?.submission?.answers || submission?.response?.answers || [];
  if (Array.isArray(answers)) {
    return answers.map((entry, idx) => ({
      key: entry?.questionId || entry?.id || `q-${idx}`,
      prompt: entry?.question || entry?.prompt || `Question ${idx + 1}`,
      response: entry?.response || entry?.answer || entry?.text || '',
    }));
  }
  if (answers && typeof answers === 'object') {
    return Object.entries(answers).map(([key, value], idx) => ({
      key,
      prompt: `Question ${idx + 1}`,
      response: typeof value === 'string' ? value : JSON.stringify(value),
    }));
  }
  return [];
};

export const CurriculumSummaryCard = ({ overview }) => {
  if (!overview?.curriculum_enabled) return null;

  return (
    <div className="card section">
      <h3>Investment Curriculum</h3>
      <p className="note">Enabled • {overview.curriculum_weeks} weeks</p>
      <p className="note">{formatDisplayDate(overview.curriculum_start_date)} → {formatDisplayDate(overview.curriculum_end_date)}</p>
      <p className="note">Generated modules: {overview.module_count ?? 0}</p>
    </div>
  );
};

const AssignmentCard = ({ assignment, moduleLocked, actionLoading, onSubmitItem, submittedMap, submissionState }) => {
  const [quizAnswers, setQuizAnswers] = useState({});
  const [writtenAnswers, setWrittenAnswers] = useState({});
  const [quizScore, setQuizScore] = useState(null);
  const assignmentType = getAssignmentType(assignment);
  const assignmentId = getAssignmentId(assignment);
  const questions = getQuestions(assignment?.content);
  const submitted = Boolean(submittedMap?.[assignmentId]) || String(assignment?.status || '').toLowerCase() === 'submitted';
  const [submitValidationError, setSubmitValidationError] = useState('');
  const currentSubmission = submissionState?.byAssignmentId?.[assignmentId] || null;

  const payload = useMemo(() => {
    return buildAssignmentSubmissionPayload({
      assignmentType,
      questions,
      quizAnswers,
      writtenAnswers,
    });
  }, [assignmentType, questions, quizAnswers, writtenAnswers]);

  const handleSubmit = () => {
    setSubmitValidationError('');
    if (isQuizAssignment(assignment)) {
      const unansweredQuestions = questions.filter((question, index) => {
        const questionId = getQuestionId(question, index);
        return !quizAnswers[questionId];
      });
      if (unansweredQuestions.length > 0) {
        setSubmitValidationError('Please answer every quiz question before submitting.');
        return;
      }
      const gradable = questions.filter((question) => getCorrectChoice(question));
      if (gradable.length > 0) {
        const correctCount = gradable.reduce((count, question, index) => {
          const questionId = getQuestionId(question, index);
          return quizAnswers[questionId] === getCorrectChoice(question) ? count + 1 : count;
        }, 0);
        const percent = Math.round((correctCount / gradable.length) * 100);
        setQuizScore({
          correctCount,
          total: gradable.length,
          percent,
        });
      }
    }
    onSubmitItem(assignment, payload);
  };

  return (
    <div style={detailShell}>
      <p className="note" style={{ margin: 0 }}>
        <strong>{assignment?.title || 'Untitled assignment'}</strong>
        {isFinalExam(assignment) ? ' • Final Exam' : ''}
        {' • '}{assignmentType || 'unknown'} • {assignment?.points ?? 0} pts • {getItemStatus(assignment, submittedMap)}
      </p>
      {submitted ? <p className="note" style={{ color: '#15803d', marginTop: 8, marginBottom: 0 }}>Submitted</p> : null}
      <p className="note" style={{ marginTop: 8, marginBottom: 4 }}><strong>Instructions</strong></p>
      <p className="note" style={{ marginTop: 0 }}>{assignment?.content?.instructions || 'No instructions provided.'}</p>

      <div style={{ display: 'grid', gap: 8 }}>
        {questions.map((question, questionIndex) => {
          const questionId = getQuestionId(question, questionIndex);
          const prompt = getQuestionPrompt(question);

          if (isWrittenAssignment(assignment)) {
            const parts = Array.isArray(question?.parts) ? question.parts : [];
            return (
              <div key={questionId}>
                <p className="note" style={{ marginBottom: 4 }}><strong>Prompt {questionIndex + 1}:</strong> {prompt}</p>
                {parts.length > 0 ? (
                  <div style={{ display: 'grid', gap: 6 }}>
                    {parts.map((part, partIndex) => {
                      const partId = part?.partId || part?.id || `part-${partIndex}`;
                      const partKey = `${questionId}-part-${partId}`;
                      const partPrompt = part?.prompt || part?.question || part?.text || `Part ${String.fromCharCode(97 + partIndex)}`;
                      return (
                        <div key={partKey}>
                          <p className="note" style={{ marginBottom: 4 }}><strong>{String.fromCharCode(97 + partIndex)}.</strong> {partPrompt}</p>
                          <textarea
                            rows={3}
                            value={writtenAnswers[partKey] || ''}
                            onChange={(event) => setWrittenAnswers((previous) => ({ ...previous, [partKey]: event.target.value }))}
                            style={{ width: '100%' }}
                            disabled={moduleLocked || actionLoading}
                            placeholder="Write your response here..."
                          />
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <textarea
                    rows={4}
                    value={writtenAnswers[questionId] || ''}
                    onChange={(event) => setWrittenAnswers((previous) => ({ ...previous, [questionId]: event.target.value }))}
                    style={{ width: '100%' }}
                    disabled={moduleLocked || actionLoading}
                    placeholder="Write your response here..."
                  />
                )}
              </div>
            );
          }

          const choices = getChoices(question);
          return (
            <div key={questionId}>
              <p className="note" style={{ marginBottom: 4 }}><strong>Question {questionIndex + 1}:</strong> {prompt}</p>
              <div style={{ display: 'grid', gap: 4 }}>
                {choices.map((choice, choiceIndex) => {
                  const choiceValue = getChoiceValue(choice, choiceIndex);
                  const choiceLabel = getChoiceLabel(choice);
                  return (
                    <label key={`${questionId}-${choiceValue}`} className="note" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <input
                        type="radio"
                        name={`${assignmentId}-${questionId}`}
                        value={choiceValue}
                        checked={quizAnswers[questionId] === choiceValue}
                        onChange={() => setQuizAnswers((previous) => ({ ...previous, [questionId]: choiceValue }))}
                        disabled={moduleLocked || actionLoading}
                        style={{ width: 16, height: 16, margin: 0 }}
                      />
                      <span>{choiceLabel}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {quizScore ? (
        <p className="note" style={{ marginTop: 10, marginBottom: 0, color: '#1d4ed8' }}>
          Score: {quizScore.correctCount}/{quizScore.total} ({quizScore.percent}%)
        </p>
      ) : null}
      {currentSubmission?.result?.score !== null && currentSubmission?.result?.score !== undefined ? (
        <p className="note" style={{ marginTop: 8, marginBottom: 0, color: '#1d4ed8' }}>
          Server graded score: {currentSubmission.result.score}
          {currentSubmission?.result?.percentage !== null && currentSubmission?.result?.percentage !== undefined
            ? ` (${Number(currentSubmission.result.percentage).toFixed(1)}%)`
            : ''}
          {currentSubmission?.result?.status ? ` • ${currentSubmission.result.status}` : ''}
        </p>
      ) : null}
      {submitValidationError ? <p className="note" style={{ marginTop: 8, marginBottom: 0, color: '#b91c1c' }}>{submitValidationError}</p> : null}
      {currentSubmission?.status === 'error' ? (
        <p className="note" style={{ marginTop: 8, marginBottom: 0, color: '#b91c1c' }}>{currentSubmission?.message || 'Unable to submit assignment.'}</p>
      ) : null}
      {currentSubmission?.status === 'success' ? (
        <p className="note" style={{ marginTop: 8, marginBottom: 0, color: '#15803d' }}>{currentSubmission?.message || 'Submission saved.'}</p>
      ) : null}

      <div style={{ marginTop: 10 }}>
        <button
          onClick={handleSubmit}
          disabled={moduleLocked || actionLoading || !assignmentId || currentSubmission?.status === 'loading'}
        >
          {currentSubmission?.status === 'loading' ? 'Submitting…' : 'Submit'}
        </button>
      </div>
    </div>
  );
};

export const StudentCurriculumPanel = ({ overview, modules, gradeSummary, gradesMessage, loading, error, onSubmitItem, actionLoading, submissionState }) => {
  if (!overview?.curriculum_enabled) return null;
  const percentage = Number(gradeSummary?.percentage ?? overview?.grade_percentage ?? 0);
  const letter = gradeSummary?.letter_grade || getLetterGrade(percentage);
  const [expandedModuleId, setExpandedModuleId] = useState(null);

  return (
    <div className="card section">
      <h3>Curriculum</h3>
      {loading ? <p className="note">Loading curriculum...</p> : null}
      {error ? <p className="note" style={{ color: '#b91c1c' }}>{error}</p> : null}
      {gradesMessage ? <p className="note" style={{ color: '#b45309' }}>{gradesMessage}</p> : null}
      {submissionState?.latestMessage ? (
        <p className="note" style={{ color: '#1d4ed8' }}>{submissionState.latestMessage}</p>
      ) : null}
      {submissionState?.lastSubmissionResult?.score !== null && submissionState?.lastSubmissionResult?.score !== undefined ? (
        <p className="note" style={{ marginTop: 0, color: '#1d4ed8' }}>
          Latest graded result: {submissionState.lastSubmissionResult.score}
          {submissionState?.lastSubmissionResult?.percentage !== null && submissionState?.lastSubmissionResult?.percentage !== undefined
            ? ` (${Number(submissionState.lastSubmissionResult.percentage).toFixed(1)}%)`
            : ''}
          {submissionState?.lastSubmissionResult?.status ? ` • ${submissionState.lastSubmissionResult.status}` : ''}
        </p>
      ) : null}

      {!loading && (
        <>
          <p className="note">Progress: {Math.round(Number(overview?.progress_percent ?? 0))}%</p>
          <div style={progressShell}><div style={progressFill(overview?.progress_percent)} /></div>
          <p className="note" style={{ marginTop: 8 }}>
            Grade: <strong>{percentage.toFixed(1)}%</strong> ({letter})
          </p>
          <div style={{ ...detailShell, marginBottom: 8 }}>
            <p className="note" style={{ marginTop: 0, marginBottom: 6 }}><strong>Overall Curriculum Grade Progress</strong></p>
            <p className="note" style={{ margin: 0 }}>
              Points earned: {gradeSummary?.total_points_earned ?? 0}/{gradeSummary?.total_points_possible ?? 0}
              {' • '}Completed: {gradeSummary?.completed_items ?? 0}/{gradeSummary?.total_items ?? 0}
            </p>
          </div>
          <p className="note">
            Summary: {overview?.curriculum_weeks ?? overview?.totalWeeks ?? '-'} weeks • {formatDisplayDate(overview?.curriculum_start_date ?? overview?.startDate)} → {formatDisplayDate(overview?.curriculum_end_date ?? overview?.endDate)} • {overview?.module_count ?? overview?.moduleCount ?? 0} modules • {overview?.assignment_count ?? overview?.assignmentCount ?? 0} assignments
          </p>

          <div className="section" style={{ display: 'grid', gap: 12 }}>
            {Array.isArray(modules) && modules.length > 0 ? modules.map((module) => {
              const moduleId = getModuleId(module);
              const assignments = getAssignments(module);
              const isExpanded = expandedModuleId === moduleId;
              const moduleTitle = module?.title || 'Untitled module';
              const weekNumber = module?.weekNumber ?? module?.week_number;
              const moduleDescription = module?.description || 'No description provided.';
              const unlockDate = module?.unlockDate ?? module?.unlock_date;
              const dueDate = module?.dueDate ?? module?.due_date;
              const lessonContent = module?.lesson_content
                || module?.lessonContent
                || module?.eText
                || module?.etext
                || module?.lesson_text
                || module?.lessonText
                || module?.content?.lesson_content
                || module?.content?.lessonContent
                || module?.content?.eText
                || module?.content?.etext
                || module?.content?.lesson_text
                || module?.content?.lessonText;
              const moduleGrades = getModuleGradeBreakdown(module);

              return (
                <div key={moduleId} style={{ border: '1px solid var(--border-color)', borderRadius: 10, padding: 12 }}>
                  <button
                    style={{ width: '100%', textAlign: 'left', background: 'transparent', border: 0, padding: 0, cursor: 'pointer' }}
                    onClick={() => setExpandedModuleId(isExpanded ? null : moduleId)}
                  >
                    <p className="em" style={{ marginBottom: 6 }}>Week {weekNumber}: {moduleTitle}</p>
                    <p className="note">{moduleDescription}</p>
                    <p className="note">Unlocks: {formatDisplayDate(unlockDate)} • Due: {formatDisplayDate(dueDate)}</p>
                    <p className="note" style={{ marginBottom: 0 }}>Status: {module?.locked ? 'Locked' : 'Unlocked'} • {assignments.length} assignments • {isExpanded ? 'Click to collapse' : 'Click to open module'}</p>
                  </button>
                  <div style={{ ...gradeGrid, marginTop: 10 }}>
                    <div style={gradeTile}><p className="note" style={{ margin: 0 }}><strong>Quiz (20)</strong><br />{moduleGrades.quiz ?? '—'}/20</p></div>
                    <div style={gradeTile}><p className="note" style={{ margin: 0 }}><strong>Written (20)</strong><br />{moduleGrades.resolvedWrittenTotal ?? '—'}/20 (Q1: {moduleGrades.writtenQ1 ?? '—'}/10, Q2: {moduleGrades.writtenQ2 ?? '—'}/10)</p></div>
                    <div style={gradeTile}><p className="note" style={{ margin: 0 }}><strong>Trading (10)</strong><br />{moduleGrades.trading ?? '—'}/10 • {moduleGrades.tradesCompleted === null ? 'Activity: Unknown' : `Activity: ${moduleGrades.tradesCompleted ? 'Yes' : 'No'}`}</p></div>
                    <div style={gradeTile}><p className="note" style={{ margin: 0 }}><strong>Module Total (50)</strong><br />{moduleGrades.resolvedModuleTotal ?? '—'}/50</p></div>
                  </div>

                  {isExpanded ? (
                    <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
                      <div style={detailShell}>
                        <p className="note" style={{ marginTop: 0, marginBottom: 6 }}><strong>Lesson (eText)</strong></p>
                        <div style={lessonShell}>
                          {lessonContent || 'Lesson content has not been published yet.'}
                        </div>
                      </div>
                      {assignments.length > 0 ? assignments.map((assignment) => (
                        <AssignmentCard
                          key={getAssignmentId(assignment) || assignment?.title}
                          assignment={assignment}
                          moduleLocked={module?.locked}
                          actionLoading={actionLoading}
                          onSubmitItem={onSubmitItem}
                          submittedMap={submissionState?.submittedByAssignmentId}
                          submissionState={submissionState}
                        />
                      )) : <p className="note">No assignments in this module yet.</p>}
                    </div>
                  ) : null}
                </div>
              );
            }) : <p className="note">Curriculum modules are still generating.</p>}
          </div>
        </>
      )}
    </div>
  );
};

export const GradeSummaryCard = ({ gradeSummary }) => {
  if (!gradeSummary) return null;
  const percentage = Number(gradeSummary.percentage || 0);

  return (
    <div className="card section">
      <h3>Grade Summary</h3>
      <p className="note">Points: {gradeSummary.total_points_earned ?? 0} / {gradeSummary.total_points_possible ?? 0}</p>
      <p className="note">Percentage: {percentage.toFixed(1)}%</p>
      <p className="note">Letter Grade: {gradeSummary.letter_grade || getLetterGrade(percentage)}</p>
      <p className="note">Completed {gradeSummary.completed_items ?? 0} of {gradeSummary.total_items ?? 0} items</p>
      <div className="section" style={{ display: 'grid', gap: 8 }}>
        {(gradeSummary.items || []).map((item) => (
          <div key={item.id || item.title} style={{ border: '1px solid var(--border-color)', borderRadius: 8, padding: 8 }}>
            <p className="note" style={{ margin: 0 }}>
              {item.title}: {item.points_earned ?? 0}/{item.points_possible ?? 0} ({normalizeCurriculumStatus(item.status)})
            </p>
          </div>
        ))}
      </div>
    </div>
  );
};

export const InstructorCurriculumPanel = ({ overview, instructorSummary, submissions, actionLoading, onRefresh, onGradeSubmission, onOverrideScore, instructorMessage }) => {
  if (!overview?.curriculum_enabled) return null;

  const [expandedSubmissionId, setExpandedSubmissionId] = useState(null);
  const [manualScoreBySubmission, setManualScoreBySubmission] = useState({});
  const [question1BySubmission, setQuestion1BySubmission] = useState({});
  const [question2BySubmission, setQuestion2BySubmission] = useState({});
  const [commentsBySubmission, setCommentsBySubmission] = useState({});
  const [overrideByStudent, setOverrideByStudent] = useState({});

  const students = instructorSummary?.students || instructorSummary?.student_grades || [];

  return (
    <div className="card section">
      <h3>Instructor / Organizer Curriculum Gradebook</h3>
      <p className="note">Average Grade: {Number(instructorSummary?.average_grade ?? 0).toFixed(1)}%</p>
      <p className="note">Student completion: {instructorSummary?.student_completion_summary || 'No submissions yet.'}</p>
      {instructorMessage ? <p className="note" style={{ color: '#b45309' }}>{instructorMessage}</p> : null}
      <button onClick={onRefresh} disabled={actionLoading}>Refresh instructor data</button>

      <div className="section" style={{ display: 'grid', gap: 8 }}>
        <p className="em" style={{ margin: 0 }}>Overall Class Progress</p>
        {(instructorSummary?.modules || []).map((module) => (
          <div key={module.id || module.week_number} style={{ border: '1px solid var(--border-color)', borderRadius: 8, padding: 8 }}>
            <p className="note" style={{ margin: 0 }}>
              Week {module.week_number}: {module.title} • {module.completed_submissions ?? 0} submissions complete
            </p>
          </div>
        ))}
      </div>

      <div className="section" style={{ display: 'grid', gap: 8 }}>
        <p className="em" style={{ margin: 0 }}>Student Grades</p>
        {students.length > 0 ? students.map((student) => {
          const studentId = student?.user_id || student?.username || student?.id;
          const modules = student?.modules || student?.module_grades || [];
          return (
            <div key={studentId} style={detailShell}>
              <p className="note" style={{ margin: 0 }}>
                <strong>{student?.name || student?.username || studentId}</strong> • {Number(student?.grade_percentage ?? student?.percentage ?? 0).toFixed(1)}% • {normalizeCurriculumStatus(student?.status)}
              </p>
              {modules.length > 0 ? (
                <div style={{ marginTop: 8, display: 'grid', gap: 6 }}>
                  {modules.map((module) => {
                    const moduleId = module?.module_id || module?.id || module?.week_number;
                    const moduleGrades = getModuleGradeBreakdown(module);
                    return (
                      <div key={`${studentId}-${moduleId}`} style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 8 }}>
                        <p className="note" style={{ margin: 0 }}>
                          <strong>Week {module?.week_number ?? module?.weekNumber ?? '-'}</strong> • Quiz: {moduleGrades.quiz ?? '—'}/20 • Written: {moduleGrades.resolvedWrittenTotal ?? '—'}/20 • Trade: {moduleGrades.trading ?? '—'}/10 • Total: {moduleGrades.resolvedModuleTotal ?? '—'}/50
                        </p>
                        <p className="note" style={{ margin: 0 }}>
                          Trade activity completed: {moduleGrades.tradesCompleted === null ? 'Unknown' : (moduleGrades.tradesCompleted ? 'Yes' : 'No')} • Trade points: {moduleGrades.trading ?? '—'}/10
                        </p>
                      </div>
                    );
                  })}
                </div>
              ) : null}
              <div style={{ marginTop: 8, display: 'flex', gap: 6, alignItems: 'center' }}>
                <input
                  type="number"
                  placeholder="Override %"
                  value={overrideByStudent[studentId] || ''}
                  onChange={(event) => setOverrideByStudent((prev) => ({ ...prev, [studentId]: event.target.value }))}
                  style={{ width: 120 }}
                  disabled={actionLoading}
                />
                <button
                  disabled={actionLoading}
                  onClick={() => onOverrideScore({ studentId, score: overrideByStudent[studentId] })}
                >
                  Override score
                </button>
              </div>
            </div>
          );
        }) : <p className="note">No student grade rows available yet.</p>}
      </div>

      <div className="section" style={{ display: 'grid', gap: 8 }}>
        <p className="em" style={{ margin: 0 }}>Student Submissions</p>
        {(submissions || []).map((submission) => {
          const submissionId = submission?.id || submission?.submission_id;
          const isExpanded = expandedSubmissionId === submissionId;
          return (
            <div key={submissionId} style={detailShell}>
              <button
                style={{ width: '100%', textAlign: 'left', background: 'transparent', border: 0, padding: 0, cursor: 'pointer' }}
                onClick={() => setExpandedSubmissionId(isExpanded ? null : submissionId)}
              >
                <p className="note" style={{ margin: 0 }}>
                  <strong>{submission?.student_name || submission?.username || submission?.student_id || 'Student'}</strong> • {submission?.assignment_title || submission?.assignment_id || 'Assignment'} • {normalizeCurriculumStatus(submission?.status)}
                </p>
              </button>
              {isExpanded ? (
                <div style={{ marginTop: 8, display: 'grid', gap: 8 }}>
                  {getSubmissionQuestionResponses(submission).slice(0, 2).map((response, index) => (
                    <div key={`${submissionId}-${response.key}`} style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 8, background: '#f8fafc' }}>
                      <p className="note" style={{ margin: 0 }}><strong>Question {index + 1}</strong></p>
                      <p className="note" style={{ marginTop: 4, marginBottom: 4 }}>{response.prompt}</p>
                      <p className="note" style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{response.response || 'No response submitted.'}</p>
                    </div>
                  ))}
                  <pre style={{ margin: 0, whiteSpace: 'pre-wrap', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 8 }}>
                    {JSON.stringify(submission?.answers || submission?.submission || submission, null, 2)}
                  </pre>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 6, alignItems: 'center' }}>
                    <input
                      type="number"
                      min="0"
                      max="10"
                      placeholder="Q1 score /10"
                      value={question1BySubmission[submissionId] || ''}
                      onChange={(event) => setQuestion1BySubmission((prev) => ({ ...prev, [submissionId]: event.target.value }))}
                      disabled={actionLoading}
                    />
                    <input
                      type="number"
                      min="0"
                      max="10"
                      placeholder="Q2 score /10"
                      value={question2BySubmission[submissionId] || ''}
                      onChange={(event) => setQuestion2BySubmission((prev) => ({ ...prev, [submissionId]: event.target.value }))}
                      disabled={actionLoading}
                    />
                    <input
                      type="number"
                      min="0"
                      max="20"
                      placeholder="Assignment total /20"
                      value={manualScoreBySubmission[submissionId] || ''}
                      onChange={(event) => setManualScoreBySubmission((prev) => ({ ...prev, [submissionId]: event.target.value }))}
                      disabled={actionLoading}
                    />
                  </div>
                  <textarea
                    rows={2}
                    placeholder="Optional feedback/comments"
                    value={commentsBySubmission[submissionId] || ''}
                    onChange={(event) => setCommentsBySubmission((prev) => ({ ...prev, [submissionId]: event.target.value }))}
                    disabled={actionLoading}
                    style={{ width: '100%' }}
                  />
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <button
                      disabled={actionLoading}
                      onClick={() => onGradeSubmission({
                        submission,
                        score: manualScoreBySubmission[submissionId],
                        question1Score: question1BySubmission[submissionId],
                        question2Score: question2BySubmission[submissionId],
                        comments: commentsBySubmission[submissionId],
                      })}
                    >
                      Grade submission
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
        {(!submissions || submissions.length === 0) ? <p className="note">No submission records available yet.</p> : null}
      </div>
    </div>
  );
};
