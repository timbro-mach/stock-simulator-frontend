import axios from 'axios';
import { getApiBaseUrl } from '../../../lib/api';
import {
  filterChartPointsToPastHours,
  normalizeChartPoints,
  shouldSyncIntradayLiveQuote,
} from '../../../lib/chartData';

const asFiniteNumber = (...values) => {
  for (const value of values) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};

const getTodaysChangeFromQuote = (quote) => {
  const changeValue = asFiniteNumber(
    quote?.todays_change,
    quote?.today_change,
    quote?.change,
    quote?.change_amount,
    quote?.day_change,
  );
  const changePercent = asFiniteNumber(
    quote?.todays_change_percent,
    quote?.today_change_percent,
    quote?.change_percent,
    quote?.percent_change,
    quote?.day_change_percent,
  );

  return {
    apiTodayChangeValue: changeValue,
    apiTodayChangePercent: changePercent,
  };
};

const getPrimaryRangeCandidates = (range) => {
  if (range === '2D') return ['2D', '1W', '1D'];
  if (range === '5D') return ['5D', '1W'];
  if (range === '3Y') return ['3Y', '5Y', '1Y'];
  return [range];
};

const fetchChartRange = (baseUrl, symbol, range) => (
  axios.get(`${baseUrl}/stock_chart/${symbol}?range=${range}`)
);

const fetchChartRangeWithFallback = async (baseUrl, symbol, ranges) => {
  let lastError = null;

  for (const candidateRange of ranges) {
    try {
      const response = await fetchChartRange(baseUrl, symbol, candidateRange);
      return response;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error('Failed to fetch chart range');
};

const fetchChartRangeSafe = async (baseUrl, symbol, range) => {
  try {
    const response = await fetchChartRange(baseUrl, symbol, range);
    return response.data;
  } catch {
    return [];
  }
};

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const symbol = String(req.query.symbol || '').trim().toUpperCase();
  const range = String(req.query.range || '1M').trim().toUpperCase();

  if (!symbol) {
    return res.status(400).json({ error: 'Missing symbol' });
  }

  const baseUrl = getApiBaseUrl();

  try {
    const primaryRangeCandidates = getPrimaryRangeCandidates(range);
    const [stockResponse, chartResponse, dailyReferenceRaw, intradayReferenceRaw] = await Promise.all([
      axios.get(`${baseUrl}/stock/${symbol}`),
      fetchChartRangeWithFallback(baseUrl, symbol, primaryRangeCandidates),
      fetchChartRangeSafe(baseUrl, symbol, '1W'),
      fetchChartRangeSafe(baseUrl, symbol, '1D'),
    ]);

    const normalizedChartPoints = normalizeChartPoints(chartResponse.data);
    const chartPoints = range === '2D'
      ? filterChartPointsToPastHours(normalizedChartPoints, 48)
      : normalizedChartPoints;
    const dailyReferencePoints = range === '5D'
      ? chartPoints
      : normalizeChartPoints(dailyReferenceRaw);
    const intradayReferencePoints = range === '2D'
      ? chartPoints
      : filterChartPointsToPastHours(intradayReferenceRaw, 48);

    const shouldSyncLiveQuote = range === '2D'
      ? shouldSyncIntradayLiveQuote(chartPoints)
      : true;
    const { apiTodayChangeValue, apiTodayChangePercent } = getTodaysChangeFromQuote(stockResponse.data);

    return res.status(200).json({
      symbol,
      range,
      liveQuotePrice: Number(stockResponse.data?.price),
      shouldSyncLiveQuote,
      apiTodayChangeValue,
      apiTodayChangePercent,
      chartPoints,
      dailyReferencePoints,
      intradayReferencePoints,
    });
  } catch (error) {
    const status = error?.response?.status || 500;
    const message = error?.response?.data?.message || error?.message || 'Failed to fetch stock snapshot';
    return res.status(status).json({ error: message });
  }
}
