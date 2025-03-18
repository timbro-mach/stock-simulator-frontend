import { useEffect, useState } from 'react';
import axios from 'axios';

export default function Leaderboard({ competitionCode }) {
  const [leaderboard, setLeaderboard] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchLeaderboard = async () => {
      try {
        const backendUrl = 'https://stock-simulator-backend.onrender.com';

        // Check for username in localStorage for global leaderboard
        const username = localStorage.getItem('username');
        if (!competitionCode && !username) {
          setError('No username found. Please log in.');
          return;
        }

        const url = competitionCode
          ? `${backendUrl}/competition/${competitionCode}/leaderboard`
          : `${backendUrl}/global_leaderboard?username=${username}`;

        console.log('Fetching leaderboard from:', url); // For debugging

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
          {leaderboard.map((player, index) => (
            <li key={index}>
              {index + 1}. {player.username} - ${Number(player.total_value || 0).toFixed(2)}
            </li>
          ))}
        </ul>
      ) : (
        !error && <p>No leaderboard data available.</p>
      )}
    </div>
  );
}
