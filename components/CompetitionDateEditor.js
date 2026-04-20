import React, { useMemo, useState } from 'react';
import axios from 'axios';
import { getApiBaseUrl, getApiErrorMessage } from '../lib/api';
import {
  buildUpdateDatesPayload,
  canEditCompetitionDates,
  normalizeDateForInput,
  validateDateRange,
} from '../lib/competitionDates';

const BASE_URL = getApiBaseUrl();

const formatDisplayDate = (value) => {
  const iso = normalizeDateForInput(value);
  if (!iso) return null;
  const parsed = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleDateString();
};

const CompetitionDateEditor = ({
  competition,
  username,
  isAdmin = false,
  currentUserId = '',
  onUpdated,
}) => {
  const canEdit = useMemo(
    () => canEditCompetitionDates({ isAdmin, username, currentUserId, competition }),
    [isAdmin, username, currentUserId, competition],
  );

  const initialStart = normalizeDateForInput(competition?.start_date ?? competition?.startDate);
  const initialEnd = normalizeDateForInput(competition?.end_date ?? competition?.endDate);

  const [isEditing, setIsEditing] = useState(false);
  const [startDate, setStartDate] = useState(initialStart);
  const [endDate, setEndDate] = useState(initialEnd);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const displayStart = formatDisplayDate(competition?.start_date ?? competition?.startDate);
  const displayEnd = formatDisplayDate(competition?.end_date ?? competition?.endDate);

  const openEditor = () => {
    setStartDate(initialStart);
    setEndDate(initialEnd);
    setError('');
    setIsEditing(true);
  };

  const closeEditor = () => {
    setIsEditing(false);
    setError('');
  };

  const handleSubmit = async (event) => {
    event?.preventDefault?.();
    const validationError = validateDateRange({ startDate, endDate });
    if (validationError) {
      setError(validationError);
      return;
    }

    const payload = buildUpdateDatesPayload({
      username,
      competition,
      startDate,
      endDate,
      clearStart: !startDate && Boolean(initialStart),
      clearEnd: !endDate && Boolean(initialEnd),
    });

    setSubmitting(true);
    setError('');
    try {
      const res = await axios.post(`${BASE_URL}/competition/update_dates`, payload);
      const updated = res?.data?.competition || null;
      if (typeof onUpdated === 'function') onUpdated(updated, res?.data);
      setIsEditing(false);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to update competition dates.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="competition-date-editor" data-testid="competition-date-editor">
      <div>
        <strong>Dates:</strong>{' '}
        {displayStart || displayEnd
          ? `${displayStart || '—'} → ${displayEnd || '—'}`
          : 'No dates set'}
        {canEdit && !isEditing ? (
          <button
            type="button"
            onClick={openEditor}
            style={{ marginLeft: 8 }}
            data-testid="edit-dates-button"
          >
            Edit dates
          </button>
        ) : null}
      </div>

      {canEdit && isEditing ? (
        <form
          onSubmit={handleSubmit}
          className="section"
          style={{ display: 'grid', gap: 8, maxWidth: 360, marginTop: 8 }}
        >
          <label className="em">
            Start Date
            <br />
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              disabled={submitting}
            />
          </label>
          <label className="em">
            End Date
            <br />
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              disabled={submitting}
            />
          </label>
          {error ? (
            <p className="note" style={{ color: '#b91c1c' }} role="alert">
              {error}
            </p>
          ) : null}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="submit" className="primary" disabled={submitting}>
              {submitting ? 'Saving...' : 'Save dates'}
            </button>
            <button type="button" onClick={closeEditor} disabled={submitting}>
              Cancel
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
};

export default CompetitionDateEditor;
