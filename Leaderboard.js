import { useEffect, useState } from 'react';
import axios from 'axios';

export default function Leaderboard() {
  const [leaderboard, setLeaderboard] = useState([]);

  useEffect(() => {
    const fetchLeaderboard = async () => {
      const res = await axios.get('http://127.0.0.1:5000/leaderboard');
      setLeaderboard(res.data);
    };

    fetchLeaderboard();
  }, []);

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
