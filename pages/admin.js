import React, { useState, useEffect } from 'react';
import axios from 'axios';

const AdminDashboard = () => {
  const [stats, setStats] = useState({});
  const [competitions, setCompetitions] = useState([]);
  const [users, setUsers] = useState([]);
  const [adminUsername, setAdminUsername] = useState('');

  const BASE_URL = 'https://stock-simulator-backend.onrender.com';

  useEffect(() => {
    const storedUsername = localStorage.getItem('username');
    setAdminUsername(storedUsername);
    fetchStats();
    fetchCompetitions();
    fetchUsers();
  }, []);

  const fetchStats = async () => {
    try {
      const response = await axios.get(`${BASE_URL}/admin/stats`);
      setStats(response.data);
    } catch (error) {
      console.error('Error fetching admin stats:', error);
    }
  };

  // Dummy fetch functions—you might need to create endpoints to list all competitions and users.
  const fetchCompetitions = async () => {
    try {
      const response = await axios.get(`${BASE_URL}/competitions`); // You'll need to implement this endpoint or modify as needed
      setCompetitions(response.data);
    } catch (error) {
      console.error('Error fetching competitions:', error);
    }
  };

  const fetchUsers = async () => {
    try {
      const response = await axios.get(`${BASE_URL}/users`); // You'll need to implement this endpoint or modify as needed
      setUsers(response.data);
    } catch (error) {
      console.error('Error fetching users:', error);
    }
  };

  const handleDeleteCompetition = async (code) => {
    try {
      await axios.post(`${BASE_URL}/admin/delete_competition`, {
        username: adminUsername,
        competition_code: code,
      });
      fetchStats();
      fetchCompetitions();
    } catch (error) {
      console.error('Error deleting competition:', error);
    }
  };

  const handleUnfeatureCompetition = async (code) => {
    try {
      await axios.post(`${BASE_URL}/admin/unfeature_competition`, {
        username: adminUsername,
        competition_code: code,
      });
      fetchCompetitions();
    } catch (error) {
      console.error('Error unfeaturing competition:', error);
    }
  };

  const handleDeleteUser = async (targetUsername) => {
    try {
      await axios.post(`${BASE_URL}/admin/delete_user`, {
        username: adminUsername,
        target_username: targetUsername,
      });
      fetchStats();
      fetchUsers();
    } catch (error) {
      console.error('Error deleting user:', error);
    }
  };

  return (
    <div className="admin-dashboard">
      <h1>Admin Dashboard</h1>
      <section className="stats">
        <p>Total Users: {stats.total_users}</p>
        <p>Total Competitions: {stats.total_competitions}</p>
      </section>
      <section className="competitions">
        <h2>Competitions</h2>
        {competitions.map((comp) => (
          <div key={comp.code} style={{ border: '1px solid #ccc', marginBottom: '10px', padding: '10px' }}>
            <p>{comp.name} (Code: {comp.code})</p>
            <p>Featured: {comp.featured ? 'Yes' : 'No'}</p>
            <button onClick={() => handleDeleteCompetition(comp.code)}>Delete</button>
            {comp.featured && <button onClick={() => handleUnfeatureCompetition(comp.code)}>Unfeature</button>}
          </div>
        ))}
      </section>
      <section className="users">
        <h2>Users</h2>
        {users.map((user) => (
          <div key={user.id} style={{ border: '1px solid #ccc', marginBottom: '10px', padding: '10px' }}>
            <p>{user.username}</p>
            <button onClick={() => handleDeleteUser(user.username)}>Delete User</button>
          </div>
        ))}
      </section>
    </div>
  );
};

export default AdminDashboard;
