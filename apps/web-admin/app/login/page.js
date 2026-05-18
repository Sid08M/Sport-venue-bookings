"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [phone, setPhone] = useState('1234567890'); // Default to player credentials
  const [password, setPassword] = useState('password123');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await fetch('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ phone, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Authentication failed');
      }

      // Store JWT wristband in localStorage
      localStorage.setItem('token', data.token);
      router.push('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <div className="glass-panel animate-fade-in" style={styles.card}>
        <h1 style={styles.title}>SportsOS Admin</h1>
        <p style={styles.subtitle}>Enter credentials to access the central console</p>

        {error && <div style={styles.error}>{error}</div>}

        <form onSubmit={handleLogin} style={styles.form}>
          <div style={styles.inputGroup}>
            <label style={styles.label}>Phone Number</label>
            <input
              type="text"
              className="input-field"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="e.g. 1234567890"
              required
            />
          </div>

          <div style={styles.inputGroup}>
            <label style={styles.label}>Password</label>
            <input
              type="password"
              className="input-field"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            style={styles.button}
            disabled={loading}
          >
            {loading ? 'Securing Session...' : 'Authenticate'}
          </button>
        </form>
      </div>
    </div>
  );
}

const styles = {
  container: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    padding: '20px',
  },
  card: {
    width: '100%',
    maxWidth: '440px',
    padding: '40px',
    textAlign: 'center',
  },
  title: {
    fontFamily: 'var(--font-heading)',
    fontSize: '2rem',
    fontWeight: '800',
    color: '#ffffff',
    marginBottom: '8px',
    background: 'linear-gradient(135deg, #ffffff 0%, var(--text-secondary) 100%)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
  },
  subtitle: {
    fontSize: '0.9rem',
    color: 'var(--text-secondary)',
    marginBottom: '30px',
  },
  form: {
    textAlign: 'left',
  },
  inputGroup: {
    marginBottom: '20px',
  },
  label: {
    display: 'block',
    fontSize: '0.85rem',
    fontWeight: '600',
    color: 'var(--text-secondary)',
    marginBottom: '8px',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  button: {
    width: '100%',
    marginTop: '10px',
    padding: '14px',
  },
  error: {
    background: 'rgba(239, 68, 68, 0.1)',
    border: '1px solid rgba(239, 68, 68, 0.2)',
    color: '#ef4444',
    padding: '12px',
    borderRadius: '8px',
    fontSize: '0.9rem',
    marginBottom: '20px',
    textAlign: 'left',
  },
};
