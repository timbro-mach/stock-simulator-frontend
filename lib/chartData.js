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

export const shouldSyncIntradayLiveQuote = (points, maxAgeMs = 2 * 60 * 1000) => {
  const normalizedPoints = normalizeChartPoints(points);
  if (!normalizedPoints.length) return false;

  const lastPoint = normalizedPoints[normalizedPoints.length - 1];
  const lastTs = toTimestamp(lastPoint.date);
  if (!Number.isFinite(lastTs)) return false;

  return Date.now() - lastTs <= maxAgeMs;
};
