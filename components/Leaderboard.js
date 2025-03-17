import React, { useState, useEffect } from 'react';
import axios from 'axios';

const Leaderboard = () => {
  const [leaderboard, setLeaderboard] = useState([]);
  const currentUser = localStorage.getItem('username') || '';

  useEffect(() => {
    const fetchLeaderboard = async () => {
      try {
        const response = await axios.get('http://127.0.0.1:5000/leaderboard');
        setLeaderboard(response.data);
      } catch (error) {
        console.error('Failed to load leaderboard:', error);
      }
    };

    fetchLeaderboard();
  }, []);

  return (
    <div>
      <h2>Leaderboard</h2>
      <ol>
        {leaderboard.map((player, index) => (
          <li
            key={index}
            style={{ fontWeight: player.username === currentUser ? 'bold' : 'normal' }}
          >
            {index + 1}. {player.username} - ${Number(player.total_value || 0).toFixed(2)}
          </li>
        ))}
      </ol>
    </div>
  );
};

export default Leaderboard;
