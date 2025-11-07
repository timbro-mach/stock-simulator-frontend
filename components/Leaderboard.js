import { useEffect, useState } from 'react';
import axios from 'axios';

export default function Leaderboard({ competitionCode, variant = 'competition' }) {
  const [leaderboard, setLeaderboard] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [displayLimit, setDisplayLimit] = useState(10); // ✅ New state for pagination

  useEffect(() => {
    const fetchLeaderboard = async () => {
      try {
        setLoading(true);
        const backendUrl = 'https://stock-simulator-backend.onrender.com';
        if (!competitionCode) {
          setError('Please select a competition account.');
          setLoading(false);
          return;
        }

        const url =
          variant === 'team'
            ? `${backendUrl}/competition/${competitionCode}/team_leaderboard`
            : `${backendUrl}/competition/${competitionCode}/leaderboard`;

        const res = await axios.get(url);
        setLeaderboard(res.data || []);
        setError(null);
      } catch (error) {
        console.error('Failed to load leaderboard:', error);
        setError('Failed to load leaderboard. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    fetchLeaderboard();
  }, [competitionCode, variant]);

  // ✅ Handle visible subset based on button choice
  const visibleLeaderboard =
    displayLimit === 'all' ? leaderboard : leaderboard.slice(0, displayLimit);

  return (
    <div>
      <h2>{variant === 'team' ? 'Team Leaderboard' : 'Competition Leaderboard'}</h2>

      {/* Pagination buttons */}
      {!loading && leaderboard.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <button
            onClick={() => setDisplayLimit(10)}
            style={{
              marginRight: 6,
              background: displayLimit === 10 ? '#2563eb' : '#f3f4f6',
              color: displayLimit === 10 ? '#fff' : '#111827',
              border: 'none',
              padding: '4px 10px',
              borderRadius: 6,
              cursor: 'pointer',
              fontSize: 13,
            }}
          >
            Top 10
          </button>
          <button
            onClick={() => setDisplayLimit(25)}
            style={{
              marginRight: 6,
              background: displayLimit === 25 ? '#2563eb' : '#f3f4f6',
              color: displayLimit === 25 ? '#fff' : '#111827',
              border: 'none',
              padding: '4px 10px',
              borderRadius: 6,
              cursor: 'pointer',
              fontSize: 13,
            }}
          >
            Top 25
          </button>
          <button
            onClick={() => setDisplayLimit('all')}
            style={{
              background: displayLimit === 'all' ? '#2563eb' : '#f3f4f6',
              color: displayLimit === 'all' ? '#fff' : '#111827',
              border: 'none',
              padding: '4px 10px',
              borderRadius: 6,
              cursor: 'pointer',
              fontSize: 13,
            }}
          >
            Show All
          </button>
        </div>
      )}

      {/* ✅ Loading animation */}
      {loading && (
        <p style={{ color: '#6b7280', fontStyle: 'italic' }}>
          <span className="blink">Loading leaderboard...</span>
          <style>{`
            .blink {
              animation: blink 1.2s linear infinite;
            }
            @keyframes blink {
              0%, 100% { opacity: 0; }
              50% { opacity: 1; }
            }
          `}</style>
        </p>
      )}

      {!loading && error && <p style={{ color: 'red' }}>{error}</p>}

      {!loading && !error && visibleLeaderboard.length > 0 && (
        <ul>
          {visibleLeaderboard.map((entry, index) => (
            <li key={index}>
              {index + 1}. {entry.name} - ${Number(entry.total_value || 0).toFixed(2)}
            </li>
          ))}
        </ul>
      )}

      {!loading && !error && visibleLeaderboard.length === 0 && (
        <p>No leaderboard data available.</p>
      )}
    </div>
  );
}
