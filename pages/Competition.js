import React, { useState, useEffect } from 'react';
import axios from 'axios';

const Competition = () => {
  const [competitionName, setCompetitionName] = useState('');
  const [competitionCode, setCompetitionCode] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [message, setMessage] = useState('');
  const [username, setUsername] = useState('');

  // Set the backend base URL
  const BASE_URL = 'https://stock-simulator-backend.onrender.com';

  useEffect(() => {
    // Ensure this only runs on the client side (to avoid SSR issues)
    if (typeof window !== 'undefined') {
      const storedUsername = localStorage.getItem('username') || '';
      setUsername(storedUsername);
    }
  }, []);

  const createCompetition = async () => {
    try {
      const response = await axios.post(`${BASE_URL}/competition/create`, {
        username,
        name: competitionName
      });
      setCompetitionCode(response.data.competition_code);
      setMessage(response.data.message);
    } catch (error) {
      setMessage('Error creating competition');
      console.error(error);
    }
  };

  const joinCompetition = async () => {
    try {
      const response = await axios.post(`${BASE_URL}/competition/join`, {
        username,
        competition_code: joinCode
      });
      setMessage(response.data.message);
    } catch (error) {
      setMessage('Error joining competition');
      console.error(error);
    }
  };

  return (
    <div className="competition-container">
      <h2>Group Competitions</h2>
      <div>
        <h3>Create Competition</h3>
        <input
          type="text"
          placeholder="Competition Name (optional)"
          value={competitionName}
          onChange={(e) => setCompetitionName(e.target.value)}
        />
        <button onClick={createCompetition}>Create Competition</button>
        {competitionCode && <p>Your Competition Code: {competitionCode}</p>}
      </div>
      <div>
        <h3>Join Competition</h3>
        <input
          type="text"
          placeholder="Enter Competition Code"
          value={joinCode}
          onChange={(e) => setJoinCode(e.target.value)}
        />
        <button onClick={joinCompetition}>Join Competition</button>
      </div>
      {message && <p>{message}</p>}
    </div>
  );
};

export default Competition;
