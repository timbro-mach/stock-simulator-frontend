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
        start_date: startDate,
        end_date: endDate,
        featured: isFeatured,
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
        competition_code: teamJoinCode.competition_code,
        team_code: teamJoinCode.team_code,
      });
      setMessage(response.data.message);
    } catch (error) {
      setMessage('Error joining competition as team');
      console.error(error);
    }
  };

  const handleTeamJoinInputChange = (e) => {
    const { name, value } = e.target;
    setTeamJoinCode((prev) => ({ ...prev, [name]: value }));
  };

  return (
    <div className="wrap">
      <h1>🏁 Group Competitions</h1>
      <p className="sub">
        Create or join competitions to test your trading strategies against others.
      </p>

      {/* --- Admin Create Competition --- */}
      <div className="card">
        <h2>🧭 Create Competition (Admin)</h2>
        <p className="note">Admins can create and optionally feature competitions.</p>

        <input
          type="text"
          placeholder="Competition Name (optional)"
          value={competitionName}
          onChange={(e) => setCompetitionName(e.target.value)}
        />

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginTop: '10px' }}>
          <div>
            <label>Start Date:</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div>
            <label>End Date:</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <label>Feature Competition:</label>
            <input
              type="checkbox"
              checked={isFeatured}
              onChange={(e) => setIsFeatured(e.target.checked)}
            />
          </div>
        </div>

        <button onClick={createCompetition}>Create Competition</button>

        {competitionCode && (
          <p className="note">
            ✅ Your Competition Code: <strong>{competitionCode}</strong>
          </p>
        )}
      </div>

      {/* --- Join Competition (Individual) --- */}
      <div className="card">
        <h2>👤 Join Competition (Individual)</h2>
        <p className="note">Enter the competition code shared by an admin.</p>
        <input
          type="text"
          placeholder="Enter Competition Code"
          value={joinCode}
          onChange={(e) => setJoinCode(e.target.value)}
        />
        <button onClick={joinCompetition}>Join Competition</button>
      </div>

      {/* --- Join Competition (Team) --- */}
      <div className="card">
        <h2>👥 Join Competition (As Team)</h2>
        <p className="note">Join as a team using your unique team code.</p>
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

      {message && (
        <div className="card" style={{ background: '#f9fafb' }}>
          <p className="note">{message}</p>
        </div>
      )}
    </div>
  );
};

export default Competition;
