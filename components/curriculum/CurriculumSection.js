import React, { useMemo, useState } from 'react';
import { formatDisplayDate, getLetterGrade, normalizeCurriculumStatus } from '../../lib/curriculum/helpers';

const ENABLE_CURRICULUM_DEBUG = true;

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
  padding: 12,
  maxHeight: 280,
  overflowY: 'auto',
  whiteSpace: 'pre-wrap',
};

const getModuleId = (module) => module?.moduleId || module?.id || module?.week_number || module?.weekNumber;
const getAssignmentId = (assignment) => assignment?.assignmentId || assignment?.id;

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

const AssignmentCard = ({ assignment, moduleLocked, actionLoading, onSubmitItem, submittedMap }) => {
  const [quizAnswers, setQuizAnswers] = useState({});
  const [writtenAnswers, setWrittenAnswers] = useState({});
  const [quizScore, setQuizScore] = useState(null);
  const assignmentType = getAssignmentType(assignment);
  const assignmentId = getAssignmentId(assignment);
  const questions = getQuestions(assignment?.content);
  const submitted = Boolean(submittedMap?.[assignmentId]) || String(assignment?.status || '').toLowerCase() === 'submitted';

  const payload = useMemo(() => {
    if (isWrittenAssignment(assignment)) {
      return {
        answers: questions.map((question, index) => ({
          questionId: getQuestionId(question, index),
          response: writtenAnswers[getQuestionId(question, index)] || '',
        })),
      };
    }

    return {
      answers: questions.map((question, index) => ({
        questionId: getQuestionId(question, index),
        selectedChoice: quizAnswers[getQuestionId(question, index)] || '',
      })),
    };
  }, [assignment, questions, quizAnswers, writtenAnswers]);

  const handleSubmit = () => {
    if (isQuizAssignment(assignment)) {
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
                      const partKey = `${questionId}-part-${part?.id || partIndex}`;
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

      <div style={{ marginTop: 10 }}>
        <button
          onClick={handleSubmit}
          disabled={moduleLocked || actionLoading || !assignmentId}
        >
          Submit
        </button>
      </div>
    </div>
  );
};

export const StudentCurriculumPanel = ({ overview, modules, gradeSummary, gradesMessage, loading, error, debugState, onSubmitItem, actionLoading, submissionState }) => {
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
      <CurriculumDebugPanel debugState={debugState} />

      {!loading && (
        <>
          <p className="note">Progress: {Math.round(Number(overview?.progress_percent ?? 0))}%</p>
          <div style={progressShell}><div style={progressFill(overview?.progress_percent)} /></div>
          <p className="note" style={{ marginTop: 8 }}>
            Grade: <strong>{percentage.toFixed(1)}%</strong> ({letter})
          </p>
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
              const lessonContent = module?.lesson_content || module?.lessonContent || module?.content?.lesson_content || module?.content?.lessonContent;

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
  const [overrideByStudent, setOverrideByStudent] = useState({});

  const students = instructorSummary?.students || instructorSummary?.student_grades || [];

  return (
    <div className="card section">
      <h3>Instructor Curriculum View</h3>
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
          return (
            <div key={studentId} style={detailShell}>
              <p className="note" style={{ margin: 0 }}>
                <strong>{student?.name || student?.username || studentId}</strong> • {Number(student?.grade_percentage ?? student?.percentage ?? 0).toFixed(1)}% • {normalizeCurriculumStatus(student?.status)}
              </p>
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
                  <pre style={{ margin: 0, whiteSpace: 'pre-wrap', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 8 }}>
                    {JSON.stringify(submission?.answers || submission?.submission || submission, null, 2)}
                  </pre>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <input
                      type="number"
                      placeholder="Score"
                      value={manualScoreBySubmission[submissionId] || ''}
                      onChange={(event) => setManualScoreBySubmission((prev) => ({ ...prev, [submissionId]: event.target.value }))}
                      style={{ width: 120 }}
                      disabled={actionLoading}
                    />
                    <button
                      disabled={actionLoading}
                      onClick={() => onGradeSubmission({ submission, score: manualScoreBySubmission[submissionId] })}
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

export const CurriculumDebugPanel = ({ debugState }) => {
  if (!ENABLE_CURRICULUM_DEBUG) return null;
  if (!debugState?.hasError) return null;

  const competitionFields = debugState?.competitionContext?.fields || {};
  const hydrationInfo = debugState?.hydrationInfo || {};
  const requestInfo = debugState?.requestInfo || {};
  const requestStatus = requestInfo?.requestStatus || {};
  const formatStatus = (entry) => {
    if (!entry?.attempted) return 'not attempted';
    return entry?.ok ? `ok (${entry?.status ?? 'n/a'})` : `failed (${entry?.status ?? 'n/a'})`;
  };

  return (
    <div
      style={{
        border: '1px solid #f59e0b',
        background: '#fffbeb',
        borderRadius: 8,
        padding: 10,
        marginTop: 10,
        fontSize: 12,
      }}
    >
      <p className="em" style={{ margin: 0, marginBottom: 6 }}>Curriculum Debug</p>
      <p className="note" style={{ margin: 0 }}><strong>Render reason:</strong> {debugState?.renderReason || 'unknown'}</p>
      <p className="note" style={{ margin: 0 }}><strong>Competition id:</strong> {debugState?.competitionContext?.id || '(none)'}</p>
      <p className="note" style={{ margin: 0 }}><strong>Competition name:</strong> {debugState?.competitionContext?.name || '(none)'}</p>
      <p className="note" style={{ margin: 0 }}><strong>Hydration attempted:</strong> {String(Boolean(hydrationInfo?.attempted))}</p>
      <p className="note" style={{ margin: 0 }}><strong>Id resolved from code:</strong> {String(Boolean(hydrationInfo?.resolvedFromCode))}</p>
      <p className="note" style={{ margin: 0 }}><strong>Id source:</strong> {hydrationInfo?.idSource || '(unknown)'}</p>
      <p className="note" style={{ margin: 0 }}><strong>Hydration source:</strong> {hydrationInfo?.source || '(none)'}</p>
      <p className="note" style={{ margin: 0 }}><strong>Extracted id:</strong> {hydrationInfo?.extractedId || '(none)'}</p>
      <p className="note" style={{ margin: 0 }}><strong>Extracted id key:</strong> {hydrationInfo?.extractedIdKey || '(none)'}</p>
      <p className="note" style={{ margin: 0 }}><strong>Selected competition updated:</strong> {String(Boolean(hydrationInfo?.selectedCompetitionUpdated))}</p>
      <p className="note" style={{ margin: 0 }}><strong>Curriculum enabled (frontend):</strong> {String(Boolean(debugState?.competitionContext?.curriculumEnabled))}</p>
      <p className="note" style={{ margin: 0 }}><strong>Parsed enabled value:</strong> {String(Boolean(debugState?.competitionContext?.parsedEnabledValue))}</p>
      <p className="note" style={{ margin: 0 }}><strong>Enabled source key:</strong> {debugState?.competitionContext?.parsedEnabledSourceKey || '(none)'}</p>
      <p className="note" style={{ margin: 0 }}><strong>Endpoint URL:</strong> {requestInfo?.endpointUrl || '(not set)'}</p>
      <p className="note" style={{ margin: 0 }}><strong>Request made:</strong> {String(Boolean(requestInfo?.requestMade))}</p>
      <p className="note" style={{ margin: 0 }}><strong>HTTP status:</strong> {requestInfo?.httpStatus ?? '(n/a)'}</p>
      <p className="note" style={{ margin: 0 }}><strong>Backend message:</strong> {requestInfo?.responseMessage || '(n/a)'}</p>
      <p className="note" style={{ margin: 0 }}><strong>Overview status:</strong> {formatStatus(requestStatus?.overview)} {requestStatus?.overview?.message ? `• ${requestStatus?.overview?.message}` : ''}</p>
      <p className="note" style={{ margin: 0 }}><strong>Modules status:</strong> {formatStatus(requestStatus?.modules)} {requestStatus?.modules?.message ? `• ${requestStatus?.modules?.message}` : ''}</p>
      <p className="note" style={{ margin: 0 }}><strong>Grades status:</strong> {formatStatus(requestStatus?.grades)} {requestStatus?.grades?.message ? `• ${requestStatus?.grades?.message}` : ''}</p>
      <p className="note" style={{ margin: 0 }}><strong>Overview response body:</strong></p>
      <pre style={{ margin: '4px 0 0 0', whiteSpace: 'pre-wrap' }}>
        {JSON.stringify(requestInfo?.rawOverviewBody ?? null, null, 2)}
      </pre>
      <p className="note" style={{ margin: 0 }}><strong>By-code response body:</strong></p>
      <pre style={{ margin: '4px 0 0 0', whiteSpace: 'pre-wrap' }}>
        {JSON.stringify(hydrationInfo?.rawResponseBody ?? null, null, 2)}
      </pre>
      <p className="note" style={{ margin: 0 }}><strong>Curriculum fields:</strong></p>
      <pre style={{ margin: '4px 0 0 0', whiteSpace: 'pre-wrap' }}>
        {JSON.stringify(competitionFields, null, 2)}
      </pre>
    </div>
  );
};
