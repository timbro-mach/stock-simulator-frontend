import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { apiClient } from '../lib/api';

const MIN_PASSWORD_LENGTH = 12;

const getPasswordRuleStatus = (password) => {
  const hasLower = /[a-z]/.test(password);
  const hasUpper = /[A-Z]/.test(password);
  const hasNumber = /\d/.test(password);
  const hasSymbol = /[^A-Za-z0-9]/.test(password);
  const satisfiedCount = [hasLower, hasUpper, hasNumber, hasSymbol].filter(Boolean).length;
  return {
    hasLower,
    hasUpper,
    hasNumber,
    hasSymbol,
    isLongEnough: password.length >= MIN_PASSWORD_LENGTH,
    isStrong: password.length >= MIN_PASSWORD_LENGTH && satisfiedCount >= 3,
  };
};

const ResetPassword = () => {
  const router = useRouter();
  const [token, setToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  useEffect(() => {
    if (router.isReady) {
      const queryToken = Array.isArray(router.query.token)
        ? router.query.token[0]
        : router.query.token || '';
      setToken(queryToken);
    }
  }, [router.isReady, router.query.token]);

  const rules = useMemo(() => getPasswordRuleStatus(newPassword), [newPassword]);
  const tokenMissing = !token;

  const validateForm = () => {
    if (tokenMissing) {
      return 'Invalid reset link.';
    }
    if (!newPassword || !confirmPassword) {
      return 'Please fill out both password fields.';
    }
    if (newPassword !== confirmPassword) {
      return 'Passwords do not match.';
    }
    if (!rules.isStrong) {
      return 'Password does not meet strength requirements.';
    }
    return '';
  };

  const isTokenError = (error) => {
    if (!error || !error.response) return false;
    const message = String(error.response?.data?.message || '').toLowerCase();
    return message.includes('invalid') || message.includes('expired') || message.includes('token');
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    const validationError = validateForm();
    if (validationError) {
      setErrorMessage(validationError);
      return;
    }

    setIsSubmitting(true);
    try {
      await apiClient.post('/api/auth/reset-password', {
        token,
        newPassword,
      });
      setSuccessMessage('Password updated successfully.');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => {
        router.push('/login?reset=1');
      }, 1500);
    } catch (error) {
      if (isTokenError(error)) {
        setErrorMessage('This reset link is invalid or expired. Please request a new one.');
      } else {
        setErrorMessage('Something went wrong — please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="card" style={{ maxWidth: 460, margin: '40px auto' }}>
      <h2>Reset Password</h2>
      {tokenMissing ? (
        <>
          <p className="note" style={{ color: '#b91c1c' }}>
            Invalid reset link.
          </p>
          <p className="note">
            <Link href="/forgot-password">Request a new reset link</Link>
          </p>
        </>
      ) : (
        <>
          <p className="note">
            Your new password must be at least {MIN_PASSWORD_LENGTH} characters and include
            at least three of the following: uppercase, lowercase, number, and symbol.
          </p>
          <form onSubmit={handleSubmit}>
            <input
              type="password"
              placeholder="New password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              autoComplete="new-password"
              disabled={isSubmitting}
              required
            />
            <input
              type="password"
              placeholder="Confirm new password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              autoComplete="new-password"
              disabled={isSubmitting}
              required
            />
            <button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Updating...' : 'Update password'}
            </button>
          </form>
          <ul className="note" style={{ paddingLeft: 18 }}>
            <li style={{ color: rules.isLongEnough ? '#15803d' : '#475569' }}>
              At least {MIN_PASSWORD_LENGTH} characters
            </li>
            <li style={{ color: rules.hasUpper ? '#15803d' : '#475569' }}>Uppercase letter</li>
            <li style={{ color: rules.hasLower ? '#15803d' : '#475569' }}>Lowercase letter</li>
            <li style={{ color: rules.hasNumber ? '#15803d' : '#475569' }}>Number</li>
            <li style={{ color: rules.hasSymbol ? '#15803d' : '#475569' }}>Symbol</li>
          </ul>
          {errorMessage && (
            <p className="note" style={{ color: '#b91c1c' }}>
              {errorMessage}
              {errorMessage.includes('invalid or expired') && (
                <>
                  {' '}
                  <Link href="/forgot-password">Request a new reset link</Link>
                </>
              )}
            </p>
          )}
          {successMessage && <p className="note" style={{ color: '#15803d' }}>{successMessage}</p>}
        </>
      )}
    </div>
  );
};

export default ResetPassword;
