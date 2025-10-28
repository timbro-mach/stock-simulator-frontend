import React, { useState, useEffect, useCallback, memo } from 'react';
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

ChartJS.register(
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend
);

/* -------------------------------------------------------------------------- */
/*                               CHART PANEL                                  */
/* -------------------------------------------------------------------------- */
const ChartPanel = memo(({ chartData, chartRange, onRangeChange }) => {
    const getGradient = (ctx, chartArea) => {
        if (!chartArea) return null;
        const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
        gradient.addColorStop(0, 'rgba(37,99,235,0.4)');
        gradient.addColorStop(1, 'rgba(37,99,235,0.0)');
        return gradient;
    };

    const dataWithGradient = chartData
        ? {
            ...chartData,
            datasets: chartData.datasets.map((ds) => ({
                ...ds,
                backgroundColor: (context) => {
                    const chart = context.chart;
                    const { ctx, chartArea } = chart;
                    return getGradient(ctx, chartArea);
                },
            })),
        }
        : null;

    return (
        <div style={{ flex: 1, minHeight: 320 }}>
            <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                {['1D', '1W', '1M', '6M', '1Y'].map((r) => (
                    <button
                        key={r}
                        onClick={() => onRangeChange(r)}
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

            {dataWithGradient ? (
                <div style={{ height: '300px', width: '100%' }}>
                    <Line
                        data={dataWithGradient}
                        options={{
                            responsive: true,
                            maintainAspectRatio: false,
                            scales: {
                                x: { grid: { display: false }, ticks: { color: '#6b7280', maxTicksLimit: 6 } },
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
                                    callbacks: { label: (ctx) => `$${ctx.formattedValue}` },
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
});
ChartPanel.displayName = 'ChartPanel';

/* -------------------------------------------------------------------------- */
/*                               SHARED INPUTS                                 */
/* -------------------------------------------------------------------------- */
const SharedInputs = memo(
    ({
        onBuy,
        onSell,
        stockSymbol,
        setStockSymbol,
        tradeQuantity,
        setTradeQuantity,
        handleSearch,
        stockPrice,
        chartSymbol,
        tradeMessage,
    }) => {
        console.log('SharedInputs rendered');

        return (
            <>
                <div className="section" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <form
                        onSubmit={(e) => {
                            e.preventDefault();
                            handleSearch(e);
                        }}
                        style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}
                    >
                        <input
                            type="text"
                            placeholder="Stock Symbol"
                            value={stockSymbol}
                            onChange={(e) => setStockSymbol(e.target.value)}
                            autoComplete="off"
                        />
                        <button type="submit">Search</button>
                    </form>
                    {stockPrice !== null && chartSymbol && (
                        <p className="note">
                            Price for {chartSymbol.toUpperCase()}: ${Number(stockPrice).toFixed(2)}
                        </p>
                    )}
                </div>

                <div className="section" style={{ display: 'flex', gap: 8 }}>
                    <input
                        type="number"
                        placeholder="Quantity"
                        value={tradeQuantity || ''}
                        onChange={(e) =>
                            setTradeQuantity(e.target.value === '' ? 0 : Number(e.target.value))
                        }
                        min="0"
                        autoComplete="off"
                    />
                    <button onClick={onBuy}>Buy</button>
                    <button onClick={onSell}>Sell</button>
                </div>

                {tradeMessage && <p className="note">{tradeMessage}</p>}
            </>
        );
    }
);
SharedInputs.displayName = 'SharedInputs';

/* -------------------------------------------------------------------------- */
/*                             ACCOUNT SUMMARY BOX                             */
/* -------------------------------------------------------------------------- */
const AccountSummaryBox = memo(({ account, isGlobal, onReset }) => {
    // provide safe defaults if any field is missing
    const {
        cash_balance = 0,
        total_value = 0,
        pnl = 0,
        daily_pnl = 0,
        return_pct = 0,
        name = '',
        code = ''
    } = account || {};

    const format = (n) =>
        typeof n === 'number'
            ? n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
            : '0.00';
    const pct = (n) =>
        typeof n === 'number' ? n.toFixed(2) + '%' : '0.00%';

    return (
        <div className="card section" style={{ minWidth: 280, maxWidth: 360 }}>
            <h3>{isGlobal ? 'Global Account' : name + (code ? ` (${code})` : '')}</h3>
            <p className="note">Cash: ${format(cash_balance)}</p>
            <p className="note">Total Value: <strong>${format(total_value)}</strong></p>
            <p className="note">
                P&L: <span style={{ color: pnl >= 0 ? 'green' : 'red' }}>${format(pnl)}</span>
            </p>
            <p className="note">
                Daily P&L: <span style={{ color: daily_pnl >= 0 ? 'green' : 'red' }}>${format(daily_pnl)}</span>
            </p>
            <p className="note">
                Return: <span style={{ color: return_pct >= 0 ? 'green' : 'red' }}>{pct(return_pct)}</span>
            </p>
            {isGlobal && (
                <button
                    onClick={onReset}
                    style={{
                        marginTop: 8,
                        background: '#dc2626',
                        color: 'white',
                        padding: '6px 12px',
                        border: 'none',
                        borderRadius: 4,
                        cursor: 'pointer',
                    }}
                >
                    Reset to $100,000
                </button>
            )}
        </div>
    );
});

AccountSummaryBox.displayName = 'AccountSummaryBox';

/* -------------------------------------------------------------------------- */
/*                                 DASHBOARD                                  */
/* -------------------------------------------------------------------------- */
const Dashboard = () => {
    // Auth & UI State
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [email, setEmail] = useState('');
    const [isRegistering, setIsRegistering] = useState(false);
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [isAdmin, setIsAdmin] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [showTrading, setShowTrading] = useState(false);

    // Accounts
    const [globalAccount, setGlobalAccount] = useState({
        cash_balance: 0,
        portfolio: [],
        total_value: 0,
        pnl: 0,
        daily_pnl: 0,
        return_pct: 0,
    });
    const [competitionAccounts, setCompetitionAccounts] = useState([]);
    const [teamCompetitionAccounts, setTeamCompetitionAccounts] = useState([]);
    const [teams, setTeams] = useState([]);
    const [selectedAccount, setSelectedAccount] = useState({ type: 'global' });

    // Trading
    const [stockSymbol, setStockSymbol] = useState('');
    const [chartSymbol, setChartSymbol] = useState('');
    const [stockPrice, setStockPrice] = useState(null);
    const [tradeQuantity, setTradeQuantity] = useState(0);
    const [tradeMessage, setTradeMessage] = useState('');
    const [chartData, setChartData] = useState(null);
    const [chartRange, setChartRange] = useState('1M');

    // Teams & Competitions
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

    // Featured Comps + Modal
    const [featuredCompetitions, setFeaturedCompetitions] = useState([]);
    const [allCompetitions, setAllCompetitions] = useState([]);
    const [showModal, setShowModal] = useState(false);
    const [modalCompetition, setModalCompetition] = useState(null);
    const [accessCode, setAccessCode] = useState('');

    // Admin Tools
    const [removeCompUserUsername, setRemoveCompUserUsername] = useState('');
    const [removeCompCode, setRemoveCompCode] = useState('');
    const [removeTeamUserUsername, setRemoveTeamUserUsername] = useState('');
    const [removeTeamId, setRemoveTeamId] = useState('');
    const [adminMessage, setAdminMessage] = useState('');

    const BASE_URL = 'https://stock-simulator-backend.onrender.com';

    /* ------------------------------ Helpers ------------------------------ */
    const isTradingHours = () => {
        const pstDate = new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' });
        const date = new Date(pstDate);
        const current = date.getHours() * 60 + date.getMinutes();
        const start = 6 * 60 + 30;
        const end = 13 * 60;
        return current >= start && current < end;
    };

    const fetchUserData = useCallback(async () => {
        if (!username) return;
        setIsLoading(true);
        try {
            const response = await axios.get(`${BASE_URL}/user`, { params: { username } });
            setGlobalAccount(response.data.global_account || {
                cash_balance: 0,
                portfolio: [],
                total_value: 0,
                pnl: 0,
                daily_pnl: 0,
                return_pct: 0,
            });
            setCompetitionAccounts(response.data.competition_accounts || []);
            setTeamCompetitionAccounts(response.data.team_competitions || []);
            if (response.data.is_admin !== undefined) setIsAdmin(response.data.is_admin);
            if (response.data.teams) setTeams(response.data.teams);
        } catch (error) {
            if (error.response?.status === 404) {
                localStorage.removeItem('username');
                setIsLoggedIn(false);
            }
        } finally {
            setIsLoading(false);
        }
    }, [username]);

    const fetchFeaturedCompetitions = async () => {
        setIsLoading(true);
        try {
            const url = isAdmin
                ? `${BASE_URL}/admin/competitions?admin_username=${username}`
                : `${BASE_URL}/featured_competitions`;
            const response = await axios.get(url);
            const currentDate = new Date();
            if (isAdmin) {
                setAllCompetitions(response.data || []);
                setFeaturedCompetitions(
                    response.data
                        .filter((comp) => comp.featured && (new Date(comp.end_date) >= currentDate || comp.end_date === null))
                        .slice(0, 10)
                );
            } else {
                setFeaturedCompetitions(
                    response.data
                        .filter((comp) => new Date(comp.end_date) >= currentDate || comp.end_date === null)
                        .slice(0, 10)
                );
            }
        } catch (error) {
            console.error('Error fetching competitions:', error);
            setFeaturedCompetitions([]);
            if (isAdmin) setAllCompetitions([]);
        } finally {
            setIsLoading(false);
        }
    };

    const resetGlobalAccount = async () => {
        if (!window.confirm('Reset your Global account to $100,000 and delete all holdings?')) return;
        setIsLoading(true);
        try {
            const res = await axios.post(`${BASE_URL}/reset_global`, { username });
            alert(res.data.message);
            fetchUserData();
        } catch (error) {
            alert('Reset failed: ' + (error.response?.data?.message || 'Unknown error'));
        } finally {
            setIsLoading(false);
        }
    };

    /* ------------------------------ Effects ------------------------------ */
    useEffect(() => {
        const storedUsername = localStorage.getItem('username');
        if (storedUsername) {
            setUsername(storedUsername);
            setIsLoggedIn(true);
        }
    }, []);

    useEffect(() => {
        if (isLoggedIn && username) {
            fetchUserData();
            fetchFeaturedCompetitions();
        }
    }, [isLoggedIn, username, fetchUserData]);

    useEffect(() => {
        const cleanTyped = stockSymbol.trim().toUpperCase();
        const cleanChart = chartSymbol.trim().toUpperCase();
        if (cleanTyped && cleanTyped !== cleanChart) {
            setStockPrice(null);
            setTradeMessage('');
            setChartData(null);
        }
    }, [stockSymbol, chartSymbol]);

    /* --------------------------- Trading Logic --------------------------- */
    const handleRangeChange = useCallback(
        (range) => {
            setChartRange(range);
            if (chartSymbol) getStockPrice(range);
        },
        [chartSymbol]
    );

    const getStockPrice = async (range = chartRange) => {
        if (!chartSymbol) return;
        const symbolToUse = chartSymbol.trim().toUpperCase();
        if (!symbolToUse) {
            setTradeMessage('Please enter a stock symbol.');
            return;
        }

        setIsLoading(true);
        try {
            const response = await axios.get(`${BASE_URL}/stock/${symbolToUse}`);
            if (response.data?.price) {
                setStockPrice(response.data.price);
                setTradeMessage(`Current price for ${symbolToUse}: $${response.data.price.toFixed(2)}`);
            }

            const chartResponse = await axios.get(`${BASE_URL}/stock_chart/${symbolToUse}?range=${range}`);
            if (chartResponse.data && chartResponse.data.length > 0) {
                const labels = chartResponse.data.map((p) => p.date);
                const dataPoints = chartResponse.data.map((p) => p.close);

                setChartData({
                    labels,
                    datasets: [
                        {
                            label: `${symbolToUse} (${range})`,
                            data: dataPoints,
                            fill: true,
                            borderWidth: 2.5,
                            borderColor: '#2563eb',
                            pointRadius: 0,
                            tension: 0.25,
                        },
                    ],
                });
            } else {
                setChartData(null);
                setTradeMessage(`No chart data available for ${symbolToUse}`);
            }
        } catch (error) {
            console.error('Error fetching stock data:', error);
            setTradeMessage('Error fetching stock data.');
            setChartData(null);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSearch = (e) => {
        e.preventDefault();
        const cleanSymbol = stockSymbol.trim().toUpperCase();
        if (!cleanSymbol) {
            setTradeMessage('Please enter a stock symbol.');
            return;
        }
        setChartSymbol(cleanSymbol);
        getStockPrice(chartRange);
    };

    const checkSymbolMatch = () => {
        const cleanTyped = stockSymbol.trim().toUpperCase();
        const cleanChart = chartSymbol.trim().toUpperCase();
        return cleanTyped === cleanChart;
    };

    const checkTradingHoursAndProceed = (action) => {
        if (!isTradingHours()) {
            setTradeMessage('Market is closed. Trading hours are 6:30 AM – 1:00 PM PST.');
            return false;
        }
        action();
        return true;
    };

    const executeTrade = async (endpoint, payload) => {
        setIsLoading(true);
        try {
            const res = await axios.post(`${BASE_URL}${endpoint}`, payload);
            if (res.data?.message) {
                setTradeMessage(res.data.message);
                fetchUserData();
            }
        } catch (error) {
            console.error('Trade failed:', error);
            setTradeMessage('Trade failed.');
        } finally {
            setIsLoading(false);
        }
    };

    const buyStockGlobal = () => {
        if (!stockSymbol || tradeQuantity <= 0) return setTradeMessage('Enter valid symbol and quantity.');
        if (!checkSymbolMatch()) return setTradeMessage('Search for the symbol first to confirm price and chart.');
        if (!checkTradingHoursAndProceed(() => { })) return;
        executeTrade('/buy', { username, symbol: stockSymbol, quantity: tradeQuantity });
    };

    const sellStockGlobal = () => {
        if (!stockSymbol || tradeQuantity <= 0) return setTradeMessage('Enter valid symbol and quantity.');
        if (!checkSymbolMatch()) return setTradeMessage('Search for the symbol first to confirm price and chart.');
        if (!checkTradingHoursAndProceed(() => { })) return;
        executeTrade('/sell', { username, symbol: stockSymbol, quantity: tradeQuantity });
    };

    const buyStockCompetition = () => {
        if (!stockSymbol || tradeQuantity <= 0) return setTradeMessage('Enter valid symbol and quantity.');
        if (!checkSymbolMatch()) return setTradeMessage('Search for the symbol first to confirm price and chart.');
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
        if (!checkSymbolMatch()) return setTradeMessage('Search for the symbol first to confirm price and chart.');
        if (!checkTradingHoursAndProceed(() => { })) return;
        executeTrade('/competition/sell', {
            username,
            competition_code: selectedAccount.id,
            symbol: stockSymbol,
            quantity: tradeQuantity,
        });
    };

    const buyStockTeam = () => {
        if (!stockSymbol || tradeQuantity <= 0) return setTradeMessage('Enter valid symbol and quantity.');
        if (!checkSymbolMatch()) return setTradeMessage('Search for the symbol first to confirm price and chart.');
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
        if (!checkSymbolMatch()) return setTradeMessage('Search for the symbol first to confirm price and chart.');
        if (!checkTradingHoursAndProceed(() => { })) return;
        executeTrade('/competition/team/sell', {
            username,
            team_id: selectedAccount.team_id,
            competition_code: selectedAccount.competition_code,
            symbol: stockSymbol,
            quantity: tradeQuantity,
        });
    };

    /* -------------------------- Auth Handlers -------------------------- */
    const handleLogin = async (e) => {
        e.preventDefault();
        setIsLoading(true);
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
        } finally {
            setIsLoading(false);
        }
    };

    const handleRegister = async (e) => {
        e.preventDefault();
        if (!username || !password || !email) {
            alert('All fields are required.');
            return;
        }
        if (!email.includes('@')) {
            alert('Please enter a valid email.');
            return;
        }

        setIsLoading(true);
        try {
            const res = await axios.post(`${BASE_URL}/register`, { username, password, email });
            alert(res.data.message);
            setIsRegistering(false);
            setEmail('');
        } catch (error) {
            alert(error.response?.data?.message || 'Registration failed.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleLogout = () => {
        localStorage.removeItem('username');
        setUsername('');
        setPassword('');
        setEmail('');
        setIsLoggedIn(false);
        setIsAdmin(false);
        setTeams([]);
        setShowTrading(false);
        setSelectedAccount({ type: 'global' });
        setGlobalAccount({ cash_balance: 0, portfolio: [], total_value: 0, pnl: 0, daily_pnl: 0, return_pct: 0 });
        setCompetitionAccounts([]);
        setTeamCompetitionAccounts([]);
        setStockSymbol('');
        setChartSymbol('');
        setStockPrice(null);
        setTradeQuantity(0);
        setTradeMessage('');
        setChartData(null);
        setFeaturedCompetitions([]);
        setAllCompetitions([]);
    };

    /* --------------------------- Render Helpers --------------------------- */
    const renderAccountDetails = () => {
        if (selectedAccount.type === 'global') {
            return (
                <div className="card section">
                    <h2>Account Summary — Global</h2>
                    <AccountSummaryBox account={globalAccount} isGlobal={true} onReset={resetGlobalAccount} />
                </div>
            );
        }
        if (selectedAccount.type === 'competition') {
            const compAcc = competitionAccounts.find((a) => a.code === selectedAccount.id);
            if (!compAcc) return null;
            return (
                <div className="card section">
                    <h2>Account Summary — Competition (Individual)</h2>
                    <AccountSummaryBox account={compAcc} isGlobal={false} />
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
                    <AccountSummaryBox account={teamAcc} isGlobal={false} />
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
                    {globalAccount.portfolio?.length > 0 ? (
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
                                {globalAccount.portfolio.map((holding, i) => {
                                    const pnl = holding.buy_price
                                        ? (holding.current_price - holding.buy_price) * holding.quantity
                                        : 0;
                                    return (
                                        <tr key={i}>
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
                    {compAcc?.portfolio?.length > 0 ? (
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
                                {compAcc.portfolio.map((holding, i) => {
                                    const pnl = holding.buy_price
                                        ? (holding.current_price - holding.buy_price) * holding.quantity
                                        : 0;
                                    return (
                                        <tr key={i}>
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
                    {teamAcc?.portfolio?.length > 0 ? (
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
                                {teamAcc.portfolio.map((holding, i) => {
                                    const pnl = holding.buy_price
                                        ? (holding.current_price - holding.buy_price) * holding.quantity
                                        : 0;
                                    return (
                                        <tr key={i}>
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
        if (selectedAccount.type === 'global') {
            return (
                <div className="card section">
                    <h3>Trade Stocks (Global)</h3>
                    <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                        <div style={{ flex: 1, minWidth: 280 }}>
                            <SharedInputs
                                onBuy={buyStockGlobal}
                                onSell={sellStockGlobal}
                                stockSymbol={stockSymbol}
                                setStockSymbol={setStockSymbol}
                                tradeQuantity={tradeQuantity}
                                setTradeQuantity={setTradeQuantity}
                                handleSearch={handleSearch}
                                stockPrice={stockPrice}
                                chartSymbol={chartSymbol}
                                tradeMessage={tradeMessage}
                            />
                        </div>
                        <ChartPanel chartData={chartData} chartRange={chartRange} onRangeChange={handleRangeChange} />
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
                            <SharedInputs
                                onBuy={buyStockCompetition}
                                onSell={sellStockCompetition}
                                stockSymbol={stockSymbol}
                                setStockSymbol={setStockSymbol}
                                tradeQuantity={tradeQuantity}
                                setTradeQuantity={setTradeQuantity}
                                handleSearch={handleSearch}
                                stockPrice={stockPrice}
                                chartSymbol={chartSymbol}
                                tradeMessage={tradeMessage}
                            />
                        </div>
                        <ChartPanel chartData={chartData} chartRange={chartRange} onRangeChange={handleRangeChange} />
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
                            <SharedInputs
                                onBuy={buyStockTeam}
                                onSell={sellStockTeam}
                                stockSymbol={stockSymbol}
                                setStockSymbol={setStockSymbol}
                                tradeQuantity={tradeQuantity}
                                setTradeQuantity={setTradeQuantity}
                                handleSearch={handleSearch}
                                stockPrice={stockPrice}
                                chartSymbol={chartSymbol}
                                tradeMessage={tradeMessage}
                            />
                        </div>
                        <ChartPanel chartData={chartData} chartRange={chartRange} onRangeChange={handleRangeChange} />
                    </div>
                </div>
            );
        }

        return null;
    };

    /* ------------------------------ Render ------------------------------ */
    return (
        <div className="dashboard-container">
            <header>
                <h1>Stock Market Simulator</h1>
                {isLoggedIn && <p className="note">Welcome back, <span className="em">{username}</span>.</p>}
                {isLoading && <p className="note">Loading...</p>}
            </header>

            {isLoggedIn ? (
                <div>
                    {/* Featured Competitions */}
                    {!showTrading && (
                        <div className="card section">
                            <h2>Featured Competitions</h2>
                            {featuredCompetitions.length > 0 ? (
                                featuredCompetitions.map((comp) => (
                                    <div
                                        key={comp.code}
                                        className="section"
                                        style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}
                                    >
                                        <span>
                                            <strong>{comp.name}</strong> • {comp.is_open ? 'Open' : 'Restricted'} •{' '}
                                            {new Date(comp.start_date).toLocaleDateString()} →{' '}
                                            {new Date(comp.end_date).toLocaleDateString()}
                                        </span>
                                        <button onClick={() => { setModalCompetition(comp); setShowModal(true); }} disabled={isLoading}>
                                            Join
                                        </button>
                                    </div>
                                ))
                            ) : (
                                <p className="note">No featured competitions available.</p>
                            )}
                        </div>
                    )}

                    {/* Mode Toggle */}
                    <div className="section">
                        {showTrading ? (
                            <button onClick={() => setShowTrading(false)} disabled={isLoading}>
                                Back to Dashboard
                            </button>
                        ) : (
                            <button onClick={() => setShowTrading(true)} disabled={isLoading}>
                                Start Trading
                            </button>
                        )}
                    </div>

                    {/* Trading Workspace */}
                    {showTrading && (
                        <>
                            <div className="card section">
                                <h2>Accounts</h2>
                                <div className="section" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                    <button onClick={() => setSelectedAccount({ type: 'global' })} disabled={isLoading}>
                                        Global Account
                                    </button>
                                    {competitionAccounts.map((acc) => (
                                        <button
                                            key={acc.code}
                                            onClick={() => setSelectedAccount({ type: 'competition', id: acc.code })}
                                            disabled={isLoading}
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
                                            disabled={isLoading}
                                        >
                                            {acc.name} (Team • {acc.code})
                                        </button>
                                    ))}
                                </div>
                                <button className="logout-button" onClick={handleLogout} disabled={isLoading}>
                                    Logout
                                </button>
                            </div>

                            {renderAccountDetails()}
                            {renderPortfolioBox()}
                            {renderTradeBox()}

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
                    )}
                </div>
            ) : (
                /* Login/Register Form */
                <div className="card section" style={{ maxWidth: 400 }}>
                    <h2>{isRegistering ? 'Register' : 'Login'}</h2>
                    <form onSubmit={isRegistering ? handleRegister : handleLogin}>
                        <input
                            type="text"
                            placeholder="Username"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            required
                        />
                        <input
                            type="password"
                            placeholder="Password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                        />
                        {isRegistering && (
                            <input
                                type="email"
                                placeholder="Email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                            />
                        )}
                        <button type="submit" disabled={isLoading}>
                            {isRegistering ? 'Register' : 'Login'}
                        </button>
                    </form>
                    <p className="note">
                        {isRegistering ? (
                            <>
                                Already have an account?{' '}
                                <button className="link" onClick={() => setIsRegistering(false)}>
                                    Login
                                </button>
                            </>
                        ) : (
                            <>
                                New user?{' '}
                                <button className="link" onClick={() => setIsRegistering(true)}>
                                    Register
                                </button>
                            </>
                        )}
                    </p>
                </div>
            )}

            {/* Join Modal */}
            {showModal && modalCompetition && (
                <div
                    className="modal-overlay"
                    style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        background: 'rgba(0,0,0,0.5)',
                        display: 'flex',
                        alignItems: 'flex-start',
                        justifyContent: 'center',
                        zIndex: 1000,
                        paddingTop: '20px',
                    }}
                >
                    <div className="card" style={{ maxWidth: 540 }}>
                        <h2>Join Competition</h2>
                        <p>
                            <strong>{modalCompetition.name}</strong>
                        </p>
                        <p className="note">
                            {new Date(modalCompetition.start_date).toLocaleDateString()} →{' '}
                            {new Date(modalCompetition.end_date).toLocaleDateString()}
                        </p>
                        {!modalCompetition.is_open && (
                            <div style={{ margin: '10px 0' }}>
                                <label className="em">Access Code:</label>
                                <input
                                    type="text"
                                    value={accessCode}
                                    onChange={(e) => setAccessCode(e.target.value)}
                                    placeholder="Enter access code"
                                    style={{ width: '100%', marginTop: 4 }}
                                />
                            </div>
                        )}
                        <div className="section" style={{ display: 'flex', gap: 8 }}>
                            <button
                                onClick={async () => {
                                    setIsLoading(true);
                                    try {
                                        const payload = { username, competition_code: modalCompetition.code };
                                        if (!modalCompetition.is_open) payload.access_code = accessCode;
                                        const res = await axios.post(`${BASE_URL}/competition/join`, payload);
                                        alert(res.data.message);
                                        setShowModal(false);
                                        fetchUserData();
                                    } catch (error) {
                                        alert(error.response?.data?.message || 'Failed to join.');
                                    } finally {
                                        setIsLoading(false);
                                    }
                                }}
                                disabled={isLoading}
                            >
                                Join
                            </button>
                            <button className="logout-button" onClick={() => setShowModal(false)} disabled={isLoading}>
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Dashboard;