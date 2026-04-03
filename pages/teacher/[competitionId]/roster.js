import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import axios from 'axios';
import { getApiBaseUrl, getApiErrorMessage } from '../../../lib/api';
import { asLetter, asPercent, asPoints, getStoredUsername } from '../../../lib/teacherDashboard';
import { resolveGradeSummaryOverall, resolveProgressPercentage } from '../../../lib/curriculum/grades';

const buildRosterUrls = (baseUrl, competitionId) => {
  const encodedId = encodeURIComponent(competitionId);
  return [
    `${baseUrl}/curriculum/competition/${encodedId}/instructor/roster`,
    `${baseUrl}/curriculum/competition/${encodedId}/teacher/roster`,
  ];
};

const mapRosterError = (status) => {
  if (status === 401) return 'Please sign in';
  if (status === 403) return 'Instructor access required';
  if (status === 404) return 'Competition not found / curriculum not enabled';
  return 'Unable to load roster.';
};

const parseRosterResponse = (payload) => {
  if (Array.isArray(payload)) {
    return {
      rows: payload,
      isInstructor: true,
    };
  }

  const source = payload && typeof payload === 'object' ? payload : {};
  const rows = Array.isArray(source.roster)
    ? source.roster
    : Array.isArray(source.students)
      ? source.students
      : [];

  return {
    rows,
    isInstructor: source.is_instructor_for_competition ?? source.isInstructorForCompetition ?? true,
  };
};

const resolveRosterSummary = (row) => resolveGradeSummaryOverall({
  gradeSummaryOverall: row?.gradeSummaryOverall ?? row?.grade_summary_overall,
  gradeSummary: row?.gradeSummary ?? row?.grade_summary,
  percentage: row?.curriculumPercentage,
  letterGrade: row?.letterGrade ?? row?.letter_grade,
  totalPointsEarned: row?.totalPointsEarned ?? row?.total_points_earned,
  totalPointsPossible: row?.totalPointsPossible ?? row?.total_points_possible,
  completedCurriculumItems: row?.completedCurriculumItems ?? row?.completed_curriculum_items,
  totalCurriculumItems: row?.totalCurriculumItems ?? row?.total_curriculum_items,
  progressPercentage: row?.progressPercentage ?? row?.progress_percentage,
});

export default function TeacherRosterPage() {
  const router = useRouter();
  const { competitionId } = router.query;
  const BASE_URL = useMemo(() => getApiBaseUrl(), []);

  const [username, setUsername] = useState('');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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
    if (!competitionId || !username) return;

    const fetchRoster = async () => {
      setLoading(true);
      setError('');
      try {
        const rosterUrls = buildRosterUrls(BASE_URL, competitionId);
        let response = null;

        for (const rosterUrl of rosterUrls) {
          try {
            response = await axios.get(rosterUrl, { params: { username } });
            break;
          } catch (candidateError) {
            const status = candidateError?.response?.status;
            if (status === 404) continue;
            throw candidateError;
          }
        }

        if (!response) {
          setRows([]);
          setError(mapRosterError(404));
          return;
        }

        const parsed = parseRosterResponse(response?.data);
        if (!parsed.isInstructor) {
          router.replace('/not-authorized');
          return;
        }
        setRows(parsed.rows);
      } catch (requestError) {
        const status = requestError?.response?.status;
        if (status === 403) {
          router.replace('/not-authorized');
          return;
        }
        setError(getApiErrorMessage(requestError, mapRosterError(status)));
      } finally {
        setLoading(false);
      }
    };

    fetchRoster();
  }, [BASE_URL, competitionId, router, username]);

  return (
    <div className="dashboard-container">
      <div className="card section">
        <h2>Teacher Dashboard: Roster</h2>
        <p className="note">Competition ID: <strong>{competitionId || '-'}</strong></p>
        <p className="note">
          <Link href="/dashboard">← Back to Dashboard</Link>
        </p>

        {loading ? <p className="note">Loading roster...</p> : null}
        {error ? <p className="note">{error}</p> : null}

        {!loading && !error ? (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Student name</th>
                  <th>Email</th>
                  <th>Grade %</th>
                  <th>Letter</th>
                  <th>Points</th>
                  <th>Completed</th>
                  <th>Progress</th>
                  <th>Trades</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const rowSummary = resolveRosterSummary(row);
                  const completedCurriculumItems = rowSummary?.completedCurriculumItems ?? rowSummary?.completed_items ?? 0;
                  const totalCurriculumItems = rowSummary?.totalCurriculumItems ?? rowSummary?.total_items ?? 0;
                  const progressPercentage = resolveProgressPercentage({
                    progressPercentage: rowSummary?.progressPercentage ?? rowSummary?.progress_percentage,
                    completedItems: completedCurriculumItems,
                    totalItems: totalCurriculumItems,
                  });
                  return (
                  <tr
                    key={row.userId}
                    style={{ cursor: 'pointer' }}
                    onClick={() => router.push(`/teacher/${encodeURIComponent(competitionId)}/students/${encodeURIComponent(row.userId)}`)}
                  >
                    <td>{row.displayName || `Student ${row.userId}`}</td>
                    <td>{row.email || '—'}</td>
                    <td>{asPercent(rowSummary?.percentage, { pointsPossible: rowSummary?.totalPointsPossible ?? rowSummary?.total_points_possible })}</td>
                    <td>{asLetter(rowSummary?.letterGrade ?? rowSummary?.letter_grade, { percentage: rowSummary?.percentage, pointsPossible: rowSummary?.totalPointsPossible ?? rowSummary?.total_points_possible })}</td>
                    <td>{asPoints(rowSummary?.totalPointsEarned ?? rowSummary?.total_points_earned, rowSummary?.totalPointsPossible ?? rowSummary?.total_points_possible)}</td>
                    <td>{completedCurriculumItems}/{totalCurriculumItems}</td>
                    <td>{Math.round(progressPercentage)}%</td>
                    <td>{row.hasTrades ? `Yes (${row.tradeCount ?? 0})` : 'No'}</td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </div>
  );
}
