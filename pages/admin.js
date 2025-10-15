import React, { useState, useEffect } from "react";
import axios from "axios";

const BASE_URL = "https://stock-simulator-backend.onrender.com";

const AdminDashboard = () => {
  const [adminUsername, setAdminUsername] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [stats, setStats] = useState({});
  const [competitions, setCompetitions] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // -------------------------------
  // Load admin info from localStorage and validate
  // -------------------------------
  useEffect(() => {
    const storedUsername = localStorage.getItem("username");
    setAdminUsername(storedUsername || "");
    if (storedUsername) {
      validateAdmin(storedUsername);
    }
  }, []);

  const validateAdmin = async (username) => {
    try {
      const res = await axios.get(`${BASE_URL}/user?username=${username}`);
      if (res.data.is_admin) {
        setIsAdmin(true);
        await Promise.all([fetchStats(), fetchCompetitions(), fetchUsers(username)]);
      } else {
        setError("Access denied: You are not an admin.");
      }
    } catch (err) {
      console.error("Error validating admin:", err);
      setError("Error validating admin credentials.");
    } finally {
      setLoading(false);
    }
  };

  // -------------------------------
  // API Fetches
  // -------------------------------
  const fetchStats = async () => {
    try {
      const response = await axios.get(`${BASE_URL}/admin/stats`);
      setStats(response.data);
    } catch (error) {
      console.error("Error fetching admin stats:", error);
    }
  };

  const fetchCompetitions = async () => {
    try {
      const response = await axios.get(`${BASE_URL}/competitions`);
      setCompetitions(response.data);
    } catch (error) {
      console.error("Error fetching competitions:", error);
    }
  };

  const fetchUsers = async (username) => {
    try {
      const response = await axios.get(`${BASE_URL}/users`, {
        params: { admin_username: username },
      });
      setUsers(response.data);
    } catch (error) {
      console.error("Error fetching users:", error);
    }
  };

  // -------------------------------
  // Admin Actions
  // -------------------------------
  const handleDeleteCompetition = async (code) => {
    if (!window.confirm("Delete this competition?")) return;
    try {
      await axios.post(`${BASE_URL}/admin/delete_competition`, {
        username: adminUsername,
        competition_code: code,
      });
      fetchCompetitions();
      fetchStats();
    } catch (error) {
      console.error("Error deleting competition:", error);
    }
  };

  const handleUnfeatureCompetition = async (code) => {
    try {
      await axios.post(`${BASE_URL}/admin/unfeature_competition`, {
        competition_code: code,
      });
      fetchCompetitions();
    } catch (error) {
      console.error("Error unfeaturing competition:", error);
    }
  };

  const handleDeleteUser = async (targetUsername) => {
    if (!window.confirm(`Delete user ${targetUsername}?`)) return;
    try {
      await axios.post(`${BASE_URL}/admin/delete_user`, {
        username: adminUsername,
        target_username: targetUsername,
      });
      fetchUsers(adminUsername);
      fetchStats();
    } catch (error) {
      console.error("Error deleting user:", error);
    }
  };

  // -------------------------------
  // UI
  // -------------------------------
  if (loading) return <p>Loading admin dashboard...</p>;
  if (error) return <p style={{ color: "red" }}>{error}</p>;
  if (!isAdmin) return <p>Access denied. Admin only.</p>;

  return (
    <div className="admin-dashboard" style={{ padding: "20px" }}>
      <h1>Admin Dashboard</h1>

      <section style={{ marginBottom: "20px" }}>
        <h3>System Stats</h3>
        <p>
          <strong>Total Users:</strong> {stats.total_users || 0}
        </p>
        <p>
          <strong>Total Competitions:</strong> {stats.total_competitions || 0}
        </p>
      </section>

      <section style={{ marginBottom: "30px" }}>
        <h3>Competitions</h3>
        {competitions.length === 0 && <p>No competitions found.</p>}
        {competitions.map((comp) => (
          <div
            key={comp.code}
            style={{
              border: "1px solid #ddd",
              padding: "10px",
              marginBottom: "10px",
              borderRadius: "6px",
            }}
          >
            <p>
              <strong>{comp.name}</strong> (Code: {comp.code})
            </p>
            <p>
              Featured: {comp.featured ? "✅" : "❌"} | Open:{" "}
              {comp.is_open ? "✅" : "❌"}
            </p>
            <button onClick={() => handleDeleteCompetition(comp.code)}>
              Delete
            </button>
            {comp.featured && (
              <button onClick={() => handleUnfeatureCompetition(comp.code)}>
                Unfeature
              </button>
            )}
          </div>
        ))}
      </section>

      <section>
        <h3>Users</h3>
        {users.length === 0 && <p>No users found.</p>}
        {users.map((user) => (
          <div
            key={user.id}
            style={{
              border: "1px solid #ddd",
              padding: "10px",
              marginBottom: "10px",
              borderRadius: "6px",
            }}
          >
            <p>
              <strong>{user.username}</strong> — Balance: $
              {user.cash_balance.toLocaleString()} | Admin:{" "}
              {user.is_admin ? "✅" : "❌"}
            </p>
            <button onClick={() => handleDeleteUser(user.username)}>
              Delete User
            </button>
          </div>
        ))}
      </section>
    </div>
  );
};

export default AdminDashboard;
