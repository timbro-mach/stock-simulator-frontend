import React, { useState, useEffect, useCallback, memo } from 'react';
import axios from 'axios';
import Link from 'next/link';
import { getApiBaseUrl } from '../lib/api';
import { normalizeChartPoints, toTimestamp } from '../lib/chartData';
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
    Filler,
} from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

const formatMoney = (value) => `$${Number(value || 0).toFixed(2)}`;
const formatSignedMoney = (value) => `${Number(value) >= 0 ? '+' : '-'}$${Math.abs(Number(value || 0)).toFixed(2)}`;

const DATE_FORMATTERS = {
    intraday: new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }),
    shortDate: new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }),
    monthYear: new Intl.DateTimeFormat('en-US', { month: 'short', year: '2-digit' }),
};

const formatChartDateLabel = (value, range) => {
    const date = new Date(value);
    if (!value || Number.isNaN(date.getTime())) return String(value || '');

    if (range === '1D') return DATE_FORMATTERS.intraday.format(date);
    if (range === '1W' || range === '1M') return DATE_FORMATTERS.shortDate.format(date);
    return DATE_FORMATTERS.monthYear.format(date);
};

const getPointTradingDay = (point) => {
    const raw = String(point?.date || '').trim();
    if (!raw) return '';
    if (raw.includes('T')) return raw.split('T')[0];
    if (raw.includes(' ')) return raw.split(' ')[0];
    return raw;
};

const RANGE_LOOKBACK_DAYS = {
    '1W': 7,
    '1M': 30,
    '6M': 182,
    '1Y': 365,
};

const getRangeBaselinePrice = (points, range, fallbackPrice) => {
    const lookbackDays = RANGE_LOOKBACK_DAYS[range];
    if (!lookbackDays || !Array.isArray(points) || !points.length) return fallbackPrice;

    const datedPoints = points
        .map((point) => ({
            close: Number(point?.close),
            ts: toTimestamp(point?.date),
        }))
        .filter((point) => Number.isFinite(point.close) && Number.isFinite(point.ts))
        .sort((a, b) => a.ts - b.ts);

    if (!datedPoints.length) return fallbackPrice;

    const latestTs = datedPoints[datedPoints.length - 1].ts;
    const targetTs = latestTs - lookbackDays * 24 * 60 * 60 * 1000;

    let atOrBefore = null;
    let after = null;
    for (const point of datedPoints) {
        if (point.ts <= targetTs) {
            atOrBefore = point;
            continue;
        }
        after = point;
        break;
    }

    return atOrBefore?.close ?? after?.close ?? fallbackPrice;
};

const derivePreviousCloseFromPoints = (points, fallbackPrice) => {
    if (!Array.isArray(points) || points.length === 0) return fallbackPrice;

    const latestDay = getPointTradingDay(points[points.length - 1]);
    for (let i = points.length - 2; i >= 0; i -= 1) {
        const candidate = Number(points[i]?.close);
        if (!Number.isFinite(candidate)) continue;
        const candidateDay = getPointTradingDay(points[i]);
        if (!latestDay || candidateDay !== latestDay) {
            return candidate;
        }
    }

    const secondLast = Number(points[points.length - 2]?.close);
    return Number.isFinite(secondLast) ? secondLast : fallbackPrice;
};

const getIntradayBaselinePrice = (points, fallbackPrice) => {
    if (!Array.isArray(points) || points.length === 0) return fallbackPrice;

    const firstPoint = Number(points[0]?.close);
    return Number.isFinite(firstPoint) ? firstPoint : fallbackPrice;
};

const buildChartState = ({
    points,
    symbol,
    range,
    dailyReferencePoints = [],
    intradayReferencePoints = [],
    apiTodayChangeValue = null,
    apiTodayChangePercent = null,
}) => {
    const labels = points.map((point) => point.date);
    const dataPoints = points.map((point) => Number(point.close));
    const latestPrice = dataPoints[dataPoints.length - 1];
    const previousPrice = dataPoints[dataPoints.length - 2] ?? latestPrice;
    const firstPrice = dataPoints[0] ?? latestPrice;

    const dailyPreviousClose = derivePreviousCloseFromPoints(dailyReferencePoints, previousPrice);
    const rangeBaselinePrice = getRangeBaselinePrice(points, range, firstPrice);
    const rangeChangeValue = latestPrice - rangeBaselinePrice;
    const rangeChangePercent = rangeBaselinePrice ? (rangeChangeValue / rangeBaselinePrice) * 100 : 0;
    const intradayBaselinePrice = getIntradayBaselinePrice(intradayReferencePoints, dailyPreviousClose);
    const dayBaseline = range === '1D'
        ? dailyPreviousClose
        : (Number.isFinite(intradayBaselinePrice) ? intradayBaselinePrice : dailyPreviousClose);
    const hasApiDayChange = range === '1D'
        && !Number.isFinite(dayBaseline)
        && Number.isFinite(Number(apiTodayChangeValue));
    const derivedDayChangeValue = latestPrice - dayBaseline;
    const derivedDayChangePercent = dayBaseline ? (derivedDayChangeValue / dayBaseline) * 100 : 0;
    const dayChangeValue = hasApiDayChange ? Number(apiTodayChangeValue) : derivedDayChangeValue;
    const dayChangePercent = hasApiDayChange && Number.isFinite(Number(apiTodayChangePercent))
        ? Number(apiTodayChangePercent)
        : derivedDayChangePercent;
    const isPositive = dayChangeValue >= 0;

    return {
        chartData: {
            labels,
            datasets: [
                {
                    label: `${symbol} (${range})`,
                    data: dataPoints,
                    fill: true,
                    borderWidth: 2.5,
                    borderColor: isPositive ? '#10b981' : '#ef4444',
                    backgroundColor: (ctx) => {
                        const gradient = ctx.chart.ctx.createLinearGradient(0, 0, 0, 350);
                        gradient.addColorStop(0, isPositive ? 'rgba(16,185,129,0.35)' : 'rgba(239,68,68,0.32)');
                        gradient.addColorStop(1, 'rgba(255,255,255,0.02)');
                        return gradient;
                    },
                    pointRadius: 0,
                    tension: range === '1D' ? 0.08 : 0.24,
                },
            ],
        },
        metrics: {
            latestPrice,
            dayChangeValue,
            dayChangePercent,
            rangeChangeValue,
            rangeChangePercent,
            previousClose: dailyPreviousClose,
            dayBaselinePrice: dayBaseline,
            dayChangeSource: hasApiDayChange ? 'api' : 'derived',
            range,
            rangeBaselinePrice,
        },
    };
};

const syncChartStateWithLiveQuote = (chartState, liveQuotePrice) => {
    if (!Number.isFinite(liveQuotePrice) || !chartState?.chartData?.datasets?.[0]?.data?.length) {
        return chartState;
    }

    const chartRange = chartState.metrics?.range;
    const labels = chartState.chartData?.labels || [];
    const lastLabel = labels[labels.length - 1];
    if (chartRange === '1D') {
        const lastTs = toTimestamp(lastLabel);
        if (!Number.isFinite(lastTs) || Date.now() - lastTs > 2 * 60 * 1000) {
            return chartState;
        }
    }

    const existingDataset = chartState.chartData.datasets[0];
    const nextPoints = [...existingDataset.data];
    nextPoints[nextPoints.length - 1] = liveQuotePrice;

    const previousPoint = Number(nextPoints[nextPoints.length - 2] ?? liveQuotePrice);
    const firstPoint = Number(nextPoints[0] ?? liveQuotePrice);
    const previousClose = Number(chartState.metrics.previousClose ?? previousPoint);

    const rangeBaselinePrice = Number(chartState.metrics.rangeBaselinePrice ?? firstPoint);
    const rangeChangeValue = liveQuotePrice - rangeBaselinePrice;
    const rangeChangePercent = rangeBaselinePrice ? (rangeChangeValue / rangeBaselinePrice) * 100 : 0;
    const defaultDayBaseline = chartRange === '1D' ? previousClose : firstPoint;
    const dayBaseline = Number(chartState.metrics.dayBaselinePrice ?? defaultDayBaseline);
    const useApiDayChange = chartRange === '1D'
        && chartState.metrics?.dayChangeSource === 'api'
        && !Number.isFinite(dayBaseline);
    const derivedDayChangeValue = liveQuotePrice - dayBaseline;
    const derivedDayChangePercent = dayBaseline ? (derivedDayChangeValue / dayBaseline) * 100 : 0;
    const dayChangeValue = useApiDayChange ? Number(chartState.metrics.dayChangeValue) : derivedDayChangeValue;
    const dayChangePercent = useApiDayChange ? Number(chartState.metrics.dayChangePercent) : derivedDayChangePercent;
    const isPositive = dayChangeValue >= 0;

    return {
        chartData: {
            ...chartState.chartData,
            datasets: [
                {
                    ...existingDataset,
                    data: nextPoints,
                    borderColor: isPositive ? '#10b981' : '#ef4444',
                    backgroundColor: (ctx) => {
                        const gradient = ctx.chart.ctx.createLinearGradient(0, 0, 0, 350);
                        gradient.addColorStop(0, isPositive ? 'rgba(16,185,129,0.35)' : 'rgba(239,68,68,0.32)');
                        gradient.addColorStop(1, 'rgba(255,255,255,0.02)');
                        return gradient;
                    },
                },
            ],
        },
        metrics: {
            ...chartState.metrics,
            latestPrice: liveQuotePrice,
            dayChangeValue,
            dayChangePercent,
            rangeChangeValue,
            rangeChangePercent,
            rangeBaselinePrice,
        },
    };
};

// Memoized ChartPanel component
const ChartPanel = memo(({ chartData, chartRange, onRangeChange, chartMetrics, chartSymbol }) => (
    <div style={{ flex: 1, minHeight: 320, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 14, boxShadow: '0 8px 16px rgba(17,24,39,0.05)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
            <div>
                <h3 style={{ margin: 0, fontSize: 18, color: '#111827' }}>{chartSymbol ? `${chartSymbol.toUpperCase()} Overview` : 'Stock Overview'}</h3>
                {chartMetrics && (
                    <p style={{ margin: '5px 0 0', color: chartMetrics.dayChangeValue >= 0 ? '#047857' : '#b91c1c', fontWeight: 600 }}>
                        {formatSignedMoney(chartMetrics.dayChangeValue)} ({chartMetrics.dayChangeValue >= 0 ? '+' : ''}{chartMetrics.dayChangePercent.toFixed(2)}%) today
                    </p>
                )}
            </div>
            {chartMetrics && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(130px, auto))', gap: 6 }}>
                    <p style={{ margin: 0, fontSize: 13, color: '#4b5563' }}>Current: <strong style={{ color: '#111827' }}>{formatMoney(chartMetrics.latestPrice)}</strong></p>
                    <p style={{ margin: 0, fontSize: 13, color: '#4b5563' }}>Prev close: <strong style={{ color: '#111827' }}>{formatMoney(chartMetrics.previousClose)}</strong></p>
                    <p style={{ margin: 0, fontSize: 13, color: '#4b5563' }}>{chartMetrics.range} change: <strong style={{ color: chartMetrics.rangeChangeValue >= 0 ? '#047857' : '#b91c1c' }}>{formatSignedMoney(chartMetrics.rangeChangeValue)}</strong></p>
                    <p style={{ margin: 0, fontSize: 13, color: '#4b5563' }}>{chartMetrics.range} %: <strong style={{ color: chartMetrics.rangeChangePercent >= 0 ? '#047857' : '#b91c1c' }}>{chartMetrics.rangeChangePercent >= 0 ? '+' : ''}{chartMetrics.rangeChangePercent.toFixed(2)}%</strong></p>
                </div>
            )}
        </div>

        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
            {['1D', '1W', '1M', '6M', '1Y'].map((r) => (
                <button
                    key={r}
                    onClick={() => onRangeChange(r)}
                    style={{
                        padding: '5px 12px',
                        borderRadius: 6,
                        background: chartRange === r ? '#1d4ed8' : '#f3f4f6',
                        color: chartRange === r ? '#fff' : '#374151',
                        border: chartRange === r ? '1px solid #1d4ed8' : '1px solid #d1d5db',
                        fontSize: 13,
                        fontWeight: chartRange === r ? 600 : 500,
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
                                ticks: {
                                    color: '#6b7280',
                                    maxTicksLimit: 6,
                                    callback(value) {
                                        return formatChartDateLabel(this.getLabelForValue(value), chartRange);
                                    },
                                },
                            },
                            y: {
                                grid: { color: 'rgba(0,0,0,0.05)' },
                                ticks: { color: '#6b7280', callback: (v) => formatMoney(v) },
                            },
                        },
                        plugins: {
                            legend: { display: false },
                            tooltip: {
                                mode: 'index',
                                intersect: false,
                                callbacks: {
                                    title: (items) => formatChartDateLabel(items[0]?.label, chartRange),
                                    label: (context) => {
                                        const points = context.dataset.data;
                                        const currentPrice = Number(context.parsed.y);
                                        const previousPrice = context.dataIndex > 0 ? Number(points[context.dataIndex - 1]) : currentPrice;
                                        const dollarChange = currentPrice - previousPrice;
                                        const percentChange = previousPrice ? (dollarChange / previousPrice) * 100 : 0;
                                        return `${formatMoney(currentPrice)} (${formatSignedMoney(dollarChange)} / ${dollarChange >= 0 ? '+' : ''}${percentChange.toFixed(2)}%)`;
                                    },
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
const SharedInputs = memo(({ onBuy, onSell, stockSymbol, setStockSymbol, tradeQuantity, setTradeQuantity, handleSearch, stockPrice, chartSymbol, tradeMessage, orderType, setOrderType, limitPrice, setLimitPrice }) => {
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
                        onChange={(e) => setStockSymbol(e.target.value.toUpperCase())}
                        autoComplete="off"
                    />
                    <button type="submit">🔍 Search</button>
                </form>
                {stockPrice !== null && chartSymbol && (
                    <p className="note">Price for {chartSymbol.toUpperCase()}: ${Number(stockPrice).toFixed(2)}</p>
                )}
            </div>

            <div className="section" style={{ display: 'grid', gap: 8 }}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <input
                        type="number"
                        placeholder="Quantity"
                        value={tradeQuantity || ''}
                        onChange={(e) => setTradeQuantity(e.target.value === '' ? 0 : Number(e.target.value))}
                        min="0"
                        autoComplete="off"
                    />
                    <select value={orderType} onChange={(e) => setOrderType(e.target.value)}>
                        <option value="market">Market</option>
                        <option value="limit">Limit</option>
                    </select>
                    {orderType === 'limit' && (
                        <input
                            type="number"
                            placeholder="Limit Price"
                            value={limitPrice}
                            onChange={(e) => setLimitPrice(e.target.value)}
                            min="0"
                            step="0.01"
                            autoComplete="off"
                        />
                    )}
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button onClick={onBuy}>Buy</button>
                    <button onClick={onSell}>Sell</button>
                </div>
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
    const [removeUserUsername, setRemoveUserUsername] = useState('');


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
    const [orderType, setOrderType] = useState('market');
    const [limitPrice, setLimitPrice] = useState('');
    const [pendingLimitOrders, setPendingLimitOrders] = useState([]);
    const [chartData, setChartData] = useState(null);
    const [chartMetrics, setChartMetrics] = useState(null);
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
    const [showTradeBlotterModal, setShowTradeBlotterModal] = useState(false);
    const [tradeBlotterRows, setTradeBlotterRows] = useState([]);
    const [tradeBlotterLoading, setTradeBlotterLoading] = useState(false);
    const [tradeBlotterError, setTradeBlotterError] = useState('');

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
    const BASE_URL = getApiBaseUrl();
    const normalizeTradeBlotterRows = useCallback((payload) => {
        if (!payload) return null;

        const candidates = [
            payload,
            payload?.rows,
            payload?.trades,
            payload?.orders,
            payload?.trade_history,
            payload?.tradeHistory,
            payload?.history,
            payload?.trade_blotter,
            payload?.tradeBlotter,
            payload?.data,
        ];

        const source = candidates.find((candidate) => Array.isArray(candidate));
        if (!source) return null;

        return source.map((row, index) => {
            const quantity = Number(row?.quantity ?? row?.qty ?? row?.shares ?? 0);
            const price = Number(row?.price ?? row?.execution_price ?? row?.fill_price ?? row?.trade_price ?? 0);
            const timestamp = row?.timestamp
                || row?.executed_at
                || row?.created_at
                || row?.updated_at
                || row?.date
                || row?.time
                || null;

            return {
                id: row?.id ?? row?.trade_id ?? row?.order_id ?? `${row?.symbol || row?.ticker || 'trade'}-${index}`,
                symbol: String(row?.symbol ?? row?.ticker ?? '-').toUpperCase(),
                action: String(row?.action ?? row?.side ?? row?.type ?? '-').toUpperCase(),
                quantity: Number.isFinite(quantity) ? quantity : 0,
                price: Number.isFinite(price) ? price : null,
                status: String(row?.status ?? row?.state ?? row?.result ?? 'FILLED').toUpperCase(),
                timestamp,
                account: row?.account_name || row?.account_type || row?.competition_code || row?.team_name || '',
            };
        });
    }, []);

    const fetchTradeBlotterRows = useCallback(async () => {
        const trimmedUsername = String(username || '').trim();
        if (!trimmedUsername) {
            setTradeBlotterRows([]);
            setTradeBlotterError('Missing username for trade history lookup.');
            setTradeBlotterLoading(false);
            return;
        }

        setTradeBlotterLoading(true);
        setTradeBlotterError('');

        const endpointCandidates = [
            '/trade_history',
            '/trade-history',
            '/trades/history',
            '/trades',
            '/trade_blotter',
        ];

        let lastError = null;
        for (const endpoint of endpointCandidates) {
            try {
                const response = await axios.get(`${BASE_URL}${endpoint}`, { params: { username: trimmedUsername } });
                const rows = normalizeTradeBlotterRows(response?.data);

                if (rows !== null) {
                    setTradeBlotterRows(rows);
                    setTradeBlotterError('');
                    setTradeBlotterLoading(false);
                    return;
                }
            } catch (error) {
                lastError = error;
                if (error?.response?.status === 404) continue;
            }
        }

        setTradeBlotterRows([]);
        setTradeBlotterError(lastError?.response?.data?.message || 'Could not load trade history right now.');
        setTradeBlotterLoading(false);
    }, [BASE_URL, normalizeTradeBlotterRows, username]);

    const openTradeBlotterModal = useCallback(async () => {
        setShowTradeBlotterModal(true);
        await fetchTradeBlotterRows();
    }, [fetchTradeBlotterRows]);

    const getPendingOrdersStorageKey = useCallback(
        (user) => `pending_limit_orders:${String(user || '').trim().toLowerCase()}`,
        [],
    );

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
    }, [BASE_URL, username]);

    const [enteredCode, setEnteredCode] = useState('');

    const joinFeaturedCompetition = async (codeOverride = null) => {
        const compCode = codeOverride || (modalCompetition ? modalCompetition.code : null);
        const enteredAccessCode = enteredCode?.trim();

        if (!compCode) {
            alert("Missing competition code.");
            return;
        }

        if (modalCompetition && modalCompetition.is_open === false && !enteredAccessCode) {
            alert("Please enter the access code to join this restricted competition.");
            return;
        }

        setIsLoading(true);
        try {
            const res = await axios.post(`${BASE_URL}/competition/join`, {
                username,
                competition_code: compCode,
                access_code: enteredAccessCode || null,
            });
            alert(res.data.message);
            closeModal();

            // ✅ Wait for account refresh before continuing
            await fetchUserData();
        } catch (error) {
            console.error("Error joining competition:", error);
            alert("Error joining competition.");
        } finally {
            setIsLoading(false);
            setEnteredCode("");
        }
    };




    const fetchFeaturedCompetitions = async () => {
        setIsLoading(true);
        try {
            const url = isAdmin
                ? `${BASE_URL}/admin/competitions?admin_username=${username}`
                : `${BASE_URL}/featured_competitions`;

            const response = await axios.get(url);
            const comps = response.data || [];
            const currentDate = new Date();

            const isActive = (comp) => {
                if (!comp.end_date || comp.end_date === "" || comp.end_date === null) return true;
                const endDate = new Date(comp.end_date);
                return !isNaN(endDate.getTime()) && endDate >= currentDate;
            };

            if (isAdmin) {
                setAllCompetitions(comps);
                setFeaturedCompetitions(
                    comps.filter((comp) => comp.featured).slice(0, 10) // ✅ show all featured comps
                );
            } else {
                setFeaturedCompetitions(
                    comps.filter((comp) => isActive(comp)).slice(0, 10) // ✅ show only active featured comps
                );
            }
        } catch (error) {
            console.error("Error fetching competitions:", error);
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
        if (!isLoggedIn || !username) {
            setPendingLimitOrders([]);
            return;
        }

        const savedOrders = localStorage.getItem(getPendingOrdersStorageKey(username));
        if (!savedOrders) {
            setPendingLimitOrders([]);
            return;
        }

        try {
            const parsed = JSON.parse(savedOrders);
            if (Array.isArray(parsed)) {
                setPendingLimitOrders(parsed);
            } else {
                setPendingLimitOrders([]);
            }
        } catch (error) {
            console.error('Failed to parse pending limit orders from storage:', error);
            setPendingLimitOrders([]);
        }
    }, [getPendingOrdersStorageKey, isLoggedIn, username]);

    useEffect(() => {
        if (!isLoggedIn || !username) return;
        localStorage.setItem(getPendingOrdersStorageKey(username), JSON.stringify(pendingLimitOrders));
    }, [getPendingOrdersStorageKey, isLoggedIn, pendingLimitOrders, username]);

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

    const handleDeleteUser = async () => {
        if (!removeUserUsername) {
            setAdminMessage('Please enter a username to delete.');
            return;
        }

        if (!window.confirm(`Are you sure you want to delete user ${removeUserUsername}? This cannot be undone.`)) return;

        setIsLoading(true);
        try {
            const payload = {
                username, // this is the admin's username
                target_username: removeUserUsername,
            };
            const res = await axios.post(`${BASE_URL}/admin/delete_user`, payload);
            setAdminMessage(res.data.message);
            fetchUserData();
            fetchFeaturedCompetitions();
            setRemoveUserUsername('');
        } catch (error) {
            console.error('Error deleting user:', error);
            setAdminMessage(error.response?.data?.message || 'Failed to delete user.');
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
        setOrderType('market');
        setLimitPrice('');
        setPendingLimitOrders([]);
        setChartData(null);
        setFeaturedCompetitions([]);
        setAllCompetitions([]);
        setShowTradeBlotterModal(false);
        setTradeBlotterRows([]);
        setTradeBlotterError('');
        setTradeBlotterLoading(false);
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
                admin_username: username,
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
            const snapshotResponse = await axios.get(`/api/stock/snapshot?symbol=${symbolToUse}&range=${range}`);
            const {
                chartPoints,
                dailyReferencePoints,
                intradayReferencePoints,
                liveQuotePrice,
                shouldSyncLiveQuote,
                apiTodayChangeValue,
                apiTodayChangePercent,
            } = snapshotResponse.data;

            if (chartPoints && chartPoints.length > 0) {
                const nextChartState = buildChartState({
                    points: normalizeChartPoints(chartPoints),
                    symbol: symbolToUse,
                    range,
                    dailyReferencePoints,
                    intradayReferencePoints,
                    apiTodayChangeValue,
                    apiTodayChangePercent,
                });
                const syncedChartState = shouldSyncLiveQuote
                    ? syncChartStateWithLiveQuote(nextChartState, Number(liveQuotePrice))
                    : nextChartState;
                const syncedPrice = Number(syncedChartState.metrics.latestPrice);
                setChartData(syncedChartState.chartData);
                setChartMetrics(syncedChartState.metrics);
                if (Number.isFinite(syncedPrice)) {
                    setStockPrice(syncedPrice);
                    setTradeMessage(`Current price for ${symbolToUse}: $${syncedPrice.toFixed(2)}`);
                }
            } else {
                setChartData(null);
                setChartMetrics(null);
                if (Number.isFinite(liveQuotePrice)) {
                    setStockPrice(liveQuotePrice);
                    setTradeMessage(`Current price for ${symbolToUse}: $${liveQuotePrice.toFixed(2)} (chart unavailable)`);
                } else {
                    setTradeMessage(`No chart data available for ${symbolToUse}`);
                }
            }
        } catch (error) {
            console.error('Error fetching stock data:', error);
            setTradeMessage('Error fetching stock data.');
            setChartData(null);
            setChartMetrics(null);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSearch = async (e) => {
        e.preventDefault();

        // Always use latest input directly — fixes the “two-click” bug
        const symbolInput = stockSymbol.trim().toUpperCase();
        if (!symbolInput) {
            setTradeMessage('Please enter a valid stock symbol.');
            return;
        }

        setIsLoading(true);
        setChartSymbol(symbolInput);
        setTradeMessage('');

        try {
            const snapshotResponse = await axios.get(`/api/stock/snapshot?symbol=${symbolInput}&range=${chartRange}`);
            const {
                chartPoints,
                dailyReferencePoints,
                intradayReferencePoints,
                liveQuotePrice,
                shouldSyncLiveQuote,
                apiTodayChangeValue,
                apiTodayChangePercent,
            } = snapshotResponse.data;

            if (chartPoints && chartPoints.length > 0) {
                const nextChartState = buildChartState({
                    points: normalizeChartPoints(chartPoints),
                    symbol: symbolInput,
                    range: chartRange,
                    dailyReferencePoints,
                    intradayReferencePoints,
                    apiTodayChangeValue,
                    apiTodayChangePercent,
                });
                const syncedChartState = shouldSyncLiveQuote
                    ? syncChartStateWithLiveQuote(nextChartState, Number(liveQuotePrice))
                    : nextChartState;
                const syncedPrice = Number(syncedChartState.metrics.latestPrice);
                setChartData(syncedChartState.chartData);
                setChartMetrics(syncedChartState.metrics);
                if (Number.isFinite(syncedPrice)) {
                    setStockPrice(syncedPrice);
                    setTradeMessage(`Current price for ${symbolInput}: $${syncedPrice.toFixed(2)}`);
                }
            } else {
                setChartData(null);
                setChartMetrics(null);
                if (Number.isFinite(liveQuotePrice)) {
                    setStockPrice(liveQuotePrice);
                    setTradeMessage(`Current price for ${symbolInput}: $${liveQuotePrice.toFixed(2)} (chart unavailable)`);
                } else {
                    setTradeMessage(`No chart data available for ${symbolInput}`);
                }
            }
        } catch (error) {
            console.error('Error fetching stock data:', error);
            setTradeMessage('Error fetching stock data.');
            setChartMetrics(null);
        } finally {
            setIsLoading(false);
        }
    };


    const checkSymbolMatch = () => {
        const cleanTyped = stockSymbol.trim().toUpperCase();
        const cleanChart = chartSymbol.trim().toUpperCase();
        return cleanTyped === cleanChart;
    };


    const buildTradeRequest = useCallback((action, accountContext, symbol, quantity) => {
        let endpoint = '';
        const payload = { username, symbol, quantity };

        if (accountContext.type === 'global') {
            endpoint = `/${action}`;
        } else if (accountContext.type === 'competition') {
            endpoint = `/competition/${action}`;
            payload.competition_code = accountContext.id;
        } else if (accountContext.type === 'team') {
            endpoint = `/team/${action}`;
            payload.team_id = accountContext.team_id;
        } else if (accountContext.type === 'team_competition') {
            endpoint = `/competition/team/${action}`;
            payload.competition_code = accountContext.competition_code;
            payload.team_id = accountContext.team_id;
        }

        return { endpoint, payload };
    }, [username]);

    const executeTrade = async (action) => {
        const cleanSymbol = stockSymbol.trim().toUpperCase();
        const normalizedLimit = Number(limitPrice);

        if (!cleanSymbol || tradeQuantity <= 0) {
            setTradeMessage('Enter a valid symbol and quantity.');
            return;
        }

        if (orderType === 'limit') {
            if (!normalizedLimit || normalizedLimit <= 0) {
                setTradeMessage('Enter a valid limit price.');
                return;
            }

            const limitOrder = {
                id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                action,
                symbol: cleanSymbol,
                quantity: tradeQuantity,
                limitPrice: normalizedLimit,
                accountContext: selectedAccount,
                createdAt: new Date().toISOString(),
            };
            setPendingLimitOrders((prev) => [...prev, limitOrder]);
            setTradeMessage(`Limit ${action} queued for ${cleanSymbol} at ${formatMoney(normalizedLimit)}.`);
            setLimitPrice('');
            return;
        }

        if (!isTradingHours()) {
            setTradeMessage('Market is closed. Trading hours are 6:30 AM – 1:00 PM PST (9:30 AM – 4:00 PM EST), Monday through Friday.');
            return;
        }

        setTradeMessage('Processing trade...');

        try {
            const { endpoint, payload } = buildTradeRequest(action, selectedAccount, cleanSymbol, tradeQuantity);
            console.log('🔹 Sending trade:', endpoint, payload);
            const res = await axios.post(`${BASE_URL}${endpoint}`, payload);
            setTradeMessage(res.data.message || 'Trade successful.');
            fetchUserData();
        } catch (err) {
            console.error('Trade error:', err.response?.data || err.message);
            setTradeMessage(err.response?.data?.message || 'Trade failed.');
        }
    };

    useEffect(() => {
        if (!isLoggedIn || !username || !pendingLimitOrders.length) return;

        const interval = setInterval(async () => {
            if (!isTradingHours()) return;

            for (const order of pendingLimitOrders) {
                try {
                    const priceResponse = await axios.get(`${BASE_URL}/stock/${order.symbol}`);
                    const currentPrice = Number(priceResponse.data?.price || 0);
                    const canExecute = order.action === 'buy'
                        ? currentPrice <= order.limitPrice
                        : currentPrice >= order.limitPrice;

                    if (!canExecute || !currentPrice) continue;

                    const { endpoint, payload } = buildTradeRequest(order.action, order.accountContext, order.symbol, order.quantity);
                    const tradeResponse = await axios.post(`${BASE_URL}${endpoint}`, payload);

                    setPendingLimitOrders((prev) => prev.filter((pending) => pending.id !== order.id));
                    setTradeMessage(tradeResponse.data.message || `Limit ${order.action} filled for ${order.symbol} at ${formatMoney(currentPrice)}.`);
                    fetchUserData();
                } catch (error) {
                    console.error('Limit order processing error:', error.response?.data || error.message);
                }
            }
        }, 15000);

        return () => clearInterval(interval);
    }, [BASE_URL, buildTradeRequest, fetchUserData, isLoggedIn, pendingLimitOrders, username]);


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
        if (!joinCompetitionCode)
            return setCompetitionMessage("Please enter a competition code.");
        setIsLoading(true);
        try {
            const res = await axios.post(`${BASE_URL}/competition/join`, {
                username,
                competition_code: joinCompetitionCode,
            });
            setCompetitionMessage(res.data.message);
            setJoinCompetitionCode("");

            // ✅ Refresh user data *after* join completes
            await fetchUserData();
        } catch (error) {
            console.error("Error joining competition:", error);
            setCompetitionMessage("Error joining competition.");
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

    const closeTradeBlotterModal = () => {
        setShowTradeBlotterModal(false);
        setTradeBlotterError('');
    };



    /* -------------------------------------------------------------------------- */
    /*                             ACCOUNT SUMMARY BOX                             */
    /* -------------------------------------------------------------------------- */
    const AccountSummaryBox = memo(({ account, isGlobal, onReset }) => {
        const {
            cash_balance = 0,
            total_value = 0,
            pnl = 0,             // total P&L (realized + unrealized)

            realized_pnl = 0,    // realized only
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
                    Realized P&L: <span style={{ color: realized_pnl >= 0 ? 'green' : 'red' }}>
                        ${format(realized_pnl)}
                    </span>
                </p>
                <p className="note">
                    Total P&L:{" "}
                    <span style={{ color: pnl >= 0 ? "green" : "red" }}>
                        ${format(pnl)}
                    </span>
                </p>
                <p className="note" style={{ fontSize: 12, color: "#6b7280", marginTop: -6 }}>
                    (Includes realized + unrealized gains)
                </p>
                <p className="note">
                    Total Return: <span style={{ color: return_pct >= 0 ? 'green' : 'red' }}>
                        {pct(return_pct)}
                    </span>
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

                <div style={{ display: 'grid', gap: 20, gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', alignItems: 'start' }}>
                    <div style={{ minWidth: 0 }}>
                        <SharedInputs
                            onBuy={() => executeTrade('buy')}
                            onSell={() => executeTrade('sell')}
                            stockSymbol={stockSymbol}
                            setStockSymbol={setStockSymbol}
                            tradeQuantity={tradeQuantity}
                            setTradeQuantity={setTradeQuantity}
                            handleSearch={handleSearch}
                            stockPrice={stockPrice}
                            chartSymbol={chartSymbol}
                            tradeMessage={tradeMessage}
                            orderType={orderType}
                            setOrderType={setOrderType}
                            limitPrice={limitPrice}
                            setLimitPrice={setLimitPrice}
                        />
                    </div>


                    <ChartPanel
                        chartData={chartData}
                        chartRange={chartRange}
                        chartMetrics={chartMetrics}
                        chartSymbol={chartSymbol}
                        onRangeChange={handleRangeChange}
                    />
                </div>

                {pendingLimitOrders.length > 0 && (
                    <div className="section" style={{ marginTop: 12 }}>
                        <h4 style={{ margin: '0 0 8px' }}>Pending Limit Orders</h4>
                        <ul style={{ margin: 0, paddingLeft: 18 }}>
                            {pendingLimitOrders.map((order) => (
                                <li key={order.id} style={{ marginBottom: 6 }}>
                                    {order.action.toUpperCase()} {order.quantity} {order.symbol} @ {formatMoney(order.limitPrice)}
                                    <button
                                        onClick={() => setPendingLimitOrders((prev) => prev.filter((pending) => pending.id !== order.id))}
                                        style={{ marginLeft: 8 }}
                                    >
                                        Cancel
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
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
                                    autoComplete="off"
                                />
                                <input
                                    type="text"
                                    placeholder="Competition Code"
                                    value={removeCompCode}
                                    onChange={(e) => setRemoveCompCode(e.target.value)}
                                    disabled={isLoading}
                                    autoComplete="off"
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
                                <h3>Delete User</h3>
                                <input
                                    type="text"
                                    placeholder="Target Username"
                                    value={removeUserUsername}
                                    onChange={(e) => setRemoveUserUsername(e.target.value)}
                                    disabled={isLoading}
                                />
                                <button onClick={handleDeleteUser} disabled={isLoading}>
                                    Delete User
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
                                <div className="section" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                    <button
                                        className="primary"
                                        onClick={openTradeBlotterModal}
                                        disabled={isLoading}
                                    >
                                        📒 Open Trade Blotter
                                    </button>
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
                                        💰 <strong>Global Account</strong> — Everyone starts with a personal practice account loaded with
                                        <em> $100,000 virtual cash</em>. Trade anytime to build your investing skills and reset your balance whenever you want.
                                    </li>
                                    <li>
                                        🏁 <strong>Competition Accounts</strong> — Join or create stock trading competitions. Each competition has its own code, leaderboard, balance, and start/end dates — perfect for classes or clubs.
                                    </li>
                                    <li>
                                        🤝 <strong>Team Accounts</strong> — Trade collaboratively with friends or classmates. Teams share a balance, make trades together, and compete on team leaderboards.
                                    </li>
                                </ul>
                                <p className="note" style={{ marginTop: 8 }}>
                                    🚀 Get Started: Log in below or click <em>“Create Account”</em> to get started!
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
                            <p className="note">
                                <Link href="/forgot-password">Forgot password?</Link>
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

            {showTradeBlotterModal && (
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
                    <div className="card" style={{ maxWidth: 900, margin: 0, width: 'min(94vw, 900px)' }}>
                        <h2>📒 Trade Blotter</h2>
                        <p>
                            Review your submitted orders, fills, and execution history directly in this modal.
                        </p>

                        {tradeBlotterLoading ? (
                            <p className="note">Loading trade history...</p>
                        ) : tradeBlotterError ? (
                            <p className="note" style={{ color: '#b91c1c' }}>{tradeBlotterError}</p>
                        ) : tradeBlotterRows.length === 0 ? (
                            <p className="note">No trades found yet.</p>
                        ) : (
                            <div style={{ overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: 10 }}>
                                <table>
                                    <thead>
                                        <tr>
                                            <th>Time</th>
                                            <th>Action</th>
                                            <th>Symbol</th>
                                            <th>Qty</th>
                                            <th>Price</th>
                                            <th>Status</th>
                                            <th>Account</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {tradeBlotterRows.map((trade) => (
                                            <tr key={trade.id}>
                                                <td>{trade.timestamp ? new Date(trade.timestamp).toLocaleString() : '—'}</td>
                                                <td>{trade.action}</td>
                                                <td>{trade.symbol}</td>
                                                <td>{trade.quantity}</td>
                                                <td>{trade.price === null ? '—' : formatMoney(trade.price)}</td>
                                                <td>{trade.status}</td>
                                                <td>{trade.account || '—'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        <div className="section" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 0, marginTop: 12 }}>
                            <button className="primary" type="button" onClick={fetchTradeBlotterRows} disabled={tradeBlotterLoading}>
                                {tradeBlotterLoading ? 'Refreshing...' : 'Refresh'}
                            </button>
                            <button className="logout-button" type="button" onClick={closeTradeBlotterModal}>
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
};

export default Dashboard;
