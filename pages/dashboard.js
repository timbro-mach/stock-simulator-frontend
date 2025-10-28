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

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

// Memoized ChartPanel component
const ChartPanel = memo(({ chartData, chartRange, onRangeChange }) => (
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
                                ticks: { color: '#6b7280', callback: (v) => `$${v} ` },
                            },
                        },
                        plugins: {
                            legend: { display: false },
                            tooltip: {
                                mode: 'index',
                                intersect: false,
                                callbacks: {
                                    label: (context) => `$${context.formattedValue} `,
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
));

ChartPanel.displayName = 'ChartPanel';

// Memoized SharedInputs component
const SharedInputs = memo(({ onBuy, onSell, stockSymbol, setStockSymbol, tradeQuantity, setTradeQuantity, handleSearch, stockPrice, chartSymbol, tradeMessage }) => {
    console.log('SharedInputs rendered'); // Debug to track re-renders

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
                    <button type="submit">🔍 Search</button>
                </form>
                {stockPrice !== null && chartSymbol && (
                    <p className="note">Price for {chartSymbol.toUpperCase()}: ${Number(stockPrice).toFixed(2)}</p>
                )}
            </div>

            <div className="section" style={{ display: 'flex', gap: 8 }}>
                <input
                    type="number"
                    placeholder="Quantity"
                    value={tradeQuantity || ''}
                    onChange={(e) => setTradeQuantity(e.target.value === '' ? 0 : Number(e.target.value))}
                    min="0"
                    autoComplete="off"
                />
                <button onClick={onBuy}>Buy</button>
                <button onClick={onSell}>Sell</button>
            </div>

            {tradeMessage && <p className="note">{tradeMessage}</p>}
        </>
    );
});

SharedInputs.displayName = 'SharedInputs';



const Dashboard = () => {
    // =========================================
    // Auth & Global UI State
    // =========================================
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [email, setEmail] = useState('');
    const [isRegistering, setIsRegistering] = useState(false);
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [isAdmin, setIsAdmin] = useState(false);
    const [isLoading, setIsLoading] = useState(false); // NEW: Loading state

    // Toggle dashboard vs trading workspace
    const [showTrading, setShowTrading] = useState(false);

    // =========================================
    // Accounts & Selections
    // =========================================
    const [globalAccount, setGlobalAccount] = useState({ cash_balance: 0, portfolio: [], total_value: 0 });
    const [competitionAccounts, setCompetitionAccounts] = useState([]);
    const [teamCompetitionAccounts, setTeamCompetitionAccounts] = useState([]);
    const [teams, setTeams] = useState([]);

    // Selected account context for trading/actions
    const [selectedAccount, setSelectedAccount] = useState({ type: 'global' });

    // =========================================
    // Trading state
    // =========================================
    const [stockSymbol, setStockSymbol] = useState('');
    const [chartSymbol, setChartSymbol] = useState('');
    const [stockPrice, setStockPrice] = useState(null);
    const [tradeQuantity, setTradeQuantity] = useState(0);
    const [tradeMessage, setTradeMessage] = useState('');
    const [chartData, setChartData] = useState(null);
    const [chartRange, setChartRange] = useState('1M');

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
    const [allCompetitions, setAllCompetitions] = useState([]); // NEW: For admin panel
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
        const now = new Date();
        const pstDateString = now.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' });
        const pstDate = new Date(pstDateString);

        const day = pstDate.getDay(); // 0 = Sunday, 6 = Saturday
        if (day === 0 || day === 6) return false; // weekends closed

        const currentMinutes = pstDate.getHours() * 60 + pstDate.getMinutes();
        const openMinutes = 6 * 60 + 30; // 6:30 AM
        const closeMinutes = 13 * 60; // 1:00 PM
        return currentMinutes >= openMinutes && currentMinutes < closeMinutes;
    };


    const fetchUserData = useCallback(async () => {
        if (!username) return;
        setIsLoading(true);
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
        } finally {
            setIsLoading(false);
        }
    }, [username]);

    const [enteredCode, setEnteredCode] = useState('');

    const joinFeaturedCompetition = async (codeOverride = null) => {
        const compCode = codeOverride || (modalCompetition ? enteredCode || modalCompetition.code : null);
        if (!compCode) return alert('Please enter the competition code.');

        setIsLoading(true);
        try {
            const res = await axios.post(`${BASE_URL}/competition/join`, {
                username,
                competition_code: compCode,
            });
            alert(res.data.message);
            closeModal();
            fetchUserData();
        } catch (error) {
            console.error('Error joining competition:', error);
            alert('Error joining competition.');
        } finally {
            setIsLoading(false);
            setEnteredCode('');
        }
    };


    const fetchFeaturedCompetitions = async () => {
        setIsLoading(true);
        try {
            const url = isAdmin ? `${BASE_URL}/admin/competitions?admin_username=${username}` : `${BASE_URL}/featured_competitions`;
            const response = await axios.get(url);
            const currentDate = new Date();
            if (isAdmin) {
                setAllCompetitions(response.data || []);
                setFeaturedCompetitions(response.data.filter(comp => comp.featured && (new Date(comp.end_date) >= currentDate || comp.end_date === null)).slice(0, 10));
            } else {
                const validComps = response.data
                    .filter(comp => new Date(comp.end_date) >= currentDate || comp.end_date === null)
                    .slice(0, 10);
                setFeaturedCompetitions(validComps || []);
            }
        } catch (error) {
            console.error('Error fetching competitions:', error);
            setFeaturedCompetitions([]);
            if (isAdmin) setAllCompetitions([]);
        } finally {
            setIsLoading(false);
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

    useEffect(() => {
        const cleanTyped = stockSymbol.trim().toUpperCase();
        const cleanChart = chartSymbol.trim().toUpperCase();
        if (cleanTyped && cleanTyped !== cleanChart) {
            setStockPrice(null);
            setTradeMessage('');
            setChartData(null);
        }
    }, [stockSymbol, chartSymbol]);

    // =========================================
    // Auth handlers
    // =========================================
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
            console.error('Login failed:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleRegister = async (e) => {
        e.preventDefault();
        setIsLoading(true);
        try {
            const res = await axios.post(`${BASE_URL}/register`, { username, password, email });
            alert(res.data.message);
            setIsRegistering(false);
            setEmail('');
        } catch (error) {
            alert(error.response?.data?.message || 'Failed to register.');
            console.error('Register error:', error);
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
        setGlobalAccount({ cash_balance: 0, portfolio: [], total_value: 0 });
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

    // =========================================
    // Admin Actions
    // =========================================
    const handleRemoveUserFromCompetition = async () => {
        setIsLoading(true);
        try {
            const payload = {
                admin_username: username,
                target_username: removeCompUserUsername,
                competition_code: removeCompCode,
            };
            const res = await axios.post(`${BASE_URL}/admin/remove_user_from_competition`, payload);
            setAdminMessage(res.data.message);
            fetchUserData();
            fetchFeaturedCompetitions();
        } catch (error) {
            console.error('Error removing user from competition:', error);
            setAdminMessage('Failed to remove user from competition.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleRemoveUserFromTeam = async () => {
        setIsLoading(true);
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
        } finally {
            setIsLoading(false);
        }
    };

    const toggleFeaturedStatus = async (competitionCode, currentFeatured) => {
        setIsLoading(true);
        try {
            const payload = {
                admin_username: username,
                competition_code: competitionCode,
                feature_competition: !currentFeatured,
            };
            const res = await axios.post(`${BASE_URL}/admin/update_featured_status`, payload);
            alert(res.data.message);
            fetchFeaturedCompetitions();
        } catch (error) {
            console.error('Error toggling featured status:', error);
            alert('Failed to update featured status.');
        } finally {
            setIsLoading(false);
        }
    };

    const deleteCompetition = async (competitionCode) => {
        if (!window.confirm(`Are you sure you want to delete competition ${competitionCode}?`)) return;
        setIsLoading(true);
        try {
            const payload = {
                username: username,
                competition_code: competitionCode,
            };
            const res = await axios.post(`${BASE_URL}/admin/delete_competition`, payload);
            alert(res.data.message);
            fetchFeaturedCompetitions();
        } catch (error) {
            console.error('Error deleting competition:', error);
            alert('Failed to delete competition.');
        } finally {
            setIsLoading(false);
        }
    };

    const toggleCompetitionOpen = async (competitionCode, currentStatus) => {
        setIsLoading(true);
        try {
            const payload = {
                admin_username: username,
                competition_code: competitionCode,
                is_open: !currentStatus,
            };
            const res = await axios.post(`${BASE_URL}/admin/update_competition_open`, payload);
            alert(res.data.message);
            fetchFeaturedCompetitions();
        } catch (error) {
            console.error('Error toggling competition open status:', error);
            alert('Failed to update competition open/closed status.');
        } finally {
            setIsLoading(false);
        }
    };

    // =========================================
    // Trading handlers
    // =========================================
    const handleRangeChange = useCallback((range) => {
        setChartRange(range);
        if (chartSymbol) {
            getStockPrice(range);
        }
    }, [chartSymbol]);

    const getStockPrice = async (range = chartRange) => {
        if (!chartSymbol) return;

        const symbolToUse = chartSymbol.trim().toUpperCase();
        if (!symbolToUse) {
            setTradeMessage('Please enter a stock symbol.');
            return;
        }

        setIsLoading(true);
        try {
            console.log('Fetching data for:', symbolToUse);
            const response = await axios.get(`${BASE_URL}/stock/${symbolToUse}`);

            if (response.data?.price) {
                setStockPrice(response.data.price);
                setTradeMessage(`Current price for ${symbolToUse}: $${response.data.price.toFixed(2)}`);
            }

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
                            label: `${symbolToUse} (${range})`,
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
        setTimeout(() => getStockPrice(chartRange, cleanSymbol), 0);

    };

    const checkSymbolMatch = () => {
        const cleanTyped = stockSymbol.trim().toUpperCase();
        const cleanChart = chartSymbol.trim().toUpperCase();
        return cleanTyped === cleanChart;
    };


    const executeTrade = async (action) => {
        if (!stockSymbol || tradeQuantity <= 0) {
            setTradeMessage("Enter a valid symbol and quantity.");
            return;
        }

        if (!isTradingHours()) {
            setTradeMessage("Market is closed. Trading hours are 6:30 AM – 1:00 PM PST (9:30 AM – 4:00 PM EST), Monday through Friday.");
            return;
        }

        setTradeMessage("Processing trade...");

        try {
            let endpoint = "";
            let payload = { username, symbol: stockSymbol, quantity: tradeQuantity };

            if (selectedAccount.type === "global") {
                endpoint = `/${action}`; // /buy or /sell
            } else if (selectedAccount.type === "competition") {
                endpoint = `/competition/${action}`;
                payload.competition_code = selectedAccount.id; // e.g. "a37b9c21"
            } else if (selectedAccount.type === "team") {
                endpoint = `/team/${action}`;
                payload.team_id = selectedAccount.team_id; // numeric ID
            } else if (selectedAccount.type === "team_competition") {
                endpoint = `/competition/team/${action}`;
                payload.competition_code = selectedAccount.competition_code;
                payload.team_id = selectedAccount.team_id;
            }

            console.log("🔹 Sending trade:", endpoint, payload);
            const res = await axios.post(`${BASE_URL}${endpoint}`, payload);
            setTradeMessage(res.data.message || "Trade successful.");
            fetchUserData(); // refresh account balances & holdings
        } catch (err) {
            console.error("Trade error:", err.response?.data || err.message);
            setTradeMessage(err.response?.data?.message || "Trade failed.");
        }
    };


    // =========================================
    // Teams & Competitions
    // =========================================
    const createTeam = async () => {
        if (!teamName) return setTeamMessage('Please enter a team name.');
        setIsLoading(true);
        try {
            const res = await axios.post(`${BASE_URL}/team/create`, { username, team_name: teamName });
            setTeamMessage(`Team created successfully! Your Team Code is ${res.data.team_code}`);
            setTeamName('');
            fetchUserData();
        } catch (error) {
            console.error('Error creating team:', error);
            setTeamMessage('Error creating team.');
        } finally {
            setIsLoading(false);
        }
    };

    const joinTeam = async () => {
        if (!joinTeamCode) return setTeamMessage('Please enter a team code.');
        setIsLoading(true);
        try {
            const res = await axios.post(`${BASE_URL}/team/join`, { username, team_code: joinTeamCode });
            setTeamMessage(res.data.message);
            setJoinTeamCode('');
            fetchUserData();
        } catch (error) {
            console.error('Error joining team:', error);
            setTeamMessage('Error joining team.');
        } finally {
            setIsLoading(false);
        }
    };

    const createCompetition = async () => {
        if (!competitionName) return setCompetitionMessage('Please enter a competition name.');
        setIsLoading(true);
        try {
            const payload = {
                username,
                competition_name: competitionName,
                start_date: compStartDate,
                end_date: compEndDate,
                max_position_limit: maxPositionLimit,
                featured: isAdmin ? featureCompetition : false, // Restrict featuring to admins
            };
            console.log('Creating competition with payload:', payload); // Debug
            const res = await axios.post(`${BASE_URL}/competition/create`, payload);
            setCompetitionMessage(`Competition created successfully! Code: ${res.data.competition_code}`);
            setCompetitionName('');
            setCompStartDate('');
            setCompEndDate('');
            setMaxPositionLimit('100%');
            setFeatureCompetition(false);
            fetchUserData();
            fetchFeaturedCompetitions();
        } catch (error) {
            console.error('Error creating competition:', error);
            setCompetitionMessage(error.response?.data?.message || 'Error creating competition.');
        } finally {
            setIsLoading(false);
        }
    };

    const joinCompetition = async () => {
        if (!joinCompetitionCode) return setCompetitionMessage('Please enter a competition code.');
        setIsLoading(true);
        try {
            const res = await axios.post(`${BASE_URL}/competition/join`, { username, competition_code: joinCompetitionCode });
            setCompetitionMessage(res.data.message);
            setJoinCompetitionCode('');
            fetchUserData();
        } catch (error) {
            console.error('Error joining competition:', error);
            setCompetitionMessage('Error joining competition.');
        } finally {
            setIsLoading(false);
        }
    };

    const joinCompetitionAsTeam = async () => {
        if (!joinTeamCompetitionTeamCode || !joinTeamCompetitionCode) {
            return setTeamCompetitionMessage('Please enter both team code and competition code.');
        }
        setIsLoading(true);
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
        } finally {
            setIsLoading(false);
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



    /* -------------------------------------------------------------------------- */
    /*                             ACCOUNT SUMMARY BOX                             */
    /* -------------------------------------------------------------------------- */
    const AccountSummaryBox = memo(({ account, isGlobal, onReset }) => {
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

    // =========================================
    // Render helpers
    // =========================================
    const resetGlobalAccount = async () => {
        if (!window.confirm("Are you sure you want to reset your global account to $100,000?")) return;
        setIsLoading(true);
        try {
            const res = await axios.post(`${BASE_URL}/reset_global`, { username });
            alert(res.data.message);
            fetchUserData();
        } catch (error) {
            console.error("Error resetting global account:", error);
            alert("Failed to reset global account.");
        } finally {
            setIsLoading(false);
        }
    };


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
        return (
            <div className="card section">
                <h3>
                    Trade Stocks —{" "}
                    {selectedAccount.type === "global"
                        ? "Global"
                        : selectedAccount.type === "competition"
                            ? "Competition (Individual)"
                            : "Competition (Team)"}
                </h3>

                <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
                    <div style={{ flex: 1, minWidth: 280 }}>
                        <SharedInputs
                            onBuy={() => executeTrade("buy")}
                            onSell={() => executeTrade("sell")}
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

                    <ChartPanel
                        chartData={chartData}
                        chartRange={chartRange}
                        onRangeChange={handleRangeChange}
                    />
                </div>
            </div>
        );
    };



    // =========================================
    // Main Render
    // =========================================
    return (
        <div className="dashboard-container">
            <header style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '10px'
            }}>
                <div>
                    <h1>📊 Stock Market Simulator</h1>
                    {isLoggedIn && (
                        <p className="note" style={{ marginTop: 2 }}>
                            Welcome back, <span className="em">{username}</span>.
                        </p>
                    )}
                </div>

                {isLoggedIn && (
                    <button
                        onClick={() => setShowTrading(!showTrading)}
                        disabled={isLoading}
                        style={{
                            background: showTrading ? '#1d4ed8' : '#2563eb',
                            color: 'white',
                            padding: '8px 16px',
                            border: 'none',
                            borderRadius: 8,
                            fontWeight: 500,
                            cursor: 'pointer',
                            transition: 'background 0.2s',
                        }}
                    >
                        {showTrading ? '⬅ Back to Dashboard' : '🚀 Start Trading'}
                    </button>
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
                                    disabled={isLoading}
                                />
                                <input
                                    type="text"
                                    placeholder="Competition Code"
                                    value={removeCompCode}
                                    onChange={(e) => setRemoveCompCode(e.target.value)}
                                    disabled={isLoading}
                                />
                                <button onClick={handleRemoveUserFromCompetition} disabled={isLoading}>
                                    Remove
                                </button>
                            </div>

                            <div className="section">
                                <h3>Remove User from Team</h3>
                                <input
                                    type="text"
                                    placeholder="Target Username"
                                    value={removeTeamUserUsername}
                                    onChange={(e) => setRemoveTeamUserUsername(e.target.value)}
                                    disabled={isLoading}
                                />
                                <input
                                    type="text"
                                    placeholder="Team ID"
                                    value={removeTeamId}
                                    onChange={(e) => setRemoveTeamId(e.target.value)}
                                    disabled={isLoading}
                                />
                                <button onClick={handleRemoveUserFromTeam} disabled={isLoading}>
                                    Remove
                                </button>
                            </div>

                            <div className="section">
                                <h3>Manage Competitions</h3>
                                {allCompetitions.length > 0 ? (
                                    allCompetitions.map((comp) => (
                                        <div key={comp.code} style={{ marginBottom: '10px' }}>
                                            <p>
                                                <strong>{comp.name}</strong> (Code: {comp.code})<br />
                                                Open: {comp.is_open ? '✅' : '❌'} | Featured: {comp.featured ? '⭐' : '☆'}<br />
                                                {comp.start_date && comp.end_date ? `${new Date(comp.start_date).toLocaleDateString()} → ${new Date(comp.end_date).toLocaleDateString()}` : 'No dates set'}
                                            </p>
                                            <div style={{ display: 'flex', gap: 8 }}>
                                                <button onClick={() => toggleCompetitionOpen(comp.code, comp.is_open)} disabled={isLoading}>
                                                    {comp.is_open ? 'Close Competition' : 'Open Competition'}
                                                </button>
                                                <button onClick={() => toggleFeaturedStatus(comp.code, comp.featured)} disabled={isLoading}>
                                                    {comp.featured ? 'Unfeature' : 'Feature'}
                                                </button>
                                                <button onClick={() => deleteCompetition(comp.code)} disabled={isLoading}>
                                                    Delete
                                                </button>
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <p className="note">No competitions found.</p>
                                )}
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
                                    const isRestricted = !comp.is_open; // depends on your backend
                                    const status = isRestricted ? 'Restricted' : 'Open';

                                    return (
                                        <div
                                            key={comp.code}
                                            className="section"
                                            style={{
                                                display: 'flex',
                                                gap: 12,
                                                alignItems: 'center',
                                                flexWrap: 'wrap',
                                                justifyContent: 'space-between',
                                            }}
                                        >
                                            <span>
                                                <strong>{comp.name}</strong> • {status} •{' '}
                                                {new Date(comp.start_date).toLocaleDateString()} →{' '}
                                                {new Date(comp.end_date).toLocaleDateString()}
                                            </span>

                                            <button
                                                className="primary"
                                                onClick={() => {
                                                    if (isRestricted) {
                                                        // open modal that asks for competition code
                                                        setModalCompetition(comp);
                                                        setShowModal(true);
                                                    } else {
                                                        // join directly if open
                                                        joinFeaturedCompetition(comp.code);
                                                    }
                                                }}
                                                disabled={isLoading}
                                            >
                                                Join
                                            </button>
                                        </div>
                                    );
                                })
                            ) : (
                                <p className="note">No featured competitions available.</p>
                            )}
                        </div>
                    )}



                    {/* Trading Workspace */}
                    {showTrading ? (
                        <>
                            <div className="card section">
                                <h2>Accounts</h2>
                                <div className="section" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                    <button onClick={() => setSelectedAccount({ type: 'global', id: null })} disabled={isLoading}>Global Account</button>
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
                    ) : (
                        <>
                            <div className="card section">
                                <h2>👥 Teams</h2>
                                <div className="section">
                                    <h3>Create Team</h3>
                                    <input
                                        type="text"
                                        placeholder="Enter Team Name"
                                        value={teamName}
                                        onChange={(e) => setTeamName(e.target.value)}
                                        disabled={isLoading}
                                    />
                                    <button className="team-button" onClick={createTeam} disabled={isLoading}>
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
                                        disabled={isLoading}
                                    />
                                    <button className="team-button" onClick={joinTeam} disabled={isLoading}>
                                        Join Team
                                    </button>
                                </div>

                                {teamMessage && <p className="note">{teamMessage}</p>}
                            </div>

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
                                            disabled={isLoading}
                                        />
                                        <label className="em">Start Date</label>
                                        <input
                                            type="date"
                                            value={compStartDate}
                                            onChange={(e) => setCompStartDate(e.target.value)}
                                            disabled={isLoading}
                                        />
                                        <label className="em">End Date</label>
                                        <input
                                            type="date"
                                            value={compEndDate}
                                            onChange={(e) => setCompEndDate(e.target.value)}
                                            disabled={isLoading}
                                        />
                                        <label className="em">Max Position Limit</label>
                                        <select
                                            value={maxPositionLimit}
                                            onChange={(e) => setMaxPositionLimit(e.target.value)}
                                            disabled={isLoading}
                                        >
                                            <option value="5%">5%</option>
                                            <option value="10%">10%</option>
                                            <option value="25%">25%</option>
                                            <option value="50%">50%</option>
                                            <option value="100%">100%</option>
                                        </select>
                                        {isAdmin && (
                                            <label className="em" style={{ display: 'flex', alignItems: 'center', gap: 8, maxWidth: '200px' }}>
                                                <input
                                                    type="checkbox"
                                                    checked={featureCompetition}
                                                    onChange={(e) => setFeatureCompetition(e.target.checked)}
                                                    disabled={isLoading}
                                                />
                                                Feature This Competition
                                            </label>
                                        )}
                                        <button className="competition-button" onClick={createCompetition} disabled={isLoading}>
                                            {isLoading ? 'Creating...' : 'Create Competition'}
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
                                            disabled={isLoading}
                                        />
                                        <button className="competition-button" onClick={joinCompetition} disabled={isLoading}>
                                            Join Competition
                                        </button>
                                    </div>
                                </div>

                                {competitionMessage && <p className="note">{competitionMessage}</p>}
                            </div>

                            <div className="card section">
                                <h2>🤝 Team Competitions</h2>
                                <div className="section" style={{ display: 'grid', gap: 8, maxWidth: 520 }}>
                                    <input
                                        type="text"
                                        placeholder="Enter Team Code"
                                        value={joinTeamCompetitionTeamCode}
                                        onChange={(e) => setJoinTeamCompetitionTeamCode(e.target.value)}
                                        disabled={isLoading}
                                    />
                                    <input
                                        type="text"
                                        placeholder="Enter Competition Code"
                                        value={joinTeamCompetitionCode}
                                        onChange={(e) => setJoinTeamCompetitionCode(e.target.value)}
                                        disabled={isLoading}
                                    />
                                    <button className="competition-button" onClick={joinCompetitionAsTeam} disabled={isLoading}>
                                        Join Competition as Team
                                    </button>
                                </div>
                                {teamCompetitionMessage && <p className="note">{teamCompetitionMessage}</p>}
                            </div>

                            <button className="logout-button" onClick={handleLogout} disabled={isLoading}>
                                Logout
                            </button>
                        </>
                    )}
                </div>
            ) : (
                <div className="card" style={{ maxWidth: 420, margin: '0 auto' }}>
                    {isRegistering ? (
                        <form onSubmit={handleRegister}>
                            <h2>Create Account</h2>
                            <input
                                type="text"
                                placeholder="Enter username"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                autoComplete="off"
                                disabled={isLoading}
                            />
                            <input
                                type="email"
                                placeholder="Enter email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                autoComplete="off"
                                disabled={isLoading}
                            />
                            <input
                                type="password"
                                placeholder="Enter password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                autoComplete="off"
                                disabled={isLoading}
                            />
                            <button type="submit" disabled={isLoading}>
                                {isLoading ? 'Creating...' : 'Create Account'}
                            </button>
                            <p className="note">
                                Already have an account?{' '}
                                <a
                                    href="#"
                                    onClick={(e) => {
                                        e.preventDefault();
                                        setIsRegistering(false);
                                        setEmail('');
                                    }}
                                >
                                    Login
                                </a>
                            </p>
                        </form>
                    ) : (
                        <form onSubmit={handleLogin}>
                            <h2>Login</h2>
                            <div
                                className="section"
                                style={{
                                    background: '#f1f5f9',
                                    border: '1px solid #e2e8f0',
                                    borderRadius: 10,
                                    padding: 14,
                                    marginBottom: 14,
                                    lineHeight: 1.6,
                                }}
                            >
                                <p className="note" style={{ margin: 0, color: '#1e293b' }}>
                                    👋 <strong>Welcome to the free Stock Market Simulator!</strong><br />
                                    Here’s how it works:
                                </p>
                                <ul style={{ marginTop: 10, paddingLeft: 18, color: '#334155' }}>
                                    <li>
                                        💰 <strong>Global Account</strong> — Everyone has this personal practice account starting with
                                        <em> $100,000 virtual cash</em>. Trade anytime to build skill and confidence. Reset the balance whenever you want.
                                    </li>
                                    <li>
                                        🏁 <strong>Competition Accounts</strong> — You can create or join competitions easily.
                                        Each competition has a competition code, its own leaderboard, balance, P&L and competition dates.
                                    </li>
                                    <li>
                                        🤝 <strong>Team Accounts</strong> — Trade with friends! Create a team of classmates or friends to trade and compete together.
                                        Teams accounts have their own leaderboard and balances and results are shared by your team.
                                    </li>
                                </ul>
                                <p className="note" style={{ marginTop: 8 }}>
                                    Login below or click <em>“Create Account”</em> to get started!
                                </p>
                            </div>

                            <input
                                type="text"
                                placeholder="Enter username"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                autoComplete="off"
                                disabled={isLoading}
                            />
                            <input
                                type="password"
                                placeholder="Enter password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                autoComplete="off"
                                disabled={isLoading}
                            />
                            <button type="submit" disabled={isLoading}>
                                {isLoading ? 'Logging in...' : 'Login'}
                            </button>
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
                    <div className="card" style={{ maxWidth: 540, margin: 0 }}>
                        <h2>🔒 Restricted Competition</h2>
                        <p>
                            Enter the access code to join <strong>{modalCompetition.name}</strong>.
                        </p>
                        <p className="note">
                            {new Date(modalCompetition.start_date).toLocaleDateString()} →{' '}
                            {new Date(modalCompetition.end_date).toLocaleDateString()}
                        </p>

                        <div className="section">
                            <label>Competition Code</label>
                            <input
                                type="text"
                                placeholder="Enter Code"
                                value={enteredCode}
                                onChange={(e) => setEnteredCode(e.target.value)}
                                disabled={isLoading}
                            />
                        </div>

                        <div className="section" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            <button onClick={() => joinFeaturedCompetition()} disabled={isLoading}>
                                Join
                            </button>
                            <button className="logout-button" onClick={closeModal} disabled={isLoading}>
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
