import { useEffect, useState } from 'react';
import axios from 'axios';

export default function Leaderboard({ competitionCode }) {
  const [leaderboard, setLeaderboard] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchLeaderboard = async () => {
      try {
        const backendUrl = 'https://stock-simulator-backend.onrender.com';

        if (!competitionCode) {
          setError('Please select a competition account to view the leaderboard.');
          return;
        }

        const url = `${backendUrl}/competition/${competitionCode}/leaderboard`;
        console.log('Fetching leaderboard from:', url);

        const res = await axios.get(url);
        setLeaderboard(res.data);
        setError(null);
      } catch (error) {
        console.error('Failed to load leaderboard:', error);
        setError('Failed to load leaderboard. Please try again.');
      }
    };

    fetchLeaderboard();
  }, [competitionCode]);

  return (
    <div>
      <h2>Leaderboard</h2>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      {leaderboard.length > 0 ? (
        <ul>
          {leaderboard.map((entry, index) => (
            <li key={index}>
              {index + 1}. {entry.name} - ${Number(entry.total_value || 0).toFixed(2)}
            </li>
          ))}
        </ul>
      ) : (
        !error && <p>No leaderboard data available.</p>
      )}
    </div>
  );
}
