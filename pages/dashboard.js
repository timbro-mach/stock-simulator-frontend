import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

// ---------------------
// Admin Dashboard Component
// ---------------------
const AdminDashboard = ({ adminUsername }) => {
  const [stats, setStats] = useState({});
  const [competitions, setCompetitions] = useState([]);
  const [users, setUsers] = useState([]);
  const BASE_URL = 'https://stock-simulator-backend.onrender.com';

  useEffect(() => {
    fetchStats();
    fetchCompetitions();
    fetchUsers();
  }, [adminUsername]);

  const fetchStats = async () => {
    try {
      const response = await axios.get(`${BASE_URL}/admin/stats`);
      setStats(response.data);
    } catch (error) {
      console.error('Error fetching admin stats:', error);
    }
  };

  const fetchCompetitions = async () => {
    try {
      const response = await axios.get(`${BASE_URL}/competitions`);
      setCompetitions(response.data);
    } catch (error) {
      console.error('Error fetching competitions:', error);
    }
  };

  const fetchUsers = async () => {
    try {
      const response = await axios.get(`${BASE_URL}/users`, {
        params: { admin_username: adminUsername }
      });
      setUsers(response.data);
    } catch (error) {
      console.error('Error fetching users:', error);
    }
  };

  // Admin action handlers
  const handleDeleteCompetition = async (code) => {
    try {
      await axios.post(`${BASE_URL}/admin/delete_competition`, {
        username: adminUsername,
        competition_code: code
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
        competition_code: code
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
        target_username: targetUsername
      });
      fetchStats();
      fetchUsers();
    } catch (error) {
      console.error('Error deleting user:', error);
    }
  };

  const handleRemoveUserFromCompetition = async (targetUsername, compCode) => {
    try {
      await axios.post(`${BASE_URL}/admin/remove_user_from_competition`, {
        admin_username: adminUsername,
        target_username: targetUsername,
        competition_code: compCode
      });
      fetchCompetitions();
      fetchUsers();
    } catch (error) {
      console.error('Error removing user from competition:', error);
    }
  };

  const handleRemoveUserFromTeam = async (targetUsername, teamId) => {
    try {
      await axios.post(`${BASE_URL}/admin/remove_user_from_team`, {
        admin_username: adminUsername,
        target_username: targetUsername,
        team_id: teamId
      });
      fetchUsers();
    } catch (error) {
      console.error('Error removing user from team:', error);
    }
  };

  const renderFeaturedCompetitions = () => {
    const featured = competitions.filter(comp => comp.featured);
    if (featured.length === 0) return <p>No featured competitions available.</p>;
    return featured.map(comp => (
      <div key={comp.code} style={{ borderBottom: '1px solid #ccc', padding: '5px' }}>
        <span>
          {comp.name} — {comp.is_open ? 'Join directly' : 'Use code to join'}
        </span>
        <button onClick={() => handleDeleteCompetition(comp.code)}>Delete</button>
        <button onClick={() => handleUnfeatureCompetition(comp.code)}>Unfeature</button>
      </div>
    ));
  };

  const renderUsers = () => {
    if (users.length === 0) return <p>No users found.</p>;
    return users.map(user => (
      <div key={user.id} style={{ border: '1px solid #ccc', marginBottom: '10px', padding: '10px' }}>
        <p>
          {user.username} (Admin: {user.is_admin ? 'Yes' : 'No'}) — Cash: ${Number(user.cash_balance).toFixed(2)}
        </p>
        <button onClick={() => handleDeleteUser(user.username)}>Delete User</button>
        {/* Demo removal buttons; adjust competition code/team id as needed */}
        <button onClick={() => handleRemoveUserFromCompetition(user.username, "COMP1234")}>
          Remove from Competition
        </button>
        <button onClick={() => handleRemoveUserFromTeam(user.username, 1)}>
          Remove from Team
        </button>
      </div>
    ));
  };

  return (
    <div className="admin-dashboard">
      <h1>Admin Dashboard</h1>
      <section className="stats">
        <p>Total Users: {stats.total_users}</p>
        <p>Total Competitions: {stats.total_competitions}</p>
      </section>
      <section className="featured-competitions">
        <h2>Featured Competitions</h2>
        {renderFeaturedCompetitions()}
      </section>
      <section className="users">
        <h2>Users</h2>
        {renderUsers()}
      </section>
    </div>
  );
};

// ---------------------
// User Dashboard Component
// ---------------------
const UserDashboard = ({ username }) => {
  const [globalAccount, setGlobalAccount] = useState({ cash_balance: 0, portfolio: [], total_value: 0 });
  const [competitionAccounts, setCompetitionAccounts] = useState([]);
  const [teamCompetitionAccounts, setTeamCompetitionAccounts] = useState([]);
  const [teams, setTeams] = useState([]);
  const [featuredCompetitions, setFeaturedCompetitions] = useState([]);
  const [stockSymbol, setStockSymbol] = useState('');
  const [stockPrice, setStockPrice] = useState(null);
  const [tradeQuantity, setTradeQuantity] = useState(0);
  const [tradeMessage, setTradeMessage] = useState('');
  const [chartData, setChartData] = useState(null);
  const [selectedAccount, setSelectedAccount] = useState({ type: 'global' });
  const BASE_URL = 'https://stock-simulator-backend.onrender.com';

  // Fetch user data
  const fetchUserData = useCallback(async () => {
    try {
      const response = await axios.get(`${BASE_URL}/user`, { params: { username } });
      setGlobalAccount(response.data.global_account || { cash_balance: 0, portfolio: [], total_value: 0 });
      setCompetitionAccounts(response.data.competition_accounts || []);
      setTeamCompetitionAccounts(response.data.team_competitions || []);
      setTeams(response.data.teams || []);
    } catch (error) {
      console.error('Failed to load user data:', error);
    }
  }, [username]);

  const fetchFeaturedCompetitions = async () => {
    try {
      const response = await axios.get(`${BASE_URL}/featured_competitions`);
      setFeaturedCompetitions(response.data);
    } catch (error) {
      console.error('Error fetching featured competitions:', error);
    }
  };

  useEffect(() => {
    if (username) {
      fetchUserData();
      fetchFeaturedCompetitions();
    }
  }, [username, fetchUserData]);

  // Helper: Check trading hours (PST 6:30 AM - 1:00 PM)
  const isTradingHours = () => {
    const pstDateString = new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles" });
    const pstDate = new Date(pstDateString);
    const current = pstDate.getHours() * 60 + pstDate.getMinutes();
    const start = 6 * 60 + 30;
    const end = 13 * 60;
    return current >= start && current < end;
  };

  const getStockPrice = async () => {
    if (!isTradingHours()) {
      setTradeMessage("Market is closed. Trading hours are 6:30 AM to 1:00 PM PST.");
      return;
    }
    if (!stockSymbol) {
      setTradeMessage('Please enter a stock symbol.');
      return;
    }
    try {
      const response = await axios.get(`${BASE_URL}/stock/${stockSymbol}`);
      if (response.data.price) {
        setStockPrice(response.data.price);
        setTradeMessage(`Current price for ${stockSymbol.toUpperCase()} is $${response.data.price.toFixed(2)}`);
      } else {
        setTradeMessage('Price not found.');
      }
      const chartResponse = await axios.get(`${BASE_URL}/stock_chart/${stockSymbol}`);
      if (chartResponse.data && chartResponse.data.length > 0) {
        const labels = chartResponse.data.map(point => point.date);
        const dataPoints = chartResponse.data.map(point => point.close);
        setChartData({
          labels: labels,
          datasets: [
            {
              label: `${stockSymbol.toUpperCase()} Price`,
              data: dataPoints,
              fill: false,
              borderColor: 'rgba(75,192,192,1)',
              tension: 0.1,
            },
          ],
        });
      } else {
        setChartData(null);
      }
    } catch (error) {
      console.error('Error fetching stock data:', error);
      setTradeMessage('Error fetching stock data.');
    }
  };

  const buyStockGlobal = async () => {
    if (!stockSymbol || tradeQuantity <= 0) {
      setTradeMessage('Please enter a valid stock symbol and quantity.');
      return;
    }
    if (!isTradingHours()) {
      setTradeMessage("Market is closed.");
      return;
    }
    try {
      const buyData = { username, symbol: stockSymbol, quantity: tradeQuantity };
      const response = await axios.post(`${BASE_URL}/buy`, buyData);
      setTradeMessage(response.data.message);
      fetchUserData();
    } catch (error) {
      console.error('Error buying stock:', error);
      setTradeMessage('Error buying stock.');
    }
  };

  const sellStockGlobal = async () => {
    if (!stockSymbol || tradeQuantity <= 0) {
      setTradeMessage('Please enter a valid stock symbol and quantity.');
      return;
    }
    if (!isTradingHours()) {
      setTradeMessage("Market is closed.");
      return;
    }
    try {
      const sellData = { username, symbol: stockSymbol, quantity: tradeQuantity };
      const response = await axios.post(`${BASE_URL}/sell`, sellData);
      setTradeMessage(response.data.message);
      fetchUserData();
    } catch (error) {
      console.error('Error selling stock:', error);
      setTradeMessage('Error selling stock.');
    }
  };

  const renderAccountDetails = () => (
    <div className="account-box">
      <h2>Global Account for {username}</h2>
      <p>Cash Balance: ${ (globalAccount.cash_balance || 0).toFixed(2) }</p>
      <p>Total Account Value: ${ (globalAccount.total_value || 0).toFixed(2) }</p>
    </div>
  );

  const renderPortfolioBox = () => (
    <div className="portfolio-box">
      <h3>Your Global Portfolio</h3>
      {globalAccount.portfolio && globalAccount.portfolio.length > 0 ? (
        <table>
          <thead>
            <tr>
              <th>Stock</th>
              <th>Quantity</th>
              <th>Current Price</th>
              <th>Total Value</th>
              <th>P&amp;L</th>
            </tr>
          </thead>
          <tbody>
            {globalAccount.portfolio.map((holding, index) => {
              const pnl = holding.buy_price ? (holding.current_price - holding.buy_price) * holding.quantity : 0;
              return (
                <tr key={index}>
                  <td>{holding.symbol}</td>
                  <td>{holding.quantity}</td>
                  <td>${holding.current_price.toFixed(2)}</td>
                  <td>${holding.total_value.toFixed(2)}</td>
                  <td style={{ color: pnl >= 0 ? 'green' : 'red' }}>${pnl.toFixed(2)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <p>No holdings in your global portfolio.</p>
      )}
    </div>
  );

  const renderTradeBox = () => (
    <div className="trade-box">
      <h3>Trade Stocks (Global)</h3>
      <div style={{ display: 'flex', gap: '20px' }}>
        <div style={{ flex: 1 }}>
          <input
            type="text"
            placeholder="Stock Symbol"
            value={stockSymbol}
            onChange={(e) => setStockSymbol(e.target.value)}
          />
          <button onClick={getStockPrice}>Get Price</button>
          {stockPrice !== null && <p>Price: ${Number(stockPrice).toFixed(2)}</p>}
          <input
            type="number"
            placeholder="Quantity"
            value={tradeQuantity}
            onChange={(e) => setTradeQuantity(Number(e.target.value))}
          />
          <button onClick={buyStockGlobal}>Buy</button>
          <button onClick={sellStockGlobal}>Sell</button>
          {tradeMessage && <p>{tradeMessage}</p>}
        </div>
        <div style={{ flex: 1, minHeight: '300px' }}>
          {chartData ? (
            <Line data={chartData} options={{ responsive: true, maintainAspectRatio: false }} />
          ) : (
            <p>No chart data available</p>
          )}
        </div>
      </div>
    </div>
  );

  const renderFeaturedCompetitions = () => {
    if (featuredCompetitions.length === 0) return <p>No featured competitions available.</p>;
    return featuredCompetitions.map(comp => (
      <div key={comp.code} style={{ border: '1px solid #ccc', padding: '10px', marginBottom: '10px' }}>
        <h3>{comp.name}</h3>
        <p>Starts: {new Date(comp.start_date).toLocaleDateString()}</p>
        <p>Ends: {new Date(comp.end_date).toLocaleDateString()}</p>
        <button onClick={() => {
          axios.post(`${BASE_URL}/competition/join`, { username, competition_code: comp.code })
            .then(resp => { alert(resp.data.message); fetchUserData(); })
            .catch(err => { console.error('Error joining competition:', err); alert('Error joining competition.'); });
        }}>Join Competition</button>
      </div>
    ));
  };

  return (
    <div className="user-dashboard">
      <h1>Welcome, {username}</h1>
      <button onClick={() => {
        localStorage.removeItem('username');
        window.location.reload();
      }}>Logout</button>
      <section className="account-details">
        {renderAccountDetails()}
        {renderPortfolioBox()}
      </section>
      <section className="trade-section">
        {renderTradeBox()}
      </section>
      <section className="featured-competitions-section">
        <h2>Featured Competitions</h2>
        {renderFeaturedCompetitions()}
      </section>
    </div>
  );
};

// ---------------------
// Main Dashboard Component
// ---------------------
const Dashboard = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const BASE_URL = 'https://stock-simulator-backend.onrender.com';

  useEffect(() => {
    const storedUsername = localStorage.getItem('username');
    if (storedUsername) {
      setUsername(storedUsername);
      setIsLoggedIn(true);
      axios.get(`${BASE_URL}/user`, { params: { username: storedUsername } })
        .then(response => {
          if (response.data.is_admin !== undefined) {
            setIsAdmin(response.data.is_admin);
          }
        })
        .catch(err => console.error('Error fetching user info:', err));
    }
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    const loginData = { username, password };
    try {
      const response = await axios.post(`${BASE_URL}/login`, loginData);
      if (response.data.username) {
        localStorage.setItem('username', username);
        setIsLoggedIn(true);
        if (response.data.is_admin !== undefined) setIsAdmin(response.data.is_admin);
      }
    } catch (error) {
      const errMsg = error.response?.data?.message || 'Login failed';
      alert(errMsg);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    const registerData = { username, password };
    try {
      const response = await axios.post(`${BASE_URL}/register`, registerData);
      alert(response.data.message);
      setIsRegistering(false);
    } catch (error) {
      alert('Failed to register.');
      console.error('Registration error:', error);
    }
  };

  if (!isLoggedIn) {
    return (
      <div className="login-box">
        {isRegistering ? (
          <form onSubmit={handleRegister}>
            <h2>Create Account</h2>
            <input type="text" placeholder="Enter username" value={username} onChange={(e) => setUsername(e.target.value)} />
            <input type="password" placeholder="Enter password" value={password} onChange={(e) => setPassword(e.target.value)} />
            <button type="submit">Create Account</button>
            <p>
              Already have an account?{' '}
              <a href="#" onClick={(e) => { e.preventDefault(); setIsRegistering(false); }}>
                Login
              </a>
            </p>
          </form>
        ) : (
          <form onSubmit={handleLogin}>
            <h2>Login</h2>
            <input type="text" placeholder="Enter username" value={username} onChange={(e) => setUsername(e.target.value)} />
            <input type="password" placeholder="Enter password" value={password} onChange={(e) => setPassword(e.target.value)} />
            <button type="submit">Login</button>
            <p>
              Don't have an account?{' '}
              <a href="#" onClick={(e) => { e.preventDefault(); setIsRegistering(true); }}>
                Create Account
              </a>
            </p>
          </form>
        )}
      </div>
    );
  }

  // If logged in, render AdminDashboard if isAdmin is true; otherwise, render UserDashboard.
  return isAdmin ? <AdminDashboard adminUsername={username} /> : <UserDashboard username={username} />;
};

export default Dashboard;
