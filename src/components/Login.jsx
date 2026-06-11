import { useState } from 'react'
import { Mail, Lock, Eye, EyeOff } from 'lucide-react'
import BrandMark from './BrandMark'

export default function Login({ onSignIn }) {
  const [email, setEmail] = useState('admin@craniaverse.ca')
  const [pw, setPw] = useState('password')
  const [show, setShow] = useState(false)

  const submit = (e) => { e.preventDefault(); onSignIn() }

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
            <input type={show ? 'text' : 'password'} value={pw} onChange={(e) => setPw(e.target.value)} placeholder="••••••••" />
            <button type="button" className="eye" onClick={() => setShow(!show)} aria-label="toggle password">
              {show ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </div>
        </div>
        <a className="forgot" href="#">Forgot password?</a>

        <button className="btn block" type="submit">Sign In</button>

        <div className="or">or</div>
        <p className="login-foot">Need help? <a href="#">Contact your administrator.</a></p>
      </form>
    </div>
  )
}
