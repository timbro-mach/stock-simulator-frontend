import { useState } from 'react';
import Link from 'next/link';
import { apiClient } from '../lib/api';

const GENERIC_SUCCESS = 'If an account exists for that email, we sent the username to it.';

const ForgotUsername = () => {
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
      const response = await apiClient.post('/api/auth/forgot-username', { email });
      setSuccessMessage(response?.data?.message || GENERIC_SUCCESS);
      setEmail('');
    } catch (error) {
      setErrorMessage('Something went wrong — please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="card auth-card" style={{ margin: '40px auto' }}>
      <h2>Forgot Username</h2>
      <p className="note">
        Enter your email address and we&apos;ll send your username if an account exists.
      </p>
      <form onSubmit={handleSubmit}>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="email"
          required
          disabled={isSubmitting}
        />
        <button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Sending...' : 'Send username'}
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

export default ForgotUsername;
