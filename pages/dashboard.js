import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import Leaderboard from '../components/Leaderboard';
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
  // =========================================
  // Auth & Global UI State
  // =========================================
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  // Toggle dashboard vs trading workspace
  const [showTrading, setShowTrading] = useState(false);

  // =========================================
  // Accounts & Selections
  // =========================================
  const [globalAccount, setGlobalAccount] = useState({ cash_balance: 0, portfolio: [], total_value: 0 });
  const [competitionAccounts, setCompetitionAccounts] = useState([]);      // [{ code, name, competition_cash, total_value, portfolio }]
  const [teamCompetitionAccounts, setTeamCompetitionAccounts] = useState([]); // [{ team_id, code, name, competition_cash, total_value, portfolio }]
  const [teams, setTeams] = useState([]);

  // Selected account context for trading/actions
  // type: 'global' | 'competition' | 'team'
  const [selectedAccount, setSelectedAccount] = useState({ type: 'global' });

  // =========================================
  // Trading state
  // =========================================
  const [stockSymbol, setStockSymbol] = useState('');
  const [chartSymbol, setChartSymbol] = useState(''); // ✅ separates typing vs. displayed chart symbol

  const [stockPrice, setStockPrice] = useState(null);
  const [tradeQuantity, setTradeQuantity] = useState(0);
  const [tradeMessage, setTradeMessage] = useState('');
  const [chartData, setChartData] = useState(null);

  // =========================================
  // Teams & Competitions state
  // =========================================
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

  // =========================================
  // Featured comps + modal
  // =========================================
  const [featuredCompetitions, setFeaturedCompetitions] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [modalCompetition, setModalCompetition] = useState(null);

  // =========================================
  // Admin-only removal tools
  // =========================================
  const [removeCompUserUsername, setRemoveCompUserUsername] = useState('');
  const [removeCompCode, setRemoveCompCode] = useState('');
  const [removeTeamUserUsername, setRemoveTeamUserUsername] = useState('');
  const [removeTeamId, setRemoveTeamId] = useState('');
  const [adminMessage, setAdminMessage] = useState('');

  // =========================================
  // API base
  // =========================================
  const BASE_URL = 'https://stock-simulator-backend.onrender.com';

  // =========================================
  // Helpers
  // =========================================
  const isTradingHours = () => {
    // 6:30 AM – 1:00 PM America/Los_Angeles
    const pstDateString = new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' });
    const pstDate = new Date(pstDateString);
    const current = pstDate.getHours() * 60 + pstDate.getMinutes();
    const start = 6 * 60 + 30;
    const end = 13 * 60;
    return current >= start && current < end;
  };

  const fetchUserData = useCallback(async () => {
    if (!username) return;
    try {
      const response = await axios.get(`${BASE_URL}/user`, { params: { username } });
      setGlobalAccount(response.data.global_account || { cash_balance: 0, portfolio: [], total_value: 0 });
      setCompetitionAccounts(response.data.competition_accounts || []);
      setTeamCompetitionAccounts(response.data.team_competitions || []);
      if (response.data.is_admin !== undefined) setIsAdmin(response.data.is_admin);
      if (response.data.teams) setTeams(response.data.teams);
    } catch (error) {
      if (error.response?.status === 404) {
        console.error('User not found. Clearing session.');
        localStorage.removeItem('username');
        setIsLoggedIn(false);
      } else {
        console.error('Failed to load user data:', error);
      }
    }
  }, [username]);

  const fetchFeaturedCompetitions = async () => {
    try {
      const response = await axios.get(`${BASE_URL}/featured_competitions`);
      setFeaturedCompetitions(response.data || []);
    } catch (error) {
      console.error('Error fetching featured competitions:', error);
    }
  };

  // =========================================
  // Effects
  // =========================================
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

  // =========================================
  // Auth handlers
  // =========================================
  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      const res = await axios.post(`${BASE_URL}/login`, { username, password });
      if (res.data.username) {
        localStorage.setItem('username', username);
        setIsLoggedIn(true);
        if (res.data.is_admin !== undefined) setIsAdmin(res.data.is_admin);
        if (res.data.teams) setTeams(res.data.teams);
        fetchUserData();
        fetchFeaturedCompetitions();
      }
    } catch (error) {
      alert(error.response?.data?.message || 'Login failed');
      console.error('Login failed:', error);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    try {
      const res = await axios.post(`${BASE_URL}/register`, { username, password });
      alert(res.data.message);
      setIsRegistering(false);
    } catch (error) {
      alert('Failed to register.');
      console.error('Register error:', error);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('username');
    setUsername('');
    setIsLoggedIn(false);
    setIsAdmin(false);
    setTeams([]);
    setShowTrading(false);
    setSelectedAccount({ type: 'global' });
    setGlobalAccount({ cash_balance: 0, portfolio: [], total_value: 0 });
    setCompetitionAccounts([]);
    setTeamCompetitionAccounts([]);
  };

  // =========================================
  // Admin Actions
  // =========================================
  const handleRemoveUserFromCompetition = async () => {
    try {
      const payload = {
        admin_username: username,
        target_username: removeCompUserUsername,
        competition_code: removeCompCode,
      };
      const res = await axios.post(`${BASE_URL}/admin/remove_user_from_competition`, payload);
      setAdminMessage(res.data.message);
      fetchUserData();
    } catch (error) {
      console.error('Error removing user from competition:', error);
      setAdminMessage('Failed to remove user from competition.');
    }
  };

  const handleRemoveUserFromTeam = async () => {
    try {
      const payload = {
        admin_username: username,
        target_username: removeTeamUserUsername,
        team_id: removeTeamId,
      };
      const res = await axios.post(`${BASE_URL}/admin/remove_user_from_team`, payload);
      setAdminMessage(res.data.message);
      fetchUserData();
    } catch (error) {
      console.error('Error removing user from team:', error);
      setAdminMessage('Failed to remove user from team.');
    }
  };

  // =========================================
  // Improved getStockPrice with range
  // =========================================
  if (!chartSymbol) return; // no confirmed chart yet

  const [chartRange, setChartRange] = useState('1M');

  const getStockPrice = async (range = chartRange) => {
    const symbolToUse = chartSymbol?.trim().toUpperCase();

    if (!symbolToUse) {
      setTradeMessage('Please enter a stock symbol.');
      return;
    }

    try {
      const response = await axios.get(`${BASE_URL}/stock/${symbolToUse}`);

      if (response.data?.price) {
        setStockPrice(response.data.price);
        setTradeMessage(`Current price for ${stockSymbol.toUpperCase()}: $${response.data.price.toFixed(2)}`);
      }

      // Try multi-day chart
      const chartResponse = await axios.get(`${BASE_URL}/stock_chart/${symbolToUse}?range=${range}`);
      if (chartResponse.data && chartResponse.data.length > 0) {
        const labels = chartResponse.data.map(p => p.date);
        const dataPoints = chartResponse.data.map(p => p.close);

        const gradientStroke = (ctx) => {
          const gradient = ctx.createLinearGradient(0, 0, 0, 400);
          gradient.addColorStop(0, 'rgba(37,99,235,0.4)');
          gradient.addColorStop(1, 'rgba(37,99,235,0.0)');
          return gradient;
        };

        setChartData({
          labels,
          datasets: [
            {
              label: `${stockSymbol.toUpperCase()} (${range})`,
              data: dataPoints,
              fill: true,
              borderWidth: 2.5,
              borderColor: '#2563eb',
              backgroundColor: (ctx) => gradientStroke(ctx.chart.ctx),
              pointRadius: 0,
              tension: 0.25,
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

  // Confirmed search to avoid reloading on every keystroke
  const handleSearch = (e) => {
    e.preventDefault();
    const cleanSymbol = stockSymbol.trim().toUpperCase();
    if (!cleanSymbol) return;

    // ✅ Update displayed chart symbol first
    setChartSymbol(cleanSymbol);

    // ✅ Then load data explicitly
    getStockPrice(chartRange);
  };

  // =========================================
  // Chart Panel JSX (replace your existing ChartPanel)
  // =========================================
  const ChartPanel = () => (
    <div style={{ flex: 1, minHeight: 320 }}>
      <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
        {['1D', '1W', '1M', '6M', '1Y'].map((r) => (
          <button
            key={r}
            onClick={() => {
              setChartRange(r);
              getStockPrice(r);
            }}
            style={{
              padding: '4px 10px',
              borderRadius: 6,
              background: chartRange === r ? '#2563eb' : '#f3f4f6',
              color: chartRange === r ? '#fff' : '#111827',
              border: 'none',
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            {r}
          </button>
        ))}
      </div>

      {chartData ? (
        <div style={{ height: '300px', width: '100%' }}>
          <Line
            data={chartData}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              scales: {
                x: {
                  grid: { display: false },
                  ticks: { color: '#6b7280', maxTicksLimit: 6 },
                },
                y: {
                  grid: { color: 'rgba(0,0,0,0.05)' },
                  ticks: { color: '#6b7280', callback: (v) => `$${v}` },
                },
              },
              plugins: {
                legend: { display: false },
                tooltip: {
                  mode: 'index',
                  intersect: false,
                  callbacks: {
                    label: (context) => `$${context.formattedValue}`,
                  },
                },
              },
              interaction: { intersect: false, mode: 'nearest' },
            }}
          />
        </div>
      ) : (
        <p className="note">No chart data available</p>
      )}

    </div>
  );


  const checkTradingHoursAndProceed = (action) => {
    if (!isTradingHours()) {
      setTradeMessage('Market is closed. Trading hours are 6:30 AM – 1:00 PM PST.');
      return false;
    }
    action();
    return true;
  };

  const executeTrade = async (endpoint, payload) => {
    try {
      const res = await axios.post(`${BASE_URL}${endpoint}`, payload);
      if (res.data?.message) {
        setTradeMessage(res.data.message);
        fetchUserData();
      }
    } catch (error) {
      console.error('Trade failed:', error);
      setTradeMessage('Trade failed.');
    }
  };

  // Global account trades
  const buyStockGlobal = () => {
    if (!stockSymbol || tradeQuantity <= 0) return setTradeMessage('Enter valid symbol and quantity.');
    if (!checkTradingHoursAndProceed(() => { })) return;
    executeTrade('/buy', { username, symbol: stockSymbol, quantity: tradeQuantity });
  };

  const sellStockGlobal = () => {
    if (!stockSymbol || tradeQuantity <= 0) return setTradeMessage('Enter valid symbol and quantity.');
    if (!checkTradingHoursAndProceed(() => { })) return;
    executeTrade('/sell', { username, symbol: stockSymbol, quantity: tradeQuantity });
  };

  // Competition trades (individual)
  const buyStockCompetition = () => {
    if (!stockSymbol || tradeQuantity <= 0) return setTradeMessage('Enter valid symbol and quantity.');
    if (!checkTradingHoursAndProceed(() => { })) return;
    executeTrade('/competition/buy', {
      username,
      competition_code: selectedAccount.id,
      symbol: stockSymbol,
      quantity: tradeQuantity,
    });
  };

  const sellStockCompetition = () => {
    if (!stockSymbol || tradeQuantity <= 0) return setTradeMessage('Enter valid symbol and quantity.');
    if (!checkTradingHoursAndProceed(() => { })) return;
    executeTrade('/competition/sell', {
      username,
      competition_code: selectedAccount.id,
      symbol: stockSymbol,
      quantity: tradeQuantity,
    });
  };

  // Team trades
  const buyStockTeam = () => {
    if (!stockSymbol || tradeQuantity <= 0) return setTradeMessage('Enter valid symbol and quantity.');
    if (!checkTradingHoursAndProceed(() => { })) return;
    executeTrade('/competition/team/buy', {
      username,
      team_id: selectedAccount.team_id,
      competition_code: selectedAccount.competition_code,
      symbol: stockSymbol,
      quantity: tradeQuantity,
    });
  };

  const sellStockTeam = () => {
    if (!stockSymbol || tradeQuantity <= 0) return setTradeMessage('Enter valid symbol and quantity.');
    if (!checkTradingHoursAndProceed(() => { })) return;
    executeTrade('/competition/team/sell', {
      username,
      team_id: selectedAccount.team_id,
      competition_code: selectedAccount.competition_code,
      symbol: stockSymbol,
      quantity: tradeQuantity,
    });
  };

  // =========================================
  // Teams & Competitions
  // =========================================
  const createTeam = async () => {
    if (!teamName) return setTeamMessage('Please enter a team name.');
    try {
      const res = await axios.post(`${BASE_URL}/team/create`, { username, team_name: teamName });
      setTeamMessage(`Team created successfully! Your Team Code is ${res.data.team_code}`);
      setTeamName('');
      fetchUserData();
    } catch (error) {
      console.error('Error creating team:', error);
      setTeamMessage('Error creating team.');
    }
  };

  const joinTeam = async () => {
    if (!joinTeamCode) return setTeamMessage('Please enter a team code.');
    try {
      const res = await axios.post(`${BASE_URL}/team/join`, { username, team_code: joinTeamCode });
      setTeamMessage(res.data.message);
      setJoinTeamCode('');
      fetchUserData();
    } catch (error) {
      console.error('Error joining team:', error);
      setTeamMessage('Error joining team.');
    }
  };

  const createCompetition = async () => {
    if (!competitionName) return setCompetitionMessage('Please enter a competition name.');
    try {
      const payload = {
        username,
        competition_name: competitionName,
        start_date: compStartDate,
        end_date: compEndDate,
        max_position_limit: maxPositionLimit,
        featured: featureCompetition,
      };
      const res = await axios.post(`${BASE_URL}/competition/create`, payload);
      setCompetitionMessage(`Competition created successfully! Code: ${res.data.competition_code}`);
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
    if (!joinCompetitionCode) return setCompetitionMessage('Please enter a competition code.');
    try {
      const res = await axios.post(`${BASE_URL}/competition/join`, { username, competition_code: joinCompetitionCode });
      setCompetitionMessage(res.data.message);
      setJoinCompetitionCode('');
      fetchUserData();
    } catch (error) {
      console.error('Error joining competition:', error);
      setCompetitionMessage('Error joining competition.');
    }
  };

  const joinCompetitionAsTeam = async () => {
    if (!joinTeamCompetitionTeamCode || !joinTeamCompetitionCode) {
      return setTeamCompetitionMessage('Please enter both team code and competition code.');
    }
    try {
      const res = await axios.post(`${BASE_URL}/competition/team/join`, {
        username,
        team_code: joinTeamCompetitionTeamCode,
        competition_code: joinTeamCompetitionCode,
      });
      setTeamCompetitionMessage(res.data.message);
      setJoinTeamCompetitionTeamCode('');
      setJoinTeamCompetitionCode('');
      fetchUserData();
    } catch (error) {
      console.error('Error joining competition as team:', error);
      setTeamCompetitionMessage('Error joining competition as team.');
    }
  };

  // =========================================
  // Featured Competitions modal
  // =========================================
  const openJoinModal = (competition) => {
    setModalCompetition(competition);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setModalCompetition(null);
  };

  const joinFeaturedCompetition = async () => {
    if (!modalCompetition) return;
    try {
      const res = await axios.post(`${BASE_URL}/competition/join`, {
        username,
        competition_code: modalCompetition.code,
      });
      alert(res.data.message);
      closeModal();
      fetchUserData();
    } catch (error) {
      console.error('Error joining competition:', error);
      alert('Error joining competition.');
    }
  };

  // =========================================
  // Render helpers
  // =========================================
  const renderAccountDetails = () => {
    if (selectedAccount.type === 'global') {
      return (
        <div className="card section">
          <h2>Account Summary — Global</h2>
          <p className="note">User: {username}</p>
          <p className="note">Cash Balance: ${(globalAccount.cash_balance ?? 0).toFixed(2)}</p>
          <p className="note">Total Account Value: ${(globalAccount.total_value ?? 0).toFixed(2)}</p>
        </div>
      );
    }

    if (selectedAccount.type === 'competition') {
      const compAcc = competitionAccounts.find((a) => a.code === selectedAccount.id);
      if (!compAcc) return null;
      return (
        <div className="card section">
          <h2>Account Summary — Competition (Individual)</h2>
          <p className="note">
            {compAcc.name} — Code: <span className="em">{compAcc.code}</span>
          </p>
          <p className="note">Cash Balance: ${(compAcc.competition_cash ?? 0).toFixed(2)}</p>
          <p className="note">Total Account Value: ${(compAcc.total_value ?? 0).toFixed(2)}</p>
        </div>
      );
    }

    if (selectedAccount.type === 'team') {
      const teamAcc = teamCompetitionAccounts.find(
        (a) => a.team_id === selectedAccount.team_id && a.code === selectedAccount.competition_code
      );
      if (!teamAcc) return null;
      return (
        <div className="card section">
          <h2>Account Summary — Team</h2>
          <p className="note">
            Team: <span className="em">{teamAcc.name}</span> — Comp Code: <span className="em">{teamAcc.code}</span>
          </p>
          <p className="note">Cash Balance: ${(teamAcc.competition_cash ?? 0).toFixed(2)}</p>
          <p className="note">Total Account Value: ${(teamAcc.total_value ?? 0).toFixed(2)}</p>
        </div>
      );
    }

    return null;
  };

  const renderPortfolioBox = () => {
    if (selectedAccount.type === 'global') {
      return (
        <div className="card section">
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
            <p className="note">No holdings in your global portfolio.</p>
          )}
        </div>
      );
    }

    if (selectedAccount.type === 'competition') {
      const compAcc = competitionAccounts.find((a) => a.code === selectedAccount.id);
      return (
        <div className="card section">
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
            <p className="note">No holdings in your individual competition portfolio.</p>
          )}
        </div>
      );
    }

    if (selectedAccount.type === 'team') {
      const teamAcc = teamCompetitionAccounts.find(
        (a) => a.team_id === selectedAccount.team_id && a.code === selectedAccount.competition_code
      );
      return (
        <div className="card section">
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
            <p className="note">No holdings in your team competition portfolio.</p>
          )}
        </div>
      );
    }

    return null;
  };

  const renderTradeBox = () => {
    const SharedInputs = ({ onBuy, onSell }) => (
      <>
        <div className="section" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <form onSubmit={handleSearch} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input
              type="text"
              placeholder="Stock Symbol"
              value={stockSymbol}
              onChange={(e) => setStockSymbol(e.target.value)}
            />
            <button type="submit">🔍 Search</button>
          </form>
          {stockPrice !== null && <p className="note">Price: ${Number(stockPrice).toFixed(2)}</p>}

          {stockPrice !== null && <p className="note">Price: ${Number(stockPrice).toFixed(2)}</p>}
        </div>

        <div className="section" style={{ display: 'flex', gap: 8 }}>
          <input
            type="number"
            placeholder="Quantity"
            value={tradeQuantity}
            onChange={(e) => setTradeQuantity(Number(e.target.value))}
          />
          <button onClick={onBuy}>Buy</button>
          <button onClick={onSell}>Sell</button>
        </div>

        {tradeMessage && <p className="note">{tradeMessage}</p>}
      </>
    );


    if (selectedAccount.type === 'global') {
      return (
        <div className="card section">
          <h3>Trade Stocks (Global)</h3>
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 280 }}>
              <SharedInputs onBuy={buyStockGlobal} onSell={sellStockGlobal} />
            </div>
            <ChartPanel />
          </div>
        </div>
      );
    }

    if (selectedAccount.type === 'competition') {
      return (
        <div className="card section">
          <h3>Trade Stocks (Competition — Individual)</h3>
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 280 }}>
              <SharedInputs onBuy={buyStockCompetition} onSell={sellStockCompetition} />
            </div>
            <ChartPanel />
          </div>
        </div>
      );
    }

    if (selectedAccount.type === 'team') {
      return (
        <div className="card section">
          <h3>Trade Stocks (Competition — Team)</h3>
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 280 }}>
              <SharedInputs onBuy={buyStockTeam} onSell={sellStockTeam} />
            </div>
            <ChartPanel />
          </div>
        </div>
      );
    }

    return null;
  };

  // =========================================
  // Main Render
  // =========================================
  return (
    <div className="dashboard-container">
      <header>
        <h1>📊 Stock Market Simulator</h1>
        {isLoggedIn && (
          <p className="note">Welcome back, <span className="em">{username}</span>.</p>
        )}
      </header>

      {isLoggedIn ? (
        <div>
          {/* Admin Panel */}
          {isAdmin && (
            <div className="card section">
              <h2>🛠️ Admin Panel</h2>

              <div className="section">
                <h3>Remove User from Competition</h3>
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
              </div>

              <div className="section">
                <h3>Remove User from Team</h3>
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
              </div>

              {adminMessage && <p className="note">{adminMessage}</p>}
            </div>
          )}

          {/* Featured Competitions (Dashboard mode only) */}
          {!showTrading && (
            <div className="card section">
              <h2>🏅 Featured Competitions</h2>
              {featuredCompetitions.length > 0 ? (
                featuredCompetitions.map((comp) => {
                  const status = comp.join === 'Join directly' ? 'Open' : 'Restricted';
                  return (
                    <div key={comp.code} className="section" style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                      <span>
                        <strong>{comp.name}</strong> • {status} • {new Date(comp.start_date).toLocaleDateString()} → {new Date(comp.end_date).toLocaleDateString()}
                      </span>
                      <button onClick={() => openJoinModal(comp)}>Join</button>
                    </div>
                  );
                })
              ) : (
                <p className="note">No featured competitions available.</p>
              )}
            </div>
          )}

          {/* Mode Toggle */}
          <div className="section">
            {showTrading ? (
              <button onClick={() => setShowTrading(false)}>⬅ Back to Dashboard</button>
            ) : (
              <button onClick={() => setShowTrading(true)}>🚀 Start Trading</button>
            )}
          </div>

          {/* Trading Workspace */}
          {showTrading ? (
            <>
              {/* Account Switcher */}
              <div className="card section">
                <h2>Accounts</h2>
                <div className="section" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button onClick={() => setSelectedAccount({ type: 'global', id: null })}>Global Account</button>
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
                      key={`${acc.team_id}-${acc.code}`}
                      onClick={() =>
                        setSelectedAccount({
                          type: 'team',
                          team_id: acc.team_id,
                          competition_code: acc.code,
                        })
                      }
                    >
                      {acc.name} (Team • {acc.code})
                    </button>
                  ))}
                </div>

                <button className="logout-button" onClick={handleLogout}>
                  Logout
                </button>
              </div>

              {renderAccountDetails()}
              {renderPortfolioBox()}
              {renderTradeBox()}

              {/* Leaderboards (contextual) */}
              {selectedAccount.type === 'competition' && (
                <div className="card section">
                  <h3>Leaderboard — {selectedAccount.id}</h3>
                  <Leaderboard competitionCode={selectedAccount.id} variant="competition" />
                </div>
              )}
              {selectedAccount.type === 'team' && (
                <div className="card section">
                  <h3>Leaderboard — {selectedAccount.competition_code} (Team)</h3>
                  <Leaderboard competitionCode={selectedAccount.competition_code} variant="team" />
                </div>
              )}
            </>
          ) : (
            <>
              {/* Teams */}
              <div className="card section">
                <h2>👥 Teams</h2>

                <div className="section">
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

                <div className="section">
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

                {teamMessage && <p className="note">{teamMessage}</p>}
              </div>

              {/* Group Competitions */}
              <div className="card section">
                <h2>🏁 Group Competitions</h2>

                <div className="section">
                  <h3>Create Competition</h3>
                  <div className="section" style={{ display: 'grid', gap: 10, maxWidth: 520 }}>
                    <label className="em">Competition Name</label>
                    <input
                      type="text"
                      placeholder="Enter Competition Name"
                      value={competitionName}
                      onChange={(e) => setCompetitionName(e.target.value)}
                    />
                    <label className="em">Start Date</label>
                    <input
                      type="date"
                      value={compStartDate}
                      onChange={(e) => setCompStartDate(e.target.value)}
                    />
                    <label className="em">End Date</label>
                    <input
                      type="date"
                      value={compEndDate}
                      onChange={(e) => setCompEndDate(e.target.value)}
                    />
                    <label className="em">Max Position Limit</label>
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

                    <label className="em" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input
                        type="checkbox"
                        checked={featureCompetition}
                        onChange={(e) => setFeatureCompetition(e.target.checked)}
                      />
                      Feature This Competition
                    </label>

                    <button className="competition-button" onClick={createCompetition}>
                      Create Competition
                    </button>
                  </div>
                </div>

                <div className="section">
                  <h3>Join Competition</h3>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <input
                      type="text"
                      placeholder="Enter Competition Code"
                      value={joinCompetitionCode}
                      onChange={(e) => setJoinCompetitionCode(e.target.value)}
                    />
                    <button className="competition-button" onClick={joinCompetition}>
                      Join Competition
                    </button>
                  </div>
                </div>

                {competitionMessage && <p className="note">{competitionMessage}</p>}
              </div>

              {/* Team Competitions */}
              <div className="card section">
                <h2>🤝 Team Competitions</h2>
                <div className="section" style={{ display: 'grid', gap: 8, maxWidth: 520 }}>
                  <input
                    type="text"
                    placeholder="Enter Team Code"
                    value={joinTeamCompetitionTeamCode}
                    onChange={(e) => setJoinTeamCompetitionTeamCode(e.target.value)}
                  />
                  <input
                    type="text"
                    placeholder="Enter Competition Code"
                    value={joinTeamCompetitionCode}
                    onChange={(e) => setJoinTeamCompetitionCode(e.target.value)}
                  />
                  <button className="competition-button" onClick={joinCompetitionAsTeam}>
                    Join Competition as Team
                  </button>
                </div>
                {teamCompetitionMessage && <p className="note">{teamCompetitionMessage}</p>}
              </div>

              <button className="logout-button" onClick={handleLogout}>
                Logout
              </button>
            </>
          )}
        </div>
      ) : (
        // Logged-out view
        <div className="card" style={{ maxWidth: 420, margin: '0 auto' }}>
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
              <p className="note">
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
              <p className="note">
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

      {/* Join Modal */}
      {showModal && modalCompetition && (
        <div className="modal-overlay">
          <div className="card" style={{ maxWidth: 540, margin: '0 auto' }}>
            <h2>Join Competition</h2>
            <p>
              Do you want to join <strong>{modalCompetition.name}</strong>?
            </p>
            <p className="note">
              {new Date(modalCompetition.start_date).toLocaleDateString()} →{' '}
              {new Date(modalCompetition.end_date).toLocaleDateString()}
            </p>
            <div className="section" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button onClick={joinFeaturedCompetition}>Join</button>
              <button className="logout-button" onClick={closeModal}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
