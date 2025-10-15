import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import Leaderboard from '../components/Leaderboard';
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
  const [isAdmin, setIsAdmin] = useState(false);

  // Toggle between Trading mode and Dashboard (Community) mode
  const [showTrading, setShowTrading] = useState(false);

  // Global account info
  const [globalAccount, setGlobalAccount] = useState({ cash_balance: 0, portfolio: [], total_value: 0 });
  const [competitionAccounts, setCompetitionAccounts] = useState([]);
  const [teamCompetitionAccounts, setTeamCompetitionAccounts] = useState([]);
  const [teams, setTeams] = useState([]); // teams from login (if any)

  // Selected account: global, competition, or team
  const [selectedAccount, setSelectedAccount] = useState({ type: 'global' });

  // Trading and chart state
  const [stockSymbol, setStockSymbol] = useState('');
  const [stockPrice, setStockPrice] = useState(null);
  const [tradeQuantity, setTradeQuantity] = useState(0);
  const [tradeMessage, setTradeMessage] = useState('');
  const [chartData, setChartData] = useState(null);

  // Teams and competitions state
  const [teamName, setTeamName] = useState('');
  const [joinTeamCode, setJoinTeamCode] = useState('');
  const [teamMessage, setTeamMessage] = useState('');

  const [competitionName, setCompetitionName] = useState('');
  const [compStartDate, setCompStartDate] = useState('');
  const [compEndDate, setCompEndDate] = useState('');
  const [maxPositionLimit, setMaxPositionLimit] = useState('100%');
  const [featureCompetition, setFeatureCompetition] = useState(false);
  const [joinCompetitionCode, setJoinCompetitionCode] = useState('');
  const [competitionMessage, setCompetitionMessage] = useState('');

  const [joinTeamCompetitionTeamCode, setJoinTeamCompetitionTeamCode] = useState('');
  const [joinTeamCompetitionCode, setJoinTeamCompetitionCode] = useState('');
  const [teamCompetitionMessage, setTeamCompetitionMessage] = useState('');

  // Featured Competitions
  const [featuredCompetitions, setFeaturedCompetitions] = useState([]);

  // Modal for joining a featured competition
  const [showModal, setShowModal] = useState(false);
  const [modalCompetition, setModalCompetition] = useState(null);

  // Admin-only removal forms
  const [removeCompUserUsername, setRemoveCompUserUsername] = useState('');
  const [removeCompCode, setRemoveCompCode] = useState('');
  const [removeTeamUserUsername, setRemoveTeamUserUsername] = useState('');
  const [removeTeamId, setRemoveTeamId] = useState('');
  const [adminMessage, setAdminMessage] = useState('');

  // Base URL for API calls
  const BASE_URL = 'https://stock-simulator-backend.onrender.com';

  // Helper: Check if current time (PST) is within trading hours (6:30 AM - 1:00 PM PST)
  const isTradingHours = () => {
    const pstDateString = new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles" });
    const pstDate = new Date(pstDateString);
    const current = pstDate.getHours() * 60 + pstDate.getMinutes();
    const start = 6 * 60 + 30;
    const end = 13 * 60;
    return current >= start && current < end;
  };

  // Fetch user data from the /user endpoint
  const fetchUserData = useCallback(async () => {
    try {
      const response = await axios.get(`${BASE_URL}/user`, { params: { username } });
      // Update data shape from the backend
      setGlobalAccount(response.data.global_account || { cash_balance: 0, portfolio: [], total_value: 0 });
      setCompetitionAccounts(response.data.competition_accounts || []);
      setTeamCompetitionAccounts(response.data.team_competitions || []);
      if (response.data.is_admin !== undefined) setIsAdmin(response.data.is_admin);
    } catch (error) {
      if (error.response && error.response.status === 404) {
        console.error('User not found. Please register.');
        localStorage.removeItem('username');
        setIsLoggedIn(false);
      } else {
        console.error('Failed to load user data:', error);
      }
    }
  }, [username]);

  // Fetch featured competitions
  const fetchFeaturedCompetitions = async () => {
    try {
      const response = await axios.get(`${BASE_URL}/featured_competitions`);
      setFeaturedCompetitions(response.data);
    } catch (error) {
      console.error('Error fetching featured competitions:', error);
    }
  };

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const storedUsername = localStorage.getItem('username');
      if (storedUsername) {
        setUsername(storedUsername);
        setIsLoggedIn(true);
      }
    }
  }, []);

  useEffect(() => {
    if (isLoggedIn && username) {
      fetchUserData();
      fetchFeaturedCompetitions();
    }
  }, [isLoggedIn, username, fetchUserData]);

  // Login handler
  const handleLogin = async (event) => {
    event.preventDefault();
    const loginData = { username, password };
    try {
      const response = await axios.post(`${BASE_URL}/login`, loginData);
      if (response.data.username) {
        localStorage.setItem('username', username);
        setIsLoggedIn(true);
        if (response.data.is_admin !== undefined) setIsAdmin(response.data.is_admin);
        if (response.data.teams) {
          setTeams(response.data.teams);
        }
        fetchUserData();
        fetchFeaturedCompetitions();
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
      const response = await axios.post(`${BASE_URL}/register`, registerData);
      alert(response.data.message);
      setIsRegistering(false);
    } catch (error) {
      console.error('Failed to register:', error);
      alert('Failed to register.');
    }
  };

  // Logout
  const handleLogout = () => {
    localStorage.removeItem('username');
    setUsername('');
    setIsLoggedIn(false);
    setGlobalAccount({ cash_balance: 0, portfolio: [], total_value: 0 });
    setCompetitionAccounts([]);
    setTeamCompetitionAccounts([]);
    setTeams([]);
    setSelectedAccount({ type: 'global' });
    setShowTrading(false);
  };

  // ----------------------------------
  // Admin Removal Actions
  // ----------------------------------
  const handleRemoveUserFromCompetition = async () => {
    try {
      const payload = {
        admin_username: username, // You are the admin
        target_username: removeCompUserUsername,
        competition_code: removeCompCode
      };
      const response = await axios.post(`${BASE_URL}/admin/remove_user_from_competition`, payload);
      setAdminMessage(response.data.message);
      // Optionally refresh data
      fetchUserData();
    } catch (error) {
      console.error('Error removing user from competition:', error);
      setAdminMessage('Failed to remove user from competition.');
    }
  };

  const handleRemoveUserFromTeam = async () => {
    try {
      const payload = {
        admin_username: username, // You are the admin
        target_username: removeTeamUserUsername,
        team_id: removeTeamId
      };
      const response = await axios.post(`${BASE_URL}/admin/remove_user_from_team`, payload);
      setAdminMessage(response.data.message);
      // Optionally refresh data
      fetchUserData();
    } catch (error) {
      console.error('Error removing user from team:', error);
      setAdminMessage('Failed to remove user from team.');
    }
  };

  // ----------------------------------
  // Trading
  // ----------------------------------
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

  const checkTradingHoursAndProceed = (action) => {
    if (!isTradingHours()) {
      setTradeMessage("Market is closed. Trading hours are 6:30 AM to 1:00 PM PST.");
      return false;
    }
    action();
    return true;
  };

  const buyStockGlobal = async () => {
    if (!stockSymbol || tradeQuantity <= 0) {
      setTradeMessage('Please enter a valid stock symbol and quantity.');
      return;
    }
    if (!checkTradingHoursAndProceed(() => { })) return;
    try {
      const buyData = { username, symbol: stockSymbol, quantity: tradeQuantity };
      const response = await axios.post(`${BASE_URL}/buy`, buyData);
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
    if (!checkTradingHoursAndProceed(() => { })) return;
    try {
      const sellData = { username, symbol: stockSymbol, quantity: tradeQuantity };
      const response = await axios.post(`${BASE_URL}/sell`, sellData);
      if (response.data.message) {
        setTradeMessage(response.data.message);
        fetchUserData();
      }
    } catch (error) {
      console.error('Error selling stock:', error);
      setTradeMessage('Error selling stock.');
    }
  };

  const buyStockCompetition = async () => {
    if (!stockSymbol || tradeQuantity <= 0) {
      setTradeMessage('Please enter a valid stock symbol and quantity.');
      return;
    }
    if (!checkTradingHoursAndProceed(() => { })) return;
    try {
      const buyData = { username, competition_code: selectedAccount.id, symbol: stockSymbol, quantity: tradeQuantity };
      const response = await axios.post(`${BASE_URL}/competition/buy`, buyData);
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
    if (!checkTradingHoursAndProceed(() => { })) return;
    try {
      const sellData = { username, competition_code: selectedAccount.id, symbol: stockSymbol, quantity: tradeQuantity };
      const response = await axios.post(`${BASE_URL}/competition/sell`, sellData);
      if (response.data.message) {
        setTradeMessage(response.data.message);
        fetchUserData();
      }
    } catch (error) {
      console.error('Error selling competition stock:', error);
      setTradeMessage('Error selling competition stock.');
    }
  };

  const buyStockTeam = async () => {
    if (!stockSymbol || tradeQuantity <= 0) {
      setTradeMessage('Please enter a valid stock symbol and quantity.');
      return;
    }
    if (!checkTradingHoursAndProceed(() => { })) return;
    try {
      const buyData = {
        username,
        team_id: selectedAccount.team_id,
        competition_code: selectedAccount.competition_code,
        symbol: stockSymbol,
        quantity: tradeQuantity
      };
      const response = await axios.post(`${BASE_URL}/competition/team/buy`, buyData);
      if (response.data.message) {
        setTradeMessage(response.data.message);
        fetchUserData();
      }
    } catch (error) {
      console.error('Error buying team stock:', error);
      setTradeMessage('Error buying team stock.');
    }
  };

  const sellStockTeam = async () => {
    if (!stockSymbol || tradeQuantity <= 0) {
      setTradeMessage('Please enter a valid stock symbol and quantity.');
      return;
    }
    if (!checkTradingHoursAndProceed(() => { })) return;
    try {
      const sellData = {
        username,
        team_id: selectedAccount.team_id,
        competition_code: selectedAccount.competition_code,
        symbol: stockSymbol,
        quantity: tradeQuantity
      };
      const response = await axios.post(`${BASE_URL}/competition/team/sell`, sellData);
      if (response.data.message) {
        setTradeMessage(response.data.message);
        fetchUserData();
      }
    } catch (error) {
      console.error('Error selling team stock:', error);
      setTradeMessage('Error selling team stock.');
    }
  };

  // ----------------------------------
  // Team & Competition creation/join
  // ----------------------------------
  const createTeam = async () => {
    if (!teamName) {
      setTeamMessage('Please enter a team name.');
      return;
    }
    try {
      const response = await axios.post(`${BASE_URL}/team/create`, { username, team_name: teamName });
      setTeamMessage(`Team created successfully! Your Team Code is ${response.data.team_code}`);
      setTeamName('');
      fetchUserData();
    } catch (error) {
      console.error('Error creating team:', error);
      setTeamMessage('Error creating team.');
    }
  };

  const joinTeam = async () => {
    if (!joinTeamCode) {
      setTeamMessage('Please enter a team code.');
      return;
    }
    try {
      const response = await axios.post(`${BASE_URL}/team/join`, { username, team_code: joinTeamCode });
      setTeamMessage(response.data.message);
      setJoinTeamCode('');
      fetchUserData();
    } catch (error) {
      console.error('Error joining team:', error);
      setTeamMessage('Error joining team.');
    }
  };

  const createCompetition = async () => {
    if (!competitionName) {
      setCompetitionMessage('Please enter a competition name.');
      return;
    }
    try {
      const payload = {
        username,
        competition_name: competitionName,
        start_date: compStartDate,
        end_date: compEndDate,
        max_position_limit: maxPositionLimit,
        featured: featureCompetition,
      };
      const response = await axios.post(`${BASE_URL}/competition/create`, payload);
      setCompetitionMessage(`Competition created successfully! Code: ${response.data.competition_code}`);
      setCompetitionName('');
      setCompStartDate('');
      setCompEndDate('');
      setMaxPositionLimit('100%');
      setFeatureCompetition(false);
      fetchUserData();
    } catch (error) {
      console.error('Error creating competition:', error);
      setCompetitionMessage('Error creating competition.');
    }
  };

  const joinCompetition = async () => {
    // If you still want a manual join for a code, keep it. Otherwise you can remove it entirely.
    if (!joinCompetitionCode) {
      setCompetitionMessage('Please enter a competition code.');
      return;
    }
    try {
      const response = await axios.post(`${BASE_URL}/competition/join`, { username, competition_code: joinCompetitionCode });
      setCompetitionMessage(response.data.message);
      setJoinCompetitionCode('');
      fetchUserData();
    } catch (error) {
      console.error('Error joining competition:', error);
      setCompetitionMessage('Error joining competition.');
    }
  };

  const joinCompetitionAsTeam = async () => {
    if (!joinTeamCompetitionTeamCode || !joinTeamCompetitionCode) {
      setTeamCompetitionMessage('Please enter both team code and competition code.');
      return;
    }
    try {
      const response = await axios.post(`${BASE_URL}/competition/team/join`, {
        username,
        team_code: joinTeamCompetitionTeamCode,
        competition_code: joinTeamCompetitionCode,
      });
      setTeamCompetitionMessage(response.data.message);
      setJoinTeamCompetitionTeamCode('');
      setJoinTeamCompetitionCode('');
      fetchUserData();
    } catch (error) {
      console.error('Error joining competition as team:', error);
      setTeamCompetitionMessage('Error joining competition as team.');
    }
  };

  // ----------------------------------
  // Featured Competitions & Quick Pics
  // ----------------------------------
  const openJoinModal = (competition) => {
    setModalCompetition(competition);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setModalCompetition(null);
  };

  const joinFeaturedCompetition = async () => {
    if (modalCompetition) {
      try {
        const response = await axios.post(`${BASE_URL}/competition/join`, {
          username,
          competition_code: modalCompetition.code
        });
        alert(response.data.message);
        closeModal();
        fetchUserData();
      } catch (error) {
        console.error('Error joining competition:', error);
        alert('Error joining competition.');
      }
    }
  };

  // ----------------------------------
  // Render Helpers
  // ----------------------------------
  const renderAccountDetails = () => {
    if (selectedAccount.type === 'global') {
      return (
        <div className="account-box">
          <h2>Global Account for {username}</h2>
          <p>Cash Balance: ${(globalAccount.cash_balance ?? 0).toFixed(2)}</p>
          <p>Total Account Value: ${(globalAccount.total_value ?? 0).toFixed(2)}</p>
        </div>
      );
    } else if (selectedAccount.type === 'competition') {
      const compAcc = competitionAccounts.find(acc => acc.code === selectedAccount.id);
      if (!compAcc) return null;
      return (
        <div className="account-box">
          <h2>Competition Account (Individual) for {username}</h2>
          <p>Competition: {compAcc.name} (Code: {compAcc.code})</p>
          <p>Cash Balance: ${(compAcc.competition_cash ?? 0).toFixed(2)}</p>
          <p>Total Account Value: ${(compAcc.total_value ?? 0).toFixed(2)}</p>
        </div>
      );
    } else if (selectedAccount.type === 'team') {
      const teamAcc = teamCompetitionAccounts.find(acc => acc.team_id === selectedAccount.team_id && acc.code === selectedAccount.competition_code);
      if (!teamAcc) return null;
      return (
        <div className="account-box">
          <h2>Competition Account (Team) - {teamAcc.name}</h2>
          <p>Cash Balance: ${(teamAcc.competition_cash ?? 0).toFixed(2)}</p>
          <p>Total Account Value: ${(teamAcc.total_value ?? 0).toFixed(2)}</p>
        </div>
      );
    }
  };

  const renderPortfolioBox = () => {
    if (selectedAccount.type === 'global') {
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
                  <th>P&amp;L</th>
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
    } else if (selectedAccount.type === 'competition') {
      const compAcc = competitionAccounts.find(acc => acc.code === selectedAccount.id);
      return (
        <div className="portfolio-box">
          <h3>Your Competition Portfolio (Individual)</h3>
          {compAcc && compAcc.portfolio && compAcc.portfolio.length > 0 ? (
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
                      <td style={{ color: pnl >= 0 ? 'green' : 'red' }}>${pnl.toFixed(2)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <p>No holdings in your individual competition portfolio.</p>
          )}
        </div>
      );
    } else if (selectedAccount.type === 'team') {
      const teamAcc = teamCompetitionAccounts.find(acc => acc.team_id === selectedAccount.team_id && acc.code === selectedAccount.competition_code);
      return (
        <div className="portfolio-box">
          <h3>Your Competition Portfolio (Team)</h3>
          {teamAcc && teamAcc.portfolio && teamAcc.portfolio.length > 0 ? (
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
                {teamAcc.portfolio.map((holding, index) => {
                  const pnl = holding.buy_price
                    ? (holding.current_price - holding.buy_price) * holding.quantity
                    : 0;
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
            <p>No holdings in your team competition portfolio.</p>
          )}
        </div>
      );
    }
  };

  const renderTradeBox = () => {
    if (selectedAccount.type === 'global') {
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
                {stockPrice !== null && (
                  <p>Price: ${Number(stockPrice).toFixed(2)}</p>
                )}
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
                <Line
                  data={chartData}
                  options={{ responsive: true, maintainAspectRatio: false }}
                />
              ) : (
                <p>No chart data available</p>
              )}
            </div>
          </div>
        </div>
      );
    } else if (selectedAccount.type === 'competition') {
      return (
        <div className="trade-box">
          <h3>Trade Stocks (Competition - Individual)</h3>
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
                {stockPrice !== null && (
                  <p>Price: ${Number(stockPrice).toFixed(2)}</p>
                )}
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
                <Line
                  data={chartData}
                  options={{ responsive: true, maintainAspectRatio: false }}
                />
              ) : (
                <p>No chart data available</p>
              )}
            </div>
          </div>
        </div>
      );
    } else if (selectedAccount.type === 'team') {
      return (
        <div className="trade-box">
          <h3>Trade Stocks (Competition - Team)</h3>
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
                {stockPrice !== null && (
                  <p>Price: ${Number(stockPrice).toFixed(2)}</p>
                )}
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
                <button onClick={buyStockTeam}>Buy</button>
                <button onClick={sellStockTeam}>Sell</button>
              </div>
              {tradeMessage && <p>{tradeMessage}</p>}
            </div>
            <div className="trade-chart" style={{ flex: 1, minHeight: '300px' }}>
              {chartData ? (
                <Line
                  data={chartData}
                  options={{ responsive: true, maintainAspectRatio: false }}
                />
              ) : (
                <p>No chart data available</p>
              )}
            </div>
          </div>
        </div>
      );
    }
  };

  // ----------------------------------
  // JSX Return
  // ----------------------------------
  return (
    <div className="dashboard-container">
      <header>
        <h1>Stock Market Simulator</h1>
      </header>

      {isLoggedIn ? (
        <div>
          {/* Admin Panel (Only visible if isAdmin === true) */}
          {isAdmin && (
            <div className="admin-panel" style={{ border: '1px solid #666', padding: 10, margin: '10px 0' }}>
              <h2>Admin Panel</h2>
              <h4>Remove User from Competition</h4>
              <input
                type="text"
                placeholder="Target Username"
                value={removeCompUserUsername}
                onChange={(e) => setRemoveCompUserUsername(e.target.value)}
              />
              <input
                type="text"
                placeholder="Competition Code"
                value={removeCompCode}
                onChange={(e) => setRemoveCompCode(e.target.value)}
              />
              <button onClick={handleRemoveUserFromCompetition}>Remove</button>

              <h4 style={{ marginTop: '10px' }}>Remove User from Team</h4>
              <input
                type="text"
                placeholder="Target Username"
                value={removeTeamUserUsername}
                onChange={(e) => setRemoveTeamUserUsername(e.target.value)}
              />
              <input
                type="text"
                placeholder="Team ID"
                value={removeTeamId}
                onChange={(e) => setRemoveTeamId(e.target.value)}
              />
              <button onClick={handleRemoveUserFromTeam}>Remove</button>

              {adminMessage && <p>{adminMessage}</p>}
            </div>
          )}

          {!showTrading && (
            <div style={{ marginBottom: "20px" }}>
              <h2>Featured Competitions</h2>
              {featuredCompetitions.length > 0 ? (
                featuredCompetitions.map((comp) => {
                  const status = comp.join === "Join directly" ? "Open" : "Restricted";
                  return (
                    <div
                      key={comp.code}
                      className="featured-competition-item"
                      style={{ margin: "5px 0", display: "flex", alignItems: "center" }}
                    >
                      <span style={{ marginRight: "10px" }}>
                        <strong>{comp.name}</strong> | {status} |
                        Start: {new Date(comp.start_date).toLocaleDateString()} |
                        End: {new Date(comp.end_date).toLocaleDateString()}
                      </span>
                      <button onClick={() => openJoinModal(comp)}>
                        Join
                      </button>
                    </div>
                  );
                })
              ) : (
                <p>No featured competitions available.</p>
              )}
            </div>
          )}

          <div style={{ marginBottom: '20px' }}>
            {showTrading ? (
              <button onClick={() => setShowTrading(false)}>Back to Dashboard</button>
            ) : (
              <button onClick={() => setShowTrading(true)}>Start Trading</button>
            )}
          </div>

          {showTrading ? (
            <>
              <div className="account-switcher" style={{ marginBottom: "10px" }}>
                <button onClick={() => setSelectedAccount({ type: 'global', id: null })}>
                  Global Account
                </button>
                {competitionAccounts.map((acc) => (
                  <button
                    key={acc.code}
                    onClick={() => setSelectedAccount({ type: 'competition', id: acc.code })}
                  >
                    {acc.name} ({acc.code})
                  </button>
                ))}
                {teamCompetitionAccounts.map((acc) => (
                  <button
                    key={acc.team_id + acc.code}
                    onClick={() =>
                      setSelectedAccount({
                        type: 'team',
                        team_id: acc.team_id,
                        competition_code: acc.code,
                      })
                    }
                  >
                    {acc.name} (Team - {acc.code})
                  </button>
                ))}
              </div>
              <button className="logout-button" onClick={handleLogout}>
                Logout
              </button>
              {renderAccountDetails()}
              {renderPortfolioBox()}
              {renderTradeBox()}
              {selectedAccount.type === 'competition' && (
                <div className="leaderboard-box">
                  <Leaderboard
                    competitionCode={selectedAccount.id}
                    variant="competition"
                  />
                </div>
              )}
              {selectedAccount.type === 'team' && (
                <div className="leaderboard-box">
                  <Leaderboard
                    competitionCode={selectedAccount.competition_code}
                    variant="team"
                  />
                </div>
              )}
            </>
          ) : (
            <>
              <div className="teams-section">
                <h2>Teams</h2>
                <div className="team-form">
                  <h3>Create Team</h3>
                  <input
                    type="text"
                    placeholder="Enter Team Name"
                    value={teamName}
                    onChange={(e) => setTeamName(e.target.value)}
                  />
                  <button className="team-button" onClick={createTeam}>
                    Create Team
                  </button>
                </div>
                <div className="team-form">
                  <h3>Join Team</h3>
                  <input
                    type="text"
                    placeholder="Enter Team Code"
                    value={joinTeamCode}
                    onChange={(e) => setJoinTeamCode(e.target.value)}
                  />
                  <button className="team-button" onClick={joinTeam}>
                    Join Team
                  </button>
                </div>
                {teamMessage && <p>{teamMessage}</p>}
              </div>

              <div className="group-competitions-section">
                <h2>Group Competitions</h2>
                <div className="competition-form">
                  <h3>Create Competition</h3>
                  <div>
                    <label>Competition Name:</label>
                    <input
                      type="text"
                      placeholder="Enter Competition Name"
                      value={competitionName}
                      onChange={(e) => setCompetitionName(e.target.value)}
                    />
                  </div>
                  <div>
                    <label>Start Date (mm/dd/yyyy):</label>
                    <input
                      type="date"
                      value={compStartDate}
                      onChange={(e) => setCompStartDate(e.target.value)}
                    />
                  </div>
                  <div>
                    <label>End Date (mm/dd/yyyy):</label>
                    <input
                      type="date"
                      value={compEndDate}
                      onChange={(e) => setCompEndDate(e.target.value)}
                    />
                  </div>
                  <div>
                    <label>Max Position Limit:</label>
                    <select
                      value={maxPositionLimit}
                      onChange={(e) => setMaxPositionLimit(e.target.value)}
                    >
                      <option value="5%">5%</option>
                      <option value="10%">10%</option>
                      <option value="25%">25%</option>
                      <option value="50%">50%</option>
                      <option value="100%">100%</option>
                    </select>
                  </div>
                  <div>
                    <label>
                      <input
                        type="checkbox"
                        checked={featureCompetition}
                        onChange={(e) => setFeatureCompetition(e.target.checked)}
                      />
                      Feature This Competition
                    </label>
                  </div>
                  <button className="competition-button" onClick={createCompetition}>
                    Create Competition
                  </button>
                </div>
                <div className="competition-form">
                  <h3>Join Competition</h3>
                  <input
                    type="text"
                    placeholder="Enter Competition Code"
                    value={joinCompetitionCode}
                    onChange={(e) => setJoinCompetitionCode(e.target.value)}
                  />
                  <button
                    className="competition-button"
                    onClick={joinCompetition}
                  >
                    Join Competition
                  </button>
                </div>
                {competitionMessage && <p>{competitionMessage}</p>}
              </div>

              <div className="team-competitions-section">
                <h2>Team Competitions</h2>
                <div className="team-competition-form">
                  <h3>Join Competition as Team</h3>
                  <input
                    type="text"
                    placeholder="Enter Team Code"
                    value={joinTeamCompetitionTeamCode}
                    onChange={(e) =>
                      setJoinTeamCompetitionTeamCode(e.target.value)
                    }
                  />
                  <input
                    type="text"
                    placeholder="Enter Competition Code"
                    value={joinTeamCompetitionCode}
                    onChange={(e) =>
                      setJoinTeamCompetitionCode(e.target.value)
                    }
                  />
                  <button
                    className="competition-button"
                    onClick={joinCompetitionAsTeam}
                  >
                    Join Competition as Team
                  </button>
                </div>
                {teamCompetitionMessage && <p>{teamCompetitionMessage}</p>}
              </div>

              <button className="logout-button" onClick={handleLogout}>
                Logout
              </button>
            </>
          )}
        </div>
      ) : (
        // Logged-out view: Only display the Login (or Registration) form.
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
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    setIsRegistering(false);
                  }}
                >
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
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    setIsRegistering(true);
                  }}
                >
                  Create Account
                </a>
              </p>
            </form>
          )}
        </div>
      )}

      {showModal && modalCompetition && (
        <div className="modal-overlay">
          <div className="modal">
            <h2>Join Competition</h2>
            <p>
              Do you want to join <strong>{modalCompetition.name}</strong>?
            </p>
            <p>
              Starts:{' '}
              {new Date(modalCompetition.start_date).toLocaleDateString()}
            </p>
            <p>
              Ends: {new Date(modalCompetition.end_date).toLocaleDateString()}
            </p>
            <button onClick={joinFeaturedCompetition}>Join</button>
            <button onClick={closeModal}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
