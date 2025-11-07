import { useEffect, useState } from 'react';
import axios from 'axios';

export default function Leaderboard({ competitionCode, variant = 'competition' }) {
  // variant can be "competition" or "team"
  const [leaderboard, setLeaderboard] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true); // ✅ NEW loading state

  useEffect(() => {
    const fetchLeaderboard = async () => {
      try {
        setLoading(true); // ✅ Start loading
        const backendUrl = 'https://stock-simulator-backend.onrender.com';
        if (!competitionCode) {
          setError('Please select a competition account.');
          setLoading(false);
          return;
        }

        // Use different endpoints based on the variant.
        const url =
          variant === 'team'
            ? `${backendUrl}/competition/${competitionCode}/team_leaderboard`
            : `${backendUrl}/competition/${competitionCode}/leaderboard`;

        console.log('Fetching leaderboard from:', url);
        const res = await axios.get(url);
        setLeaderboard(res.data || []);
        setError(null);
      } catch (error) {
        console.error('Failed to load leaderboard:', error);
        setError('Failed to load leaderboard. Please try again.');
      } finally {
        setLoading(false); // ✅ End loading
      }
    };

    fetchLeaderboard();
  }, [competitionCode, variant]);

  return (
    <div>
      <h2>{variant === 'team' ? 'Team Leaderboard' : 'Competition Leaderboard'}</h2>

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

      {!loading && !error && leaderboard.length > 0 && (
        <ul>
          {leaderboard.map((entry, index) => (
            <li key={index}>
              {index + 1}. {entry.name} - ${Number(entry.total_value || 0).toFixed(2)}
            </li>
          ))}
        </ul>
      )}

      {!loading && !error && leaderboard.length === 0 && (
        <p>No leaderboard data available.</p>
      )}
    </div>
  );
}
