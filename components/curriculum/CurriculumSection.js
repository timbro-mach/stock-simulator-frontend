import React from 'react';
import { formatDisplayDate, getLetterGrade, normalizeCurriculumStatus } from '../../lib/curriculum/helpers';

const ENABLE_CURRICULUM_DEBUG = true;

const progressShell = {
  width: '100%',
  background: '#e2e8f0',
  height: 10,
  borderRadius: 999,
  overflow: 'hidden',
};

const progressFill = (value) => ({
  width: `${Math.max(0, Math.min(100, Number(value) || 0))}%`,
  background: '#0b63b6',
  height: '100%',
});

export const CurriculumSummaryCard = ({ overview }) => {
  if (!overview?.curriculum_enabled) return null;

  return (
    <div className="card section">
      <h3>Investment Curriculum</h3>
      <p className="note">Enabled • {overview.curriculum_weeks} weeks</p>
      <p className="note">{formatDisplayDate(overview.curriculum_start_date)} → {formatDisplayDate(overview.curriculum_end_date)}</p>
      <p className="note">Generated modules: {overview.module_count ?? 0}</p>
    </div>
  );
};

export const StudentCurriculumPanel = ({ overview, modules, gradeSummary, loading, error, debugState, onOpenItem, onSubmitItem, actionLoading }) => {
  if (!overview?.curriculum_enabled) return null;
  const percentage = Number(gradeSummary?.percentage ?? overview?.grade_percentage ?? 0);
  const letter = gradeSummary?.letter_grade || getLetterGrade(percentage);

  return (
    <div className="card section">
      <h3>Curriculum</h3>
      {loading ? <p className="note">Loading curriculum...</p> : null}
      {error ? <p className="note" style={{ color: '#b91c1c' }}>{error}</p> : null}
      <CurriculumDebugPanel debugState={debugState} />

      {!loading && !error && (
        <>
          <p className="note">Progress: {Math.round(Number(overview?.progress_percent ?? 0))}%</p>
          <div style={progressShell}><div style={progressFill(overview?.progress_percent)} /></div>
          <p className="note" style={{ marginTop: 8 }}>
            Grade: <strong>{percentage.toFixed(1)}%</strong> ({letter})
          </p>

          <div className="section" style={{ display: 'grid', gap: 12 }}>
            {Array.isArray(modules) && modules.length > 0 ? modules.map((module) => (
              <div key={module.id || module.week_number} style={{ border: '1px solid var(--border-color)', borderRadius: 10, padding: 12 }}>
                <p className="em" style={{ marginBottom: 6 }}>Week {module.week_number}: {module.title}</p>
                <p className="note">{module.description || 'No description provided.'}</p>
                <p className="note">Unlocks: {formatDisplayDate(module.unlock_date)} • Due: {formatDisplayDate(module.due_date)}</p>
                <p className="note">Status: {module.locked ? 'Locked' : 'Unlocked'}</p>
                <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
                  {(module.items || []).map((item) => (
                    <div key={item.id || item.title} style={{ border: '1px solid var(--border-color)', borderRadius: 8, padding: 8 }}>
                      <p className="note" style={{ margin: 0 }}>
                        <strong>{item.title}</strong> • {item.points ?? 0} pts • {normalizeCurriculumStatus(item.status)}
                      </p>
                      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                        <button onClick={() => onOpenItem(item)} disabled={module.locked || actionLoading}>Open</button>
                        <button onClick={() => onSubmitItem(item)} disabled={module.locked || actionLoading}>Submit</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )) : <p className="note">Curriculum modules are still generating.</p>}
          </div>
        </>
      )}
    </div>
  );
};

export const GradeSummaryCard = ({ gradeSummary }) => {
  if (!gradeSummary) return null;
  const percentage = Number(gradeSummary.percentage || 0);

  return (
    <div className="card section">
      <h3>Grade Summary</h3>
      <p className="note">Points: {gradeSummary.total_points_earned ?? 0} / {gradeSummary.total_points_possible ?? 0}</p>
      <p className="note">Percentage: {percentage.toFixed(1)}%</p>
      <p className="note">Letter Grade: {gradeSummary.letter_grade || getLetterGrade(percentage)}</p>
      <p className="note">Completed {gradeSummary.completed_items ?? 0} of {gradeSummary.total_items ?? 0} items</p>
      <div className="section" style={{ display: 'grid', gap: 8 }}>
        {(gradeSummary.items || []).map((item) => (
          <div key={item.id || item.title} style={{ border: '1px solid var(--border-color)', borderRadius: 8, padding: 8 }}>
            <p className="note" style={{ margin: 0 }}>
              {item.title}: {item.points_earned ?? 0}/{item.points_possible ?? 0} ({normalizeCurriculumStatus(item.status)})
            </p>
          </div>
        ))}
      </div>
    </div>
  );
};

export const InstructorCurriculumPanel = ({ overview, instructorSummary }) => {
  if (!overview?.curriculum_enabled) return null;

  return (
    <div className="card section">
      <h3>Instructor Curriculum View</h3>
      <p className="note">Average Grade: {Number(instructorSummary?.average_grade ?? 0).toFixed(1)}%</p>
      <p className="note">Student completion: {instructorSummary?.student_completion_summary || 'No submissions yet.'}</p>
      <div className="section" style={{ display: 'grid', gap: 8 }}>
        {(instructorSummary?.modules || []).map((module) => (
          <div key={module.id || module.week_number} style={{ border: '1px solid var(--border-color)', borderRadius: 8, padding: 8 }}>
            <p className="note" style={{ margin: 0 }}>
              Week {module.week_number}: {module.title} • {module.completed_submissions ?? 0} submissions complete
            </p>
          </div>
        ))}
      </div>
    </div>
  );
};

export const CurriculumDebugPanel = ({ debugState }) => {
  if (!ENABLE_CURRICULUM_DEBUG) return null;
  if (!debugState?.hasError) return null;

  const competitionFields = debugState?.competitionContext?.fields || {};
  const hydrationInfo = debugState?.hydrationInfo || {};
  const requestInfo = debugState?.requestInfo || {};

  return (
    <div
      style={{
        border: '1px solid #f59e0b',
        background: '#fffbeb',
        borderRadius: 8,
        padding: 10,
        marginTop: 10,
        fontSize: 12,
      }}
    >
      <p className="em" style={{ margin: 0, marginBottom: 6 }}>Curriculum Debug</p>
      <p className="note" style={{ margin: 0 }}><strong>Render reason:</strong> {debugState?.renderReason || 'unknown'}</p>
      <p className="note" style={{ margin: 0 }}><strong>Competition id:</strong> {debugState?.competitionContext?.id || '(none)'}</p>
      <p className="note" style={{ margin: 0 }}><strong>Competition name:</strong> {debugState?.competitionContext?.name || '(none)'}</p>
      <p className="note" style={{ margin: 0 }}><strong>Hydration attempted:</strong> {String(Boolean(hydrationInfo?.attempted))}</p>
      <p className="note" style={{ margin: 0 }}><strong>Id resolved from code:</strong> {String(Boolean(hydrationInfo?.resolvedFromCode))}</p>
      <p className="note" style={{ margin: 0 }}><strong>Id source:</strong> {hydrationInfo?.idSource || '(unknown)'}</p>
      <p className="note" style={{ margin: 0 }}><strong>Hydration source:</strong> {hydrationInfo?.source || '(none)'}</p>
      <p className="note" style={{ margin: 0 }}><strong>Extracted id:</strong> {hydrationInfo?.extractedId || '(none)'}</p>
      <p className="note" style={{ margin: 0 }}><strong>Extracted id key:</strong> {hydrationInfo?.extractedIdKey || '(none)'}</p>
      <p className="note" style={{ margin: 0 }}><strong>Selected competition updated:</strong> {String(Boolean(hydrationInfo?.selectedCompetitionUpdated))}</p>
      <p className="note" style={{ margin: 0 }}><strong>Curriculum enabled (frontend):</strong> {String(Boolean(debugState?.competitionContext?.curriculumEnabled))}</p>
      <p className="note" style={{ margin: 0 }}><strong>Parsed enabled value:</strong> {String(Boolean(debugState?.competitionContext?.parsedEnabledValue))}</p>
      <p className="note" style={{ margin: 0 }}><strong>Enabled source key:</strong> {debugState?.competitionContext?.parsedEnabledSourceKey || '(none)'}</p>
      <p className="note" style={{ margin: 0 }}><strong>Endpoint URL:</strong> {requestInfo?.endpointUrl || '(not set)'}</p>
      <p className="note" style={{ margin: 0 }}><strong>Request made:</strong> {String(Boolean(requestInfo?.requestMade))}</p>
      <p className="note" style={{ margin: 0 }}><strong>HTTP status:</strong> {requestInfo?.httpStatus ?? '(n/a)'}</p>
      <p className="note" style={{ margin: 0 }}><strong>Backend message:</strong> {requestInfo?.responseMessage || '(n/a)'}</p>
      <p className="note" style={{ margin: 0 }}><strong>Overview response body:</strong></p>
      <pre style={{ margin: '4px 0 0 0', whiteSpace: 'pre-wrap' }}>
        {JSON.stringify(requestInfo?.rawOverviewBody ?? null, null, 2)}
      </pre>
      <p className="note" style={{ margin: 0 }}><strong>By-code response body:</strong></p>
      <pre style={{ margin: '4px 0 0 0', whiteSpace: 'pre-wrap' }}>
        {JSON.stringify(hydrationInfo?.rawResponseBody ?? null, null, 2)}
      </pre>
      <p className="note" style={{ margin: 0 }}><strong>Curriculum fields:</strong></p>
      <pre style={{ margin: '4px 0 0 0', whiteSpace: 'pre-wrap' }}>
        {JSON.stringify(competitionFields, null, 2)}
      </pre>
    </div>
  );
};
