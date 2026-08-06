import { useCallback, useEffect, useState } from 'react'
import { Mail, Lock, Eye, EyeOff, RefreshCw } from 'lucide-react'
import BrandMark from './BrandMark'

const API_BASE = import.meta.env?.VITE_API_URL || ''

/* The image comes from our own server, so there is no third-party
   script on the login page and nothing about whoever is looking at it
   leaves the machine. The answer is not in the token — the server
   keeps a hash of it — so reading the markup gets you nowhere. */
function Captcha({ svg, answer, onAnswer, onReload, busy }) {
  return (
    <div className="field-block">
      <label>Verification</label>
      <div className="captcha-row">
        <div className="captcha-img"
          aria-label="Verification image"
          dangerouslySetInnerHTML={{ __html: svg || '' }} />
        <button type="button" className="captcha-reload" onClick={onReload}
          title="Show a different image" disabled={busy}>
          <RefreshCw size={15} />
        </button>
      </div>
      <div className="input-shell" style={{ marginTop: 8 }}>
        <input
          value={answer}
          onChange={(e) => onAnswer(e.target.value)}
          placeholder="Type the characters above"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={8}
        />
      </div>
    </div>
  )
}

export default function Login({ onSignIn }) {
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [captcha, setCaptcha] = useState({ token: '', svg: '' })
  const [answer, setAnswer] = useState('')
  const [loadingCaptcha, setLoadingCaptcha] = useState(true)

  const loadCaptcha = useCallback(async () => {
    setLoadingCaptcha(true)
    setAnswer('')
    try {
      const res = await fetch(`${API_BASE}/api/captcha`, { credentials: 'include' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setCaptcha(await res.json())
    } catch {
      setCaptcha({ token: '', svg: '' })
      setError('Could not reach the server. Check your connection and try again.')
    } finally {
      setLoadingCaptcha(false)
    }
  }, [])

  useEffect(() => { loadCaptcha() }, [loadCaptcha])

  const submit = async (e) => {
    e.preventDefault()
    if (!email || !pw || !answer) return
    setBusy(true); setError('')
    try {
      const res = await fetch(`${API_BASE}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          email, password: pw, captchaToken: captcha.token, captchaAnswer: answer,
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (res.ok) {
        onSignIn(body.user, body.expiresAt)
        return
      }
      setError(body.error || 'Login failed')
      /* Every image is single-use, so any failed attempt — wrong code
         or wrong password — needs a fresh one, or the next try is
         refused for a reason that has nothing to do with what changed. */
      loadCaptcha()
    } catch (err) {
      setError('Network problem — please try again.')
      loadCaptcha()
      console.error(err)
    } finally {
      setBusy(false)
    }
  }

  const ready = email && pw && answer && captcha.token && !busy

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
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com" autoComplete="username" autoFocus />
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
              autoComplete="current-password"
            />
            <button type="button" className="eye" onClick={() => setShow(!show)} aria-label="toggle password">
              {show ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </div>
        </div>

        <Captcha svg={captcha.svg} answer={answer} onAnswer={setAnswer}
          onReload={loadCaptcha} busy={loadingCaptcha} />

        {error && (
          <div style={{
            background: '#fdecea', border: '1px solid #f5b5b0', color: '#8a1c15',
            borderRadius: 8, padding: '8px 12px', fontSize: 13, margin: '8px 0',
          }}>{error}</div>
        )}

        <button className="btn block" type="submit" disabled={!ready}
          style={{ opacity: ready ? 1 : 0.5 }}>
          {busy ? 'Signing in…' : 'Sign In'}
        </button>

        <p className="login-foot" style={{ marginTop: 14 }}>
          Forgotten your password? <a href="#">Ask an administrator to set a new one.</a>
        </p>
      </form>
    </div>
  )
}
