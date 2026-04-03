import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import axios from 'axios';
import { getApiBaseUrl, getApiErrorMessage } from '../../../../lib/api';
import {
  asPercent,
  getStatusBadgeStyles,
  getStoredUsername,
  normalizeGradingStatus,
} from '../../../../lib/teacherDashboard';
import {
  resolveGradeSummaryByModule,
  resolveGradeSummaryOverall,
} from '../../../../lib/curriculum/grades';
import { applyGradeResponse, canShowManualGradeAction } from '../../../../lib/curriculum/teacherDetail';

const parseStudentResponse = (payload) => {
  const source = payload && typeof payload === 'object' ? payload : {};
  return {
    student: source.student || source.user || null,
    gradeSummary: resolveGradeSummaryOverall(source),
    gradeSummaryByModule: resolveGradeSummaryByModule(source),
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

export default function TeacherStudentDetailPage() {
  const router = useRouter();
  const { competitionId, studentId } = router.query;
  const BASE_URL = useMemo(() => getApiBaseUrl(), []);

  const [username, setUsername] = useState('');
  const [student, setStudent] = useState(null);
  const [gradeSummary, setGradeSummary] = useState(null);
  const [gradeSummaryByModule, setGradeSummaryByModule] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [gradeModalItem, setGradeModalItem] = useState(null);
  const [gradeForm, setGradeForm] = useState({ score: '', percentage: '', feedback: '', rubric_notes: '' });
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
      setGradeSummaryByModule(parsed.gradeSummaryByModule);
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
    setGradeModalItem(item);
    setGradeForm({
      score: item?.pointsEarned ?? '',
      percentage: item?.percentage ?? '',
      feedback: item?.feedback?.comment || '',
      rubric_notes: item?.rubricNotes || '',
    });
    setGradeError('');
  };

  const handleSubmitGrade = async () => {
    if (!gradeModalItem || !username) return;
    setGradeLoading(true);
    setGradeError('');

    try {
      const response = await axios.post(
        `${BASE_URL}/curriculum/submissions/${encodeURIComponent(gradeModalItem.submissionId)}/grade`,
        {
          username,
          score: Number(gradeForm.score),
          feedback: gradeForm.feedback,
          rubric_notes: gradeForm.rubric_notes,
          percentage: Number(gradeForm.percentage),
        },
      );

      const payload = response?.data || {};
      const updatedGradeData = applyGradeResponse(payload);
      const updatedSummary = updatedGradeData.gradeSummary;
      const updatedSummaryByModule = updatedGradeData.gradeSummaryByModule;
      if (updatedSummary) setGradeSummary(updatedSummary);
      if (updatedSummaryByModule.length > 0) setGradeSummaryByModule(updatedSummaryByModule);
      if (updatedGradeData.items.length > 0) setItems(updatedGradeData.items);

      await loadStudentDetail(username);
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

            <div className="section" style={{ border: '1px solid #d7dde2', borderRadius: 10, padding: 12 }}>
              <h3 style={{ marginBottom: 8 }}>Grade Summary</h3>
              <p className="note">Percentage: {asPercent(gradeSummary?.percentage)}</p>
              <p className="note">Letter: {gradeSummary?.letterGrade || gradeSummary?.letter_grade || '—'}</p>
              <p className="note">Points: {Number(gradeSummary?.totalPointsEarned || gradeSummary?.total_points_earned || 0)}/{Number(gradeSummary?.totalPointsPossible || gradeSummary?.total_points_possible || 0)}</p>
            </div>
            <div className="section" style={{ border: '1px solid #d7dde2', borderRadius: 10, padding: 12 }}>
              <h3 style={{ marginBottom: 8 }}>Per-Module Grade Breakdown</h3>
              {gradeSummaryByModule.length > 0 ? (
                <div style={{ overflowX: 'auto' }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Week</th>
                        <th>Module</th>
                        <th>Points</th>
                        <th>Percentage</th>
                        <th>Letter</th>
                      </tr>
                    </thead>
                    <tbody>
                      {gradeSummaryByModule.map((moduleSummary) => (
                        <tr key={`${moduleSummary.moduleId || moduleSummary.module_id}-${moduleSummary.weekNumber || moduleSummary.week_number}`}>
                          <td>{moduleSummary.weekNumber || moduleSummary.week_number || '—'}</td>
                          <td>{moduleSummary.moduleTitle || moduleSummary.module_title || '—'}</td>
                          <td>{Number(moduleSummary.totalPointsEarned || moduleSummary.total_points_earned || 0)}/{Number(moduleSummary.totalPointsPossible || moduleSummary.total_points_possible || 0)}</td>
                          <td>{asPercent(moduleSummary.percentage)}</td>
                          <td>{moduleSummary.letterGrade || moduleSummary.letter_grade || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <p className="note">No module summaries yet.</p>}
            </div>

            <div className="section" style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button type="button" onClick={openTradesModal}>View Trade Blotter</button>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th>Week</th>
                    <th>Module</th>
                    <th>Type</th>
                    <th>Title</th>
                    <th>Points</th>
                    <th>Percentage</th>
                    <th>Status</th>
                    <th>Submission</th>
                    <th>Feedback</th>
                    <th>Graded By</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => {
                    const status = normalizeGradingStatus(item.gradingStatus);
                    const canManualGrade = canShowManualGradeAction(item);
                    return (
                      <tr key={`${item.assignmentId}-${item.moduleId}`}>
                        <td>{item.moduleWeek}</td>
                        <td>{item.moduleTitle}</td>
                        <td>{item.assignmentType}</td>
                        <td>{item.title}</td>
                        <td>{Number(item.pointsEarned || 0)}/{Number(item.pointsPossible || 0)}</td>
                        <td>{asPercent(item.percentage)}</td>
                        <td>
                          <span className="pill" style={getStatusBadgeStyles(status)}>{status}</span>
                        </td>
                        <td>
                          <div className="note">{item.submittedAt || '—'}</div>
                          <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: 12 }}>{JSON.stringify(item.submissionContent || null, null, 2)}</pre>
                        </td>
                        <td>
                          <div className="note">{typeof item.feedback === 'string' ? item.feedback : JSON.stringify(item.feedback || {})}</div>
                          <div className="note">Rubric: {item.rubricNotes || '—'}</div>
                        </td>
                        <td>
                          <div className="note">{item.gradedByUsername || item.gradedByUserId || '—'}</div>
                          <div className="note">{item.gradedAt || '—'}</div>
                        </td>
                        <td>
                          {canManualGrade ? (
                            <button type="button" onClick={() => openGradeModal(item)}>Manual Grade</button>
                          ) : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        ) : null}
      </div>

      {gradeModalItem ? (
        <div className="modal-overlay">
          <div className="card" style={{ maxWidth: 560 }}>
            <h3>Manual Grade: {gradeModalItem.title}</h3>
            <label>Score</label>
            <input value={gradeForm.score} onChange={(event) => setGradeForm((prev) => ({ ...prev, score: event.target.value }))} />
            <label>Percentage</label>
            <input value={gradeForm.percentage} onChange={(event) => setGradeForm((prev) => ({ ...prev, percentage: event.target.value }))} />
            <label>Feedback</label>
            <input value={gradeForm.feedback} onChange={(event) => setGradeForm((prev) => ({ ...prev, feedback: event.target.value }))} />
            <label>Rubric Notes</label>
            <input value={gradeForm.rubric_notes} onChange={(event) => setGradeForm((prev) => ({ ...prev, rubric_notes: event.target.value }))} />
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
