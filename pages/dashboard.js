import React, { useState, useEffect } from 'react';
import axios from 'axios';
import Leaderboard from '../Leaderboard';
import Competition from './Competition';
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

// ✅ Backend base URL (Render URL)
const API_BASE_URL = 'https://stock-simulator-backend.onrender.com';

const Dashboard = () => {
  // Authentication state
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  // Account state
  const [globalAccount, setGlobalAccount] = useState({ cash_balance: 0, portfolio: [], total_value: 0 });
  const [competitionAccounts, setCompetitionAccounts] = useState([]);
  const [selectedAccount, setSelectedAccount] = useState('global');

  // Stock and chart state
  const [stockSymbol, setStockSymbol] = useState('');
  const [stockPrice, setStockPrice] = useState(null);
  const [tradeQuantity, setTradeQuantity] = useState(0);
  const [tradeMessage, setTradeMessage] = useState('');
  const [chartData, setChartData] = useState(null);

  // ----------------------
  // Load user data from backend
  // ----------------------
  const fetchUserData = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/user`, {
        params: { username }
      });

      setGlobalAccount(response.data.global_account || { cash_balance: 0, portfolio: [], total_value: 0 });
      setCompetitionAccounts(response.data.competition_accounts || []);
    } catch (error) {
      console.error('Failed to load user data:', error);
      if (error.response && error.response.status === 404) {
        alert('User not found. Please register.');
        localStorage.removeItem('username');
        setIsLoggedIn(false);
      }
    }
  };

  // ----------------------
  // Load username from local storage
  // ----------------------
  useEffect(() => {
    const storedUsername = localStorage.getItem('username');
    if (storedUsername) {
      setUsername(storedUsername);
      setIsLoggedIn(true);
    }
  }, []);

  // ----------------------
  // Fetch user data after login
  // ----------------------
  useEffect(() => {
    if (isLoggedIn && username) {
      fetchUserData();
    }
  }, [isLoggedIn, username]);

  // ----------------------
  // Login handler
  // ----------------------
  const handleLogin = async (event) => {
    event.preventDefault();
    try {
      const response = await axios.post(`${API_BASE_URL}/login`, { username, password });
      if (response.data.username) {
        localStorage.setItem('username', username);
        setIsLoggedIn(true);
        fetchUserData();
      }
    } catch (error) {
      const errMsg = error.response?.data?.message || 'Login failed';
      alert(errMsg);
      console.error('Login failed:', error);
    }
  };

  // ----------------------
  // Register handler
  // ----------------------
  const handleRegister = async (event) => {
    event.preventDefault();
    try {
      const response = await axios.post(`${API_BASE_URL}/register`, { username, password });
      alert(response.data.message);
      setIsRegistering(false);
    } catch (error) {
      const errMsg = error.response?.data?.message || 'Failed to register';
      alert(errMsg);
      console.error('Registration failed:', error);
    }
  };

  // ----------------------
  // Logout handler
  // ----------------------
  const handleLogout = () => {
    localStorage.removeItem('username');
    setUsername('');
    setIsLoggedIn(false);
    setGlobalAccount({ cash_balance: 0, portfolio: [], total_value: 0 });
    setCompetitionAccounts([]);
    setSelectedAccount('global');
  };

  // ----------------------
  // Get Stock Price and Chart Data
  // ----------------------
  const getStockPrice = async () => {
    if (!stockSymbol) {
      setTradeMessage('Please enter a stock symbol.');
      return;
    }

    try {
      const response = await axios.get(`${API_BASE_URL}/stock/${stockSymbol}`);
      setStockPrice(response.data.price);
      setTradeMessage(`Current price for ${stockSymbol.toUpperCase()}: $${response.data.price.toFixed(2)}`);

      // Fetch chart data
      const chartResponse = await axios.get(`${API_BASE_URL}/stock_chart/${stockSymbol}`);
      if (chartResponse.data && chartResponse.data.length > 0) {
        const labels = chartResponse.data.map(point => point.date);
        const dataPoints = chartResponse.data.map(point => point.close);

        setChartData({
          labels,
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
      setTradeMessage('Failed to get stock data.');
    }
  };

  // ----------------------
  // Render Account Details
  // ----------------------
  const renderAccountDetails = () => {
    const account = selectedAccount === 'global'
      ? globalAccount
      : competitionAccounts.find(acc => acc.code === selectedAccount);

    if (!account) return null;

    return (
      <div className="account-box">
        <h2>{selectedAccount === 'global' ? 'Global' : 'Competition'} Account</h2>
        <p>Cash Balance: ${account.cash_balance.toFixed(2)}</p>
        <p>Total Value: ${account.total_value.toFixed(2)}</p>
      </div>
    );
  };

  // ----------------------
  // Render Trading Box
  // ----------------------
  const renderTradeBox = () => (
    <div className="trade-box">
      <input
        type="text"
        placeholder="Stock Symbol"
        value={stockSymbol}
        onChange={(e) => setStockSymbol(e.target.value)}
      />
      <button onClick={getStockPrice}>Get Price</button>
      {stockPrice && <p>Price: ${stockPrice.toFixed(2)}</p>}
      <input
        type="number"
        placeholder="Quantity"
        value={tradeQuantity}
        onChange={(e) => setTradeQuantity(Number(e.target.value))}
      />
      <p>{tradeMessage}</p>
    </div>
  );

  // ----------------------
  // Render Authentication Form
  // ----------------------
  const renderAuthForm = () => (
    <div className="login-box">
      {isRegistering ? (
        <form onSubmit={handleRegister}>
          <h2>Create Account</h2>
          <input
            type="text"
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button type="submit">Register</button>
        </form>
      ) : (
        <form onSubmit={handleLogin}>
          <h2>Login</h2>
          <input
            type="text"
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button type="submit">Login</button>
        </form>
      )}
    </div>
  );

  return (
    <div className="dashboard-container">
      {isLoggedIn ? (
        <>
          {renderAccountDetails()}
          {renderTradeBox()}
          <Leaderboard />
          <Competition />
          <button onClick={handleLogout}>Logout</button>
        </>
      ) : (
        renderAuthForm()
      )}
    </div>
  );
};

export default Dashboard;
