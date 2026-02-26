import { useState } from 'react';

/**
 * Mock login page.
 * Replace with Firebase Auth (signInWithEmailAndPassword) later.
 */
export default function LoginPage({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    // Mock: accept any non-empty credentials
    if (email && password) {
      onLogin({ email, uid: 'mock-uid-001' });
    } else {
      setError('Please enter email and password');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-base-200">
      <div className="card w-96 bg-base-100 shadow-xl">
        <div className="card-body">
          <h2 className="card-title text-2xl justify-center mb-4">⚡ Swastik MCP</h2>
          <p className="text-center text-sm opacity-60 mb-4">Sign in to your MCP Brain</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="form-control">
              <label className="label"><span className="label-text">Email</span></label>
              <input
                type="email"
                placeholder="you@example.com"
                className="input input-bordered w-full"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div className="form-control">
              <label className="label"><span className="label-text">Password</span></label>
              <input
                type="password"
                placeholder="••••••••"
                className="input input-bordered w-full"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            {error && <p className="text-error text-sm">{error}</p>}

            <button type="submit" className="btn btn-primary w-full">Login</button>
          </form>

          <p className="text-xs text-center opacity-40 mt-4">
            Mock login — any credentials accepted
          </p>
        </div>
      </div>
    </div>
  );
}
