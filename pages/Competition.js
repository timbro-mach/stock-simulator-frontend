import React, { useState, useEffect } from 'react';
import axios from 'axios';

const Competition = () => {
  const [competitionName, setCompetitionName] = useState('');
  const [competitionCode, setCompetitionCode] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [teamJoinCode, setTeamJoinCode] = useState({});
  const [message, setMessage] = useState('');
  const [username, setUsername] = useState('');

  // New state variables for competition dates and featured flag (admin use)
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [isFeatured, setIsFeatured] = useState(false);

  // Set the backend base URL
  const BASE_URL = 'https://stock-simulator-backend.onrender.com';

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const storedUsername = localStorage.getItem('username') || '';
      setUsername(storedUsername);
    }
  }, []);

  const createCompetition = async () => {
    try {
      const response = await axios.post(`${BASE_URL}/competition/create`, {
        username,
        competition_name: competitionName,
        start_date: startDate,     // New field
        end_date: endDate,         // New field
        featured: isFeatured,      // New field
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
        competition_code: joinCode,
      });
      setMessage(response.data.message);
    } catch (error) {
      setMessage('Error joining competition as individual');
      console.error(error);
    }
  };

  const joinCompetitionAsTeam = async () => {
    try {
      const response = await axios.post(`${BASE_URL}/competition/team/join`, {
        username,
        competition_code: teamJoinCode.competition_code, // competition code to join
        team_code: teamJoinCode.team_code,              // team code from your team account
      });
      setMessage(response.data.message);
    } catch (error) {
      setMessage('Error joining competition as team');
      console.error(error);
    }
  };

  // For team join input, we use an object with competition_code and team_code fields.
  const handleTeamJoinInputChange = (e) => {
    const { name, value } = e.target;
    setTeamJoinCode(prev => ({ ...prev, [name]: value }));
  };

  return (
    <div className="competition-container">
      <h2>Group Competitions</h2>
      <div>
        <h3>Create Competition (Admin)</h3>
        <input
          type="text"
          placeholder="Competition Name (optional)"
          value={competitionName}
          onChange={(e) => setCompetitionName(e.target.value)}
        />
        <div>
          <label>
            Start Date:
            <input 
              type="date" 
              value={startDate} 
              onChange={(e) => setStartDate(e.target.value)} 
            />
          </label>
          <label>
            End Date:
            <input 
              type="date" 
              value={endDate} 
              onChange={(e) => setEndDate(e.target.value)} 
            />
          </label>
          <label>
            Feature Competition:
            <input 
              type="checkbox" 
              checked={isFeatured} 
              onChange={(e) => setIsFeatured(e.target.checked)} 
            />
          </label>
        </div>
        <button onClick={createCompetition}>Create Competition</button>
        {competitionCode && <p>Your Competition Code: {competitionCode}</p>}
      </div>
      <div>
        <h3>Join Competition (Individual)</h3>
        <input
          type="text"
          placeholder="Enter Competition Code"
          value={joinCode}
          onChange={(e) => setJoinCode(e.target.value)}
        />
        <button onClick={joinCompetition}>Join Competition</button>
      </div>
      <div>
        <h3>Join Competition (As Team)</h3>
        <input
          type="text"
          placeholder="Enter Competition Code"
          name="competition_code"
          value={teamJoinCode.competition_code || ''}
          onChange={handleTeamJoinInputChange}
        />
        <input
          type="text"
          placeholder="Enter Your Team Code"
          name="team_code"
          value={teamJoinCode.team_code || ''}
          onChange={handleTeamJoinInputChange}
        />
        <button onClick={joinCompetitionAsTeam}>Join Competition as Team</button>
      </div>
      {message && <p>{message}</p>}
    </div>
  );
};

export default Competition;
