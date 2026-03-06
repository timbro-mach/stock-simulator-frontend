export const toTimestamp = (value) => {
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : NaN;
};

export const normalizeChartPoints = (points = []) => {
  if (!Array.isArray(points)) return [];

  return points
    .map((point) => ({
      date: point?.date,
      close: Number(point?.close),
    }))
    .filter((point) => Number.isFinite(point.close) && Number.isFinite(toTimestamp(point.date)))
    .sort((a, b) => toTimestamp(a.date) - toTimestamp(b.date));
};

const getTradingDayKey = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw.includes('T')) return raw.split('T')[0];
  if (raw.includes(' ')) return raw.split(' ')[0];

  const parsed = new Date(raw);
  if (!Number.isFinite(parsed.getTime())) return '';
  return parsed.toISOString().split('T')[0];
};

export const filterChartPointsToLatestTradingDay = (points = []) => {
  const normalizedPoints = normalizeChartPoints(points);
  if (!normalizedPoints.length) return [];

  const latestTradingDay = getTradingDayKey(normalizedPoints[normalizedPoints.length - 1]?.date);
  if (!latestTradingDay) return normalizedPoints;

  const filteredPoints = normalizedPoints.filter(
    (point) => getTradingDayKey(point.date) === latestTradingDay,
  );

  return filteredPoints.length ? filteredPoints : normalizedPoints;
};

export const shouldSyncIntradayLiveQuote = (points, maxAgeMs = 2 * 60 * 1000) => {
  const normalizedPoints = normalizeChartPoints(points);
  if (!normalizedPoints.length) return false;

  const lastPoint = normalizedPoints[normalizedPoints.length - 1];
  const lastTs = toTimestamp(lastPoint.date);
  if (!Number.isFinite(lastTs)) return false;

  return Date.now() - lastTs <= maxAgeMs;
};
