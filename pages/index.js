import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import AdminApp from '../components/AdminApp'
import MedecinApp from '../components/MedecinApp'

export default function Home() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(false)
  const [code, setCode] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    const saved = sessionStorage.getItem('si_user')
    if (saved) setUser(JSON.parse(saved))
  }, [])

  async function handleLogin(e) {
    e.preventDefault()
    setError(''); setLoading(true)
    const { data, error } = await supabase
      .from('medecins')
      .select('*')
      .eq('code_acces', code.trim())
      .single()
    setLoading(false)
    if (error || !data) { setError('Code incorrect. Vérifiez votre code d\'accès.'); return; }
    sessionStorage.setItem('si_user', JSON.stringify(data))
    setUser(data)
  }

  function handleLogout() {
    sessionStorage.removeItem('si_user')
    setUser(null); setCode('')
  }

  if (user) {
    return user.est_admin
      ? <AdminApp user={user} onLogout={handleLogout} />
      : <MedecinApp user={user} onLogout={handleLogout} />
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <span className="login-badge">SI · SOINS INTENSIFS</span>
        <div className="login-title">Planning des gardes</div>
        <div className="login-sub">Entrez votre code d'accès personnel</div>
        {error && <div className="error">{error}</div>}
        <form onSubmit={handleLogin}>
          <div className="form-group">
            <label>Code d'accès</label>
            <input
              type="text"
              value={code}
              onChange={e => setCode(e.target.value)}
              placeholder="Ex: MED001"
              autoFocus
            />
          </div>
          <button className="btn primary" type="submit" disabled={loading}>
            {loading ? 'Connexion…' : 'Se connecter'}
          </button>
        </form>
        <p style={{fontSize:12,color:'#aaa',marginTop:16,textAlign:'center'}}>
          Contactez l'administrateur si vous avez perdu votre code.
        </p>
      </div>
    </div>
  )
}
