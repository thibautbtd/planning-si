import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const MONTHS = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre']
const MAX_INDISPO_WEEK = 5
const MAX_INDISPO_WE = 4

function getEaster(y) {
  const a = y % 19, b = Math.floor(y/100), c = y % 100
  const d = Math.floor(b/4), e = b % 4, f = Math.floor((b+8)/25)
  const g = Math.floor((b-f+1)/3), h = (19*a+b-d-g+15) % 30
  const i = Math.floor(c/4), k = c % 4
  const l = (32+2*e+2*i-h-k) % 7
  const m2 = Math.floor((a+11*h+22*l)/451)
  const month = Math.floor((h+l-7*m2+114)/31)
  const day2 = ((h+l-7*m2+114) % 31) + 1
  return new Date(y, month-1, day2)
}

function getFeriesBelges(y) {
  const easter = getEaster(y)
  const add = (date, days) => { const d = new Date(date); d.setDate(d.getDate()+days); return d }
  const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
  return {
    set: new Set([
      `${y}-01-01`, fmt(add(easter,1)), `${y}-05-01`, fmt(add(easter,39)),
      fmt(add(easter,50)), `${y}-07-21`, `${y}-08-15`, `${y}-11-01`, `${y}-11-11`, `${y}-12-25`,
    ]),
    labels: {
      [`${y}-01-01`]: 'Nouvel an',
      [fmt(add(easter,1))]: 'Lundi de Pâques',
      [`${y}-05-01`]: 'Fête du travail',
      [fmt(add(easter,39))]: 'Ascension',
      [fmt(add(easter,50))]: 'Lundi de Pentecôte',
      [`${y}-07-21`]: 'Fête nationale',
      [`${y}-08-15`]: 'Assomption',
      [`${y}-11-01`]: 'Toussaint',
      [`${y}-11-11`]: 'Armistice',
      [`${y}-12-25`]: 'Noël',
    }
  }
}

function dateStr(y, m, d) {
  return `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`
}
function isWE(ds) {
  const d = new Date(ds+'T12:00').getDay()
  return d === 0 || d === 6
}

export default function MedecinApp({ user, onLogout }) {
  const now = new Date()
  const [y, setY] = useState(now.getFullYear())
  const [m, setM] = useState(now.getMonth())
  const [dispoMap, setDispoMap] = useState({})
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => { loadDispo() }, [y, m])

  async function loadDispo() {
    const start = dateStr(y, m, 1)
    const end = dateStr(y, m, new Date(y, m+1, 0).getDate())
    const { data } = await supabase
      .from('desiderata').select('*')
      .eq('medecin_id', user.id).gte('date', start).lte('date', end)
    const map = {}
    if (data) data.forEach(r => { map[r.date] = r.statut })
    setDispoMap(map)
  }

  function getQuota() {
    let indW = 0, indWE = 0
    Object.entries(dispoMap).forEach(([, v]) => {
      if (v === 'indispo') indW++
      if (v === 'we-indispo') indWE++
    })
    return { indW, indWE }
  }

  function toggleDay(ds) {
    const { set: feriesSet } = getFeriesBelges(y)
    const weOrFerie = isWE(ds) || feriesSet.has(ds)
    const cur = dispoMap[ds] || ''
    let next = ''
    if (cur === '') { next = 'dispo' }
    else if (cur === 'dispo') {
      const { indW, indWE } = getQuota()
      if (weOrFerie) {
        if (indWE >= MAX_INDISPO_WE) { alert(`Maximum ${MAX_INDISPO_WE} jours WE/fériés indisponibles par mois atteint.`); return }
        next = 'we-indispo'
      } else {
        if (indW >= MAX_INDISPO_WEEK) { alert(`Maximum ${MAX_INDISPO_WEEK} jours indisponibles en semaine par mois atteint.`); return }
        next = 'indispo'
      }
    }
    setDispoMap(prev => {
      const n = { ...prev }
      if (next === '') delete n[ds]
      else n[ds] = next
      return n
    })
  }

  function chM(dir) {
    let nm = m + dir, ny = y
    if (nm > 11) { nm = 0; ny++ }
    if (nm < 0) { nm = 11; ny-- }
    setM(nm); setY(ny)
  }

  async function saveDispo() {
    setSaving(true); setMsg('')
    const start = dateStr(y, m, 1)
    const end = dateStr(y, m, new Date(y, m+1, 0).getDate())
    await supabase.from('desiderata').delete()
      .eq('medecin_id', user.id).gte('date', start).lte('date', end)
    const rows = Object.entries(dispoMap).map(([date, statut]) => ({ medecin_id: user.id, date, statut }))
    if (rows.length > 0) await supabase.from('desiderata').insert(rows)
    setSaving(false)
    setMsg('Disponibilités enregistrées !')
    setTimeout(() => setMsg(''), 3000)
  }

  const { set: feriesSet, labels: feriesLabels } = getFeriesBelges(y)
  const days = new Date(y, m+1, 0).getDate()
  const firstDay = new Date(y, m, 1).getDay()
  const off = firstDay === 0 ? 6 : firstDay - 1
  const total = Math.ceil((off + days) / 7) * 7
  const cells = []
  for (let i = 0; i < total; i++) {
    const day = i - off + 1
    if (day < 1 || day > days) { cells.push(null); continue }
    cells.push(day)
  }

  const { indW, indWE } = getQuota()
  const wLeft = MAX_INDISPO_WEEK - indW
  const weLeft = MAX_INDISPO_WE - indWE
  const qCls = wLeft < 0 || weLeft < 0 ? 'err' : wLeft <= 1 || weLeft <= 1 ? 'warn' : ''

  return (
    <div>
      <div className="app-header">
        <span className="app-badge">SI</span>
        <span className="app-title">Planning — Soins Intensifs</span>
        <div className="app-user">
          <span>Dr {user.prenom} {user.nom}</span>
          <button className="btn sm" onClick={onLogout}>Déconnexion</button>
        </div>
      </div>

      <div className="container">
        <div className="dispo-header">
          <div className="dispo-title">Mes disponibilités</div>
          <div className="dispo-sub">Encodez vos disponibilités. L'administrateur en tiendra compte lors de la génération du planning.</div>
        </div>

        <div className="hint-box">
          <strong>Comment ça marche :</strong><br/>
          Cliquez sur un jour → <strong style={{color:'#27500A'}}>Disponible</strong> → <strong style={{color:'#791F1F'}}>Indisponible</strong> → vide.<br/>
          Disponibilités : illimitées · Indisponible semaine : max {MAX_INDISPO_WEEK} jours · Indisponible WE/férié : max {MAX_INDISPO_WE} jours
        </div>

        <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:12,flexWrap:'wrap'}}>
          <div className="month-nav">
            <button className="btn sm" onClick={() => chM(-1)}>←</button>
            <span className="month-label">{MONTHS[m]} {y}</span>
            <button className="btn sm" onClick={() => chM(1)}>→</button>
          </div>
          <button className="btn primary sm" onClick={saveDispo} disabled={saving}>
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
          {msg && <span style={{color:'#639922',fontWeight:600,fontSize:13}}>{msg}</span>}
        </div>

        <div className={`quota-box ${qCls}`}>
          Indisponible semaine : <strong>{indW} / {MAX_INDISPO_WEEK}</strong> &nbsp;·&nbsp;
          Indisponible WE/fériés : <strong>{indWE} / {MAX_INDISPO_WE}</strong><br/>
          Reste : <strong>{Math.max(0,wLeft)} jour(s) semaine</strong> · <strong>{Math.max(0,weLeft)} jour(s) WE/férié</strong>
        </div>

        <div className="des-legend">
          <span className="des-leg"><span className="ldot" style={{background:'#C0DD97',borderRadius:2}}></span>Disponible</span>
          <span className="des-leg"><span className="ldot" style={{background:'#F09595',borderRadius:2}}></span>Indisponible semaine</span>
          <span className="des-leg"><span className="ldot" style={{background:'#FAC775',borderRadius:2}}></span>Indisponible WE/férié</span>
          <span className="des-leg"><span className="ldot" style={{background:'#F5C4B3',borderRadius:2}}></span>Jour férié belge</span>
        </div>

        <div style={{overflowX:'auto'}}>
          <table className="mini-cal" style={{minWidth:350}}>
            <thead>
              <tr>{['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'].map(d => <th key={d}>{d}</th>)}</tr>
            </thead>
            <tbody>
              {Array.from({length: Math.ceil(total/7)}, (_,ri) => (
                <tr key={ri}>
                  {Array.from({length:7}, (_,ci) => {
                    const cell = cells[ri*7+ci]
                    if (!cell) return <td key={ci}><div className="dc empty-d"></div></td>
                    const ds = dateStr(y, m, cell)
                    const isFerie = feriesSet.has(ds)
                    const ferieLabel = isFerie ? feriesLabels[ds] : null
                    const we = ci >= 5
                    const v = dispoMap[ds] || ''
                    const cls = v === 'dispo' ? 'dispo' : v === 'indispo' ? 'indispo' : v === 'we-indispo' ? 'we-indispo' : ''
                    const bgStyle = !cls && isFerie
                      ? {background:'#F5C4B3', borderColor:'#F0997B', color:'#993C1D'}
                      : !cls && we ? {background:'#fff8f8', borderColor:'#fdd'} : {}
                    return (
                      <td key={ci} style={{position:'relative', verticalAlign:'top', padding:'2px', border:'1px solid #eee'}}>
                        <div className={`dc ${cls}`} style={bgStyle} onClick={() => toggleDay(ds)} title={ferieLabel||''}>
                          {cell}
                        </div>
                        {isFerie && (
                          <div style={{fontSize:8,color:'#993C1D',textAlign:'center',lineHeight:1.2,marginTop:1,overflow:'hidden'}}>
                            {ferieLabel}
                          </div>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{marginTop:16,padding:'12px 0',borderTop:'1px solid #eee',fontSize:12,color:'#aaa',textAlign:'center'}}>
          Seul l'administrateur peut voir le planning complet et les disponibilités de l'équipe.
        </div>
      </div>
    </div>
  )
}
