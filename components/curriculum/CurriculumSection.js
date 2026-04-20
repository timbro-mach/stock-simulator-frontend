import React, { useEffect, useMemo, useRef, useState } from 'react';
import { formatDisplayDate, normalizeCurriculumStatus } from '../../lib/curriculum/helpers';
import { buildAssignmentSubmissionPayload, normalizeAssignmentIdKey } from '../../lib/curriculum/submission';
import { asLetter, asPercent, asPoints, getStatusBadgeStyles, normalizeGradingStatus } from '../../lib/teacherDashboard';
import { getGradeItemDisplayText, getGradeItemStatus, shouldShowNoGradedItemsYet } from '../../lib/curriculum/statusDisplay';
import { resolveProgressPercentage } from '../../lib/curriculum/grades';
import { buildModuleLockMessage, getModuleLockState } from '../../lib/curriculum/moduleLock';
import {
  buildAssignmentPayloadContent,
  buildInitialAssignmentDraft,
  nextQuestionId,
  nextSectionId,
  validateAssignmentDraft,
} from '../../lib/curriculum/assignmentPrompts';
import LessonContentRenderer from './LessonContentRenderer';

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
const getModuleSummaryId = (moduleSummary) => moduleSummary?.moduleId || moduleSummary?.module_id || moduleSummary?.id;
const getModuleSummaryWeek = (moduleSummary) => moduleSummary?.weekNumber ?? moduleSummary?.week_number;

const getAssignments = (module) => {
  if (Array.isArray(module?.assignments)) return module.assignments;
  if (Array.isArray(module?.items)) return module.items;
  return [];
};

const getQuestions = (content) => {
  // Prefer the canonical `questions` shape whenever it is populated; the Edit
  // Assignment Prompts flow writes there and it's the source of truth for
  // section-level prompts. Fall back to legacy aliases only when `questions`
  // is missing or empty.
  if (Array.isArray(content?.questions) && content.questions.length > 0) return content.questions;
  if (Array.isArray(content?.prompts) && content.prompts.length > 0) return content.prompts;
  if (Array.isArray(content?.question_prompts)) return content.question_prompts;
  if (Array.isArray(content?.assignmentPrompts)) return content.assignmentPrompts;
  if (Array.isArray(content?.assignment_prompts)) return content.assignment_prompts;
  if (Array.isArray(content?.quiz_questions)) return content.quiz_questions;
  if (Array.isArray(content?.quizQuestions)) return content.quizQuestions;
  if (Array.isArray(content?.question_bank)) return content.question_bank;
  if (Array.isArray(content?.questionBank)) return content.questionBank;
  if (Array.isArray(content?.items)) return content.items;
  if (Array.isArray(content?.quiz?.questions)) return content.quiz.questions;
  if (Array.isArray(content?.assessment?.questions)) return content.assessment.questions;
  if (content?.questions && typeof content.questions === 'object') {
    const values = Object.values(content.questions);
    if (values.length > 0) return values;
  }
  if (Array.isArray(content?.questions)) return content.questions;
  if (Array.isArray(content?.prompts)) return content.prompts;
  return [];
};

const toTextContent = (value) => {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    return value
      .map((entry) => toTextContent(entry))
      .filter(Boolean)
      .join('\n\n');
  }
  if (value && typeof value === 'object') {
    return (
      value?.text
      || value?.content
      || value?.body
      || value?.value
      || ''
    );
  }
  return '';
};

const resolveLessonContent = (module) => {
  const candidates = [
    { key: 'module.lesson_content', value: module?.lesson_content },
    { key: 'module.lessonContent', value: module?.lessonContent },
    { key: 'module.eText', value: module?.eText },
    { key: 'module.etext', value: module?.etext },
    { key: 'module.lesson_text', value: module?.lesson_text },
    { key: 'module.lessonText', value: module?.lessonText },
    { key: 'module.lesson.content', value: module?.lesson?.content },
    { key: 'module.lesson.text', value: module?.lesson?.text },
    { key: 'module.lesson.body', value: module?.lesson?.body },
    { key: 'module.content.lesson_content', value: module?.content?.lesson_content },
    { key: 'module.content.lessonContent', value: module?.content?.lessonContent },
    { key: 'module.content.eText', value: module?.content?.eText },
    { key: 'module.content.etext', value: module?.content?.etext },
    { key: 'module.content.lesson_text', value: module?.content?.lesson_text },
    { key: 'module.content.lessonText', value: module?.content?.lessonText },
    { key: 'module.content.lesson.content', value: module?.content?.lesson?.content },
    { key: 'module.content.lesson.text', value: module?.content?.lesson?.text },
    { key: 'module.content.lesson.body', value: module?.content?.lesson?.body },
    { key: 'module.content.text', value: module?.content?.text },
    { key: 'module.content.body', value: module?.content?.body },
  ];
  const scoredCandidates = candidates
    .map(({ key, value }) => {
      const normalized = String(toTextContent(value) || '').trim();
      if (!normalized) return null;
      const hasMarkdownHeading = normalized.includes('\n## ') || normalized.startsWith('## ');
      const markdownBonus = hasMarkdownHeading ? 500 : 0;
      const etextKeyBonus = key.toLowerCase().includes('etext') ? 250 : 0;
      const score = normalized.length + markdownBonus + etextKeyBonus;
      return { key, normalized, score };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);

  if (scoredCandidates.length > 0) {
    return scoredCandidates[0].normalized;
  }

  return '';
};

const resolveLessonContentHtml = (module) => {
  const candidates = [
    module?.lessonContentHtml,
    module?.lesson_content_html,
    module?.lesson?.contentHtml,
    module?.lesson?.content_html,
    module?.content?.lessonContentHtml,
    module?.content?.lesson_content_html,
    module?.content?.lesson?.contentHtml,
    module?.content?.lesson?.content_html,
  ];
  const resolved = candidates.find((entry) => typeof entry === 'string' && entry.trim());
  return typeof resolved === 'string' ? resolved : '';
};

const normalizeLessonBlocks = (value) => {
  if (!Array.isArray(value)) return [];
  return value
    .map((block) => {
      if (!block || typeof block !== 'object') return null;
      const type = String(block?.type || '').trim().toLowerCase();
      if (type === 'heading') return { type: 'heading', level: block?.level, text: toTextContent(block?.text) };
      if (type === 'paragraph') return { type: 'paragraph', text: toTextContent(block?.text) };
      if (type === 'list') {
        const items = Array.isArray(block?.items) ? block.items.map((item) => toTextContent(item)).filter(Boolean) : [];
        return { type: 'list', items };
      }
      return null;
    })
    .filter(Boolean);
};

const resolveLessonContentBlocks = (module) => {
  const blockCandidates = [
    module?.lessonContentBlocks,
    module?.lesson_content_blocks,
    module?.lesson?.contentBlocks,
    module?.lesson?.content_blocks,
    module?.content?.lessonContentBlocks,
    module?.content?.lesson_content_blocks,
    module?.content?.lesson?.contentBlocks,
    module?.content?.lesson?.content_blocks,
  ];

  for (const candidate of blockCandidates) {
    const normalized = normalizeLessonBlocks(candidate);
    if (normalized.length > 0) return normalized;
  }

  return [];
};

const getQuestionPrompt = (question) => {
  if (typeof question === 'string') return question;
  return question?.prompt || question?.question || question?.text || question?.title || question?.label || 'Question';
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

const displayNumeric = (value, fallback = 'N/A') => {
  if (value === null || value === undefined || value === '') return fallback;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const displayPointsPair = (earned, possible, { empty = 'N/A' } = {}) => {
  const earnedDisplay = displayNumeric(earned, empty);
  const possibleDisplay = displayNumeric(possible, empty);
  return `${earnedDisplay}/${possibleDisplay}`;
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

  const hasWrittenParts = writtenQ1 !== null || writtenQ2 !== null;
  const resolvedWrittenTotal = writtenTotal ?? (
    hasWrittenParts
      ? [writtenQ1, writtenQ2].filter((value) => value !== null).reduce((sum, value) => sum + value, 0)
      : null
  );
  const componentValues = [quiz, resolvedWrittenTotal, trading].filter((value) => value !== null);
  const resolvedModuleTotal = moduleTotal ?? (componentValues.length > 0
    ? componentValues.reduce((sum, value) => sum + value, 0)
    : null);

  return {
    quiz,
    writtenQ1,
    writtenQ2,
    trading,
    tradesCompleted,
    resolvedWrittenTotal,
    resolvedModuleTotal,
    hasComponentDerivedTotal: componentValues.length > 0,
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

const ASSIGNMENT_QUESTION_KINDS = ['qualitative', 'quantitative', 'short_answer', 'essay'];

const AssignmentPromptsEditor = ({ assignmentKey, initialContent, onCancel, onSave, status, message, actionLoading }) => {
  const [draft, setDraft] = useState(() => buildInitialAssignmentDraft(initialContent));
  const lastSeededRef = useRef(initialContent);
  const pendingFocusRef = useRef(null);
  useEffect(() => {
    if (lastSeededRef.current !== initialContent) {
      lastSeededRef.current = initialContent;
      setDraft(buildInitialAssignmentDraft(initialContent));
    }
  }, [initialContent]);

  const registerFocusable = (key) => (element) => {
    if (!element) return;
    if (pendingFocusRef.current === key) {
      pendingFocusRef.current = null;
      // focus() alone nudges the new textarea into view without the jarring
      // window-scroll that scrollIntoView triggers on large pages.
      element.focus({ preventScroll: false });
    }
  };

  const isSaving = status === 'saving';
  const isError = status === 'error';
  const isSuccess = status === 'success';
  const disabled = isSaving || actionLoading;

  const updateQuestion = (questionId, updater) => {
    setDraft((previous) => ({
      ...previous,
      questions: previous.questions.map((question) => (
        question.id === questionId ? { ...question, ...(typeof updater === 'function' ? updater(question) : updater) } : question
      )),
    }));
  };

  const updateSection = (questionId, sectionId, updater) => {
    setDraft((previous) => ({
      ...previous,
      questions: previous.questions.map((question) => {
        if (question.id !== questionId) return question;
        return {
          ...question,
          sections: question.sections.map((section) => (
            section.id === sectionId ? { ...section, ...(typeof updater === 'function' ? updater(section) : updater) } : section
          )),
        };
      }),
    }));
  };

  const handleAddQuestion = () => {
    setDraft((previous) => {
      const id = nextQuestionId(previous.questions);
      pendingFocusRef.current = `question:${id}`;
      return {
        ...previous,
        questions: [
          ...previous.questions,
          { id, prompt: '', sections: [], points: null, kind: '', existing: false },
        ],
      };
    });
  };

  const handleRemoveQuestion = (questionId) => {
    setDraft((previous) => ({
      ...previous,
      questions: previous.questions.filter((question) => question.id !== questionId || question.existing),
    }));
  };

  const handleAddSection = (questionId) => {
    setDraft((previous) => ({
      ...previous,
      questions: previous.questions.map((question) => {
        if (question.id !== questionId) return question;
        const sectionId = nextSectionId(question.sections);
        pendingFocusRef.current = `section:${questionId}:${sectionId}`;
        return {
          ...question,
          sections: [
            ...question.sections,
            { id: sectionId, instruction: '', existing: false },
          ],
        };
      }),
    }));
  };

  const handleRemoveSection = (questionId, sectionId) => {
    setDraft((previous) => ({
      ...previous,
      questions: previous.questions.map((question) => {
        if (question.id !== questionId) return question;
        return {
          ...question,
          sections: question.sections.filter((section) => section.id !== sectionId || section.existing),
        };
      }),
    }));
  };

  const handleAddRubricHint = () => {
    setDraft((previous) => ({ ...previous, rubricHints: [...previous.rubricHints, ''] }));
  };

  const handleRemoveRubricHint = (index) => {
    setDraft((previous) => ({
      ...previous,
      rubricHints: previous.rubricHints.filter((_, entryIndex) => entryIndex !== index),
    }));
  };

  const handleUpdateRubricHint = (index, value) => {
    setDraft((previous) => ({
      ...previous,
      rubricHints: previous.rubricHints.map((hint, entryIndex) => (entryIndex === index ? value : hint)),
    }));
  };

  const handleSave = () => {
    const validationError = validateAssignmentDraft(draft);
    if (validationError) {
      onSave({ validationError });
      return;
    }
    onSave({ content: buildAssignmentPayloadContent(draft) });
  };

  return (
    <div
      data-testid={`assignment-editor-${assignmentKey}`}
      style={{ marginTop: 10, border: '1px dashed #1d4ed8', borderRadius: 8, padding: 10, background: '#f8fafc' }}
    >
      <p className="note" style={{ marginTop: 0, marginBottom: 6 }}>
        <strong>Edit Assignment Prompts</strong>
      </p>
      <label className="note" style={{ display: 'block', marginTop: 4, marginBottom: 4 }}>
        <strong>Instructions</strong>
      </label>
      <textarea
        aria-label="Assignment instructions"
        data-testid={`assignment-editor-instructions-${assignmentKey}`}
        rows={3}
        value={draft.instructions}
        onChange={(event) => setDraft((previous) => ({ ...previous, instructions: event.target.value }))}
        disabled={disabled}
        style={{ width: '100%', fontFamily: 'inherit' }}
        placeholder="Overall assignment instructions..."
      />

      <p className="note" style={{ marginTop: 10, marginBottom: 4 }}><strong>Questions</strong></p>
      <div style={{ display: 'grid', gap: 8 }}>
        {draft.questions.map((question) => (
          <div
            key={question.id}
            data-testid={`assignment-editor-question-${assignmentKey}-${question.id}`}
            style={{ border: '1px solid #cbd5e1', borderRadius: 8, padding: 8, background: '#ffffff' }}
          >
            <p className="note" style={{ margin: 0, marginBottom: 4 }}>
              <strong>ID:</strong> <code>{question.id}</code>
              {question.existing ? <span className="note" style={{ marginLeft: 6 }}>(preserved)</span> : null}
            </p>
            <label className="note" style={{ display: 'block', marginTop: 4, marginBottom: 2 }}>Prompt</label>
            <textarea
              ref={registerFocusable(`question:${question.id}`)}
              rows={2}
              value={question.prompt}
              onChange={(event) => {
                const { value } = event.target;
                updateQuestion(question.id, () => ({ prompt: value }));
              }}
              disabled={disabled}
              style={{ width: '100%' }}
              placeholder="Question prompt..."
            />
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 6 }}>
              <label className="note" style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                Points
                <input
                  type="number"
                  min="0"
                  value={question.points ?? ''}
                  onChange={(event) => {
                    const { value } = event.target;
                    updateQuestion(question.id, () => ({ points: value === '' ? null : Number(value) }));
                  }}
                  disabled={disabled}
                  style={{ width: 70 }}
                />
              </label>
              <label className="note" style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                Kind
                <select
                  value={question.kind || ''}
                  onChange={(event) => {
                    const { value } = event.target;
                    updateQuestion(question.id, () => ({ kind: value }));
                  }}
                  disabled={disabled}
                >
                  <option value="">(unset)</option>
                  {ASSIGNMENT_QUESTION_KINDS.map((kindOption) => (
                    <option key={kindOption} value={kindOption}>{kindOption}</option>
                  ))}
                </select>
              </label>
              {!question.existing ? (
                <button type="button" onClick={() => handleRemoveQuestion(question.id)} disabled={disabled}>
                  Remove question
                </button>
              ) : null}
            </div>
            <p className="note" style={{ marginTop: 8, marginBottom: 4 }}><strong>Sections</strong></p>
            <div style={{ display: 'grid', gap: 6 }}>
              {question.sections.map((section) => (
                <div
                  key={section.id}
                  style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}
                >
                  <span className="note" style={{ paddingTop: 4, minWidth: 80 }}>
                    <code>{section.id}</code>
                    {section.existing ? '' : ' (new)'}
                  </span>
                  <textarea
                    ref={registerFocusable(`section:${question.id}:${section.id}`)}
                    rows={2}
                    value={section.instruction}
                    onChange={(event) => {
                      const { value } = event.target;
                      updateSection(question.id, section.id, () => ({ instruction: value }));
                    }}
                    disabled={disabled}
                    style={{ flex: '1 1 auto', minWidth: 200, width: '100%', boxSizing: 'border-box' }}
                    placeholder="Section instruction..."
                  />
                  {!section.existing ? (
                    <button
                      type="button"
                      onClick={() => handleRemoveSection(question.id, section.id)}
                      disabled={disabled}
                    >
                      ×
                    </button>
                  ) : null}
                </div>
              ))}
              <div>
                <button type="button" onClick={() => handleAddSection(question.id)} disabled={disabled}>
                  + Add section
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 8 }}>
        <button
          type="button"
          data-testid={`assignment-editor-add-question-${assignmentKey}`}
          onClick={handleAddQuestion}
          disabled={disabled}
        >
          + Add question
        </button>
      </div>

      <p className="note" style={{ marginTop: 10, marginBottom: 4 }}><strong>Rubric Hints</strong> <span className="note">(optional)</span></p>
      <div style={{ display: 'grid', gap: 6 }}>
        {draft.rubricHints.map((hint, hintIndex) => (
          <div key={`rubric-${hintIndex}`} style={{ display: 'flex', gap: 6 }}>
            <input
              type="text"
              value={hint}
              onChange={(event) => handleUpdateRubricHint(hintIndex, event.target.value)}
              disabled={disabled}
              style={{ flex: 1 }}
              placeholder="Hint for rubric..."
            />
            <button type="button" onClick={() => handleRemoveRubricHint(hintIndex)} disabled={disabled}>×</button>
          </div>
        ))}
        <div>
          <button type="button" onClick={handleAddRubricHint} disabled={disabled}>+ Add hint</button>
        </div>
      </div>

      {message ? (
        <p
          className="note"
          data-testid={`assignment-editor-message-${assignmentKey}`}
          style={{ marginTop: 8, marginBottom: 0, color: isError ? '#b91c1c' : (isSuccess ? '#15803d' : '#1d4ed8') }}
        >
          {message}
        </p>
      ) : null}
      <div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button
          type="button"
          data-testid={`assignment-editor-save-${assignmentKey}`}
          onClick={handleSave}
          disabled={disabled}
        >
          {isSaving ? 'Saving…' : 'Save Prompts'}
        </button>
        <button type="button" onClick={onCancel} disabled={isSaving}>Cancel</button>
      </div>
    </div>
  );
};

const LessonEditor = ({ moduleKey, initialContent, onCancel, onSave, status, message, actionLoading }) => {
  const [draft, setDraft] = useState(initialContent || '');
  const lastSeededRef = useRef(initialContent || '');
  useEffect(() => {
    if (lastSeededRef.current !== initialContent) {
      lastSeededRef.current = initialContent || '';
      setDraft(initialContent || '');
    }
  }, [initialContent]);
  const isSaving = status === 'saving';
  const isError = status === 'error';
  const isSuccess = status === 'success';

  return (
    <div
      data-testid={`lesson-editor-${moduleKey}`}
      style={{ marginTop: 10, border: '1px dashed #1d4ed8', borderRadius: 8, padding: 10, background: '#f8fafc' }}
    >
      <p className="note" style={{ marginTop: 0, marginBottom: 6 }}>
        <strong>Edit eText</strong> (Markdown)
      </p>
      <textarea
        aria-label="Edit lesson content"
        data-testid={`lesson-editor-textarea-${moduleKey}`}
        rows={10}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        disabled={isSaving || actionLoading}
        style={{ width: '100%', fontFamily: 'monospace' }}
        placeholder="Write or paste the lesson content in Markdown..."
      />
      {message ? (
        <p
          className="note"
          data-testid={`lesson-editor-message-${moduleKey}`}
          style={{ marginTop: 6, marginBottom: 0, color: isError ? '#b91c1c' : (isSuccess ? '#15803d' : '#1d4ed8') }}
        >
          {message}
        </p>
      ) : null}
      <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button
          type="button"
          data-testid={`lesson-editor-save-${moduleKey}`}
          onClick={() => onSave(draft)}
          disabled={isSaving || actionLoading || !draft.trim()}
        >
          {isSaving ? 'Saving…' : 'Save eText'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={isSaving}
        >
          Cancel
        </button>
      </div>
    </div>
  );
};

const AssignmentCard = ({
  assignment,
  moduleLocked,
  moduleLockMessage,
  actionLoading,
  onSubmitItem,
  submittedMap,
  submissionState,
  quizAnswers,
  writtenAnswers,
  onQuizAnswersChange,
  onWrittenAnswersChange,
  isInstructor = false,
  assignmentEditEntry,
  onEditAssignmentPrompts,
}) => {
  const [quizScore, setQuizScore] = useState(null);
  const assignmentType = getAssignmentType(assignment);
  const assignmentId = getAssignmentId(assignment);
  const initialQuestions = getQuestions(assignment?.content);
  // Cache questions per assignment to keep rendering stable across re-renders,
  // but refresh whenever the content reference changes so freshly edited
  // prompts/sections show up immediately for everyone (students and
  // instructors alike). Answers are keyed by question/section id, not index,
  // so refreshing the question list does not misalign any in-progress work.
  const cachedQuestionsRef = useRef(initialQuestions);
  const cachedAssignmentIdRef = useRef(assignmentId);
  const cachedContentRef = useRef(assignment?.content);
  if (
    cachedAssignmentIdRef.current !== assignmentId
    || cachedContentRef.current !== assignment?.content
  ) {
    cachedAssignmentIdRef.current = assignmentId;
    cachedContentRef.current = assignment?.content;
    cachedQuestionsRef.current = initialQuestions;
  }
  const questions = cachedQuestionsRef.current;
  const submitted = Boolean(submittedMap?.[assignmentId]) || String(assignment?.status || '').toLowerCase() === 'submitted';
  const [submitValidationError, setSubmitValidationError] = useState('');
  const currentSubmission = submissionState?.byAssignmentId?.[assignmentId] || null;
  const isLocked = Boolean(moduleLocked) || Boolean(currentSubmission?.lockInfo);
  const lockNotice = currentSubmission?.lockInfo?.message || moduleLockMessage || '';

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
            const sections = Array.isArray(question?.sections) ? question.sections : [];
            const legacyParts = sections.length === 0 && Array.isArray(question?.parts) ? question.parts : [];
            return (
              <div key={questionId}>
                <p className="note" style={{ marginBottom: 4 }}><strong>Prompt {questionIndex + 1}:</strong> {prompt}</p>
                {sections.length > 0 ? (
                  <ol
                    data-testid={`assignment-sections-${questionId}`}
                    style={{ listStyle: 'none', paddingLeft: 16, margin: '0 0 6px', display: 'grid', gap: 4 }}
                  >
                    {sections.map((section, sectionIndex) => {
                      const sectionId = section?.id || section?.partId || String.fromCharCode(97 + sectionIndex);
                      const sectionInstruction = section?.instruction || section?.prompt || section?.text || '';
                      return (
                        <li key={`${questionId}-section-${sectionId}`} className="note" style={{ margin: 0 }}>
                          <strong>{sectionId}.</strong> {sectionInstruction}
                        </li>
                      );
                    })}
                  </ol>
                ) : null}
                {legacyParts.length > 0 ? (
                  <div style={{ display: 'grid', gap: 6 }}>
                    {legacyParts.map((part, partIndex) => {
                      const partId = part?.partId || part?.id || `part-${partIndex}`;
                      const partKey = `${questionId}-part-${partId}`;
                      const partPrompt = part?.prompt || part?.question || part?.text || `Part ${String.fromCharCode(97 + partIndex)}`;
                      return (
                        <div key={partKey}>
                          <p className="note" style={{ marginBottom: 4 }}><strong>{String.fromCharCode(97 + partIndex)}.</strong> {partPrompt}</p>
                          <textarea
                            rows={3}
                            value={writtenAnswers[partKey] || ''}
                            onChange={(event) => onWrittenAnswersChange((previous) => ({ ...previous, [partKey]: event.target.value }))}
                            style={{ width: '100%' }}
                            disabled={isLocked || actionLoading}
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
                    onChange={(event) => onWrittenAnswersChange((previous) => ({ ...previous, [questionId]: event.target.value }))}
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
                        onChange={() => onQuizAnswersChange((previous) => ({ ...previous, [questionId]: choiceValue }))}
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
      {currentSubmission?.status === 'locked' ? (
        <p
          className="note"
          role="alert"
          data-testid="assignment-lock-message"
          style={{ marginTop: 8, marginBottom: 0, color: '#b45309' }}
        >
          🔒 {currentSubmission?.message || 'This module is locked.'}
        </p>
      ) : (isLocked && lockNotice ? (
        <p
          className="note"
          data-testid="assignment-lock-notice"
          style={{ marginTop: 8, marginBottom: 0, color: '#b45309' }}
        >
          🔒 {lockNotice}
        </p>
      ) : null)}

      <div style={{ marginTop: 10 }}>
        <button
          onClick={handleSubmit}
          disabled={isLocked || actionLoading || !assignmentId || currentSubmission?.status === 'loading'}
        >
          {currentSubmission?.status === 'loading' ? 'Submitting…' : 'Submit'}
        </button>
      </div>

      {isInstructor && isWrittenAssignment(assignment) && typeof onEditAssignmentPrompts === 'function' ? (
        <div style={{ marginTop: 10 }}>
          {!assignmentEditEntry?.open ? (
            <button
              type="button"
              data-testid={`edit-assignment-prompts-button-${assignmentId}`}
              onClick={() => onEditAssignmentPrompts({
                type: 'open',
                assignmentId,
                assignmentKey: assignmentId,
                initialContent: assignment?.content || {},
              })}
              disabled={actionLoading}
            >
              ✏️ Edit Assignment Prompts
            </button>
          ) : (
            <AssignmentPromptsEditor
              assignmentKey={assignmentId}
              initialContent={assignmentEditEntry?.initialContent ?? assignment?.content ?? {}}
              onCancel={() => onEditAssignmentPrompts({ type: 'close', assignmentId, assignmentKey: assignmentId })}
              onSave={({ validationError, content }) => {
                if (validationError) {
                  onEditAssignmentPrompts({
                    type: 'validation-error',
                    assignmentId,
                    assignmentKey: assignmentId,
                    message: validationError,
                  });
                  return;
                }
                onEditAssignmentPrompts({
                  type: 'save',
                  assignmentId,
                  assignmentKey: assignmentId,
                  content,
                });
              }}
              status={assignmentEditEntry?.status || 'idle'}
              message={assignmentEditEntry?.message || ''}
              actionLoading={actionLoading}
            />
          )}
        </div>
      ) : null}
    </div>
  );
};

export const StudentCurriculumPanel = ({
  overview,
  modules,
  gradeSummary,
  gradesMessage,
  loading,
  error,
  onSubmitItem,
  actionLoading,
  submissionState,
  isInstructor = false,
  onSaveLessonContent,
  lessonEditState,
  onEditAssignmentPrompts,
  assignmentEditState,
}) => {
  if (!overview?.curriculum_enabled) return null;
  const summaryOverall = gradeSummary?.gradeSummaryOverall ?? gradeSummary?.grade_summary_overall ?? gradeSummary ?? {};
  const percentage = summaryOverall?.percentage ?? null;
  const totalPointsPossible = summaryOverall?.points_possible ?? summaryOverall?.totalPointsPossible ?? summaryOverall?.total_points_possible ?? null;
  const letter = summaryOverall?.letter ?? summaryOverall?.letterGrade ?? summaryOverall?.letter_grade ?? 'N/A';
  const completedItems = summaryOverall?.completed_items ?? summaryOverall?.completedItems ?? null;
  const totalItems = summaryOverall?.total_items ?? summaryOverall?.totalItems ?? null;
  const progressPercentage = resolveProgressPercentage({
    progressPercentage: gradeSummary?.progressPercentage ?? gradeSummary?.progress_percentage,
    completedItems,
    totalItems,
  });
  const showNoGradedItemsYet = shouldShowNoGradedItemsYet(gradeSummary);
  const [expandedModuleId, setExpandedModuleId] = useState(null);
  const [quizAnswersByAssignment, setQuizAnswersByAssignment] = useState({});
  const [writtenAnswersByAssignment, setWrittenAnswersByAssignment] = useState({});
  const normalizedModuleSummaries = useMemo(() => (
    Array.isArray(gradeSummary?.moduleGrades)
      ? gradeSummary.moduleGrades
      : (Array.isArray(gradeSummary?.module_grades) ? gradeSummary.module_grades : [])
  ), [gradeSummary]);
  const moduleSummaryLookup = useMemo(() => {
    const byId = new Map();
    const byWeek = new Map();
    normalizedModuleSummaries.forEach((moduleSummary) => {
      const summaryId = String(getModuleSummaryId(moduleSummary) ?? '').trim();
      const summaryWeek = String(getModuleSummaryWeek(moduleSummary) ?? '').trim();
      if (summaryId) byId.set(summaryId, moduleSummary);
      if (summaryWeek) byWeek.set(summaryWeek, moduleSummary);
    });
    return { byId, byWeek };
  }, [normalizedModuleSummaries]);

  const hasModulesToShow = Array.isArray(modules) && modules.length > 0;
  const isInitialLoading = loading && !hasModulesToShow;
  const isBackgroundRefreshing = loading && hasModulesToShow;

  return (
    <div className="card section">
      <h3>Curriculum</h3>
      {isInitialLoading ? <p className="note">Loading curriculum...</p> : null}
      {isBackgroundRefreshing ? (
        <p className="note" style={{ color: '#1d4ed8' }} data-testid="curriculum-refreshing">Refreshing…</p>
      ) : null}
      {error ? <p className="note" style={{ color: '#b91c1c' }}>{error}</p> : null}
      {gradesMessage && !showNoGradedItemsYet ? <p className="note" style={{ color: '#b45309' }}>{gradesMessage}</p> : null}
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

      {!isInitialLoading && (
        <>
          <p className="note">Progress: {progressPercentage === null ? '—' : `${Math.round(Number(progressPercentage))}%`}</p>
          <div style={progressShell}><div style={progressFill(progressPercentage)} /></div>
          <p className="note" style={{ marginTop: 8 }}>
            Grade: <strong>{showNoGradedItemsYet ? 'No graded items yet' : asPercent(percentage, { pointsPossible: totalPointsPossible })}</strong>
            {showNoGradedItemsYet ? '' : ` (${asLetter(letter, { percentage, pointsPossible: totalPointsPossible })})`}
          </p>
          <div style={{ ...detailShell, marginBottom: 8 }}>
            <p className="note" style={{ marginTop: 0, marginBottom: 6 }}><strong>Overall Curriculum Grade Progress</strong></p>
            <p className="note" style={{ margin: 0 }}>
              Points earned: {displayPointsPair(summaryOverall?.points_earned ?? summaryOverall?.totalPointsEarned ?? summaryOverall?.total_points_earned, totalPointsPossible)}
              {' • '}Completed: {displayPointsPair(completedItems, totalItems)}
              {' • '}Percentage: {displayNumeric(percentage)}%
              {' • '}Letter: {letter || 'N/A'}
            </p>
          </div>
          <p className="note">
            Summary: {overview?.curriculum_weeks ?? overview?.totalWeeks ?? '-'} weeks • {formatDisplayDate(overview?.curriculum_start_date ?? overview?.startDate)} → {formatDisplayDate(overview?.curriculum_end_date ?? overview?.endDate)} • {overview?.module_count ?? overview?.moduleCount ?? 0} modules • {overview?.assignment_count ?? overview?.assignmentCount ?? 0} assignments
          </p>

          <div className="section" style={{ display: 'grid', gap: 12 }}>
            {Array.isArray(modules) && modules.length > 0 ? modules.map((module) => {
              const moduleId = getModuleId(module);
              const assignments = getAssignments(module);
              const moduleKey = String(moduleId ?? module?.weekNumber ?? module?.week_number ?? module?.title ?? '').trim();
              const isExpanded = expandedModuleId === moduleKey;
              const moduleTitle = module?.title || 'Untitled module';
              const weekNumber = module?.weekNumber ?? module?.week_number;
              const moduleDescription = module?.description || 'No description provided.';
              const unlockDate = module?.unlockDate ?? module?.unlock_date;
              const dueDate = module?.dueDate ?? module?.due_date;
              const lessonContent = resolveLessonContent(module);
              const lessonContentBlocks = resolveLessonContentBlocks(module);
              const lessonContentHtml = resolveLessonContentHtml(module);
              const lockState = getModuleLockState(module);
              // Backend already bypasses lock for instructors/admins; treat as unlocked defensively.
              const effectiveLocked = isInstructor ? false : lockState.locked;
              const lockMessage = effectiveLocked
                ? buildModuleLockMessage(module, { allModules: modules, formatDate: formatDisplayDate })
                : '';
              const moduleSummaryById = moduleSummaryLookup.byId.get(String(moduleId ?? '').trim());
              const moduleSummaryByWeek = moduleSummaryLookup.byWeek.get(String(weekNumber ?? '').trim());
              const moduleSummary = moduleSummaryById || moduleSummaryByWeek || null;
              const quiz = moduleSummary?.quiz || {};
              const writtenAssignment = moduleSummary?.writtenAssignment || {};
              const tradeParticipation = moduleSummary?.tradeParticipation || {};
              const moduleTotal = moduleSummary?.moduleTotalPoints;
              const modulePossible = moduleSummary?.modulePointsPossible;
              const modulePercent = moduleSummary?.modulePercentage;
              const quizStatus = normalizeGradingStatus(quiz?.gradingStatus || quiz?.status || 'not_submitted');
              const writtenStatus = normalizeGradingStatus(writtenAssignment?.gradingStatus || writtenAssignment?.status || 'not_submitted');
              const tradeStatus = normalizeGradingStatus(tradeParticipation?.gradingStatus || tradeParticipation?.status || 'not_submitted');
              const editState = lessonEditState?.[moduleKey] || null;
              const isEditingLesson = Boolean(editState?.open);
              const handleOpenLessonEditor = () => {
                if (typeof onSaveLessonContent !== 'function') return;
                onSaveLessonContent({
                  type: 'open',
                  moduleId,
                  moduleKey,
                  initialContent: lessonContent,
                });
              };
              const handleCloseLessonEditor = () => {
                if (typeof onSaveLessonContent !== 'function') return;
                onSaveLessonContent({ type: 'close', moduleId, moduleKey });
              };
              const handleSaveLessonEditor = (draftValue) => {
                if (typeof onSaveLessonContent !== 'function') return;
                onSaveLessonContent({
                  type: 'save',
                  moduleId,
                  moduleKey,
                  lessonContent: draftValue,
                });
              };

              return (
                <div
                  key={moduleKey || String(moduleTitle)}
                  data-testid={`curriculum-module-tile-${moduleKey || moduleTitle}`}
                  data-locked={effectiveLocked ? 'true' : 'false'}
                  aria-disabled={effectiveLocked ? 'true' : undefined}
                  style={{
                    border: '1px solid var(--border-color)',
                    borderRadius: 10,
                    padding: 12,
                    background: effectiveLocked ? '#f1f5f9' : undefined,
                    opacity: effectiveLocked ? 0.75 : 1,
                  }}
                  title={effectiveLocked ? lockMessage : undefined}
                >
                  <button
                    type="button"
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      background: 'transparent',
                      border: 0,
                      padding: 0,
                      cursor: effectiveLocked ? 'not-allowed' : (isExpanded ? 'default' : 'pointer'),
                    }}
                    disabled={effectiveLocked}
                    aria-disabled={effectiveLocked ? 'true' : undefined}
                    aria-label={effectiveLocked ? `Locked module: ${moduleTitle}. ${lockMessage}` : undefined}
                    onClick={() => {
                      if (effectiveLocked) return;
                      if (!isExpanded) setExpandedModuleId(moduleKey);
                    }}
                  >
                    <p className="em" style={{ marginBottom: 6 }}>
                      {effectiveLocked ? (
                        <span aria-hidden="true" data-testid="module-lock-icon" style={{ marginRight: 6 }}>🔒</span>
                      ) : null}
                      Week {weekNumber}: {moduleTitle}
                    </p>
                    <p className="note">{moduleDescription}</p>
                    <p className="note">Unlocks: {formatDisplayDate(unlockDate)} • Due: {formatDisplayDate(dueDate)}</p>
                    <p className="note" style={{ marginBottom: 0 }}>
                      Status: {effectiveLocked ? 'Locked' : 'Unlocked'} • {assignments.length} assignments • {effectiveLocked ? 'Locked' : (isExpanded ? 'Open' : 'Click to open module')}
                    </p>
                  </button>
                  {effectiveLocked && lockMessage ? (
                    <p
                      className="note"
                      role="note"
                      data-testid="module-lock-message"
                      style={{ marginTop: 6, marginBottom: 0, color: '#b45309' }}
                    >
                      {lockMessage}
                    </p>
                  ) : null}
                  {isInstructor && lockState.enforcePrerequisites ? (
                    <p
                      className="note"
                      data-testid="enforce-prereq-badge"
                      style={{ marginTop: 6, marginBottom: 0, color: '#1d4ed8' }}
                    >
                      <span className="pill" style={{ background: '#dbeafe', color: '#1d4ed8', padding: '2px 6px', borderRadius: 4 }}>
                        Prerequisites enforced
                      </span>
                    </p>
                  ) : null}
                  {isInstructor && typeof onSaveLessonContent === 'function' ? (
                    <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {!isEditingLesson ? (
                        <button
                          type="button"
                          data-testid={`edit-etext-button-${moduleKey || moduleTitle}`}
                          onClick={handleOpenLessonEditor}
                          disabled={actionLoading}
                        >
                          ✏️ Edit eText
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                  {isExpanded && !effectiveLocked ? (
                    <div style={{ marginTop: 8, display: 'flex', justifyContent: 'flex-end' }}>
                      <button type="button" onClick={() => setExpandedModuleId(null)}>Collapse module</button>
                    </div>
                  ) : null}
                  <div style={{ ...gradeGrid, marginTop: 10 }}>
                    <div style={gradeTile}>
                      <p className="note" style={{ margin: 0 }}>
                        <strong>Quiz Score</strong><br />
                        {displayPointsPair(quiz?.score, quiz?.pointsPossible)}
                        {' '}<span className="pill" style={getStatusBadgeStyles(quizStatus)}>{quizStatus}</span>
                      </p>
                    </div>
                    <div style={gradeTile}>
                      <p className="note" style={{ margin: 0 }}>
                        <strong>Written Score</strong><br />
                        {displayPointsPair(writtenAssignment?.totalScore, writtenAssignment?.pointsPossible)}
                        {' '}<span className="pill" style={getStatusBadgeStyles(writtenStatus)}>{writtenStatus}</span><br />
                        Q1: {displayNumeric(writtenAssignment?.question1Score, '—')} • Q2: {displayNumeric(writtenAssignment?.question2Score, '—')}
                      </p>
                    </div>
                    <div style={gradeTile}>
                      <p className="note" style={{ margin: 0 }}>
                        <strong>Trading Score</strong><br />
                        {displayPointsPair(tradeParticipation?.tradePoints, tradeParticipation?.pointsPossible)}
                        {' '}<span className="pill" style={getStatusBadgeStyles(tradeStatus)}>{tradeStatus}</span>
                      </p>
                    </div>
                    <div style={gradeTile}>
                      <p className="note" style={{ margin: 0 }}>
                        <strong>Module Total</strong><br />
                        {displayPointsPair(moduleTotal, modulePossible)} • {displayNumeric(modulePercent)}%
                      </p>
                    </div>
                  </div>

                  {isEditingLesson ? (
                    <LessonEditor
                      moduleKey={moduleKey}
                      initialContent={editState?.initialContent ?? lessonContent}
                      onCancel={handleCloseLessonEditor}
                      onSave={handleSaveLessonEditor}
                      status={editState?.status || 'idle'}
                      message={editState?.message || ''}
                      actionLoading={actionLoading}
                    />
                  ) : null}
                  {isExpanded && !effectiveLocked ? (
                    <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
                      <div style={detailShell}>
                        <p className="note" style={{ marginTop: 0, marginBottom: 6 }}><strong>Lesson (eText)</strong></p>
                        <LessonContentRenderer blocks={lessonContentBlocks} html={lessonContentHtml} raw={lessonContent} />
                      </div>
                      {assignments.length > 0 ? assignments.map((assignment, assignmentIndex) => {
                        const assignmentId = getAssignmentId(assignment) || `${moduleKey}-assignment-${assignmentIndex}`;
                        return (
                          <AssignmentCard
                            key={assignmentId}
                            assignment={assignment}
                            moduleLocked={effectiveLocked}
                            moduleLockMessage={lockMessage}
                            actionLoading={actionLoading}
                            onSubmitItem={onSubmitItem}
                            submittedMap={submissionState?.submittedByAssignmentId}
                            submissionState={submissionState}
                            quizAnswers={quizAnswersByAssignment?.[assignmentId] || {}}
                            writtenAnswers={writtenAnswersByAssignment?.[assignmentId] || {}}
                            onQuizAnswersChange={(updater) => {
                              setQuizAnswersByAssignment((previous) => {
                                const previousValue = previous?.[assignmentId] || {};
                                const nextValue = typeof updater === 'function' ? updater(previousValue) : updater;
                                return { ...previous, [assignmentId]: nextValue };
                              });
                            }}
                            onWrittenAnswersChange={(updater) => {
                              setWrittenAnswersByAssignment((previous) => {
                                const previousValue = previous?.[assignmentId] || {};
                                const nextValue = typeof updater === 'function' ? updater(previousValue) : updater;
                                return { ...previous, [assignmentId]: nextValue };
                              });
                            }}
                            isInstructor={isInstructor}
                            assignmentEditEntry={assignmentEditState?.[assignmentId]}
                            onEditAssignmentPrompts={isInstructor ? onEditAssignmentPrompts : undefined}
                          />
                        );
                      }) : <p className="note">No assignments in this module yet.</p>}
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
  const percentage = gradeSummary?.percentage;
  const showNoGradedItemsYet = shouldShowNoGradedItemsYet(gradeSummary);

  return (
    <div className="card section">
      <h3>Grade Summary</h3>
      <p className="note">Points: {asPoints(gradeSummary.totalPointsEarned ?? gradeSummary.total_points_earned, gradeSummary.totalPointsPossible ?? gradeSummary.total_points_possible)}</p>
      <p className="note">Percentage: {showNoGradedItemsYet ? 'No graded items yet' : asPercent(percentage, { pointsPossible: gradeSummary.totalPointsPossible ?? gradeSummary.total_points_possible })}</p>
      <p className="note">Letter Grade: {showNoGradedItemsYet ? 'N/A' : asLetter(gradeSummary.letterGrade ?? gradeSummary.letter_grade, { percentage, pointsPossible: gradeSummary.totalPointsPossible ?? gradeSummary.total_points_possible })}</p>
      <p className="note">Completed {gradeSummary.completed_items ?? 0} of {gradeSummary.total_items ?? 0} items</p>
      <div className="section" style={{ display: 'grid', gap: 8 }}>
        {(gradeSummary.items || []).map((item) => {
          const itemStatus = getGradeItemStatus(item);
          return (
            <div key={item.id || item.assignmentId || item.title} style={{ border: '1px solid var(--border-color)', borderRadius: 8, padding: 8 }}>
              <p className="note" style={{ margin: 0, display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                <strong>{item.title || 'Curriculum item'}</strong>
                <span className="pill" style={getStatusBadgeStyles(itemStatus)}>{normalizeGradingStatus(itemStatus)}</span>
                <span>{getGradeItemDisplayText(item)}</span>
              </p>
            </div>
          );
        })}
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
                <strong>{student?.name || student?.username || studentId}</strong> • {asPercent(student?.grade_percentage ?? student?.percentage)} • {normalizeCurriculumStatus(student?.status)}
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
                  {getSubmissionQuestionResponses(submission).map((response, index) => (
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
