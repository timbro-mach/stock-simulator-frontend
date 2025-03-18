import { useEffect, useState } from 'react';
import axios from 'axios';

export default function Leaderboard({ competitionCode }) {
  const [leaderboard, setLeaderboard] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchLeaderboard = async () => {
      try {
        const backendUrl = 'https://stock-simulator-backend.onrender.com';
        const url = competitionCode
          ? `${backendUrl}/competition/${competitionCode}/leaderboard`
          : `${backendUrl}/global_leaderboard?username=${localStorage.getItem('username')}`;

        const res = await axios.get(url);
        setLeaderboard(res.data);
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
        <p>No leaderboard data available.</p>
      )}
    </div>
  );
}
