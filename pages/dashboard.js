import React, { useState, useEffect, useCallback, useMemo, useRef, memo } from 'react';
import axios from 'axios';
import Link from 'next/link';
import { getApiBaseUrl, getApiErrorMessage } from '../lib/api';
import { normalizeChartPoints, toTimestamp } from '../lib/chartData';
import Leaderboard from '../components/Leaderboard';
import CompetitionDateEditor from '../components/CompetitionDateEditor';
import { canEditCompetitionDates } from '../lib/competitionDates';
import {
    CurriculumSummaryCard,
    GradeSummaryCard,
    InstructorCurriculumPanel,
    StudentCurriculumPanel,
} from '../components/curriculum/CurriculumSection';
import {
    calculateCurriculumEndDate,
    CURRICULUM_WEEK_MAX,
    CURRICULUM_WEEK_MIN,
} from '../lib/curriculum/helpers';
import {
    buildCurriculumPath,
    getCanonicalCompetitionId,
    getCompetitionCode,
} from '../lib/curriculum/competitionId';
import {
    buildCanonicalCurriculumEndpoints,
    logCurriculumRequestFailure,
    mapCurriculumRequestError,
    normalizeCurriculumRouteParams,
} from '../lib/curriculum/endpoints';
import {
    canManageCurriculumGradesForCompetition,
    normalizeAssignmentIdKey,
} from '../lib/curriculum/submission';
import {
    resolveGradeSummaryOverall,
} from '../lib/curriculum/grades';
import { refetchCurriculumGradeQueries } from '../lib/curriculum/queryKeys';
import { parseLockedSubmissionError } from '../lib/curriculum/moduleLock';
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
const INCEPTION_STARTING_BALANCE = 100000;

const DATE_FORMATTERS = {
    intraday: new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }),
    shortDate: new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }),
    monthYear: new Intl.DateTimeFormat('en-US', { month: 'short', year: '2-digit' }),
    shortDateUtc: new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }),
    monthYearUtc: new Intl.DateTimeFormat('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' }),
};

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const formatChartDateLabel = (value, range) => {
    const rawValue = String(value || '').trim();
    if (!rawValue) return String(value || '');
    const isDateOnly = DATE_ONLY_PATTERN.test(rawValue);
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value || '');

    if (range === '2D') return DATE_FORMATTERS.intraday.format(date);
    if (range === '5D' || range === '1M' || range === 'ALL') {
        return isDateOnly ? DATE_FORMATTERS.shortDateUtc.format(date) : DATE_FORMATTERS.shortDate.format(date);
    }
    return isDateOnly ? DATE_FORMATTERS.monthYearUtc.format(date) : DATE_FORMATTERS.monthYear.format(date);
};

const normalizeArray = (value) => {
    if (Array.isArray(value)) return value;
    if (value && typeof value === 'object') return Object.values(value);
    return [];
};

const pickFirstNonEmptyArray = (...candidates) => {
    for (const candidate of candidates) {
        const normalized = normalizeArray(candidate);
        if (normalized.length > 0) return normalized;
    }
    return [];
};

const normalizeCompetitionCollection = (payload) => pickFirstNonEmptyArray(
    payload,
    payload?.competitions,
    payload?.featured_competitions,
    payload?.featuredCompetitions,
    payload?.data,
    payload?.results,
);

const toBooleanFlag = (value) => {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (['true', '1', 'yes', 'y', 'enabled', 'on'].includes(normalized)) return true;
        if (['false', '0', 'no', 'n', 'disabled', 'off', ''].includes(normalized)) return false;
    }
    return Boolean(value);
};

const normalizeCurriculumOverview = (overview) => {
    const source = overview && typeof overview === 'object' ? overview : {};
    const enabledCandidates = [
        { key: 'enabled', value: source?.enabled },
        { key: 'curriculum_enabled', value: source?.curriculum_enabled },
        { key: 'curriculumEnabled', value: source?.curriculumEnabled },
    ];
    const enabledCandidate = enabledCandidates.find((candidate) => candidate.value !== undefined && candidate.value !== null);
    const parsedEnabled = enabledCandidate
        ? toBooleanFlag(enabledCandidate.value)
        : toBooleanFlag(source?.enabled ?? source?.curriculum_enabled ?? source?.curriculumEnabled);
    const hasCurriculumId = source?.curriculum_id !== undefined
        ? source?.curriculum_id !== null && String(source?.curriculum_id).trim() !== ''
        : source?.curriculumId !== null && source?.curriculumId !== undefined && String(source?.curriculumId).trim() !== '';
    const curriculumEnabled = parsedEnabled || hasCurriculumId;

    return {
        ...source,
        curriculum_enabled: curriculumEnabled,
        curriculumEnabled: curriculumEnabled,
        enabled: source?.enabled ?? source?.curriculum_enabled ?? source?.curriculumEnabled ?? null,
        enabled_source_key: enabledCandidate?.key || (hasCurriculumId ? 'curriculumId-derived' : ''),
        competition_id: source?.competition_id ?? source?.competitionId ?? null,
        competitionId: source?.competitionId ?? source?.competition_id ?? null,
        curriculum_id: source?.curriculum_id ?? source?.curriculumId ?? null,
        curriculumId: source?.curriculumId ?? source?.curriculum_id ?? null,
        curriculum_weeks: source?.curriculum_weeks ?? source?.totalWeeks ?? null,
        totalWeeks: source?.totalWeeks ?? source?.curriculum_weeks ?? null,
        curriculum_start_date: source?.curriculum_start_date ?? source?.startDate ?? null,
        startDate: source?.startDate ?? source?.curriculum_start_date ?? null,
        curriculum_end_date: source?.curriculum_end_date ?? source?.endDate ?? null,
        endDate: source?.endDate ?? source?.curriculum_end_date ?? null,
        module_count: source?.module_count ?? source?.moduleCount ?? null,
        moduleCount: source?.moduleCount ?? source?.module_count ?? null,
        assignment_count: source?.assignment_count ?? source?.assignmentCount ?? null,
        assignmentCount: source?.assignmentCount ?? source?.assignment_count ?? null,
    };
};

const getCurriculumCompetitionFields = (competition) => ({
    curriculum_enabled: competition?.curriculum_enabled ?? null,
    curriculumEnabled: competition?.curriculumEnabled ?? null,
    curriculum_weeks: competition?.curriculum_weeks ?? null,
    curriculumWeeks: competition?.curriculumWeeks ?? null,
    curriculum_start_date: competition?.curriculum_start_date ?? null,
    curriculumStartDate: competition?.curriculumStartDate ?? null,
    curriculum_end_date: competition?.curriculum_end_date ?? null,
    curriculumEndDate: competition?.curriculumEndDate ?? null,
});

const getCurriculumResponseMessage = (error) => (
    error?.response?.data?.message
    || error?.response?.data?.error
    || (typeof error?.response?.data === 'string' ? error.response.data : '')
    || error?.message
    || ''
);

const normalizeCollectionPayload = (payload, preferredKeys = []) => {
    if (Array.isArray(payload)) return payload;
    if (!payload || typeof payload !== 'object') return [];

    for (const key of preferredKeys) {
        if (Array.isArray(payload?.[key])) return payload[key];
    }

    const fallbackKeys = ['items', 'rows', 'data', 'results', 'students', 'submissions', 'records'];
    for (const key of fallbackKeys) {
        if (Array.isArray(payload?.[key])) return payload[key];
    }
    return [];
};

const resolveInstructorSummaryPayload = (payload) => {
    if (!payload || typeof payload !== 'object') return null;
    return (
        payload?.summary
        || payload?.instructor_summary
        || payload?.instructorSummary
        || payload?.gradebook
        || payload?.grade_book
        || payload?.data?.summary
        || payload?.data?.instructor_summary
        || payload?.data?.instructorSummary
        || payload?.data?.gradebook
        || payload?.data?.grade_book
        || payload
    );
};

const getCompetitionIdentityId = (competition) => {
    if (!competition || typeof competition !== 'object') return '';
    const rawId = competition?.id ?? competition?.competition_id ?? competition?.competitionId;
    const parsed = String(rawId ?? '').trim();
    if (parsed) return parsed;
    return getCanonicalCompetitionId(competition);
};

const getByCodeResponseIdentity = (payload) => {
    const source = payload && typeof payload === 'object' ? payload : {};
    const rawIdByPriority = [
        { key: 'response.data.id', value: source?.id },
        { key: 'response.data.competition_id', value: source?.competition_id },
        { key: 'response.data.competitionId', value: source?.competitionId },
    ];
    for (const candidate of rawIdByPriority) {
        const parsed = String(candidate.value ?? '').trim();
        if (parsed) {
            return { id: parsed, idKey: candidate.key };
        }
    }
    return { id: '', idKey: '' };
};

const normalizeCompetitionEntry = (competition) => {
    const code = String(
        competition?.code
        || competition?.competition_code
        || competition?.competitionCode
        || competition?.id
        || '',
    ).trim();
    if (!code) return null;

    const name = String(
        competition?.name
        || competition?.competition_name
        || competition?.competitionName
        || competition?.title
        || `Competition ${code}`
        || '',
    ).trim();

    const featuredRaw = competition?.featured ?? competition?.is_featured ?? competition?.isFeatured;
    const isOpenRaw = competition?.is_open ?? competition?.isOpen ?? competition?.open;

    return {
        ...competition,
        id: getCompetitionIdentityId(competition),
        code,
        competition_id: getCompetitionIdentityId(competition),
        competitionId: getCompetitionIdentityId(competition),
        competition_code: code,
        curriculum_enabled: toBooleanFlag(competition?.curriculum_enabled ?? competition?.curriculumEnabled),
        curriculumEnabled: toBooleanFlag(competition?.curriculum_enabled ?? competition?.curriculumEnabled),
        curriculum_id: competition?.curriculum_id ?? competition?.curriculumId ?? null,
        curriculumId: competition?.curriculumId ?? competition?.curriculum_id ?? null,
        name,
        featured: Boolean(featuredRaw),
        is_open: isOpenRaw === undefined || isOpenRaw === null ? true : Boolean(isOpenRaw),
        start_date: competition?.start_date || competition?.startDate || competition?.starts_at || null,
        end_date: competition?.end_date || competition?.endDate || competition?.ends_at || null,
    };
};

const toAccountCode = (account) => {
    const code = getCompetitionCode(account);
    if (code) return code;
    return String(
        account?.id
        || account?.account_id
        || account?.accountId
        || '',
    ).trim();
};

const toCompetitionName = (account, fallbackCode = '') => {
    const name = account?.name
        || account?.competition_name
        || account?.competitionName
        || account?.competition?.name
        || account?.competition?.competition_name
        || account?.competition?.competitionName
        || account?.title
        || account?.display_name
        || account?.displayName
        || '';
    if (String(name || '').trim()) return String(name).trim();
    return fallbackCode ? `Competition ${fallbackCode}` : '';
};

const normalizeCompetitionAccount = (account) => {
    const code = toAccountCode(account);
    if (!code) return null;
    return {
        ...account,
        code,
        competition_id: getCanonicalCompetitionId(account),
        name: toCompetitionName(account, code),
    };
};

const normalizeTeamCompetitionAccount = (account) => {
    const code = toAccountCode(account);
    const teamId = account?.team_id
        ?? account?.teamId
        ?? account?.team_number
        ?? account?.teamNumber
        ?? account?.team?.id
        ?? account?.team?.team_id
        ?? account?.team?.team_number;
    if (!code && (teamId === undefined || teamId === null || String(teamId).trim() === '')) return null;
    const teamName = account?.team_name
        || account?.teamName
        || account?.team_display_name
        || account?.teamDisplayName
        || account?.team?.name
        || account?.team?.team_name
        || account?.team?.display_name
        || account?.name
        || account?.display_name
        || account?.displayName
        || '';
    const competitionName = toCompetitionName(account, code);
    return {
        ...account,
        code,
        competition_id: getCanonicalCompetitionId(account),
        name: competitionName,
        team_id: teamId,
        team_name: String(teamName || '').trim(),
    };
};

const getPointTradingDay = (point) => {
    const raw = String(point?.date || '').trim();
    if (!raw) return '';
    if (raw.includes('T')) return raw.split('T')[0];
    if (raw.includes(' ')) return raw.split(' ')[0];
    return raw;
};

const RANGE_LOOKBACK_DAYS = {
    '5D': 5,
    '1M': 30,
    '6M': 182,
    '1Y': 365,
    '3Y': 365 * 3,
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

const normalizePerformanceHistoryRows = (payload) => {
    const candidates = [
        payload,
        payload?.history,
        payload?.performance_history,
        payload?.performanceHistory,
        payload?.rows,
        payload?.data,
    ];
    const rows = candidates.find((candidate) => Array.isArray(candidate));
    if (!Array.isArray(rows)) return [];
    return rows.filter((row) => row && typeof row === 'object');
};

const buildDailyPerformancePoints = (rows, metricMode = 'value') => {
    if (!Array.isArray(rows) || rows.length === 0) return [];
    const normalizedMode = String(metricMode || '').toLowerCase();
    const valueKey = normalizedMode === 'pnl' ? 'total_pnl' : 'total_value';
    const fallbackKey = valueKey === 'total_value' ? 'total_pnl' : 'total_value';

    return rows
        .map((row) => {
            const rawDate = row?.date ?? row?.day ?? row?.timestamp ?? row?.time;
            const date = String(rawDate || '').trim();
            if (!date) return null;

            const value = Number(
                row?.[valueKey]
                ?? row?.[valueKey === 'total_value' ? 'totalValue' : 'totalPnl']
                ?? row?.[fallbackKey]
                ?? row?.[fallbackKey === 'total_value' ? 'totalValue' : 'totalPnl'],
            );
            if (!Number.isFinite(value)) return null;

            return { date, value };
        })
        .filter(Boolean);
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
    const dayBaseline = range === '2D'
        ? dailyPreviousClose
        : (Number.isFinite(intradayBaselinePrice) ? intradayBaselinePrice : dailyPreviousClose);
    const hasApiDayChange = range === '2D'
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
                    tension: range === '2D' ? 0.08 : 0.24,
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
    if (chartRange === '2D') {
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
    const defaultDayBaseline = chartRange === '2D' ? previousClose : firstPoint;
    const dayBaseline = Number(chartState.metrics.dayBaselinePrice ?? defaultDayBaseline);
    const useApiDayChange = chartRange === '2D'
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
const ChartPanel = memo(({ chartData, chartRange, onRangeChange, chartMetrics, chartSymbol, title = null, containerClassName = '', showRangeControls = true, emptyStateLabel = 'No chart data available' }) => {
    const singlePointHint = chartData?._meta?.singlePointHint;
    const resolvedEmptyStateLabel = chartData?._meta?.emptyStateLabel || emptyStateLabel;

    return (
        <div className={containerClassName} style={{ flex: 1, minHeight: 320, minWidth: 0, background: '#fff', border: '1px solid var(--border-color)', borderRadius: 12, padding: 14, boxShadow: '0 8px 16px rgba(0,39,94,0.08)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                <div>
                    <h3 style={{ margin: 0, fontSize: 18, color: 'var(--text-main)' }}>
                        {title || (chartSymbol ? `${chartSymbol.toUpperCase()} Overview` : 'Account Performance')}
                    </h3>
                    {chartMetrics && (
                        <p style={{ margin: '5px 0 0', color: chartMetrics.dayChangeValue >= 0 ? '#047857' : '#b91c1c', fontWeight: 600 }}>
                            {formatSignedMoney(chartMetrics.dayChangeValue)} ({chartMetrics.dayChangeValue >= 0 ? '+' : ''}{chartMetrics.dayChangePercent.toFixed(2)}%) {chartMetrics.dayChangeLabel || 'today'}
                        </p>
                    )}
                </div>
                {chartMetrics && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 6, width: '100%' }}>
                        <p style={{ margin: 0, fontSize: 13, color: 'var(--text-subtle)' }}>Current: <strong style={{ color: 'var(--text-main)' }}>{formatMoney(chartMetrics.latestPrice)}</strong></p>
                        <p style={{ margin: 0, fontSize: 13, color: 'var(--text-subtle)' }}>Prev close: <strong style={{ color: 'var(--text-main)' }}>{formatMoney(chartMetrics.previousClose)}</strong></p>
                        <p style={{ margin: 0, fontSize: 13, color: 'var(--text-subtle)' }}>{chartMetrics.range} change: <strong style={{ color: chartMetrics.rangeChangeValue >= 0 ? '#047857' : '#b91c1c' }}>{formatSignedMoney(chartMetrics.rangeChangeValue)}</strong></p>
                        <p style={{ margin: 0, fontSize: 13, color: 'var(--text-subtle)' }}>{chartMetrics.range} %: <strong style={{ color: chartMetrics.rangeChangePercent >= 0 ? '#047857' : '#b91c1c' }}>{chartMetrics.rangeChangePercent >= 0 ? '+' : ''}{chartMetrics.rangeChangePercent.toFixed(2)}%</strong></p>
                    </div>
                )}
            </div>

            {showRangeControls && (
                <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
                    {['2D', '5D', '1M', '6M', '1Y', '3Y'].map((r) => (
                        <button
                            key={r}
                            onClick={() => onRangeChange(r)}
                            style={{
                                padding: '8px 12px',
                                borderRadius: 6,
                                background: chartRange === r ? 'var(--brand-blue-dark)' : '#edf1f4',
                                color: chartRange === r ? '#fff' : 'var(--text-subtle)',
                                border: chartRange === r ? '1px solid var(--brand-blue-dark)' : '1px solid var(--border-color)',
                                fontSize: 13,
                                fontWeight: chartRange === r ? 600 : 500,
                                cursor: 'pointer',
                            }}
                        >
                            {r}
                        </button>
                    ))}
                </div>
            )}

            {chartData ? (
                <>
                    <div style={{ height: 'clamp(220px, 40vw, 300px)', width: '100%' }}>
                        <Line
                            data={chartData}
                            options={{
                                responsive: true,
                                maintainAspectRatio: false,
                                scales: {
                                    x: {
                                        grid: { display: false },
                                        ticks: {
                                            color: 'var(--text-light)',
                                            maxTicksLimit: 6,
                                            callback(value) {
                                                return formatChartDateLabel(this.getLabelForValue(value), chartRange);
                                            },
                                        },
                                    },
                                    y: {
                                        grid: { color: 'rgba(0, 39, 94, 0.12)' },
                                        ticks: { color: 'var(--text-light)', callback: (v) => formatMoney(v) },
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
                    {singlePointHint && (
                        <p className="note" style={{ marginTop: 8 }}>{singlePointHint}</p>
                    )}
                </>
            ) : (
                <p className="note">{resolvedEmptyStateLabel}</p>
            )}
        </div>
    );
});

ChartPanel.displayName = 'ChartPanel';

// Memoized SharedInputs component
const SharedInputs = memo(({ onBuy, onSell, stockSymbol, setStockSymbol, tradeQuantity, setTradeQuantity, handleSearch, stockPrice, chartSymbol, tradeMessage, orderType, setOrderType, limitPrice, setLimitPrice }) => {
    console.log('SharedInputs rendered'); // Debug to track re-renders

    return (
        <>
            <div className="section" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', width: '100%' }}>
                <form
                    className="responsive-form"
                    onSubmit={(e) => {
                        e.preventDefault();
                        handleSearch(e);
                    }}
                    style={{ display: 'flex', gap: 8, flexWrap: 'wrap', width: '100%' }}
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
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', width: '100%' }}>
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
    const [curriculumEnabled, setCurriculumEnabled] = useState(false);
    const [curriculumWeeks, setCurriculumWeeks] = useState('8');
    const [curriculumStartDate, setCurriculumStartDate] = useState('');
    const [curriculumEndDate, setCurriculumEndDate] = useState('');
    const [curriculumDateOverride, setCurriculumDateOverride] = useState(false);
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
    const [accountPerformanceHistory, setAccountPerformanceHistory] = useState([]);
    const [curriculumOverview, setCurriculumOverview] = useState(null);
    const [curriculumModules, setCurriculumModules] = useState([]);
    const [curriculumGradeSummary, setCurriculumGradeSummary] = useState(null);
    const [curriculumInstructorSummary, setCurriculumInstructorSummary] = useState(null);
    const [curriculumLoading, setCurriculumLoading] = useState(false);
    const [curriculumError, setCurriculumError] = useState('');
    const [curriculumGradesMessage, setCurriculumGradesMessage] = useState('');
    const [curriculumDebugState, setCurriculumDebugState] = useState({
        hasError: false,
        renderReason: '',
        competitionContext: null,
        hydrationInfo: null,
        requestInfo: null,
        submitVsGradesComparison: null,
    });
    const [competitionHydration, setCompetitionHydration] = useState({
        code: '',
        attempted: false,
        resolvedFromCode: false,
        source: '',
        idSource: '',
        record: null,
        rawResponseBody: null,
        extractedId: '',
        extractedIdKey: '',
        selectedCompetitionUpdated: false,
    });
    const [curriculumActionLoading, setCurriculumActionLoading] = useState(false);
    const [curriculumRefreshTick, setCurriculumRefreshTick] = useState(0);
    const [curriculumSubmissionState, setCurriculumSubmissionState] = useState({
        submittedByAssignmentId: {},
        byAssignmentId: {},
        latestMessage: '',
    });
    const [curriculumInstructorSubmissions, setCurriculumInstructorSubmissions] = useState([]);
    const [curriculumInstructorMessage, setCurriculumInstructorMessage] = useState('');
    const [curriculumLessonEditState, setCurriculumLessonEditState] = useState({});
    const [curriculumAssignmentEditState, setCurriculumAssignmentEditState] = useState({});
    const pendingCurriculumScrollRestoreY = useRef(null);
    const [currentUserId, setCurrentUserId] = useState('');

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
    const selectedCompetitionCode = useMemo(() => {
        if (selectedAccount.type === 'competition') return selectedAccount.id || '';
        if (selectedAccount.type === 'team' || selectedAccount.type === 'team_competition') {
            return selectedAccount.competition_code || '';
        }
        return '';
    }, [selectedAccount.competition_code, selectedAccount.id, selectedAccount.type]);
    const selectedCompetitionId = useMemo(() => {
        const directSelectedCompetitionId = getCanonicalCompetitionId(selectedAccount);
        if (directSelectedCompetitionId) return directSelectedCompetitionId;

        if (selectedAccount.type === 'competition') {
            const matched = competitionAccounts.find((account) => String(account?.code) === String(selectedAccount.id));
            const matchedCompetitionId = getCanonicalCompetitionId(matched);
            if (matchedCompetitionId) return matchedCompetitionId;
            const fromAllCompetitions = allCompetitions.find((competition) => String(competition?.code) === String(selectedAccount.id));
            const fromAllCompetitionsId = getCanonicalCompetitionId(fromAllCompetitions);
            if (fromAllCompetitionsId) return fromAllCompetitionsId;
            if (competitionHydration?.code && String(competitionHydration.code) === String(selectedAccount.id)) {
                return getCanonicalCompetitionId(competitionHydration.record);
            }
            return '';
        }
        if (selectedAccount.type === 'team' || selectedAccount.type === 'team_competition') {
            const matched = teamCompetitionAccounts.find(
                (account) => String(account?.team_id) === String(selectedAccount.team_id)
                    && String(account?.code) === String(selectedAccount.competition_code),
            );
            const matchedCompetitionId = getCanonicalCompetitionId(matched);
            if (matchedCompetitionId) return matchedCompetitionId;
            if (competitionHydration?.code && String(competitionHydration.code) === String(selectedAccount.competition_code)) {
                return getCanonicalCompetitionId(competitionHydration.record);
            }
            return '';
        }
        if (competitionHydration?.code && String(competitionHydration.code) === String(selectedCompetitionCode)) {
            return getCanonicalCompetitionId(competitionHydration.record);
        }
        return '';
    }, [
        allCompetitions,
        competitionAccounts,
        competitionHydration,
        selectedAccount.competition_code,
        selectedAccount.competition_id,
        selectedAccount.id,
        selectedAccount.team_id,
        selectedAccount.type,
        selectedCompetitionCode,
        teamCompetitionAccounts,
    ]);
    const selectedCompetitionRecord = useMemo(() => {
        if (selectedAccount.type === 'competition') {
            const matchedCompetition = competitionAccounts.find((account) => String(account?.code) === String(selectedAccount.id))
                || allCompetitions.find((competition) => String(competition?.code) === String(selectedAccount.id))
                || null;
            if (matchedCompetition) return matchedCompetition;
            if (competitionHydration?.code && String(competitionHydration.code) === String(selectedAccount.id)) {
                return competitionHydration.record;
            }
            return null;
        }
        if (selectedAccount.type === 'team' || selectedAccount.type === 'team_competition') {
            const matchedTeamCompetition = teamCompetitionAccounts.find(
                (account) => String(account?.team_id) === String(selectedAccount.team_id)
                    && String(account?.code) === String(selectedAccount.competition_code),
            );
            if (matchedTeamCompetition) return matchedTeamCompetition;
            if (competitionHydration?.code && String(competitionHydration.code) === String(selectedAccount.competition_code)) {
                return competitionHydration.record;
            }
            return null;
        }
        if (competitionHydration?.code && String(competitionHydration.code) === String(selectedCompetitionCode)) {
            return competitionHydration.record;
        }
        return null;
    }, [
        allCompetitions,
        competitionAccounts,
        competitionHydration,
        selectedAccount.competition_code,
        selectedAccount.id,
        selectedAccount.team_id,
        selectedAccount.type,
        selectedCompetitionCode,
        teamCompetitionAccounts,
    ]);
    const selectedCompetitionIdSource = useMemo(() => {
        if (!selectedCompetitionId) return 'missing';
        if (competitionHydration?.resolvedFromCode && competitionHydration?.source === 'by-code') {
            return 'by-code hydration';
        }
        return 'list payload';
    }, [competitionHydration?.resolvedFromCode, competitionHydration?.source, selectedCompetitionId]);
    const canManageCurriculumGrades = useMemo(() => {
        return canManageCurriculumGradesForCompetition({
            isAdmin,
            username,
            competitionRecord: selectedCompetitionRecord,
        });
    }, [isAdmin, selectedCompetitionRecord, username]);

    useEffect(() => {
        setCurriculumSubmissionState({
            submittedByAssignmentId: {},
            byAssignmentId: {},
            latestMessage: '',
        });
    }, [selectedCompetitionId]);

    useEffect(() => {
        const competitionCode = String(selectedCompetitionCode || '').trim();
        if (!isLoggedIn || !showTrading || !competitionCode) {
            setCompetitionHydration((previous) => {
                const nextState = {
                    code: competitionCode,
                    attempted: false,
                    resolvedFromCode: false,
                    source: '',
                    idSource: '',
                    record: null,
                    rawResponseBody: null,
                    extractedId: '',
                    extractedIdKey: '',
                    selectedCompetitionUpdated: false,
                };
                if (
                    previous?.code === nextState.code
                    && previous?.attempted === nextState.attempted
                    && previous?.resolvedFromCode === nextState.resolvedFromCode
                    && previous?.source === nextState.source
                    && previous?.idSource === nextState.idSource
                    && previous?.record === nextState.record
                    && previous?.rawResponseBody === nextState.rawResponseBody
                    && previous?.extractedId === nextState.extractedId
                    && previous?.extractedIdKey === nextState.extractedIdKey
                    && previous?.selectedCompetitionUpdated === nextState.selectedCompetitionUpdated
                ) {
                    return previous;
                }
                return nextState;
            });
            return;
        }

        if (selectedCompetitionId) {
            setCompetitionHydration((previous) => {
                const shouldPreserveHydratedRecord = Boolean(
                    previous?.resolvedFromCode
                    && previous?.source === 'by-code'
                    && String(previous?.code || '') === competitionCode
                    && previous?.record,
                );
                const nextState = {
                    code: competitionCode,
                    attempted: shouldPreserveHydratedRecord ? previous?.attempted || true : false,
                    resolvedFromCode: shouldPreserveHydratedRecord ? true : false,
                    source: shouldPreserveHydratedRecord ? previous?.source || 'by-code' : 'direct',
                    idSource: shouldPreserveHydratedRecord ? previous?.idSource || 'by-code hydration' : 'list payload',
                    record: shouldPreserveHydratedRecord ? previous?.record : null,
                    rawResponseBody: shouldPreserveHydratedRecord ? previous?.rawResponseBody ?? null : null,
                    extractedId: shouldPreserveHydratedRecord ? previous?.extractedId || selectedCompetitionId : selectedCompetitionId,
                    extractedIdKey: shouldPreserveHydratedRecord ? previous?.extractedIdKey || 'normalized competition identity' : 'list payload',
                    selectedCompetitionUpdated: true,
                };
                if (
                    previous?.code === nextState.code
                    && previous?.attempted === nextState.attempted
                    && previous?.resolvedFromCode === nextState.resolvedFromCode
                    && previous?.source === nextState.source
                    && previous?.idSource === nextState.idSource
                    && previous?.record === nextState.record
                    && previous?.rawResponseBody === nextState.rawResponseBody
                    && previous?.extractedId === nextState.extractedId
                    && previous?.extractedIdKey === nextState.extractedIdKey
                    && previous?.selectedCompetitionUpdated === nextState.selectedCompetitionUpdated
                ) {
                    return previous;
                }
                return nextState;
            });
            return;
        }

        let cancelled = false;
        const hydrateCompetitionByCode = async () => {
            const localMatch = allCompetitions.find((competition) => String(competition?.code) === competitionCode)
                || competitionAccounts.find((account) => String(account?.code) === competitionCode)
                || teamCompetitionAccounts.find((account) => String(account?.code) === competitionCode)
                || null;
            const localCompetitionId = getCanonicalCompetitionId(localMatch);
            if (localCompetitionId) {
                if (!cancelled) {
                    setCompetitionHydration({
                        code: competitionCode,
                        attempted: true,
                        resolvedFromCode: true,
                        source: 'local-cache',
                        idSource: 'list payload',
                        record: localMatch,
                        rawResponseBody: null,
                        extractedId: localCompetitionId,
                        extractedIdKey: 'list payload',
                        selectedCompetitionUpdated: true,
                    });
                }
                return;
            }

            setCompetitionHydration({
                code: competitionCode,
                attempted: true,
                resolvedFromCode: false,
                source: 'by-code',
                idSource: '',
                record: null,
                rawResponseBody: null,
                extractedId: '',
                extractedIdKey: '',
                selectedCompetitionUpdated: false,
            });

            try {
                const response = await axios.get(`${BASE_URL}/competition/by_code/${encodeURIComponent(competitionCode)}`);
                if (cancelled) return;
                const rawBody = response?.data ?? null;
                const competitionData = response?.data?.competition || response?.data || null;
                const byCodeIdentity = getByCodeResponseIdentity(rawBody);
                const normalized = normalizeCompetitionEntry(competitionData);
                const competitionId = getCompetitionIdentityId(normalized) || byCodeIdentity.id;
                if (!normalized || !competitionId) {
                    setCompetitionHydration({
                        code: competitionCode,
                        attempted: true,
                        resolvedFromCode: false,
                        source: 'by-code',
                        idSource: '',
                        record: normalized,
                        rawResponseBody: rawBody,
                        extractedId: byCodeIdentity.id,
                        extractedIdKey: byCodeIdentity.idKey,
                        selectedCompetitionUpdated: false,
                    });
                    return;
                }

                setCompetitionHydration({
                    code: competitionCode,
                    attempted: true,
                    resolvedFromCode: true,
                    source: 'by-code',
                    idSource: byCodeIdentity.idKey || 'by-code hydration',
                    record: {
                        ...normalized,
                        id: competitionId,
                        competition_id: competitionId,
                        competitionId: competitionId,
                        code: normalized?.code || competitionCode,
                        competition_code: normalized?.competition_code || normalized?.code || competitionCode,
                    },
                    rawResponseBody: rawBody,
                    extractedId: competitionId,
                    extractedIdKey: byCodeIdentity.idKey || 'normalized competition identity',
                    selectedCompetitionUpdated: true,
                });
            } catch (error) {
                if (cancelled) return;
            }
        };

        hydrateCompetitionByCode();
        return () => {
            cancelled = true;
        };
    }, [
        BASE_URL,
        allCompetitions,
        competitionAccounts,
        isLoggedIn,
        selectedCompetitionCode,
        selectedCompetitionId,
        showTrading,
        teamCompetitionAccounts,
    ]);

    useEffect(() => {
        if (!curriculumEnabled || curriculumDateOverride) return;
        const endDate = calculateCurriculumEndDate(curriculumStartDate, Number(curriculumWeeks));
        setCurriculumEndDate(endDate);
    }, [curriculumDateOverride, curriculumEnabled, curriculumStartDate, curriculumWeeks]);

    const teamNameById = useMemo(() => {
        const map = new Map();
        const appendTeamName = (identifiers, rawName) => {
            const name = String(rawName || '').trim();
            if (!name) return;
            identifiers.forEach((identifier) => {
                if (identifier === undefined || identifier === null) return;
                const key = String(identifier).trim();
                if (!key || map.has(key)) return;
                map.set(key, name);
            });
        };

        teams.forEach((team) => {
            const name = team?.name
                ?? team?.team_name
                ?? team?.teamName
                ?? team?.display_name
                ?? team?.displayName;
            appendTeamName([
                team?.id,
                team?.team_id,
                team?.teamId,
                team?.team_number,
                team?.teamNumber,
                team?.number,
                team?.team?.id,
                team?.team?.team_id,
                team?.team?.team_number,
            ], name);
        });

        teamCompetitionAccounts.forEach((account) => {
            const name = account?.team_name ?? account?.teamName ?? account?.team?.name;
            appendTeamName([
                account?.team_id,
                account?.teamId,
                account?.team_number,
                account?.teamNumber,
                account?.team?.id,
                account?.team?.team_id,
                account?.team?.team_number,
            ], name);
        });

        return map;
    }, [teamCompetitionAccounts, teams]);

    const resolveCompetitionTeamId = useCallback((row, accountContext, fallbackAccountName) => {
        const explicitTeamId = row?.team_id
            || row?.teamId
            || row?.team_number
            || row?.teamNumber
            || accountContext?.team_id
            || accountContext?.teamId
            || accountContext?.team_number
            || accountContext?.teamNumber;
        if (explicitTeamId !== undefined && explicitTeamId !== null && String(explicitTeamId).trim()) {
            return String(explicitTeamId).trim();
        }

        if (typeof fallbackAccountName !== 'string') return '';
        const normalizedFallback = fallbackAccountName.trim();
        if (!normalizedFallback) return '';

        const parts = normalizedFallback.split(':').map((part) => part.trim()).filter(Boolean);
        if (parts.length < 2) return '';

        const prefix = parts[0].toLowerCase();
        if (prefix === 'competition_team') {
            return parts[parts.length - 1] || '';
        }
        if (prefix === 'team') {
            return parts[1] || '';
        }

        return '';
    }, []);

    const resolveAccountDisplayName = useCallback((row) => {
        const accountContext = row?.account_context
            || row?.accountContext
            || row?.context
            || row?.metadata?.account_context
            || row?.metadata?.accountContext
            || row?.trade_context
            || {};

        const accountType = String(
            row?.account_type
            || row?.accountType
            || accountContext?.type
            || '',
        ).toLowerCase();

        const competitionCode = row?.competition_code
            || row?.competitionCode
            || accountContext?.competition_code
            || accountContext?.competitionCode
            || accountContext?.id
            || '';

        const matchedCompetitionAccount = competitionAccounts.find((account) => String(account?.code) === String(competitionCode));

        const fallbackAccountName = row?.account_name
            || row?.accountName
            || row?.account?.name
            || row?.account;

        const teamId = resolveCompetitionTeamId(row, accountContext, fallbackAccountName);
        const isTeamTradeRow = accountType === 'team'
            || accountType === 'team_competition'
            || String(fallbackAccountName || '').trim().toLowerCase().startsWith('competition_team:')
            || String(fallbackAccountName || '').trim().toLowerCase().startsWith('team:');
        const matchedTeamAccount = teamCompetitionAccounts.find(
            (account) => {
                const accountTeamId = String(account?.team_id ?? account?.teamId ?? '').trim();
                const accountTeamNumber = String(account?.team_number ?? account?.teamNumber ?? '').trim();
                const accountCode = String(account?.code ?? account?.competition_code ?? account?.competitionCode ?? '').trim();

                if (teamId && competitionCode) {
                    return (accountTeamId === String(teamId) || accountTeamNumber === String(teamId))
                        && accountCode === String(competitionCode);
                }
                if (teamId) {
                    return accountTeamId === String(teamId) || accountTeamNumber === String(teamId);
                }
                if (isTeamTradeRow && competitionCode) {
                    return accountCode === String(competitionCode);
                }
                return false;
            },
        );
        const teamName = teamNameById.get(String(teamId))
            || row?.team_name
            || row?.teamName
            || row?.team?.name
            || matchedTeamAccount?.team_name
            || matchedTeamAccount?.teamName
            || matchedTeamAccount?.team?.name
            || '';

        const rowCompetitionName = row?.competition_name
            || row?.competitionName
            || row?.competition?.name
            || accountContext?.competition_name
            || accountContext?.competitionName
            || '';

        const competitionName = matchedCompetitionAccount?.name
            || matchedTeamAccount?.name
            || rowCompetitionName;

        const competitionLabel = competitionName && competitionCode
            ? `${competitionName} (${competitionCode})`
            : competitionName || (competitionCode ? `Competition ${competitionCode}` : 'Competition');

        const teamSuffix = teamId ? ` #${teamId}` : '';

        if (accountType === 'global') {
            return 'Global Account';
        }

        if (accountType === 'team' || accountType === 'team_competition') {
            return teamName
                ? `${teamName} • Team Competition`
                : (teamId ? `Competition Team (ID: ${teamId})` : 'Competition Team');
        }

        if (accountType === 'competition') {
            return `${competitionLabel} • Individual`;
        }

        if (matchedCompetitionAccount?.name) {
            return `${competitionLabel} • Individual`;
        }

        if (teamName) {
            return `${teamName} • Team Competition`;
        }

        if (typeof fallbackAccountName === 'string' && fallbackAccountName.trim()) {
            const normalizedFallback = fallbackAccountName.trim();

            if (normalizedFallback.toLowerCase() === 'global') {
                return 'Global Account';
            }

            if (normalizedFallback.toLowerCase().startsWith('competition:')) {
                const fallbackCode = normalizedFallback.split(':').slice(1).join(':').trim();
                const byFallbackCode = competitionAccounts.find((account) => String(account?.code) === String(fallbackCode));
                if (byFallbackCode?.name) return `${byFallbackCode.name} (${fallbackCode}) • Individual`;
                return fallbackCode ? `Competition ${fallbackCode} • Individual` : 'Competition • Individual';
            }

            if (normalizedFallback.toLowerCase().startsWith('team:')) {
                const fallbackTeamId = normalizedFallback.split(':').slice(1).join(':').trim();
                const byFallbackTeamId = teamCompetitionAccounts.find(
                    (account) => String(account?.team_id) === String(fallbackTeamId)
                        || String(account?.team_number) === String(fallbackTeamId),
                );
                const byFallbackTeamName = teamNameById.get(String(fallbackTeamId))
                    || byFallbackTeamId?.team_name
                    || byFallbackTeamId?.teamName
                    || byFallbackTeamId?.team?.name
                    || '';
                if (byFallbackTeamName) {
                    return `${byFallbackTeamName} • Team Competition`;
                }
                return 'Competition Team';
            }

            if (normalizedFallback.toLowerCase().startsWith('competition_team:')) {
                const parsedTeamId = normalizedFallback.split(':').slice(-1)[0]?.trim();
                if (parsedTeamId) {
                    const mappedTeamName = teamNameById.get(String(parsedTeamId));
                    if (mappedTeamName) return `${mappedTeamName} • Team Competition`;
                    return `Competition Team (ID: ${parsedTeamId})`;
                }
                return 'Competition Team';
            }

            return teamId ? `Competition Team (ID: ${teamId})` : normalizedFallback;
        }

        if (competitionCode) {
            const ownershipType = teamId ? `Team${teamSuffix}` : 'Individual';
            return `Competition ${competitionCode} • ${ownershipType}`;
        }

        return '';
    }, [competitionAccounts, resolveCompetitionTeamId, teamCompetitionAccounts, teamNameById]);

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

            const accountLabel = resolveAccountDisplayName(row);

            return {
                id: row?.id ?? row?.trade_id ?? row?.order_id ?? `${row?.symbol || row?.ticker || 'trade'}-${index}`,
                symbol: String(row?.symbol ?? row?.ticker ?? '-').toUpperCase(),
                action: String(row?.action ?? row?.side ?? row?.type ?? '-').toUpperCase(),
                quantity: Number.isFinite(quantity) ? quantity : 0,
                price: Number.isFinite(price) ? price : null,
                status: String(row?.status ?? row?.state ?? row?.result ?? 'FILLED').toUpperCase(),
                timestamp,
                account: accountLabel,
            };
        });
    }, [resolveAccountDisplayName]);

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
            const data = response?.data || {};
            setCurrentUserId(String(data?.user_id ?? data?.id ?? data?.user?.id ?? '').trim());
            const accountsCollection = pickFirstNonEmptyArray(
                data?.accounts,
                data?.user_accounts,
                data?.userAccounts,
                data?.portfolios,
                data?.account_list,
                data?.accountList,
            );
            const accountRowsWithCompetitionCode = accountsCollection.filter((account) => {
                const possibleCode = account?.competition_code
                    ?? account?.competitionCode
                    ?? account?.code
                    ?? account?.competition?.code;
                return String(possibleCode || '').trim().length > 0;
            });
            const directCompetitionRows = pickFirstNonEmptyArray(
                data?.competition_accounts,
                data?.competitionAccounts,
                data?.competition_account,
                data?.competition_portfolios,
                data?.competitionPortfolio,
                data?.individual_competition_accounts,
                data?.individualCompetitionAccounts,
                data?.individual_accounts,
                data?.accounts?.competition_accounts,
                data?.accounts?.competitionAccounts,
                data?.accounts?.competition,
                data?.accounts?.competitions,
                data?.accounts?.individual,
                data?.competitions,
            );
            const directTeamCompetitionRows = pickFirstNonEmptyArray(
                data?.team_competitions,
                data?.teamCompetitions,
                data?.team_competition_accounts,
                data?.teamCompetitionAccounts,
                data?.competition_team_accounts,
                data?.team_accounts,
                data?.teamAccounts,
                data?.team_portfolios,
                data?.accounts?.team_competitions,
                data?.accounts?.teamCompetitions,
                data?.accounts?.team_competition_accounts,
                data?.accounts?.team_accounts,
                data?.accounts?.competition_team_accounts,
                data?.accounts?.team,
            );
            const competitionRowsFromAccounts = accountsCollection.filter((account) => {
                const type = String(account?.type || account?.account_type || '').toLowerCase();
                return type === 'competition';
            });
            const teamRowsFromAccounts = accountsCollection.filter((account) => {
                const type = String(account?.type || account?.account_type || '').toLowerCase();
                return type === 'team' || type === 'team_competition';
            });

            const competitionAccountRows = pickFirstNonEmptyArray(
                directCompetitionRows,
                competitionRowsFromAccounts,
                accountRowsWithCompetitionCode.filter((account) => {
                    const type = String(account?.type || account?.account_type || '').toLowerCase();
                    return type !== 'team' && type !== 'team_competition';
                }),
            )
                .map(normalizeCompetitionAccount)
                .filter(Boolean);

            const teamCompetitionRows = pickFirstNonEmptyArray(
                directTeamCompetitionRows,
                teamRowsFromAccounts,
            )
                .map(normalizeTeamCompetitionAccount)
                .filter(Boolean);

            const teamRows = pickFirstNonEmptyArray(
                data?.teams,
                data?.user_teams,
                data?.team_memberships,
                data?.team_accounts,
                data?.accounts?.teams,
                teamCompetitionRows.map((account) => ({
                    id: account?.team_id,
                    team_id: account?.team_id,
                    team_number: account?.team_number,
                    name: account?.team_name,
                    team_name: account?.team_name,
                })),
            ).filter((team) => {
                const id = team?.id ?? team?.team_id ?? team?.teamId ?? team?.team_number ?? team?.teamNumber;
                const name = team?.name ?? team?.team_name ?? team?.teamName;
                return id !== undefined && id !== null && String(name || '').trim();
            });

            setGlobalAccount(data.global_account || { cash_balance: 0, portfolio: [], total_value: 0 });
            setCompetitionAccounts(competitionAccountRows);
            setTeamCompetitionAccounts(teamCompetitionRows);
            if (response.data.is_admin !== undefined) setIsAdmin(response.data.is_admin);
            if (teamRows.length > 0) setTeams(teamRows);
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




    const fetchFeaturedCompetitions = useCallback(async () => {
        setIsLoading(true);
        try {
            const endpointCandidates = isAdmin
                ? [`${BASE_URL}/admin/competitions?admin_username=${username}`]
                : [
                    `${BASE_URL}/featured_competitions`,
                    `${BASE_URL}/competitions`,
                ];

            let response = null;
            let lastError = null;
            for (const endpoint of endpointCandidates) {
                try {
                    response = await axios.get(endpoint);
                    break;
                } catch (error) {
                    lastError = error;
                    if (error?.response?.status === 404) continue;
                    throw error;
                }
            }

            if (!response) throw lastError || new Error('No competition endpoint returned data.');

            const comps = normalizeCompetitionCollection(response?.data)
                .map(normalizeCompetitionEntry)
                .filter(Boolean);
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
                    comps.filter((comp) => comp.featured && isActive(comp)).slice(0, 10)
                );
            }
        } catch (error) {
            console.error("Error fetching competitions:", error);
            setFeaturedCompetitions([]);
            if (isAdmin) setAllCompetitions([]);
        } finally {
            setIsLoading(false);
        }
    }, [BASE_URL, isAdmin, username]);


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
    }, [isAdmin, isLoggedIn, username, fetchFeaturedCompetitions, fetchUserData]);

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
                // Persist the canonical username returned by the server, not the raw
                // value the user typed. Logging in by email (or with different casing)
                // would otherwise store an identifier that other endpoints, which match
                // on username only, can't resolve — leaving the dashboard unable to load
                // the user's competitions.
                const resolvedUsername = res.data.username;
                localStorage.setItem('username', resolvedUsername);
                setUsername(resolvedUsername);
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

    const handleCompetitionDatesUpdated = useCallback((competitionCode, updatedCompetition) => {
        if (updatedCompetition) {
            const normalized = normalizeCompetitionEntry(updatedCompetition);
            if (normalized) {
                setAllCompetitions((prev) => prev.map((entry) => (entry.code === competitionCode ? { ...entry, ...normalized } : entry)));
                setFeaturedCompetitions((prev) => prev.map((entry) => (entry.code === competitionCode ? { ...entry, ...normalized } : entry)));
                return;
            }
        }
        fetchFeaturedCompetitions();
    }, [fetchFeaturedCompetitions]);

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

    const curriculumRouteParams = useMemo(() => normalizeCurriculumRouteParams({
        competitionSources: [{ competition_id: selectedCompetitionId }, selectedCompetitionRecord, selectedAccount],
        userSources: [{ user_id: currentUserId }, selectedCompetitionRecord, selectedAccount],
        username,
    }), [currentUserId, selectedAccount, selectedCompetitionId, selectedCompetitionRecord, username]);

    const curriculumCanonicalEndpoints = useMemo(() => {
        if (!curriculumRouteParams?.competition_id || !curriculumRouteParams?.username) return null;
        return buildCanonicalCurriculumEndpoints({
            baseUrl: BASE_URL,
            competition_id: curriculumRouteParams.competition_id,
            user_id: curriculumRouteParams.user_id,
            username: curriculumRouteParams.username,
        });
    }, [BASE_URL, curriculumRouteParams?.competition_id, curriculumRouteParams?.user_id, curriculumRouteParams?.username]);

    const refreshCurriculumGradeSummary = useCallback(async () => {
        if (!curriculumRouteParams?.isReady || !curriculumCanonicalEndpoints?.studentGrades) return null;
        const gradesRequest = curriculumCanonicalEndpoints.studentGrades;
        const response = await axios.get(gradesRequest.url, { params: gradesRequest.params });
        const refreshedSummary = resolveGradeSummaryOverall(response?.data ?? null);
        setCurriculumGradeSummary(refreshedSummary);
        return refreshedSummary;
    }, [curriculumCanonicalEndpoints, curriculumRouteParams?.isReady]);

    const applyImmediateCurriculumGradeSummary = useCallback(async (mutationPayload) => {
        const responseSummary = resolveGradeSummaryOverall(mutationPayload);
        if (responseSummary) {
            setCurriculumGradeSummary(responseSummary);
            return responseSummary;
        }
        return refreshCurriculumGradeSummary();
    }, [refreshCurriculumGradeSummary]);

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
            await applyImmediateCurriculumGradeSummary(res?.data);
            await fetchUserData();
            if (showTradeBlotterModal) {
                await fetchTradeBlotterRows();
            }
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
                    await applyImmediateCurriculumGradeSummary(tradeResponse?.data);
                    await fetchUserData();
                    if (showTradeBlotterModal) {
                        await fetchTradeBlotterRows();
                    }
                } catch (error) {
                    console.error('Limit order processing error:', error.response?.data || error.message);
                }
            }
        }, 15000);

        return () => clearInterval(interval);
    }, [BASE_URL, applyImmediateCurriculumGradeSummary, buildTradeRequest, fetchTradeBlotterRows, fetchUserData, isLoggedIn, pendingLimitOrders, showTradeBlotterModal, username]);

    useEffect(() => {
        if (!isLoggedIn || !showTrading || !selectedCompetitionCode || !username) {
            setCurriculumOverview(null);
            setCurriculumModules([]);
            setCurriculumGradeSummary(null);
            setCurriculumInstructorSummary(null);
            setCurriculumInstructorSubmissions([]);
            setCurriculumInstructorMessage('');
            setCurriculumError('');
            setCurriculumGradesMessage('');
            setCurriculumDebugState({
                hasError: !selectedCompetitionCode,
                renderReason: !selectedCompetitionCode ? 'competition not selected' : '',
                competitionContext: {
                    id: selectedCompetitionId || '',
                    name: selectedCompetitionRecord?.name || '',
                    curriculumEnabled: toBooleanFlag(
                        selectedCompetitionRecord?.curriculum_enabled ?? selectedCompetitionRecord?.curriculumEnabled,
                    ),
                    fields: getCurriculumCompetitionFields(selectedCompetitionRecord),
                },
                hydrationInfo: {
                    attempted: competitionHydration?.attempted || false,
                    resolvedFromCode: competitionHydration?.resolvedFromCode || false,
                    source: competitionHydration?.source || '',
                    idSource: selectedCompetitionIdSource,
                    extractedId: competitionHydration?.extractedId || '',
                    extractedIdKey: competitionHydration?.extractedIdKey || '',
                    selectedCompetitionUpdated: Boolean(competitionHydration?.selectedCompetitionUpdated),
                    rawResponseBody: competitionHydration?.rawResponseBody ?? null,
                },
                requestInfo: {
                    endpointUrl: selectedCompetitionId ? `${BASE_URL}${buildCurriculumPath(selectedCompetitionId)}` : '',
                    requestMade: false,
                    httpStatus: null,
                    responseMessage: '',
                    requestStatus: {
                        overview: { attempted: false, ok: false, status: null, message: '' },
                        modules: { attempted: false, ok: false, status: null, message: '' },
                        grades: { attempted: false, ok: false, status: null, message: '' },
                    },
                },
                submitVsGradesComparison: null,
            });
            return;
        }

        let cancelled = false;
        const fetchCurriculumData = async () => {
            setCurriculumLoading(true);
            setCurriculumError('');
            setCurriculumGradesMessage('');
            const baseDebugState = {
                hasError: false,
                renderReason: '',
                competitionContext: {
                    id: selectedCompetitionId || '',
                    name: selectedCompetitionRecord?.name || '',
                    curriculumEnabled: toBooleanFlag(
                        selectedCompetitionRecord?.curriculum_enabled ?? selectedCompetitionRecord?.curriculumEnabled,
                    ),
                    fields: getCurriculumCompetitionFields(selectedCompetitionRecord),
                },
                hydrationInfo: {
                    attempted: competitionHydration?.attempted || false,
                    resolvedFromCode: competitionHydration?.resolvedFromCode || false,
                    source: competitionHydration?.source || '',
                    idSource: selectedCompetitionIdSource,
                    extractedId: competitionHydration?.extractedId || '',
                    extractedIdKey: competitionHydration?.extractedIdKey || '',
                    selectedCompetitionUpdated: Boolean(competitionHydration?.selectedCompetitionUpdated),
                    rawResponseBody: competitionHydration?.rawResponseBody ?? null,
                },
                requestInfo: {
                    endpointUrl: selectedCompetitionId ? `${BASE_URL}${buildCurriculumPath(selectedCompetitionId)}` : '',
                    requestMade: false,
                    httpStatus: null,
                    responseMessage: '',
                    requestStatus: {
                        overview: { attempted: false, ok: false, status: null, message: '' },
                        modules: { attempted: false, ok: false, status: null, message: '' },
                        grades: { attempted: false, ok: false, status: null, message: '' },
                    },
                },
                submitVsGradesComparison: null,
            };
            setCurriculumDebugState(baseDebugState);
            try {
                if (!selectedCompetitionId) {
                    const hasHydratedResponseId = Boolean(String(competitionHydration?.extractedId || '').trim());
                    setCurriculumDebugState({
                        ...baseDebugState,
                        hasError: true,
                        renderReason: competitionHydration?.attempted
                            ? hasHydratedResponseId
                                ? 'curriculum fetch did not run (selected competition state not updated after hydration)'
                                : 'curriculum fetch did not run (competition_id unresolved after hydration)'
                            : 'curriculum fetch did not run (waiting for competition hydration)',
                    });
                    throw new Error(
                        hasHydratedResponseId
                            ? `Selected competition state was not updated after hydration for competition code "${selectedCompetitionCode}".`
                            : `Missing competition_id for competition code "${selectedCompetitionCode}".`,
                    );
                }
                const overviewUrl = `${BASE_URL}${buildCurriculumPath(selectedCompetitionId)}`;
                setCurriculumDebugState((previous) => ({
                    ...previous,
                    requestInfo: {
                        ...previous.requestInfo,
                        endpointUrl: overviewUrl,
                        requestMade: true,
                        requestStatus: {
                            ...previous.requestInfo?.requestStatus,
                            overview: { attempted: true, ok: false, status: null, message: '' },
                        },
                    },
                }));
                const overviewResponse = await axios.get(overviewUrl);
                const overview = overviewResponse?.data ?? null;
                if (cancelled) return;

                const normalizedOverview = normalizeCurriculumOverview(overview?.curriculum || overview);
                setCurriculumOverview(normalizedOverview);
                setCurriculumDebugState((previous) => ({
                    ...previous,
                    competitionContext: {
                        ...previous.competitionContext,
                        curriculumEnabled: normalizedOverview.curriculum_enabled,
                        parsedEnabledValue: normalizedOverview.curriculum_enabled,
                        parsedEnabledSourceKey: normalizedOverview.enabled_source_key || '(none)',
                    },
                    requestInfo: {
                        ...previous.requestInfo,
                        httpStatus: overviewResponse?.status ?? null,
                        rawOverviewBody: overview,
                        requestStatus: {
                            ...previous.requestInfo?.requestStatus,
                            overview: {
                                attempted: true,
                                ok: true,
                                status: overviewResponse?.status ?? null,
                                message: '',
                            },
                        },
                    },
                }));

                if (!normalizedOverview.curriculum_enabled) {
                    setCurriculumModules([]);
                    setCurriculumGradeSummary(null);
                    setCurriculumInstructorSummary(null);
                    setCurriculumInstructorSubmissions([]);
                    setCurriculumError('Curriculum is not enabled for this competition.');
                    setCurriculumDebugState((previous) => ({
                        ...previous,
                        hasError: true,
                        renderReason: 'curriculum not enabled by backend overview response',
                    }));
                    return;
                }

                let modulesData = [];
                let gradesData = null;
                let instructorData = null;
                let instructorSubmissionsData = [];

                try {
                    const modulesUrl = `${BASE_URL}${buildCurriculumPath(selectedCompetitionId, 'modules')}`;
                    const modulesResponse = await axios.get(modulesUrl, {
                        params: username ? { username } : undefined,
                    });
                    modulesData = modulesResponse?.data ?? [];
                    if (!cancelled) {
                        setCurriculumDebugState((previous) => ({
                            ...previous,
                            requestInfo: {
                                ...previous.requestInfo,
                                requestStatus: {
                                    ...previous.requestInfo?.requestStatus,
                                    modules: {
                                        attempted: true,
                                        ok: true,
                                        status: modulesResponse?.status ?? null,
                                        message: '',
                                    },
                                },
                            },
                        }));
                    }
                } catch (error) {
                    if (!cancelled) {
                        setCurriculumDebugState((previous) => ({
                            ...previous,
                            hasError: true,
                            renderReason: 'modules request failed',
                            requestInfo: {
                                ...previous.requestInfo,
                                requestStatus: {
                                    ...previous.requestInfo?.requestStatus,
                                    modules: {
                                        attempted: true,
                                        ok: false,
                                        status: error?.response?.status ?? null,
                                        message: getCurriculumResponseMessage(error),
                                    },
                                },
                            },
                        }));
                    }
                }

                if (curriculumRouteParams?.isReady && curriculumCanonicalEndpoints?.studentGrades) {
                    const gradesRequest = curriculumCanonicalEndpoints.studentGrades;
                    try {
                        const gradesResponse = await axios.get(gradesRequest.url, { params: gradesRequest.params });
                        gradesData = gradesResponse?.data ?? null;
                        if (!cancelled) {
                            setCurriculumDebugState((previous) => ({
                                ...previous,
                                requestInfo: {
                                    ...previous.requestInfo,
                                    requestStatus: {
                                        ...previous.requestInfo?.requestStatus,
                                        grades: {
                                            attempted: true,
                                            ok: true,
                                            status: gradesResponse?.status ?? null,
                                            message: '',
                                        },
                                    },
                                },
                            }));
                        }
                    } catch (error) {
                        if (!cancelled) {
                            const statusCode = error?.response?.status ?? null;
                            const responseMessage = getCurriculumResponseMessage(error);
                            logCurriculumRequestFailure({
                                endpoint: gradesRequest.endpoint,
                                competition_id: curriculumRouteParams.competition_id,
                                user_id: curriculumRouteParams.user_id,
                                username: curriculumRouteParams.username,
                                status: statusCode,
                                response_message: responseMessage,
                            });
                            setCurriculumGradesMessage(mapCurriculumRequestError({
                                status: statusCode,
                                responseMessage,
                            }));
                            setCurriculumDebugState((previous) => ({
                                ...previous,
                                requestInfo: {
                                    ...previous.requestInfo,
                                    requestStatus: {
                                        ...previous.requestInfo?.requestStatus,
                                        grades: {
                                            attempted: true,
                                            ok: false,
                                            status: error?.response?.status ?? null,
                                            message: getCurriculumResponseMessage(error),
                                        },
                                    },
                                },
                            }));
                        }
                    }
                } else if (!cancelled) {
                    setCurriculumDebugState((previous) => ({
                        ...previous,
                        requestInfo: {
                            ...previous.requestInfo,
                            requestStatus: {
                                ...previous.requestInfo?.requestStatus,
                                grades: { attempted: false, ok: false, status: null, message: 'skipped (missing competition/user route params)' },
                            },
                        },
                    }));
                }

                if (canManageCurriculumGrades && curriculumCanonicalEndpoints?.instructorOverview && curriculumCanonicalEndpoints?.writtenSubmissions) {
                    try {
                        const overviewRequest = curriculumCanonicalEndpoints.instructorOverview;
                        instructorData = (await axios.get(overviewRequest.url, { params: overviewRequest.params }))?.data ?? null;
                    } catch (error) {
                        logCurriculumRequestFailure({
                            endpoint: curriculumCanonicalEndpoints.instructorOverview.endpoint,
                            competition_id: curriculumRouteParams.competition_id,
                            user_id: curriculumRouteParams.user_id,
                            username: curriculumRouteParams.username,
                            status: error?.response?.status ?? null,
                            response_message: getCurriculumResponseMessage(error),
                        });
                        instructorData = null;
                    }
                    try {
                        const submissionsRequest = curriculumCanonicalEndpoints.writtenSubmissions;
                        const response = await axios.get(submissionsRequest.url, { params: submissionsRequest.params });
                        instructorSubmissionsData = normalizeCollectionPayload(response?.data, ['submissions', 'items']);
                    } catch (error) {
                        logCurriculumRequestFailure({
                            endpoint: curriculumCanonicalEndpoints.writtenSubmissions.endpoint,
                            competition_id: curriculumRouteParams.competition_id,
                            user_id: curriculumRouteParams.user_id,
                            username: curriculumRouteParams.username,
                            status: error?.response?.status ?? null,
                            response_message: getCurriculumResponseMessage(error),
                        });
                        instructorSubmissionsData = [];
                    }
                }
                if (cancelled) return;

                const resolvedModules = Array.isArray(modulesData?.modules) ? modulesData.modules : (Array.isArray(modulesData) ? modulesData : []);
                const resolvedGradeSummary = resolveGradeSummaryOverall(gradesData);
                const resolvedInstructorSummary = resolveInstructorSummaryPayload(instructorData);

                setCurriculumModules(resolvedModules);
                setCurriculumGradeSummary((previous) => resolvedGradeSummary || previous || null);
                setCurriculumInstructorSummary(resolvedInstructorSummary);
                setCurriculumInstructorSubmissions(Array.isArray(instructorSubmissionsData) ? instructorSubmissionsData : []);
                setCurriculumInstructorMessage('');

                if (resolvedModules.length === 0 && !resolvedGradeSummary && !resolvedInstructorSummary) {
                    setCurriculumError(`Curriculum is enabled, but no curriculum records were returned yet for competition_id=${selectedCompetitionId}.`);
                }
                setCurriculumDebugState((previous) => {
                    const moduleRequestFailed = previous?.requestInfo?.requestStatus?.modules?.attempted
                        && !previous?.requestInfo?.requestStatus?.modules?.ok;
                    const gradesRequestFailed = previous?.requestInfo?.requestStatus?.grades?.attempted
                        && !previous?.requestInfo?.requestStatus?.grades?.ok;
                    return {
                        ...previous,
                        hasError: moduleRequestFailed || gradesRequestFailed,
                        renderReason: moduleRequestFailed ? 'modules request failed' : (gradesRequestFailed ? 'grades request failed (non-fatal)' : ''),
                    };
                });
            } catch (error) {
                if (cancelled) return;
                setCurriculumModules([]);
                setCurriculumGradeSummary(null);
                setCurriculumInstructorSummary(null);
                setCurriculumInstructorSubmissions([]);
                setCurriculumGradesMessage('');
                setCurriculumError(getApiErrorMessage(error, 'Unable to load curriculum data right now.'));
                const statusCode = error?.response?.status ?? null;
                const reasonByStatus = statusCode === 404
                    ? 'curriculum endpoint returned 404'
                    : statusCode === 500
                        ? 'curriculum endpoint returned 500'
                        : '';
                setCurriculumDebugState((previous) => ({
                    ...previous,
                    hasError: true,
                    renderReason: previous.renderReason || reasonByStatus || 'curriculum fetch did not run',
                    requestInfo: {
                        ...previous.requestInfo,
                        httpStatus: statusCode,
                        responseMessage: getCurriculumResponseMessage(error),
                        requestStatus: {
                            ...previous.requestInfo?.requestStatus,
                            overview: previous.requestInfo?.requestStatus?.overview?.attempted
                                ? {
                                    ...previous.requestInfo?.requestStatus?.overview,
                                    ok: false,
                                    status: statusCode,
                                    message: getCurriculumResponseMessage(error),
                                }
                                : previous.requestInfo?.requestStatus?.overview,
                        },
                    },
                }));
            } finally {
                if (!cancelled) setCurriculumLoading(false);
            }
        };

        fetchCurriculumData();
        return () => {
            cancelled = true;
        };
    }, [
        isLoggedIn,
        selectedCompetitionCode,
        selectedCompetitionId,
        selectedCompetitionRecord,
        selectedCompetitionIdSource,
        competitionHydration,
        curriculumRefreshTick,
        showTrading,
        canManageCurriculumGrades,
        curriculumCanonicalEndpoints,
        curriculumRouteParams,
        username,
    ]);

    useEffect(() => {
        if (!isLoggedIn || !showTrading || !selectedCompetitionCode || !username || !curriculumOverview?.curriculum_enabled) return undefined;

        const handleFocusRefresh = () => {
            setCurriculumRefreshTick((value) => value + 1);
        };

        const handleVisibilityRefresh = () => {
            if (document.visibilityState === 'visible') handleFocusRefresh();
        };

        window.addEventListener('focus', handleFocusRefresh);
        document.addEventListener('visibilitychange', handleVisibilityRefresh);

        return () => {
            window.removeEventListener('focus', handleFocusRefresh);
            document.removeEventListener('visibilitychange', handleVisibilityRefresh);
        };
    }, [curriculumOverview?.curriculum_enabled, isLoggedIn, selectedCompetitionCode, showTrading, username]);

    useEffect(() => {
        const latestSubmission = curriculumSubmissionState?.lastSubmissionResult;
        if (!latestSubmission) return;
        const summaries = Array.isArray(curriculumGradeSummary?.moduleGrades)
            ? curriculumGradeSummary.moduleGrades
            : (Array.isArray(curriculumGradeSummary?.module_grades) ? curriculumGradeSummary.module_grades : []);
        const moduleId = String(latestSubmission?.moduleId ?? '').trim();
        const weekNumber = String(latestSubmission?.weekNumber ?? '').trim();
        const matchedSummary = summaries.find((summary) => {
            const summaryModuleId = String(summary?.moduleId ?? summary?.module_id ?? '').trim();
            const summaryWeek = String(summary?.weekNumber ?? summary?.week_number ?? '').trim();
            if (moduleId && summaryModuleId && summaryModuleId === moduleId) return true;
            if (weekNumber && summaryWeek && summaryWeek === weekNumber) return true;
            return false;
        }) || null;
        const comparison = {
            assignmentId: latestSubmission?.assignmentId ?? '',
            moduleId: moduleId || null,
            weekNumber: weekNumber || null,
            immediateSubmit: {
                score: latestSubmission?.score ?? null,
                percentage: latestSubmission?.percentage ?? null,
                status: latestSubmission?.status ?? null,
            },
            gradesSummary: matchedSummary
                ? {
                    moduleId: matchedSummary?.moduleId ?? matchedSummary?.module_id ?? null,
                    weekNumber: matchedSummary?.weekNumber ?? matchedSummary?.week_number ?? null,
                    totalPointsEarned: matchedSummary?.totalPointsEarned ?? matchedSummary?.total_points_earned ?? null,
                    totalPointsPossible: matchedSummary?.totalPointsPossible ?? matchedSummary?.total_points_possible ?? null,
                    percentage: matchedSummary?.percentage ?? null,
                }
                : null,
            hasModuleSummaries: summaries.length > 0,
        };

        console.debug('[curriculum][submit-vs-grades]', comparison);
        setCurriculumDebugState((previous) => ({
            ...previous,
            submitVsGradesComparison: comparison,
        }));
    }, [curriculumGradeSummary, curriculumSubmissionState?.lastSubmissionResult]);


    // =========================================
    // Teams & Competitions
    // =========================================
    const handleSubmitCurriculumItem = async (item, submissionPayload = {}) => {
        const assignmentId = normalizeAssignmentIdKey(item?.assignmentId || item?.id);
        if (!assignmentId) return;

        setCurriculumSubmissionState((previous) => ({
            ...previous,
            byAssignmentId: {
                ...(previous.byAssignmentId || {}),
                [assignmentId]: {
                    status: 'loading',
                    message: 'Submitting assignment...',
                    result: null,
                },
            },
        }));
        setCurriculumActionLoading(true);
        try {
            const response = await axios.post(`${BASE_URL}/curriculum/assignments/${encodeURIComponent(assignmentId)}/submissions`, {
                username,
                competition_id: selectedCompetitionId,
                ...submissionPayload,
            });
            const immediateResult = response?.data || {};
            const immediateStatus = immediateResult?.status || immediateResult?.gradingStatus;
            const successMessage = `Submitted: ${item?.title || 'assignment'}${immediateStatus ? ` • ${String(immediateStatus)}` : ''}`;
            setCurriculumSubmissionState((previous) => ({
                ...previous,
                submittedByAssignmentId: {
                    ...previous.submittedByAssignmentId,
                    [assignmentId]: true,
                },
                byAssignmentId: {
                    ...(previous.byAssignmentId || {}),
                    [assignmentId]: {
                        status: 'success',
                        message: successMessage,
                        result: {
                            score: immediateResult?.score ?? null,
                            pointsEarned: immediateResult?.pointsEarned ?? immediateResult?.points_earned ?? null,
                            pointsPossible: immediateResult?.pointsPossible ?? immediateResult?.points_possible ?? null,
                            percentage: immediateResult?.percentage ?? null,
                            status: immediateStatus ?? null,
                            feedback: immediateResult?.feedback ?? null,
                        },
                    },
                },
                latestMessage: successMessage,
                lastSubmissionResult: {
                    assignmentId,
                    moduleId: item?.moduleId ?? item?.module_id ?? null,
                    weekNumber: item?.weekNumber ?? item?.week_number ?? null,
                    score: immediateResult?.score ?? null,
                    pointsEarned: immediateResult?.pointsEarned ?? immediateResult?.points_earned ?? null,
                    pointsPossible: immediateResult?.pointsPossible ?? immediateResult?.points_possible ?? null,
                    percentage: immediateResult?.percentage ?? null,
                    status: immediateStatus ?? null,
                    feedback: immediateResult?.feedback ?? null,
                },
            }));
            await applyImmediateCurriculumGradeSummary(immediateResult);
            if (typeof window !== 'undefined') {
                pendingCurriculumScrollRestoreY.current = window.scrollY;
            }
            await refetchCurriculumGradeQueries({
                refetchStudentGradesSummary: async () => setCurriculumRefreshTick((value) => value + 1),
            });
        } catch (error) {
            const lockInfo = parseLockedSubmissionError(error);
            if (lockInfo) {
                // 423 Locked: do not retry, surface module-lock message and link to prerequisite.
                const lockMessage = lockInfo.message || 'This module is locked. Complete the prerequisite to submit.';
                setCurriculumSubmissionState((previous) => ({
                    ...previous,
                    byAssignmentId: {
                        ...(previous.byAssignmentId || {}),
                        [assignmentId]: {
                            status: 'locked',
                            message: lockMessage,
                            result: null,
                            lockInfo,
                        },
                    },
                    latestMessage: lockMessage,
                }));
            } else {
                console.error('Error submitting curriculum item:', error);
                const errorMessage = getApiErrorMessage(error, `Could not submit assignment: ${item?.title || 'Unknown assignment'}`);
                setCurriculumSubmissionState((previous) => ({
                    ...previous,
                    byAssignmentId: {
                        ...(previous.byAssignmentId || {}),
                        [assignmentId]: {
                            status: 'error',
                            message: errorMessage,
                            result: null,
                        },
                    },
                    latestMessage: errorMessage,
                }));
            }
        } finally {
            setCurriculumActionLoading(false);
        }
    };

    const handleCurriculumLessonEdit = useCallback(async (event) => {
        if (!event || !event.type) return;
        const moduleKey = String(event.moduleKey ?? event.moduleId ?? '').trim();
        if (!moduleKey) return;
        if (event.type === 'open') {
            setCurriculumLessonEditState((previous) => ({
                ...previous,
                [moduleKey]: {
                    open: true,
                    initialContent: event.initialContent ?? '',
                    status: 'idle',
                    message: '',
                },
            }));
            return;
        }
        if (event.type === 'close') {
            setCurriculumLessonEditState((previous) => {
                const next = { ...previous };
                delete next[moduleKey];
                return next;
            });
            return;
        }
        if (event.type === 'save') {
            const moduleId = event.moduleId;
            const lessonContent = String(event.lessonContent ?? '').trim();
            if (!moduleId) {
                setCurriculumLessonEditState((previous) => ({
                    ...previous,
                    [moduleKey]: {
                        ...(previous[moduleKey] || {}),
                        open: true,
                        status: 'error',
                        message: 'Missing module identifier.',
                    },
                }));
                return;
            }
            if (!lessonContent) {
                setCurriculumLessonEditState((previous) => ({
                    ...previous,
                    [moduleKey]: {
                        ...(previous[moduleKey] || {}),
                        open: true,
                        status: 'error',
                        message: 'Lesson content cannot be empty.',
                    },
                }));
                return;
            }
            setCurriculumLessonEditState((previous) => ({
                ...previous,
                [moduleKey]: {
                    ...(previous[moduleKey] || {}),
                    open: true,
                    status: 'saving',
                    message: '',
                },
            }));
            setCurriculumActionLoading(true);
            try {
                const url = `${BASE_URL}${buildCurriculumPath(selectedCompetitionId, 'modules/lesson-content')}`;
                await axios.patch(url, {
                    username,
                    updates: [{ moduleId, lessonContent }],
                });
                setCurriculumLessonEditState((previous) => {
                    const next = { ...previous };
                    delete next[moduleKey];
                    return next;
                });
                setCurriculumRefreshTick((value) => value + 1);
            } catch (error) {
                const message = getApiErrorMessage(error, 'Unable to save lesson content.');
                setCurriculumLessonEditState((previous) => ({
                    ...previous,
                    [moduleKey]: {
                        ...(previous[moduleKey] || {}),
                        open: true,
                        status: 'error',
                        message,
                    },
                }));
            } finally {
                setCurriculumActionLoading(false);
            }
        }
    }, [BASE_URL, selectedCompetitionId, username]);

    const handleCurriculumAssignmentEdit = useCallback(async (event) => {
        if (!event || !event.type) return;
        const assignmentKey = String(event.assignmentKey ?? event.assignmentId ?? '').trim();
        if (!assignmentKey) return;
        if (event.type === 'open') {
            setCurriculumAssignmentEditState((previous) => ({
                ...previous,
                [assignmentKey]: {
                    open: true,
                    initialContent: event.initialContent ?? {},
                    status: 'idle',
                    message: '',
                },
            }));
            return;
        }
        if (event.type === 'close') {
            setCurriculumAssignmentEditState((previous) => {
                const next = { ...previous };
                delete next[assignmentKey];
                return next;
            });
            return;
        }
        if (event.type === 'validation-error') {
            setCurriculumAssignmentEditState((previous) => ({
                ...previous,
                [assignmentKey]: {
                    ...(previous[assignmentKey] || { open: true }),
                    open: true,
                    status: 'error',
                    message: event.message || 'Invalid assignment prompts.',
                },
            }));
            return;
        }
        if (event.type === 'save') {
            const numericAssignmentId = Number(event.assignmentId);
            if (!Number.isFinite(numericAssignmentId)) {
                setCurriculumAssignmentEditState((previous) => ({
                    ...previous,
                    [assignmentKey]: {
                        ...(previous[assignmentKey] || {}),
                        open: true,
                        status: 'error',
                        message: 'Missing assignment identifier.',
                    },
                }));
                return;
            }
            setCurriculumAssignmentEditState((previous) => ({
                ...previous,
                [assignmentKey]: {
                    ...(previous[assignmentKey] || {}),
                    open: true,
                    status: 'saving',
                    message: '',
                },
            }));
            setCurriculumActionLoading(true);
            try {
                const url = `${BASE_URL}${buildCurriculumPath(selectedCompetitionId, 'assignments/content')}`;
                await axios.patch(url, {
                    username,
                    updates: [{ assignmentId: numericAssignmentId, content: event.content }],
                });
                setCurriculumAssignmentEditState((previous) => {
                    const next = { ...previous };
                    delete next[assignmentKey];
                    return next;
                });
                setCurriculumRefreshTick((value) => value + 1);
            } catch (error) {
                const message = getApiErrorMessage(error, 'Unable to save assignment prompts.');
                setCurriculumAssignmentEditState((previous) => ({
                    ...previous,
                    [assignmentKey]: {
                        ...(previous[assignmentKey] || {}),
                        open: true,
                        status: 'error',
                        message,
                    },
                }));
            } finally {
                setCurriculumActionLoading(false);
            }
        }
    }, [BASE_URL, selectedCompetitionId, username]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const restoreTarget = pendingCurriculumScrollRestoreY.current;
        if (!Number.isFinite(restoreTarget) || curriculumLoading) return;
        pendingCurriculumScrollRestoreY.current = null;
        window.requestAnimationFrame(() => {
            window.scrollTo({ top: restoreTarget, behavior: 'auto' });
        });
    }, [curriculumLoading]);

    const postToFirstSuccessfulEndpoint = async (candidateRequests) => {
        let lastError = null;
        for (const candidate of candidateRequests) {
            try {
                const response = await axios({
                    method: candidate.method || 'post',
                    url: candidate.url,
                    data: candidate.data,
                    params: candidate.params,
                });
                return response;
            } catch (error) {
                lastError = error;
            }
        }
        throw lastError || new Error('No endpoint candidates provided.');
    };

    const handleRefreshInstructorData = () => {
        setCurriculumRefreshTick((value) => value + 1);
    };

    const handleGradeSubmission = async ({ submission, score, question1Score, question2Score, comments }) => {
        const submissionId = submission?.submission_id || submission?.id;
        const assignmentId = submission?.assignment_id || submission?.assignmentId;
        const q1 = Number(question1Score);
        const q2 = Number(question2Score);
        const hasQ1 = Number.isFinite(q1);
        const hasQ2 = Number.isFinite(q2);
        const manualTotal = Number(score);
        const effectiveScore = Number.isFinite(manualTotal) ? manualTotal : ((hasQ1 ? q1 : 0) + (hasQ2 ? q2 : 0));
        if (!submissionId || !Number.isFinite(effectiveScore)) {
            setCurriculumInstructorMessage('Enter a valid score before grading (total or question scores).');
            return;
        }
        if ((hasQ1 && (q1 < 0 || q1 > 10)) || (hasQ2 && (q2 < 0 || q2 > 10)) || effectiveScore < 0 || effectiveScore > 20) {
            setCurriculumInstructorMessage('Scores must be within range (Q1/Q2: 0-10, total: 0-20).');
            return;
        }
        const questionGrades = [];
        if (hasQ1) questionGrades.push({ questionId: 'q1', pointsAwarded: q1, pointsPossible: 10, feedback: '' });
        if (hasQ2) questionGrades.push({ questionId: 'q2', pointsAwarded: q2, pointsPossible: 10, feedback: '' });
        const gradePayload = {
            competition_id: selectedCompetitionId,
            score: effectiveScore,
            grader: username,
            comments: comments || '',
            feedback: comments || '',
            question_1_score: hasQ1 ? q1 : null,
            question_2_score: hasQ2 ? q2 : null,
            q1_score: hasQ1 ? q1 : null,
            q2_score: hasQ2 ? q2 : null,
            question_scores: hasQ1 || hasQ2 ? { q1: hasQ1 ? q1 : null, q2: hasQ2 ? q2 : null } : undefined,
        };
        setCurriculumActionLoading(true);
        setCurriculumInstructorMessage('');
        try {
            await postToFirstSuccessfulEndpoint([
                {
                    method: 'post',
                    url: `${BASE_URL}/teacher/submissions/${encodeURIComponent(submissionId)}/question-grades`,
                    data: {
                        username,
                        grades: questionGrades,
                        finalFeedback: comments || '',
                        rubricNotes: '',
                    },
                },
                {
                    method: 'post',
                    url: `${BASE_URL}/curriculum/submissions/${encodeURIComponent(submissionId)}/grade`,
                    data: gradePayload,
                },
                {
                    method: 'post',
                    url: `${BASE_URL}${buildCurriculumPath(selectedCompetitionId, `instructor/grade/${encodeURIComponent(submissionId)}`)}`,
                    data: { ...gradePayload, competition_id: undefined },
                },
                {
                    method: 'post',
                    url: `${BASE_URL}/curriculum/assignments/${encodeURIComponent(assignmentId || 'unknown')}/submissions/${encodeURIComponent(submissionId)}/grade`,
                    data: gradePayload,
                },
            ]);
            setCurriculumInstructorMessage('Submission graded successfully.');
            await refetchCurriculumGradeQueries({
                refetchStudentGradesSummary: async () => setCurriculumRefreshTick((value) => value + 1),
            });
        } catch (error) {
            setCurriculumInstructorMessage('Unable to grade submission right now. Curriculum remains usable.');
        } finally {
            setCurriculumActionLoading(false);
        }
    };

    const handleOverrideCurriculumScore = async ({ studentId, score }) => {
        const effectiveScore = Number(score);
        if (!studentId || !Number.isFinite(effectiveScore)) {
            setCurriculumInstructorMessage('Enter a valid override score.');
            return;
        }
        setCurriculumActionLoading(true);
        setCurriculumInstructorMessage('');
        try {
            await postToFirstSuccessfulEndpoint([
                {
                    method: 'post',
                    url: `${BASE_URL}${buildCurriculumPath(selectedCompetitionId, 'instructor/override-score')}`,
                    data: { student_id: studentId, score: effectiveScore, competition_id: selectedCompetitionId, grader: username },
                },
                {
                    method: 'post',
                    url: `${BASE_URL}/curriculum/grades/override`,
                    data: { student_id: studentId, score: effectiveScore, competition_id: selectedCompetitionId, grader: username },
                },
            ]);
            setCurriculumInstructorMessage('Student score override submitted.');
            setCurriculumRefreshTick((value) => value + 1);
        } catch (error) {
            setCurriculumInstructorMessage('Unable to override score right now. Curriculum remains usable.');
        } finally {
            setCurriculumActionLoading(false);
        }
    };

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
        if (curriculumEnabled) {
            const parsedWeeks = Number(curriculumWeeks);
            if (!Number.isInteger(parsedWeeks) || parsedWeeks < CURRICULUM_WEEK_MIN || parsedWeeks > CURRICULUM_WEEK_MAX) {
                return setCompetitionMessage(`Curriculum length must be an integer between ${CURRICULUM_WEEK_MIN} and ${CURRICULUM_WEEK_MAX} weeks.`);
            }
            if (!curriculumStartDate) {
                return setCompetitionMessage('Curriculum start date is required when curriculum is enabled.');
            }
            if (!curriculumEndDate) {
                return setCompetitionMessage('Curriculum end date is required when curriculum is enabled.');
            }
        }
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
            if (curriculumEnabled) {
                payload.curriculumEnabled = true;
                payload.curriculumWeeks = Number(curriculumWeeks);
                payload.curriculumStartDate = curriculumStartDate;
                payload.curriculumEndDate = curriculumEndDate;
            }
            console.log('Creating competition with payload:', payload); // Debug
            const res = await axios.post(`${BASE_URL}/competition/create`, payload);
            setCompetitionMessage(`Competition created successfully! Code: ${res.data.competition_code}`);
            setCompetitionName('');
            setCompStartDate('');
            setCompEndDate('');
            setMaxPositionLimit('100%');
            setFeatureCompetition(false);
            setCurriculumEnabled(false);
            setCurriculumWeeks('8');
            setCurriculumStartDate('');
            setCurriculumEndDate('');
            setCurriculumDateOverride(false);
            await fetchUserData();
            await fetchFeaturedCompetitions();
            if (res?.data?.competition_code) {
                setSelectedAccount({
                    type: 'competition',
                    id: String(res.data.competition_code),
                    competition_id: String(res.data?.competition_id || '').trim(),
                });
            }
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
        const trimmedTeamCode = joinTeamCompetitionTeamCode.trim();
        const trimmedCompetitionCode = joinTeamCompetitionCode.trim();

        if (!trimmedTeamCode || !trimmedCompetitionCode) {
            return setTeamCompetitionMessage('Please enter both team code and competition code.');
        }

        const payload = {
            username,
            team_code: trimmedTeamCode,
            competition_code: trimmedCompetitionCode,
        };

        const endpointCandidates = [
            '/competition/team/join',
            '/competition/join_team',
            '/team/competition/join',
        ];

        setIsLoading(true);
        try {
            let res = null;
            let lastError = null;

            for (const endpoint of endpointCandidates) {
                try {
                    res = await axios.post(`${BASE_URL}${endpoint}`, payload);
                    break;
                } catch (error) {
                    lastError = error;
                    if (error?.response?.status !== 404 && error?.response?.status !== 405) {
                        throw error;
                    }
                }
            }

            if (!res) {
                throw lastError || new Error('No team competition join endpoint available.');
            }

            setTeamCompetitionMessage(res.data.message);
            setJoinTeamCompetitionTeamCode('');
            setJoinTeamCompetitionCode('');
            await fetchUserData();
        } catch (error) {
            console.error('Error joining competition as team:', error);
            setTeamCompetitionMessage(error.response?.data?.message || 'Error joining competition as team.');
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

        const toFiniteNumber = (...values) => {
            for (const value of values) {
                const candidate = Number(value);
                if (Number.isFinite(candidate)) return candidate;
            }
            return null;
        };
        const toFinitePercent = (...values) => {
            for (const value of values) {
                if (value === undefined || value === null) continue;
                if (typeof value === 'string') {
                    const normalized = value.trim().replace('%', '');
                    if (!normalized) continue;
                    const parsed = Number(normalized);
                    if (Number.isFinite(parsed)) return parsed;
                    continue;
                }
                const parsed = Number(value);
                if (Number.isFinite(parsed)) return parsed;
            }
            return null;
        };

        const format = (n) =>
            typeof n === 'number'
                ? n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                : '0.00';
        const pct = (n) =>
            typeof n === 'number' ? n.toFixed(2) + '%' : '0.00%';

        const todayPnlValueFromAccount = toFiniteNumber(
            account?.pnl_today,
            account?.today_pnl,
        );

        const todayPnlValue = Number.isFinite(todayPnlValueFromAccount)
            ? todayPnlValueFromAccount
            : 0;

        const todayPnlPercent = toFinitePercent(
            account?.pnl_pct_today,
            account?.today_pnl_pct,
        ) ?? 0;

        return (
            <div className="card section" style={{ width: 'min(100%, 360px)', height: '100%' }}>
                <h3>{isGlobal ? 'Global Account' : name + (code ? ` (${code})` : '')}</h3>
                <p className="note">Cash: ${format(cash_balance)}</p>
                <p className="note">Total Value: <strong>${format(total_value)}</strong></p>
                <p className="note">
                    P&L $ Today: <span style={{ color: todayPnlValue >= 0 ? 'green' : 'red', fontWeight: 600 }}>
                        {todayPnlValue >= 0 ? '+' : '-'}${format(Math.abs(todayPnlValue))}
                    </span>
                </p>
                <p className="note">
                    P&L % Today: <span style={{ color: todayPnlPercent >= 0 ? 'green' : 'red', fontWeight: 600 }}>
                        {todayPnlPercent >= 0 ? '+' : ''}{pct(todayPnlPercent)}
                    </span>
                </p>

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
                <p className="note" style={{ fontSize: 12, color: "var(--text-light)", marginTop: -6 }}>
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


    const getSelectedCompetitionAccount = useCallback(() => {
        if (selectedAccount.type !== 'competition') return null;
        return competitionAccounts.find((a) => String(a?.code) === String(selectedAccount.id)) || null;
    }, [competitionAccounts, selectedAccount.id, selectedAccount.type]);

    const getSelectedTeamCompetitionAccount = useCallback(() => {
        if (selectedAccount.type !== 'team' && selectedAccount.type !== 'team_competition') return null;
        return teamCompetitionAccounts.find(
            (a) => String(a?.team_id) === String(selectedAccount.team_id)
                && String(a?.code) === String(selectedAccount.competition_code),
        ) || null;
    }, [selectedAccount.competition_code, selectedAccount.team_id, selectedAccount.type, teamCompetitionAccounts]);

    const getSelectedAccountForPerformance = useCallback(() => {
        if (selectedAccount.type === 'global') return globalAccount;
        if (selectedAccount.type === 'competition') return getSelectedCompetitionAccount();
        if (selectedAccount.type === 'team' || selectedAccount.type === 'team_competition') return getSelectedTeamCompetitionAccount();
        return null;
    }, [getSelectedCompetitionAccount, getSelectedTeamCompetitionAccount, globalAccount, selectedAccount.type]);

    const getSelectedPerformanceRequestParams = useCallback(() => {
        const account = getSelectedAccountForPerformance();
        if (!account) return null;

        const accountId = String(
            account?.account_id
            ?? account?.accountId
            ?? account?.id
            ?? account?.portfolio_id
            ?? account?.portfolioId
            ?? account?.code
            ?? account?.competition_code
            ?? account?.competitionCode
            ?? selectedAccount?.id
            ?? '',
        ).trim();
        if (!accountId) return null;

        const accountType = String(
            account?.account_type
            ?? account?.type
            ?? selectedAccount?.type
            ?? '',
        ).trim().toLowerCase();
        if (!accountType) return null;

        return {
            params: {
                username,
                account_id: accountId,
                account_type: accountType,
            },
        };
    }, [
        getSelectedAccountForPerformance,
        selectedAccount?.id,
        selectedAccount?.type,
        selectedAccount?.team_id,
        selectedAccount?.competition_code,
        username,
    ]);

    useEffect(() => {
        const trimmedUsername = String(username || '').trim();
        if (!trimmedUsername) {
            setAccountPerformanceHistory([]);
            return;
        }

        const requestConfig = getSelectedPerformanceRequestParams();
        if (!requestConfig?.params) {
            setAccountPerformanceHistory([]);
            return;
        }

        let cancelled = false;
        const fetchPerformanceHistory = async () => {
            const endpointCandidates = ['/account/performance/history', '/account/performance'];
            if (process.env.NODE_ENV === 'development') {
                console.debug('[AccountPerformance] Request params', requestConfig.params);
            }
            for (const endpoint of endpointCandidates) {
                try {
                    const response = await axios.get(`${BASE_URL}${endpoint}`, {
                        params: requestConfig.params,
                    });
                    if (cancelled) return;
                    const normalizedHistory = normalizePerformanceHistoryRows(response?.data);
                    if (process.env.NODE_ENV === 'development') {
                        const firstDate = normalizedHistory[0]?.date ?? normalizedHistory[0]?.day ?? normalizedHistory[0]?.timestamp ?? normalizedHistory[0]?.time ?? null;
                        const lastDate = normalizedHistory[normalizedHistory.length - 1]?.date
                            ?? normalizedHistory[normalizedHistory.length - 1]?.day
                            ?? normalizedHistory[normalizedHistory.length - 1]?.timestamp
                            ?? normalizedHistory[normalizedHistory.length - 1]?.time
                            ?? null;
                        console.debug('[AccountPerformance] History summary', {
                            historyLength: normalizedHistory.length,
                            firstDate,
                            lastDate,
                        });
                    }
                    setAccountPerformanceHistory(normalizedHistory);
                    return;
                } catch (error) {
                    if (error?.response?.status === 404) continue;
                }
            }

            if (!cancelled) setAccountPerformanceHistory([]);
        };

        fetchPerformanceHistory();
        return () => {
            cancelled = true;
        };
    }, [BASE_URL, getSelectedPerformanceRequestParams, username]);

    const buildInceptionPerformanceChart = (account) => {
        if (!account) return { chart: null, metrics: null };

        const parseNum = (...values) => {
            for (const value of values) {
                const n = Number(value);
                if (Number.isFinite(n)) return n;
            }
            return null;
        };

        const totalValue = parseNum(account?.total_value, account?.totalValue);
        const metricMode = String(account?.performance_chart_mode ?? account?.performanceChartMode ?? 'value').toLowerCase();
        const dailyPerformancePoints = buildDailyPerformancePoints(accountPerformanceHistory, metricMode);

        const rawChartLabels = dailyPerformancePoints.map((point) => point.date);
        const rawChartValues = dailyPerformancePoints.map((point) => point.value);
        const hasRawHistory = rawChartLabels.length > 0;
        const fallbackLatestValue = Number.isFinite(totalValue) ? totalValue : INCEPTION_STARTING_BALANCE;
        const hasSingleRawPoint = rawChartLabels.length === 1;
        const resolvedRawValues = hasSingleRawPoint && Number.isFinite(totalValue)
            ? [totalValue]
            : rawChartValues;
        const shouldInjectInceptionPoint = hasRawHistory
            && Math.abs((resolvedRawValues[0] ?? INCEPTION_STARTING_BALANCE) - INCEPTION_STARTING_BALANCE) > 0.005;

        const chartLabels = shouldInjectInceptionPoint
            ? ['Inception', ...rawChartLabels]
            : rawChartLabels;
        const chartValues = shouldInjectInceptionPoint
            ? [INCEPTION_STARTING_BALANCE, ...resolvedRawValues]
            : resolvedRawValues;
        const singlePointMode = chartLabels.length === 1;

        const previousClose = resolvedRawValues.length >= 2
            ? resolvedRawValues[resolvedRawValues.length - 2]
            : resolvedRawValues[0] ?? fallbackLatestValue;
        const latestValue = resolvedRawValues[resolvedRawValues.length - 1] ?? fallbackLatestValue;
        const rangeChangeValue = latestValue - INCEPTION_STARTING_BALANCE;
        const rangeChangePercent = INCEPTION_STARTING_BALANCE
            ? (rangeChangeValue / INCEPTION_STARTING_BALANCE) * 100
            : 0;
        const hasHistory = chartLabels.length > 0;
        const safeRangeChangeValue = Number.isFinite(rangeChangeValue) ? rangeChangeValue : 0;
        const safeRangeChangePercent = Number.isFinite(rangeChangePercent) ? rangeChangePercent : 0;

        return {
            chart: hasHistory ? {
                labels: chartLabels,
                datasets: [
                    {
                        label: metricMode === 'pnl' ? 'Account P&L' : 'Account value',
                        data: chartValues,
                        borderColor: '#0b63b6',
                        borderWidth: 2,
                        pointRadius: singlePointMode ? 5 : 3,
                        fill: false,
                        tension: 0.25,
                    },
                ],
                _meta: {
                    singlePointHint: singlePointMode ? 'Need at least 2 days for trend line.' : null,
                    emptyStateLabel: null,
                },
            } : null,
            metrics: {
                latestPrice: latestValue,
                previousClose,
                range: 'Since inception',
                rangeChangeValue: safeRangeChangeValue,
                rangeChangePercent: safeRangeChangePercent,
                dayChangeValue: safeRangeChangeValue,
                dayChangePercent: safeRangeChangePercent,
                dayChangeLabel: 'Overall',
            },
        };
    };

    const renderAccountDetails = () => {
        const renderSummaryAndChart = (account, heading, isGlobal = false) => {
            const inceptionChart = buildInceptionPerformanceChart(account);

            return (
                <div className="card section">
                    <h2>{heading}</h2>
                    <div className="account-summary-layout">
                        <AccountSummaryBox account={account} isGlobal={isGlobal} onReset={isGlobal ? resetGlobalAccount : undefined} />
                        <ChartPanel
                            chartData={inceptionChart.chart}
                            chartRange="ALL"
                            chartMetrics={inceptionChart.metrics}
                            chartSymbol=""
                            onRangeChange={() => {}}
                            title="Account Performance"
                            containerClassName="card section account-performance-card"
                            showRangeControls={false}
                            emptyStateLabel="No account performance history available yet."
                        />
                    </div>
                </div>
            );
        };

        if (selectedAccount.type === 'global') {
            return renderSummaryAndChart(globalAccount, 'Account Summary — Global', true);
        }

        if (selectedAccount.type === 'competition') {
            const compAcc = getSelectedCompetitionAccount();
            if (!compAcc) return null;
            return renderSummaryAndChart(compAcc, 'Account Summary — Competition (Individual)');
        }

        if (selectedAccount.type === 'team' || selectedAccount.type === 'team_competition') {
            const teamAcc = getSelectedTeamCompetitionAccount();
            if (!teamAcc) return null;
            return renderSummaryAndChart(teamAcc, 'Account Summary — Team');
        }
        return null;
    };


    const renderPortfolioBox = () => {
        if (selectedAccount.type === 'global') {
            return (
                <div className="card section">
                    <h3>Your Global Portfolio</h3>
                    {globalAccount.portfolio && globalAccount.portfolio.length > 0 ? (
                        <div className="table-scroll">
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
                        </div>
                    ) : (
                        <p className="note">No holdings in your global portfolio.</p>
                    )}
                </div>
            );
        }

        if (selectedAccount.type === 'competition') {
            const compAcc = getSelectedCompetitionAccount();
            return (
                <div className="card section">
                    <h3>Your Competition Portfolio (Individual)</h3>
                    {compAcc && compAcc.portfolio && compAcc.portfolio.length > 0 ? (
                        <div className="table-scroll">
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
                        </div>
                    ) : (
                        <p className="note">No holdings in your individual competition portfolio.</p>
                    )}
                </div>
            );
        }

        if (selectedAccount.type === 'team' || selectedAccount.type === 'team_competition') {
            const teamAcc = getSelectedTeamCompetitionAccount();
            return (
                <div className="card section">
                    <h3>Your Competition Portfolio (Team)</h3>
                    {teamAcc && teamAcc.portfolio && teamAcc.portfolio.length > 0 ? (
                        <div className="table-scroll">
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
                        </div>
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

                <div style={{ display: 'grid', gap: 20, gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', alignItems: 'start' }}>
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
                        title={chartSymbol ? `${chartSymbol.toUpperCase()} Stock Chart` : 'Stock Price Chart'}
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
                            background: showTrading ? 'var(--brand-blue-dark)' : 'var(--brand-blue)',
                            color: 'white',
                            padding: '10px 16px',
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
                                                Open: {comp.is_open ? '✅' : '❌'} | Featured: {comp.featured ? '⭐' : '☆'}
                                                {comp.curriculum_enabled ? (
                                                    <>
                                                        <br />
                                                        Curriculum: Enabled • {comp.curriculum_weeks || '-'} weeks • {comp.module_count || 0} modules
                                                    </>
                                                ) : null}
                                            </p>
                                            <CompetitionDateEditor
                                                competition={comp}
                                                username={username}
                                                isAdmin={isAdmin}
                                                currentUserId={currentUserId}
                                                onUpdated={(updated) => handleCompetitionDatesUpdated(comp.code, updated)}
                                            />
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
                                                {comp.curriculum_enabled && (
                                                    <button
                                                        onClick={() => {
                                                            setShowTrading(true);
                                                            setSelectedAccount({ type: 'competition', id: comp.code });
                                                        }}
                                                        disabled={isLoading}
                                                    >
                                                        View Curriculum
                                                    </button>
                                                )}
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
                                <div className="section" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', width: '100%' }}>
                                    <button
                                        className={selectedAccount.type === 'global' ? 'account-chip account-chip-active' : 'account-chip'}
                                        onClick={() => setSelectedAccount({ type: 'global', id: null })}
                                        disabled={isLoading}
                                    >
                                        Global Account
                                    </button>
                                    {competitionAccounts.map((acc) => {
                                        const isActive = selectedAccount.type === 'competition' && selectedAccount.id === acc.code;
                                        return (
                                            <button
                                                key={acc.code}
                                                className={isActive ? 'account-chip account-chip-active' : 'account-chip'}
                                                onClick={() => setSelectedAccount({ type: 'competition', id: acc.code, competition_id: acc.competition_id || '' })}
                                                disabled={isLoading}
                                            >
                                                {acc.name} ({acc.code})
                                            </button>
                                        );
                                    })}
                                    {teamCompetitionAccounts.map((acc) => {
                                        const isActive =
                                            (selectedAccount.type === 'team' || selectedAccount.type === 'team_competition')
                                            && selectedAccount.team_id === acc.team_id
                                            && selectedAccount.competition_code === acc.code;

                                        return (
                                            <button
                                                key={`${acc.team_id}-${acc.code}`}
                                                className={isActive ? 'account-chip account-chip-active' : 'account-chip'}
                                                onClick={() =>
                                                    setSelectedAccount({
                                                        type: 'team_competition',
                                                        team_id: acc.team_id,
                                                        competition_code: acc.code,
                                                        competition_id: acc.competition_id || '',
                                                    })
                                                }
                                                disabled={isLoading}
                                            >
                                                {acc.name} (Team • {acc.code})
                                            </button>
                                        );
                                    })}
                                </div>
                                <div className="section" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', width: '100%' }}>
                                    <button
                                        className="primary"
                                        onClick={openTradeBlotterModal}
                                        disabled={isLoading}
                                    >
                                        📒 Open Trade Blotter
                                    </button>
                                    {canManageCurriculumGrades && selectedCompetitionId ? (
                                        <Link
                                            href={`/teacher/${encodeURIComponent(selectedCompetitionId)}/roster`}
                                            style={{ display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}
                                        >
                                            <button type="button" disabled={isLoading}>🧑‍🏫 Teacher Dashboard</button>
                                        </Link>
                                    ) : null}
                                </div>
                                <button className="logout-button" onClick={handleLogout} disabled={isLoading}>
                                    Logout
                                </button>
                            </div>

                            {renderAccountDetails()}
                            {selectedCompetitionRecord && canEditCompetitionDates({
                                isAdmin,
                                username,
                                currentUserId,
                                competition: selectedCompetitionRecord,
                            }) ? (
                                <div className="card section">
                                    <h3>Competition Settings</h3>
                                    <CompetitionDateEditor
                                        competition={selectedCompetitionRecord}
                                        username={username}
                                        isAdmin={isAdmin}
                                        currentUserId={currentUserId}
                                        onUpdated={(updated) => handleCompetitionDatesUpdated(selectedCompetitionRecord.code, updated)}
                                    />
                                </div>
                            ) : null}
                            {renderPortfolioBox()}
                            {renderTradeBox()}
                            <CurriculumSummaryCard overview={curriculumOverview} />
                            {curriculumOverview?.curriculum_enabled && (
                                <StudentCurriculumPanel
                                    overview={curriculumOverview}
                                    modules={curriculumModules}
                                    gradeSummary={curriculumGradeSummary}
                                    gradesMessage={curriculumGradesMessage}
                                    loading={curriculumLoading}
                                    error={curriculumError}
                                    onSubmitItem={handleSubmitCurriculumItem}
                                    actionLoading={curriculumActionLoading}
                                    submissionState={curriculumSubmissionState}
                                    isInstructor={canManageCurriculumGrades}
                                    lessonEditState={curriculumLessonEditState}
                                    onSaveLessonContent={canManageCurriculumGrades ? handleCurriculumLessonEdit : undefined}
                                    assignmentEditState={curriculumAssignmentEditState}
                                    onEditAssignmentPrompts={canManageCurriculumGrades ? handleCurriculumAssignmentEdit : undefined}
                                />
                            )}
                            {curriculumOverview?.curriculum_enabled && (
                                <GradeSummaryCard gradeSummary={curriculumGradeSummary} />
                            )}
                            {canManageCurriculumGrades && curriculumOverview?.curriculum_enabled && (
                                <InstructorCurriculumPanel
                                    overview={curriculumOverview}
                                    instructorSummary={curriculumInstructorSummary}
                                    submissions={curriculumInstructorSubmissions}
                                    actionLoading={curriculumActionLoading}
                                    onRefresh={handleRefreshInstructorData}
                                    onGradeSubmission={handleGradeSubmission}
                                    onOverrideScore={handleOverrideCurriculumScore}
                                    instructorMessage={curriculumInstructorMessage}
                                />
                            )}
                            {selectedAccount.type === 'competition' && (
                                <div className="card section">
                                    <h3>Leaderboard — {selectedAccount.id}</h3>
                                    <Leaderboard competitionCode={selectedAccount.id} variant="competition" />
                                </div>
                            )}
                            {(selectedAccount.type === 'team' || selectedAccount.type === 'team_competition') && (
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

                                <div className="section">
                                    <h3>🤝 Team Competitions</h3>
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
                                </div>

                                {teamMessage && <p className="note">{teamMessage}</p>}
                                {teamCompetitionMessage && <p className="note">{teamCompetitionMessage}</p>}
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

                                        <div style={{ border: '1px solid var(--border-color)', borderRadius: 10, padding: 12 }}>
                                            <label className="em" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <input
                                                    type="checkbox"
                                                    checked={curriculumEnabled}
                                                    onChange={(e) => setCurriculumEnabled(e.target.checked)}
                                                    disabled={isLoading}
                                                />
                                                Enable Investment Curriculum
                                            </label>
                                            <p className="note" style={{ marginTop: 8 }}>
                                                Attach an auto-scheduled investment curriculum with quizzes, assignments, and final exam.
                                            </p>
                                            {curriculumEnabled && (
                                                <div className="section" style={{ display: 'grid', gap: 8 }}>
                                                    <label className="em">Curriculum Length (Weeks)</label>
                                                    <input
                                                        type="number"
                                                        min={CURRICULUM_WEEK_MIN}
                                                        max={CURRICULUM_WEEK_MAX}
                                                        value={curriculumWeeks}
                                                        onChange={(e) => setCurriculumWeeks(e.target.value)}
                                                        disabled={isLoading}
                                                    />
                                                    <label className="em">Curriculum Start Date</label>
                                                    <input
                                                        type="date"
                                                        value={curriculumStartDate}
                                                        onChange={(e) => setCurriculumStartDate(e.target.value)}
                                                        disabled={isLoading}
                                                    />
                                                    <label className="em" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                        <input
                                                            type="checkbox"
                                                            checked={curriculumDateOverride}
                                                            onChange={(e) => setCurriculumDateOverride(e.target.checked)}
                                                            disabled={isLoading}
                                                        />
                                                        Manually override end date
                                                    </label>
                                                    <label className="em">Curriculum End Date {curriculumDateOverride ? '' : '(Auto-calculated)'}</label>
                                                    <input
                                                        type="date"
                                                        value={curriculumEndDate}
                                                        onChange={(e) => setCurriculumEndDate(e.target.value)}
                                                        disabled={isLoading || !curriculumDateOverride}
                                                    />
                                                </div>
                                            )}
                                        </div>
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
                                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', width: '100%' }}>
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
                            <button className="logout-button" onClick={handleLogout} disabled={isLoading}>
                                Logout
                            </button>
                        </>
                    )}
                </div>
            ) : (
                <div className="card auth-card">
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
                            <p className="note" style={{ marginTop: -6, marginBottom: 8 }}>
                                Usernames are not case-sensitive.
                            </p>
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
                                    background: '#edf3f8',
                                    border: '1px solid var(--border-color)',
                                    borderRadius: 10,
                                    padding: 14,
                                    marginBottom: 14,
                                    lineHeight: 1.6,
                                }}
                            >
                                <p className="note" style={{ margin: 0, color: 'var(--brand-navy)' }}>
                                    👋 <strong>Welcome to the free Stock Market Simulator!</strong><br />
                                    Here’s how it works:
                                </p>
                                <ul style={{ marginTop: 10, paddingLeft: 18, color: 'var(--text-subtle)' }}>
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

                            <label htmlFor="login-username" className="note" style={{ display: 'block', marginBottom: 4 }}>
                                Username or email
                            </label>
                            <input
                                id="login-username"
                                type="text"
                                placeholder="Username or email"
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
                                {' · '}
                                <Link href="/forgot-username">Forgot username?</Link>
                            </p>
                        </form>
                    )}
                </div>
            )}

            {showModal && modalCompetition && (
                <div
                    className="modal-overlay"
                >
                    <div className="card modal-card" style={{ maxWidth: 540 }}>
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

                        <div className="section" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', width: '100%' }}>
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
                >
                    <div className="card modal-card">
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
                            <div className="table-scroll" style={{ border: '1px solid var(--border-color)', borderRadius: 10 }}>
                                <table>
                                    <thead>
                                        <tr>
                                            <th>Time</th>
                                            <th>Action</th>
                                            <th>Symbol</th>
                                            <th>Qty</th>
                                            <th>Price</th>
                                            <th>Status</th>
                                            <th>Account Name</th>
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
