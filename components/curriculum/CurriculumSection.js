import React from 'react';
import { formatDisplayDate, getLetterGrade, normalizeCurriculumStatus } from '../../lib/curriculum/helpers';

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

export const StudentCurriculumPanel = ({ overview, modules, gradeSummary, loading, error, onOpenItem, onSubmitItem, actionLoading }) => {
  if (!overview?.curriculum_enabled) return null;
  const percentage = Number(gradeSummary?.percentage ?? overview?.grade_percentage ?? 0);
  const letter = gradeSummary?.letter_grade || getLetterGrade(percentage);

  return (
    <div className="card section">
      <h3>Curriculum</h3>
      {loading ? <p className="note">Loading curriculum...</p> : null}
      {error ? <p className="note" style={{ color: '#b91c1c' }}>{error}</p> : null}

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
