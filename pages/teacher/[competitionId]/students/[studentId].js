import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import axios from 'axios';
import { getApiBaseUrl, getApiErrorMessage } from '../../../../lib/api';
import {
  asPercent,
  asLetter,
  asPoints,
  getStatusBadgeStyles,
  getStoredUsername,
  normalizeGradingStatus,
} from '../../../../lib/teacherDashboard';
import {
  getSummaryOverall,
  resolveProgressPercentage,
  resolveGradeSummaryOverall,
} from '../../../../lib/curriculum/grades';
import {
  applyGradeResponse,
  canShowManualGradeAction,
  getQuestionGradeRows,
  toQuestionGradePayload,
  validateQuestionGrades,
} from '../../../../lib/curriculum/teacherDetail';
import { refetchCurriculumGradeQueries } from '../../../../lib/curriculum/queryKeys';

const parseStudentResponse = (payload) => {
  const source = payload && typeof payload === 'object' ? payload : {};
  const student = source.student || source.user || null;
  const summaryOverall = getSummaryOverall(source);
  const summarySource = {
    ...source,
    gradeSummaryOverall: summaryOverall,
    gradeSummary: source?.gradeSummary ?? source?.grade_summary,
    percentage: source?.curriculumPercentage ?? student?.curriculumPercentage,
    letterGrade: source?.letterGrade ?? source?.letter_grade ?? student?.letterGrade ?? student?.letter_grade,
    totalPointsEarned: source?.totalPointsEarned ?? source?.total_points_earned ?? student?.totalPointsEarned ?? student?.total_points_earned,
    totalPointsPossible: source?.totalPointsPossible ?? source?.total_points_possible ?? student?.totalPointsPossible ?? student?.total_points_possible,
  };
  return {
    student,
    gradeSummary: resolveGradeSummaryOverall(summarySource),
    items: Array.isArray(source.items) ? source.items : [],
  };
};

const buildStudentDetailUrls = (baseUrl, competitionId, studentId) => {
  const encodedCompetitionId = encodeURIComponent(competitionId);
  const encodedStudentId = encodeURIComponent(studentId);
  return [
    `${baseUrl}/curriculum/competition/${encodedCompetitionId}/instructor/students/${encodedStudentId}`,
    `${baseUrl}/curriculum/competition/${encodedCompetitionId}/teacher/students/${encodedStudentId}`,
  ];
};

const buildStudentTradesUrls = (baseUrl, competitionId, studentId) => {
  const encodedCompetitionId = encodeURIComponent(competitionId);
  const encodedStudentId = encodeURIComponent(studentId);
  return [
    `${baseUrl}/curriculum/competition/${encodedCompetitionId}/instructor/students/${encodedStudentId}/trades`,
    `${baseUrl}/curriculum/competition/${encodedCompetitionId}/teacher/students/${encodedStudentId}/trades`,
  ];
};

const mapValidationMessage = (message) => {
  const normalized = String(message || '').toLowerCase();
  const whitelist = [
    'score is required',
    'score must be numeric',
    'score must be greater than or equal to 0',
    'score must be less than or equal to points possible',
    'only written assignments can be manually graded at this endpoint',
  ];
  const found = whitelist.find((entry) => normalized.includes(entry));
  return found || message || 'Unable to submit grade.';
};

const formatSubmittedAt = (value) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const datePart = date.toLocaleDateString(undefined, { dateStyle: 'medium' });
  const timePart = date.toLocaleTimeString(undefined, { timeStyle: 'short' });
  return `${datePart}, ${timePart}`;
};

const getFeedback = (item) => (item && typeof item.feedback === 'object' && item.feedback !== null ? item.feedback : {});

const getSubmissionAnswers = (item) => {
  const content = item?.submissionContent;
  if (content == null) return { status: 'empty', answers: [] };
  if (Array.isArray(content.answers)) return { status: 'ok', answers: content.answers };
  return { status: 'malformed', answers: [] };
};

const SECTION_ORDER = ['pending', 'graded', 'not_submitted'];

const groupItemsByStatus = (items) => {
  const groups = { pending: [], graded: [], not_submitted: [] };
  for (const item of items) {
    const status = normalizeGradingStatus(item?.gradingStatus);
    if (status === 'graded') groups.graded.push(item);
    else if (status === 'not_submitted') groups.not_submitted.push(item);
    else groups.pending.push(item);
  }
  return groups;
};

const SECTION_META = {
  pending: { label: 'Needs grading', defaultOpen: true },
  graded: { label: 'Graded', defaultOpen: false },
  not_submitted: { label: 'Not submitted', defaultOpen: false },
};

const SubmissionRow = ({ item, onOpenGradeModal }) => {
  const status = normalizeGradingStatus(item?.gradingStatus);
  const feedback = getFeedback(item);
  const pendingManualGrade = feedback.pendingManualGrade === true;
  const lateSubmission = feedback.lateSubmission === true;
  const canManualGrade = canShowManualGradeAction(item);
  const questionGrades = Array.isArray(item?.questionGrades) ? item.questionGrades : [];
  const { status: payloadStatus, answers } = getSubmissionAnswers(item);
  const submittedLabel = formatSubmittedAt(item?.submittedAt);
  const gradedLabel = formatSubmittedAt(item?.gradedAt);
  const gradedBy = item?.gradedByUsername || item?.gradedByUserId || '';
  const instructorComment = typeof feedback.instructorComment === 'string' ? feedback.instructorComment.trim() : '';
  const comments = typeof feedback.comments === 'string' ? feedback.comments.trim() : '';
  const rubricNotes = typeof item?.rubricNotes === 'string' ? item.rubricNotes.trim() : '';

  return (
    <div className="teacher-student-row">
      <div className="teacher-student-row-head">
        <div className="teacher-student-week-badge">
          {Number.isFinite(Number(item?.moduleWeek)) ? `W${item.moduleWeek}` : '—'}
        </div>
        <div className="teacher-student-row-title-block">
          <div className="teacher-student-row-title">{item?.title || 'Untitled'}</div>
          {item?.moduleTitle ? (
            <div className="note teacher-student-row-subtitle">{item.moduleTitle}</div>
          ) : null}
          <div className="teacher-student-row-pills">
            <span className="pill" style={getStatusBadgeStyles(status)}>{status.replace('_', ' ')}</span>
            {pendingManualGrade ? (
              <span className="pill teacher-student-pill-warn">Needs grading</span>
            ) : null}
            {lateSubmission ? (
              <span className="pill teacher-student-pill-late">Late</span>
            ) : null}
            {item?.assignmentType ? (
              <span className="note teacher-student-row-type">{item.assignmentType}</span>
            ) : null}
          </div>
        </div>
        <div className="teacher-student-row-score">
          <div className="teacher-student-row-points">{asPoints(item?.pointsEarned, item?.pointsPossible)}</div>
          <div className="note">{asPercent(item?.percentage)}</div>
        </div>
        <div className="teacher-student-row-actions">
          {canManualGrade ? (
            <button type="button" onClick={() => onOpenGradeModal(item)}>Manual Grade</button>
          ) : null}
        </div>
      </div>

      {submittedLabel ? (
        <div className="note teacher-student-row-subline">Submitted {submittedLabel}</div>
      ) : null}

      {payloadStatus === 'ok' && answers.length > 0 ? (
        <div className="teacher-student-answers">
          {answers.map((answer, idx) => {
            const pointsPossibleKey = `question${idx + 1}PointsPossible`;
            const feedbackPointsPossible = feedback?.[pointsPossibleKey];
            const matchedGrade = questionGrades.find(
              (grade) => grade?.questionId && answer?.questionId && grade.questionId === answer.questionId,
            );
            const pointsAwarded = matchedGrade && Number.isFinite(Number(matchedGrade.pointsAwarded))
              ? Number(matchedGrade.pointsAwarded)
              : null;
            const pointsPossible = matchedGrade && Number.isFinite(Number(matchedGrade.pointsPossible))
              ? Number(matchedGrade.pointsPossible)
              : (Number.isFinite(Number(feedbackPointsPossible)) ? Number(feedbackPointsPossible) : null);
            const response = typeof answer?.response === 'string' ? answer.response : '';
            return (
              <div key={answer?.questionId || `q-${idx}`} className="teacher-student-answer">
                <div className="teacher-student-answer-head">
                  <strong>Question {idx + 1}</strong>
                  <span className="note">
                    {pointsAwarded !== null ? pointsAwarded : '—'}
                    {' / '}
                    {pointsPossible !== null ? pointsPossible : '?'}
                  </span>
                </div>
                {response ? (
                  <div className="teacher-student-answer-body">{response}</div>
                ) : (
                  <div className="note">No response provided.</div>
                )}
              </div>
            );
          })}
        </div>
      ) : payloadStatus === 'malformed' ? (
        <div className="teacher-student-row-subline">
          <div className="note">Unable to display submission.</div>
          <details className="teacher-student-details">
            <summary>View raw</summary>
            <pre className="teacher-student-pre">{JSON.stringify(item?.submissionContent ?? null, null, 2)}</pre>
          </details>
        </div>
      ) : null}

      {(instructorComment || comments || rubricNotes) ? (
        <div className="teacher-student-row-feedback">
          {instructorComment ? (
            <div><span className="note">Instructor comment:</span> {instructorComment}</div>
          ) : null}
          {comments && comments !== instructorComment ? (
            <div><span className="note">Comments:</span> {comments}</div>
          ) : null}
          {rubricNotes ? (
            <div><span className="note">Rubric:</span> {rubricNotes}</div>
          ) : null}
        </div>
      ) : null}

      {(gradedBy || gradedLabel) ? (
        <div className="note teacher-student-row-subline">
          {gradedBy ? `Graded by ${gradedBy}` : 'Graded'}
          {gradedLabel ? ` · ${gradedLabel}` : ''}
        </div>
      ) : null}
    </div>
  );
};

export default function TeacherStudentDetailPage() {
  const router = useRouter();
  const { competitionId, studentId } = router.query;
  const BASE_URL = useMemo(() => getApiBaseUrl(), []);

  const [username, setUsername] = useState('');
  const [student, setStudent] = useState(null);
  const [gradeSummary, setGradeSummary] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [gradeModalItem, setGradeModalItem] = useState(null);
  const [gradeForm, setGradeForm] = useState({ grades: [], finalFeedback: '', rubricNotes: '' });
  const [gradeError, setGradeError] = useState('');
  const [gradeLoading, setGradeLoading] = useState(false);

  const [showTrades, setShowTrades] = useState(false);
  const [tradesLoading, setTradesLoading] = useState(false);
  const [tradesError, setTradesError] = useState('');
  const [trades, setTrades] = useState([]);

  const loadStudentDetail = async (activeUsername) => {
    if (!competitionId || !studentId || !activeUsername) return;
    setLoading(true);
    setError('');
    try {
      const detailUrls = buildStudentDetailUrls(BASE_URL, competitionId, studentId);
      let response = null;

      for (const detailUrl of detailUrls) {
        try {
          response = await axios.get(detailUrl, { params: { username: activeUsername } });
          break;
        } catch (candidateError) {
          const status = candidateError?.response?.status;
          if (status === 404) continue;
          throw candidateError;
        }
      }

      if (!response) {
        setError('Curriculum is not enabled for this competition');
        return;
      }

      const parsed = parseStudentResponse(response?.data);
      setStudent(parsed.student);
      setGradeSummary(parsed.gradeSummary);
      setItems(parsed.items);
    } catch (requestError) {
      const status = requestError?.response?.status;
      if (status === 403) {
        router.replace('/not-authorized');
        return;
      }
      if (status === 404) {
        setError('Curriculum is not enabled for this competition');
      } else if (status === 401) {
        setError('Please sign in');
      } else {
        setError(getApiErrorMessage(requestError, 'Unable to load student detail.'));
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const storedUsername = getStoredUsername();
    if (!storedUsername) {
      setError('Please sign in');
      setLoading(false);
      return;
    }
    setUsername(storedUsername);
  }, []);

  useEffect(() => {
    if (!username) return;
    loadStudentDetail(username);
  }, [competitionId, studentId, username]);

  const openGradeModal = (item) => {
    const gradeRows = getQuestionGradeRows(item);
    setGradeModalItem(item);
    setGradeForm({
      grades: gradeRows,
      finalFeedback: item?.feedback?.comment || item?.feedback || '',
      rubricNotes: item?.rubricNotes || '',
    });
    setGradeError('');
  };

  const updateQuestionGrade = (index, key, value) => {
    setGradeForm((prev) => ({
      ...prev,
      grades: prev.grades.map((grade, gradeIndex) => (gradeIndex === index ? { ...grade, [key]: value } : grade)),
    }));
  };

  const handleSubmitGrade = async () => {
    if (!gradeModalItem || !username) return;
    setGradeLoading(true);
    setGradeError('');

    try {
      const validationMessage = validateQuestionGrades(gradeForm.grades);
      if (validationMessage) {
        setGradeError(validationMessage);
        return;
      }

      const payload = toQuestionGradePayload({
        username,
        grades: gradeForm.grades,
        finalFeedback: gradeForm.finalFeedback,
        rubricNotes: gradeForm.rubricNotes,
      });

      const response = await axios.post(
        `${BASE_URL}/teacher/submissions/${encodeURIComponent(gradeModalItem.submissionId)}/question-grades`,
        payload,
      );

      const responsePayload = response?.data || {};
      const updatedGradeData = applyGradeResponse(responsePayload);
      const updatedSummary = updatedGradeData.gradeSummary;
      if (updatedSummary) setGradeSummary(updatedSummary);
      if (updatedGradeData.items.length > 0) setItems(updatedGradeData.items);

      await refetchCurriculumGradeQueries({
        refetchTeacherStudentDetail: async () => loadStudentDetail(username),
      });
      setGradeModalItem(null);
    } catch (requestError) {
      if (requestError?.response?.status === 422) {
        setGradeError(mapValidationMessage(requestError?.response?.data?.message));
      } else if (requestError?.response?.status === 403) {
        router.replace('/not-authorized');
      } else {
        setGradeError(getApiErrorMessage(requestError, 'Unable to submit grade.'));
      }
    } finally {
      setGradeLoading(false);
    }
  };

  const openTradesModal = async () => {
    if (!username || !competitionId || !studentId) return;
    setShowTrades(true);
    setTradesLoading(true);
    setTradesError('');

    try {
      const tradesUrls = buildStudentTradesUrls(BASE_URL, competitionId, studentId);
      let response = null;

      for (const tradesUrl of tradesUrls) {
        try {
          response = await axios.get(tradesUrl, { params: { username } });
          break;
        } catch (candidateError) {
          const status = candidateError?.response?.status;
          if (status === 404) continue;
          throw candidateError;
        }
      }

      if (!response) {
        setTrades([]);
        return;
      }

      const rows = Array.isArray(response?.data) ? response.data : (response?.data?.trades || []);
      setTrades(rows);
    } catch (requestError) {
      if (requestError?.response?.status === 403) {
        router.replace('/not-authorized');
        return;
      }
      setTradesError(getApiErrorMessage(requestError, 'Unable to load trade blotter.'));
    } finally {
      setTradesLoading(false);
    }
  };

  return (
    <div className="dashboard-container">
      <div className="card section">
        <h2>Student Detail</h2>
        <p className="note">
          {competitionId ? (
            <Link href={`/teacher/${encodeURIComponent(competitionId)}/roster`}>← Back to roster</Link>
          ) : '← Back to roster'}
        </p>

        {loading ? <p className="note">Loading student detail...</p> : null}
        {error ? <p className="note">{error}</p> : null}

        {!loading && !error ? (
          <>
            <h3>{student?.displayName || `Student ${studentId}`}</h3>
            <p className="note">{student?.email || 'No email available'}</p>

            <div className="section teacher-student-summary-card">
              <h3 style={{ marginBottom: 12 }}>Grade Summary</h3>
              <div className="teacher-student-metrics-grid">
                <div className="teacher-student-metric">
                  <p className="note teacher-student-metric-label">Percentage</p>
                  <p className="teacher-student-metric-value">{asPercent(gradeSummary?.percentage, { pointsPossible: gradeSummary?.totalPointsPossible ?? gradeSummary?.total_points_possible })}</p>
                </div>
                <div className="teacher-student-metric">
                  <p className="note teacher-student-metric-label">Letter</p>
                  <p className="teacher-student-metric-value">{asLetter(gradeSummary?.letterGrade ?? gradeSummary?.letter_grade, { percentage: gradeSummary?.percentage, pointsPossible: gradeSummary?.totalPointsPossible ?? gradeSummary?.total_points_possible })}</p>
                </div>
                <div className="teacher-student-metric">
                  <p className="note teacher-student-metric-label">Points</p>
                  <p className="teacher-student-metric-value">{asPoints(gradeSummary?.totalPointsEarned ?? gradeSummary?.total_points_earned, gradeSummary?.totalPointsPossible ?? gradeSummary?.total_points_possible)}</p>
                </div>
                <div className="teacher-student-metric">
                  <p className="note teacher-student-metric-label">Completed</p>
                  <p className="teacher-student-metric-value">
                    {gradeSummary?.completedCurriculumItems ?? gradeSummary?.completed_items ?? 0}/{gradeSummary?.totalCurriculumItems ?? gradeSummary?.total_items ?? 0}
                  </p>
                </div>
                <div className="teacher-student-metric">
                  <p className="note teacher-student-metric-label">Progress</p>
                  <p className="teacher-student-metric-value">
                    {Math.round(resolveProgressPercentage({
                      progressPercentage: gradeSummary?.progressPercentage ?? gradeSummary?.progress_percentage,
                      completedItems: gradeSummary?.completedCurriculumItems ?? gradeSummary?.completed_items,
                      totalItems: gradeSummary?.totalCurriculumItems ?? gradeSummary?.total_items,
                    }))}%
                  </p>
                </div>
              </div>
            </div>
            <div className="section" style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button type="button" onClick={openTradesModal}>View Trade Blotter</button>
            </div>

            {(() => {
              const groups = groupItemsByStatus(items);
              return SECTION_ORDER.map((sectionKey) => {
                const sectionItems = groups[sectionKey];
                if (sectionItems.length === 0) return null;
                const meta = SECTION_META[sectionKey];
                return (
                  <details
                    key={sectionKey}
                    className="teacher-student-section"
                    open={meta.defaultOpen || undefined}
                  >
                    <summary className="teacher-student-section-summary">
                      {meta.label} <span className="note">({sectionItems.length})</span>
                    </summary>
                    {sectionKey === 'not_submitted' ? (
                      <ul className="teacher-student-notsubmitted-list">
                        {sectionItems.map((item) => (
                          <li
                            key={`${item.assignmentId}-${item.moduleId}`}
                            className="teacher-student-notsubmitted-item"
                          >
                            <span className="teacher-student-week-badge">
                              {Number.isFinite(Number(item.moduleWeek)) ? `W${item.moduleWeek}` : '—'}
                            </span>
                            <span className="teacher-student-notsubmitted-title">
                              {item.title || 'Untitled'}
                              {item.moduleTitle ? (
                                <span className="note"> · {item.moduleTitle}</span>
                              ) : null}
                              {item.assignmentType ? (
                                <span className="note"> · {item.assignmentType}</span>
                              ) : null}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div className="teacher-student-rows">
                        {sectionItems.map((item) => (
                          <SubmissionRow
                            key={`${item.assignmentId}-${item.moduleId}`}
                            item={item}
                            onOpenGradeModal={openGradeModal}
                          />
                        ))}
                      </div>
                    )}
                  </details>
                );
              });
            })()}
          </>
        ) : null}
      </div>

      {gradeModalItem ? (
        <div className="modal-overlay">
          <div className="card" style={{ maxWidth: 560 }}>
            <h3>Manual Grade: {gradeModalItem.title}</h3>
            <p className="note">Submission is marked graded as soon as at least one question grade is saved.</p>
            <div style={{ display: 'grid', gap: 10 }}>
              {gradeForm.grades.map((grade, index) => (
                <div key={`${grade.questionId}-${index}`} style={{ border: '1px solid #d7dde2', borderRadius: 8, padding: 8 }}>
                  <p className="note" style={{ marginTop: 0 }}><strong>{grade.questionId}</strong></p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(120px, 1fr))', gap: 8 }}>
                    <div>
                      <label>Points Awarded</label>
                      <input type="number" min="0" value={grade.pointsAwarded ?? ''} onChange={(event) => updateQuestionGrade(index, 'pointsAwarded', event.target.value)} />
                    </div>
                    <div>
                      <label>Points Possible</label>
                      <input type="number" min="0" value={grade.pointsPossible ?? ''} onChange={(event) => updateQuestionGrade(index, 'pointsPossible', event.target.value)} />
                    </div>
                  </div>
                  <label>Question Feedback (optional)</label>
                  <textarea rows={2} style={{ width: '100%' }} value={grade.feedback || ''} onChange={(event) => updateQuestionGrade(index, 'feedback', event.target.value)} />
                </div>
              ))}
            </div>
            <label>Overall Feedback</label>
            <textarea rows={3} style={{ width: '100%' }} value={gradeForm.finalFeedback} onChange={(event) => setGradeForm((prev) => ({ ...prev, finalFeedback: event.target.value }))} />
            <label>Rubric Notes</label>
            <textarea rows={2} style={{ width: '100%' }} value={gradeForm.rubricNotes} onChange={(event) => setGradeForm((prev) => ({ ...prev, rubricNotes: event.target.value }))} />
            {gradeError ? <p className="note">{gradeError}</p> : null}
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button type="button" onClick={handleSubmitGrade} disabled={gradeLoading}>{gradeLoading ? 'Saving...' : 'Submit Grade'}</button>
              <button type="button" onClick={() => setGradeModalItem(null)} disabled={gradeLoading}>Cancel</button>
            </div>
          </div>
        </div>
      ) : null}

      {showTrades ? (
        <div className="modal-overlay">
          <div className="card" style={{ maxWidth: 900, width: '95%' }}>
            <h3>Student Trade Blotter</h3>
            {tradesLoading ? <p className="note">Loading trades...</p> : null}
            {tradesError ? <p className="note">{tradesError}</p> : null}
            {!tradesLoading && !tradesError ? (
              <div style={{ overflowX: 'auto' }}>
                <table>
                  <thead>
                    <tr>
                      <th>timestamp</th>
                      <th>symbol</th>
                      <th>side</th>
                      <th>quantity</th>
                      <th>price</th>
                      <th>orderType</th>
                      <th>status</th>
                      <th>accountName</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trades.map((trade) => (
                      <tr key={trade.tradeId}>
                        <td>{trade.timestamp}</td>
                        <td>{trade.symbol}</td>
                        <td>{trade.side}</td>
                        <td>{trade.quantity}</td>
                        <td>{trade.price}</td>
                        <td>{trade.orderType}</td>
                        <td>{trade.status}</td>
                        <td>{trade.accountName}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
            <div style={{ marginTop: 12 }}>
              <button type="button" onClick={() => setShowTrades(false)}>Close</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
