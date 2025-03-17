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

const Dashboard = () => {
  // Authentication & global state
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  // Global account info
  const [globalAccount, setGlobalAccount] = useState({ cash_balance: 0, portfolio: [], total_value: 0 });
  // Competition accounts info (array)
  const [competitionAccounts, setCompetitionAccounts] = useState([]);
  // Which account is currently active: 'global' or competition code
  const [selectedAccount, setSelectedAccount] = useState('global');

  // Trading and chart state
  const [stockSymbol, setStockSymbol] = useState('');
  const [stockPrice, setStockPrice] = useState(null);
  const [tradeQuantity, setTradeQuantity] = useState(0);
  const [tradeMessage, setTradeMessage] = useState('');
  const [chartData, setChartData] = useState(null);

  // On mount, load username from localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const storedUsername = localStorage.getItem('username');
      if (storedUsername) {
        setUsername(storedUsername);
        setIsLoggedIn(true);
      }
    }
  }, []);

  // Fetch user data after login
  useEffect(() => {
    if (isLoggedIn && username) {
      fetchUserData();
    }
  }, [isLoggedIn, username, fetchUserData]);
  

  const fetchUserData = async () => {
    try {
      const response = await axios.get('http://127.0.0.1:5000/user', { params: { username } });
      setGlobalAccount(response.data.global_account || { cash_balance: 0, portfolio: [], total_value: 0 });
      setCompetitionAccounts(response.data.competition_accounts || []);
    } catch (error) {
      if (error.response && error.response.status === 404) {
        // Handle case where user isn't found in the database.
        console.error('User not found. Please register.');
        // Optionally, clear localStorage and set isLoggedIn to false:
        localStorage.removeItem('username');
        setIsLoggedIn(false);
      } else {
        console.error('Failed to load user data:', error);
      }
    }
  };

  const handleLogin = async (event) => {
    event.preventDefault();
    const loginData = { username, password };
    try {
      const response = await axios.post('http://127.0.0.1:5000/login', loginData);
      if (response.data.username) {
        localStorage.setItem('username', username);
        setIsLoggedIn(true);
        fetchUserData();
      }
    } catch (error) {
      const errMsg = error.response?.data?.message || 'Login failed';
      alert(errMsg);
      console.error('Failed to log in:', error);
    }
  };

  const handleRegister = async (event) => {
    event.preventDefault();
    const registerData = { username, password };
    try {
      const response = await axios.post('http://127.0.0.1:5000/register', registerData);
      alert(response.data.message);
      setIsRegistering(false);
    } catch (error) {
      console.error('Failed to register:', error);
      alert('Failed to register.');
    }
  };

  const handleLogout = async () => {
    try {
      await axios.post('http://127.0.0.1:5000/logout');
    } catch (error) {
      console.error('Logout endpoint not available, proceeding with client-side logout.');
    } finally {
      localStorage.removeItem('username');
      setUsername('');
      setIsLoggedIn(false);
      setGlobalAccount({ cash_balance: 0, portfolio: [], total_value: 0 });
      setCompetitionAccounts([]);
      setSelectedAccount('global');
    }
  };

  const getStockPrice = async () => {
    if (!stockSymbol) {
      setTradeMessage('Please enter a stock symbol.');
      return;
    }
    try {
      const response = await axios.get(`http://127.0.0.1:5000/stock/${stockSymbol}`);
      if (response.data.price) {
        setStockPrice(response.data.price);
        setTradeMessage(`Current price for ${stockSymbol.toUpperCase()} is $${response.data.price.toFixed(2)}`);
      } else {
        setTradeMessage('Price not found.');
      }
      const chartResponse = await axios.get(`http://127.0.0.1:5000/stock_chart/${stockSymbol}`);
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
              tension: 0.1
            }
          ]
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
    try {
      const buyData = { username, symbol: stockSymbol, quantity: tradeQuantity };
      const response = await axios.post('http://127.0.0.1:5000/buy', buyData);
      if (response.data.message) {
        setTradeMessage(response.data.message);
        fetchUserData();
      }
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
    try {
      const sellData = { username, symbol: stockSymbol, quantity: tradeQuantity };
      const response = await axios.post('http://127.0.0.1:5000/sell', sellData);
      if (response.data.message) {
        setTradeMessage(response.data.message);
        fetchUserData();
      }
    } catch (error) {
      console.error('Error selling stock:', error);
      setTradeMessage('Error selling stock.');
    }
  };

  // For competition trading, assume similar endpoints exist
  const buyStockCompetition = async () => {
    if (!stockSymbol || tradeQuantity <= 0) {
      setTradeMessage('Please enter a valid stock symbol and quantity.');
      return;
    }
    try {
      const buyData = { username, competition_code: selectedAccount, symbol: stockSymbol, quantity: tradeQuantity };
      const response = await axios.post('http://127.0.0.1:5000/competition/buy', buyData);
      if (response.data.message) {
        setTradeMessage(response.data.message);
        fetchUserData();
      }
    } catch (error) {
      console.error('Error buying competition stock:', error);
      setTradeMessage('Error buying competition stock.');
    }
  };

  const sellStockCompetition = async () => {
    if (!stockSymbol || tradeQuantity <= 0) {
      setTradeMessage('Please enter a valid stock symbol and quantity.');
      return;
    }
    try {
      const sellData = { username, competition_code: selectedAccount, symbol: stockSymbol, quantity: tradeQuantity };
      const response = await axios.post('http://127.0.0.1:5000/competition/sell', sellData);
      if (response.data.message) {
        setTradeMessage(response.data.message);
        fetchUserData();
      }
    } catch (error) {
      console.error('Error selling competition stock:', error);
      setTradeMessage('Error selling competition stock.');
    }
  };

  // Render account details based on selected account
  const renderAccountDetails = () => {
    if (selectedAccount === 'global') {
      return (
        <div className="account-box">
          <h2>Global Account for {username}</h2>
          <p>Cash Balance: ${ (globalAccount.cash_balance ?? 0).toFixed(2) }</p>
          <p>Total Account Value: ${ (globalAccount.total_value ?? 0).toFixed(2) }</p>
        </div>
      );
    } else {
      const compAcc = competitionAccounts.find(acc => acc.code === selectedAccount);
      if (!compAcc) return null;
      return (
        <div className="account-box">
          <h2>Competition Account for {username}</h2>
          <p>Competition: {compAcc.name} (Code: {compAcc.code})</p>
          <p>Cash Balance: ${ (compAcc.competition_cash ?? 0).toFixed(2) }</p>
          <p>Total Account Value: ${ (compAcc.total_value ?? 0).toFixed(2) }</p>
        </div>
      );
    }
  };

  // Render portfolio box based on selected account
const renderPortfolioBox = () => {
  if (selectedAccount === 'global') {
    return (
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
                <th>P&L</th>
              </tr>
            </thead>
            <tbody>
              {globalAccount.portfolio.map((holding, index) => {
                const pnl = holding.buy_price
                  ? (holding.current_price - holding.buy_price) * holding.quantity
                  : 0;
                return (
                  <tr key={index}>
                    <td>{holding.symbol}</td>
                    <td>{holding.quantity}</td>
                    <td>${holding.current_price.toFixed(2)}</td>
                    <td>${holding.total_value.toFixed(2)}</td>
                    <td style={{ color: pnl >= 0 ? 'green' : 'red' }}>
                      ${pnl.toFixed(2)}
                    </td>
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
  } else {
    const compAcc = competitionAccounts.find(acc => acc.code === selectedAccount);
    return (
      <div className="portfolio-box">
        <h3>Your Competition Portfolio</h3>
        {compAcc && compAcc.portfolio && compAcc.portfolio.length > 0 ? (
          <table>
            <thead>
              <tr>
                <th>Stock</th>
                <th>Quantity</th>
                <th>Current Price</th>
                <th>Total Value</th>
                <th>P&L</th>
              </tr>
            </thead>
            <tbody>
              {compAcc.portfolio.map((holding, index) => {
                const pnl = holding.buy_price
                  ? (holding.current_price - holding.buy_price) * holding.quantity
                  : 0;
                return (
                  <tr key={index}>
                    <td>{holding.symbol}</td>
                    <td>{holding.quantity}</td>
                    <td>${holding.current_price.toFixed(2)}</td>
                    <td>${holding.total_value.toFixed(2)}</td>
                    <td style={{ color: pnl >= 0 ? 'green' : 'red' }}>
                      ${pnl.toFixed(2)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <p>No holdings in your competition portfolio.</p>
        )}
      </div>
    );
  }
};


  // Render trade box based on selected account
  const renderTradeBox = () => {
    if (selectedAccount === 'global') {
      return (
        <div className="trade-box">
          <h3>Trade Stocks (Global)</h3>
          <div className="trade-chart-container" style={{ display: 'flex', gap: '20px' }}>
            <div className="trade-inputs" style={{ flex: 1 }}>
              <div>
                <input
                  type="text"
                  placeholder="Stock Symbol"
                  value={stockSymbol}
                  onChange={(e) => setStockSymbol(e.target.value)}
                />
                <button onClick={getStockPrice}>Get Price</button>
                {stockPrice !== null && <p>Price: ${Number(stockPrice).toFixed(2)}</p>}
              </div>
              <div>
                <input
                  type="number"
                  placeholder="Quantity"
                  value={tradeQuantity}
                  onChange={(e) => setTradeQuantity(Number(e.target.value))}
                />
              </div>
              <div>
                <button onClick={buyStockGlobal}>Buy</button>
                <button onClick={sellStockGlobal}>Sell</button>
              </div>
              {tradeMessage && <p>{tradeMessage}</p>}
            </div>
            <div className="trade-chart" style={{ flex: 1, minHeight: '300px' }}>
              {chartData ? (
                <Line data={chartData} options={{ responsive: true, maintainAspectRatio: false }} />
              ) : (
                <p>No chart data available</p>
              )}
            </div>
          </div>
        </div>
      );
    } else {
      return (
        <div className="trade-box">
          <h3>Trade Stocks (Competition)</h3>
          <div className="trade-chart-container" style={{ display: 'flex', gap: '20px' }}>
            <div className="trade-inputs" style={{ flex: 1 }}>
              <div>
                <input
                  type="text"
                  placeholder="Stock Symbol"
                  value={stockSymbol}
                  onChange={(e) => setStockSymbol(e.target.value)}
                />
                <button onClick={getStockPrice}>Get Price</button>
                {stockPrice !== null && <p>Price: ${Number(stockPrice).toFixed(2)}</p>}
              </div>
              <div>
                <input
                  type="number"
                  placeholder="Quantity"
                  value={tradeQuantity}
                  onChange={(e) => setTradeQuantity(Number(e.target.value))}
                />
              </div>
              <div>
                <button onClick={buyStockCompetition}>Buy</button>
                <button onClick={sellStockCompetition}>Sell</button>
              </div>
              {tradeMessage && <p>{tradeMessage}</p>}
            </div>
            <div className="trade-chart" style={{ flex: 1, minHeight: '300px' }}>
              {chartData ? (
                <Line data={chartData} options={{ responsive: true, maintainAspectRatio: false }} />
              ) : (
                <p>No chart data available</p>
              )}
            </div>
          </div>
        </div>
      );
    }
  };

  return (
    <div className="dashboard-container">
      {isLoggedIn ? (
        <div>
          {/* Account Switcher */}
          <div className="account-switcher">
            <button onClick={() => setSelectedAccount('global')}>Global Account</button>
            {competitionAccounts.map(acc => (
              <button key={acc.code} onClick={() => setSelectedAccount(acc.code)}>
                {acc.name} ({acc.code})
              </button>
            ))}
          </div>
          {/* Logout Button */}
          <button className="logout-button" onClick={handleLogout}>Logout</button>

          {renderAccountDetails()}
          {renderPortfolioBox()}
          {renderTradeBox()}

          {/* Global Leaderboard */}
          <div className="leaderboard-box">
            <Leaderboard />
          </div>

          {/* Competition Section for creating/joining competitions */}
          <div className="competition-section">
            <Competition />
          </div>
        </div>
      ) : (
        <div className="login-box">
          {isRegistering ? (
            <form onSubmit={handleRegister}>
              <h2>Create Account</h2>
              <input
                type="text"
                placeholder="Enter username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
              <input
                type="password"
                placeholder="Enter password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
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
              <input
                type="text"
                placeholder="Enter username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
              <input
                type="password"
                placeholder="Enter password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button type="submit">Login</button>
              <p>
              Don&apos;t have an account?{' '}
              <a href="#" onClick={(e) => { e.preventDefault(); setIsRegistering(true); }}>
                Create Account
                </a>
              </p>
            </form>
          )}
        </div>
      )}
    </div>
  );
};

export default Dashboard;
