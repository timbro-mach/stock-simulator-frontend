import { useEffect, useState } from 'react';
import axios from 'axios';

export default function Leaderboard({ competitionCode }) {
  const [leaderboard, setLeaderboard] = useState([]);
  const [error, setError] = useState(false);

  useEffect(() => {
    const fetchLeaderboard = async () => {
      try {
        setError(false); // Reset error state before fetching
        const url = competitionCode
          ? `https://your-render-backend-url.onrender.com/competition/${competitionCode}/leaderboard`
          : `https://your-render-backend-url.onrender.com/global_leaderboard?username=${localStorage.getItem('username')}`;

        const res = await axios.get(url);

        if (res.data && res.data.length > 0) {
          setLeaderboard(res.data);
        } else {
          setError(true); // Trigger error if leaderboard is empty
        }
      } catch (error) {
        console.error('Failed to load leaderboard:', error);
        setError(true);
      }
    };

    fetchLeaderboard();
  }, [competitionCode]);

  return (
    <div>
      <h2>Leaderboard</h2>
      {error && leaderboard.length === 0 ? (
        <p style={{ color: 'red' }}>Failed to load leaderboard. Please try again.</p>
      ) : (
        <ul>
          {leaderboard.map((player, index) => (
            <li key={index}>
              {index + 1}. {player.username} - ${Number(player.total_value || 0).toFixed(2)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
