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
  const assignmentType = String(assignment?.type || '').toLowerCase();
  const assignmentId = getAssignmentId(assignment);
  const questions = getQuestions(assignment?.content);
  const submitted = Boolean(submittedMap?.[assignmentId]) || String(assignment?.status || '').toLowerCase() === 'submitted';

  const payload = useMemo(() => {
    if (assignmentType === 'assignment') {
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
  }, [assignmentType, questions, quizAnswers, writtenAnswers]);

  return (
    <div style={{ border: '1px solid var(--border-color)', borderRadius: 8, padding: 10 }}>
      <p className="note" style={{ margin: 0 }}>
        <strong>{assignment?.title || 'Untitled assignment'}</strong> • {assignmentType || 'unknown'} • {assignment?.points ?? 0} pts • {normalizeCurriculumStatus(assignment?.status)}
      </p>
      {submitted ? <p className="note" style={{ color: '#15803d', marginTop: 8, marginBottom: 0 }}>Submitted</p> : null}
      <p className="note" style={{ marginTop: 8, marginBottom: 4 }}><strong>Instructions</strong></p>
      <p className="note" style={{ marginTop: 0 }}>{assignment?.content?.instructions || 'No instructions provided.'}</p>

      <div style={{ display: 'grid', gap: 8 }}>
        {questions.map((question, questionIndex) => {
          const questionId = getQuestionId(question, questionIndex);
          const prompt = getQuestionPrompt(question);

          if (assignmentType === 'assignment') {
            return (
              <div key={questionId}>
                <p className="note" style={{ marginBottom: 4 }}><strong>Prompt {questionIndex + 1}:</strong> {prompt}</p>
                <textarea
                  rows={4}
                  value={writtenAnswers[questionId] || ''}
                  onChange={(event) => setWrittenAnswers((previous) => ({ ...previous, [questionId]: event.target.value }))}
                  style={{ width: '100%' }}
                  disabled={moduleLocked || actionLoading}
                  placeholder="Write your response here..."
                />
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

      <div style={{ marginTop: 10 }}>
        <button
          onClick={() => onSubmitItem(assignment, payload)}
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

export const InstructorCurriculumPanel = ({ overview, instructorSummary }) => {
  if (!overview?.curriculum_enabled) return null;

  return (
    <div className="card section">
      <h3>Instructor Curriculum View</h3>
      <p className="note">Average Grade: {Number(instructorSummary?.average_grade ?? 0).toFixed(1)}%</p>
      <p className="note">Student completion: {instructorSummary?.student_completion_summary || 'No submissions yet.'}</p>
      <div className="section" style={{ display: 'grid', gap: 8 }}>
        {(instructorSummary?.modules || []).map((module) => (
          <div key={module.id || module.week_number} style={{ border: '1px solid var(--border-color)', borderRadius: 8, padding: 8 }}>
            <p className="note" style={{ margin: 0 }}>
              Week {module.week_number}: {module.title} • {module.completed_submissions ?? 0} submissions complete
            </p>
          </div>
        ))}
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
