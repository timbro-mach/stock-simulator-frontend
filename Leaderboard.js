import { useEffect, useState } from 'react';
import axios from 'axios';

export default function Leaderboard({ competitionCode }) {
  const [leaderboard, setLeaderboard] = useState([]);

  useEffect(() => {
    const fetchLeaderboard = async () => {
      try {
        // Use the competition-specific endpoint if competitionCode is provided
        const url = competitionCode
          ? `http://127.0.0.1:5000/competition/${competitionCode}/leaderboard`
          : `http://127.0.0.1:5000/global_leaderboard?username=${localStorage.getItem('username')}`;
        const res = await axios.get(url);
        setLeaderboard(res.data);
      } catch (error) {
        console.error('Failed to load leaderboard:', error);
      }
    };

    fetchLeaderboard();
  }, [competitionCode]);

  return (
    <div>
      <h2>Leaderboard</h2>
      <ul>
        {leaderboard.map((player, index) => (
          <li key={index}>
            {index + 1}. {player.username} - ${Number(player.total_value || 0).toFixed(2)}
          </li>
        ))}
      </ul>
    </div>
  );
}
