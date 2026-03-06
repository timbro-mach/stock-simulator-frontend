import axios from 'axios';
import { getApiBaseUrl } from '../../../lib/api';
import {
  filterChartPointsToLatestTradingDay,
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
    const [stockResponse, chartResponse, dailyResponse, intradayResponse] = await Promise.all([
      axios.get(`${baseUrl}/stock/${symbol}`),
      axios.get(`${baseUrl}/stock_chart/${symbol}?range=${range}`),
      range === '1W'
        ? Promise.resolve({ data: [] })
        : axios.get(`${baseUrl}/stock_chart/${symbol}?range=1W`),
      range === '1D'
        ? Promise.resolve({ data: [] })
        : axios.get(`${baseUrl}/stock_chart/${symbol}?range=1D`),
    ]);

    const normalizedChartPoints = normalizeChartPoints(chartResponse.data);
    const chartPoints = range === '1D'
      ? filterChartPointsToLatestTradingDay(normalizedChartPoints)
      : normalizedChartPoints;
    const dailyReferencePoints = range === '1W'
      ? chartPoints
      : normalizeChartPoints(dailyResponse.data);
    const intradayReferencePoints = range === '1D'
      ? chartPoints
      : filterChartPointsToLatestTradingDay(intradayResponse.data);

    const shouldSyncLiveQuote = range === '1D'
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
