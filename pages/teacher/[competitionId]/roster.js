import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import axios from 'axios';
import { getApiBaseUrl } from '../../../lib/api';
import { asPercent, getStoredUsername } from '../../../lib/teacherDashboard';

const mapRosterError = (status) => {
  if (status === 401) return 'Please sign in';
  if (status === 403) return 'Instructor access required';
  if (status === 404) return 'Competition not found / curriculum not enabled';
  return 'Unable to load roster.';
};

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
        const response = await axios.get(
          `${BASE_URL}/curriculum/competition/${encodeURIComponent(competitionId)}/teacher/roster`,
          { params: { username } },
        );
        setRows(Array.isArray(response?.data) ? response.data : (response?.data?.students || []));
      } catch (requestError) {
        const status = requestError?.response?.status;
        if (status === 403) {
          router.replace('/not-authorized');
          return;
        }
        setError(mapRosterError(status));
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
                  <th>Completed quizzes</th>
                  <th>Completed assignments</th>
                  <th>Total items</th>
                  <th>Trades</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.userId}
                    style={{ cursor: 'pointer' }}
                    onClick={() => router.push(`/teacher/${encodeURIComponent(competitionId)}/students/${encodeURIComponent(row.userId)}`)}
                  >
                    <td>{row.displayName || `Student ${row.userId}`}</td>
                    <td>{row.email || '—'}</td>
                    <td>{asPercent(row.curriculumPercentage)}</td>
                    <td>{row.letterGrade || '—'}</td>
                    <td>{Number(row.totalPointsEarned || 0)}/{Number(row.totalPointsPossible || 0)}</td>
                    <td>{row.completedQuizzes ?? 0}</td>
                    <td>{row.completedAssignments ?? 0}</td>
                    <td>{row.totalCurriculumItems ?? 0}</td>
                    <td>{row.hasTrades ? `Yes (${row.tradeCount ?? 0})` : 'No'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </div>
  );
}
