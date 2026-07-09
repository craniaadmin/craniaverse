import { useState } from 'react'
import { Mail, Lock, Eye, EyeOff } from 'lucide-react'
import BrandMark from './BrandMark'

const API_BASE = import.meta.env?.VITE_API_URL || ''

export default function Login({ onSignIn }) {
  const [email, setEmail] = useState('admin@craniaverse.ca')
  const [pw, setPw] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e) => {
    e.preventDefault()
    if (!pw) return
    setBusy(true); setError('')
    try {
      const res = await fetch(`${API_BASE}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ password: pw }),
      })
      if (res.ok) {
        onSignIn()
      } else {
        const body = await res.json().catch(() => ({}))
        setError(body.error || 'Login failed')
      }
    } catch (err) {
      setError('Network problem — please try again.')
      console.error(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <BrandMark height={120} radius={16} />
        <h1>Welcome back!</h1>
        <p className="sub">Sign in to continue to CraniaVerse.</p>

        <div className="field-block">
          <label>Email</label>
          <div className="input-shell">
            <Mail size={17} color="#9aa4b1" />
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
          </div>
        </div>

        <div className="field-block" style={{ marginBottom: 8 }}>
          <label>Password</label>
          <div className="input-shell">
            <Lock size={17} color="#9aa4b1" />
            <input
              type={show ? 'text' : 'password'}
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              placeholder="••••••••"
              autoFocus
            />
            <button type="button" className="eye" onClick={() => setShow(!show)} aria-label="toggle password">
              {show ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </div>
        </div>
        <a className="forgot" href="#">Forgot password?</a>

        {error && (
          <div style={{
            background: '#fdecea', border: '1px solid #f5b5b0', color: '#8a1c15',
            borderRadius: 8, padding: '8px 12px', fontSize: 13, margin: '8px 0',
          }}>{error}</div>
        )}

        <button className="btn block" type="submit" disabled={busy || !pw}
          style={{ opacity: busy || !pw ? 0.5 : 1 }}>
          {busy ? 'Signing in…' : 'Sign In'}
        </button>

        <div className="or">or</div>
        <p className="login-foot">Need help? <a href="#">Contact your administrator.</a></p>
      </form>
    </div>
  )
}
