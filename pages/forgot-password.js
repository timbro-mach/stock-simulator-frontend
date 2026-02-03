import { useState } from 'react';
import Link from 'next/link';
import { apiClient } from '../lib/api';

const ForgotPassword = () => {
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const handleSubmit = async (event) => {
    event.preventDefault();
    setIsSubmitting(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      await apiClient.post('/api/auth/forgot-password', { email });
      setSuccessMessage('If an account exists for that email, we sent a reset link.');
      setEmail('');
    } catch (error) {
      setErrorMessage('Something went wrong — please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="card" style={{ maxWidth: 420, margin: '40px auto' }}>
      <h2>Forgot Password</h2>
      <p className="note">
        Enter your email address and we&apos;ll send a reset link if an account exists.
      </p>
      <form onSubmit={handleSubmit}>
        <input
          type="email"
          placeholder="Email address"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="email"
          required
          disabled={isSubmitting}
        />
        <button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Sending...' : 'Send reset link'}
        </button>
      </form>
      {successMessage && <p className="note">{successMessage}</p>}
      {errorMessage && <p className="note" style={{ color: '#b91c1c' }}>{errorMessage}</p>}
      <p className="note">
        <Link href="/login">Back to login</Link>
      </p>
    </div>
  );
};

export default ForgotPassword;
