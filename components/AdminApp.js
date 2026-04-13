import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const MONTHS = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre']
const BG = ['#B5D4F4','#C0DD97','#CECBF6','#FAC775','#F5C4B3','#9FE1CB','#F4C0D1','#D3D1C7','#85B7EB','#5DCAA5','#FAEEДА','#CCC','#B5D4F4','#C0DD97','#CECBF6','#FAC775','#F5C4B3','#9FE1CB','#F4C0D1','#D3D1C7']
const FG = ['#0C447C','#27500A','#3C3489','#633806','#993C1D','#085041','#72243E','#444441','#185FA5','#0F6E56','#633806','#444','#0C447C','#27500A','#3C3489','#633806','#993C1D','#085041','#72243E','#444441']

const SHIFT_DEF = {
  J:  { label:'Journée',    start:'09:00', end:'13:30' },
  AM: { label:'Après-midi', start:'13:30', end:'18:00' },
  N:  { label:'Nuit',       start:'18:00', end:'09:00' },
  WE: { label:'WE/Férié',   start:'09:00', end:'09:00' }
}

function dateStr(y, m, d) {
  return `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`
}
function isWE(ds) {
  const d = new Date(ds+'T12:00').getDay()
  return d === 0 || d === 6
}
function ini(s) { return (s.prenom[0]||'') + (s.nom[0]||'') }
function sc(idx) { return { bg: BG[idx % BG.length], fg: FG[idx % FG.length] } }

export default function AdminApp({ user, onLogout }) {
  const now = new Date()
  const [tab, setTab] = useState('planning')
  const [y, setY] = useState(now.getFullYear())
  const [m, setM] = useState(now.getMonth())
  const [staff, setStaff] = useState([])
  const [shifts, setShifts] = useState([])
  const [dispos, setDispos] = useState([])
  const [loading, setLoading] = useState(true)

  // modals
  const [shiftModal, setShiftModal] = useState(false)
  const [staffModal, setStaffModal] = useState(false)
  const [editShift, setEditShift] = useState(null)

  // forms
  const [sf, setSf] = useState({ staffId:'', type:'J', date:'', start:'09:00', end:'13:30', note:'' })
  const [stf, setStf] = useState({ prenom:'', nom:'', role:'Médecin réanimateur', contract:'Temps plein', max:20, code_acces:'' })

  useEffect(() => { loadAll() }, [])
  useEffect(() => { loadMonthData() }, [y, m])

  async function loadAll() {
    const { data } = await supabase.from('medecins').select('*').order('nom')
    setStaff(data || [])
    setLoading(false)
  }

  async function loadMonthData() {
    const start = dateStr(y, m, 1)
    const end = dateStr(y, m, new Date(y, m+1, 0).getDate())
    const [s1, s2] = await Promise.all([
      supabase.from('gardes').select('*').gte('date', start).lte('date', end),
      supabase.from('desiderata').select('*').gte('date', start).lte('date', end)
    ])
    setShifts(s1.data || [])
    setDispos(s2.data || [])
  }

  function chM(dir) {
    let nm = m + dir, ny = y
    if (nm > 11) { nm = 0; ny++ }
    if (nm < 0) { nm = 11; ny-- }
    setM(nm); setY(ny)
  }

  // ─── SHIFT ───────────────────────────────────────────────────────────────
  function openNewShift(date) {
    setEditShift(null)
    setSf({ staffId: staff[0]?.id || '', type:'J', date: date||'', start:'09:00', end:'13:30', note:'' })
    setShiftModal(true)
  }
  function openEditShift(sh) {
    setEditShift(sh.id)
    setSf({ staffId: sh.medecin_id, type: sh.type, date: sh.date, start: sh.heure_debut, end: sh.heure_fin, note: sh.note||'' })
    setShiftModal(true)
  }
  function onTypeChange(t) {
    const def = SHIFT_DEF[t]
    setSf(p => ({ ...p, type: t, start: def.start, end: def.end }))
  }

  async function saveShift() {
    const row = { medecin_id: sf.staffId, type: sf.type, date: sf.date, heure_debut: sf.start, heure_fin: sf.end, note: sf.note }
    if (editShift) {
      await supabase.from('gardes').update(row).eq('id', editShift)
    } else {
      await supabase.from('gardes').insert(row)
    }
    setShiftModal(false); loadMonthData()
  }

  async function deleteShiftById() {
    await supabase.from('gardes').delete().eq('id', editShift)
    setShiftModal(false); loadMonthData()
  }

  // ─── AUTO GENERATE ───────────────────────────────────────────────────────
  async function autoGenerate() {
    if (!staff.length) { alert('Aucun médecin enregistré.'); return }
    const days = new Date(y, m+1, 0).getDate()
    const rows = []
    let lastNight = {} // staffId → date of last night

    // Build a schedule respecting no 2 consecutive nights
    let staffIdx = 0
    for (let d = 1; d <= days; d++) {
      const ds = dateStr(y, m, d)
      const exists = shifts.some(s => s.date === ds)
      if (exists) continue

      const we = isWE(ds)
      if (we) {
        // WE: assign one doctor
        const doc = staff[staffIdx % staff.length]
        rows.push({ medecin_id: doc.id, type:'WE', date: ds, heure_debut:'09:00', heure_fin:'09:00', note:'Auto' })
        staffIdx++
      } else {
        // Weekday: J, AM, N
        const typesToAssign = ['J','AM','N']
        for (const type of typesToAssign) {
          let attempts = 0
          let assigned = false
          while (attempts < staff.length && !assigned) {
            const doc = staff[staffIdx % staff.length]
            staffIdx++
            attempts++
            // Check no consecutive nights
            if (type === 'N') {
              const prevDs = new Date(new Date(ds+'T12:00').getTime() - 86400000).toISOString().split('T')[0]
              const hadNightYesterday = rows.some(r => r.medecin_id === doc.id && r.date === prevDs && r.type === 'N')
                || shifts.some(s => s.medecin_id === doc.id && s.date === prevDs && s.type === 'N')
              if (hadNightYesterday) continue
            }
            const def = SHIFT_DEF[type]
            rows.push({ medecin_id: doc.id, type, date: ds, heure_debut: def.start, heure_fin: def.end, note:'Auto' })
            assigned = true
          }
        }
      }
    }

    if (rows.length > 0) await supabase.from('gardes').insert(rows)
    loadMonthData()
    alert(`${rows.length} garde(s) générée(s) pour ${MONTHS[m]} ${y}.`)
  }

  async function clearMonth() {
    if (!confirm('Effacer toutes les gardes de ce mois ?')) return
    const start = dateStr(y, m, 1)
    const end = dateStr(y, m, new Date(y, m+1, 0).getDate())
    await supabase.from('gardes').delete().gte('date', start).lte('date', end)
    loadMonthData()
  }

  // ─── STAFF ───────────────────────────────────────────────────────────────
  async function saveStaff() {
    if (!stf.prenom || !stf.nom || !stf.code_acces) { alert('Remplissez tous les champs.'); return }
    await supabase.from('medecins').insert({
      prenom: stf.prenom, nom: stf.nom, role: stf.role,
      code_acces: stf.code_acces, est_admin: false
    })
    setStaffModal(false)
    setStf({ prenom:'', nom:'', role:'Médecin réanimateur', contract:'Temps plein', max:20, code_acces:'' })
    loadAll()
  }

  async function removeStaff(id) {
    if (!confirm('Retirer ce médecin ?')) return
    await supabase.from('medecins').delete().eq('id', id)
    loadAll(); loadMonthData()
  }

  // ─── RENDER CALENDAR ─────────────────────────────────────────────────────
  function renderCalendar() {
    const firstDay = new Date(y, m, 1).getDay()
    const off = firstDay === 0 ? 6 : firstDay - 1
    const days = new Date(y, m+1, 0).getDate()
    const total = Math.ceil((off + days) / 7) * 7
    const rows = []
    let day = 1
    for (let i = 0; i < total; i += 7) {
      const cells = []
      for (let j = 0; j < 7; j++) {
        const ci = i + j
        if (ci < off || day > days) {
          cells.push(<td key={j} className="empty"></td>)
        } else {
          const ds = dateStr(y, m, day)
          const we = j >= 5
          const isToday = now.getFullYear()===y && now.getMonth()===m && now.getDate()===day
          const dayShifts = shifts.filter(s => s.date === ds)
          const dayDispos = dispos.filter(d => d.date === ds)

          cells.push(
            <td key={j} className={we ? 'is-we' : ''} style={isToday?{border:'2px solid #E24B4A'}:{}}>
              <div className={isToday ? 'dn today' : 'dn'}>{day}</div>
              {dayShifts.map((sh, si) => {
                const idx = staff.findIndex(s => s.id === sh.medecin_id)
                const c = sc(idx)
                const doc = staff.find(s => s.id === sh.medecin_id)
                return (
                  <div key={si} className={`pill t-${sh.type}`}
                    style={{background:c.bg,color:c.fg}}
                    onClick={() => openEditShift(sh)}
                    title={doc ? `${doc.prenom} ${doc.nom} · ${sh.heure_debut}→${sh.heure_fin}` : ''}>
                    {doc ? ini(doc) : '?'} {sh.type}
                  </div>
                )
              })}
              <div className="dispo-bar">
                {dayDispos.map((d, di) => (
                  <div key={di} className={`db ${d.statut==='dispo'?'db-dispo':d.statut==='indispo'?'db-indispo':'db-we'}`}
                    title={(() => { const doc=staff.find(s=>s.id===d.medecin_id); return doc ? `${doc.prenom} ${doc.nom}: ${d.statut}` : '' })()}
                  />
                ))}
              </div>
            </td>
          )
          day++
        }
      }
      rows.push(<tr key={i}>{cells}</tr>)
      if (day > days) break
    }
    return rows
  }

  // ─── STATS ───────────────────────────────────────────────────────────────
  function renderStats() {
    const byT = {J:0,AM:0,N:0,WE:0}
    shifts.forEach(sh => { if(byT[sh.type]!==undefined) byT[sh.type]++ })
    const avg = staff.length ? Math.round(shifts.length/staff.length*10)/10 : 0
    return (
      <div>
        <div className="metrics">
          <div className="metric"><div className="ml">Gardes ce mois</div><div className="mv">{shifts.length}</div></div>
          <div className="metric"><div className="ml">Médecins</div><div className="mv">{staff.length}</div></div>
          <div className="metric"><div className="ml">Moy. / médecin</div><div className="mv">{avg}</div></div>
          <div className="metric"><div className="ml">Nuits</div><div className="mv">{byT.N}</div></div>
          <div className="metric"><div className="ml">WE / Fériés</div><div className="mv">{byT.WE}</div></div>
        </div>
        {staff.map((s, idx) => {
          const mine = shifts.filter(sh => sh.medecin_id === s.id)
          const mt = {J:0,AM:0,N:0,WE:0}
          mine.forEach(sh => { if(mt[sh.type]!==undefined) mt[sh.type]++ })
          const c = sc(idx)
          const pct = Math.min(100, Math.round(mine.length/20*100))
          return (
            <div key={s.id} style={{display:'flex',alignItems:'center',gap:10,padding:'8px 0',borderBottom:'1px solid #eee'}}>
              <div className="avatar" style={{background:c.bg,color:c.fg,width:30,height:30,fontSize:11}}>{ini(s)}</div>
              <div style={{flex:1,fontSize:13,fontWeight:600}}>Dr {s.prenom} {s.nom}</div>
              <div style={{flex:2}}>
                <div style={{height:5,background:'#eee',borderRadius:3,overflow:'hidden'}}>
                  <div style={{width:`${pct}%`,height:'100%',borderRadius:3,background:pct>90?'#E24B4A':pct>70?'#EF9F27':'#639922'}}/>
                </div>
              </div>
              <div style={{fontSize:12,color:'#888',minWidth:30}}>{mine.length}</div>
              <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
                {Object.entries(mt).filter(([,v])=>v>0).map(([t,v]) => (
                  <span key={t} className={`badge b-${t}`}>{v} {t}</span>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  if (loading) return <div style={{padding:40,textAlign:'center',color:'#888'}}>Chargement…</div>

  return (
    <div>
      <div className="app-header">
        <span className="app-badge">SI · Admin</span>
        <span className="app-title">Planning des gardes — Soins Intensifs</span>
        <div className="app-user">
          <span>Dr {user.prenom} {user.nom}</span>
          <button className="btn sm" onClick={onLogout}>Déconnexion</button>
        </div>
      </div>

      <div className="tabs">
        {['planning','equipe','stats'].map(t => (
          <button key={t} className={`tab ${tab===t?'active':''}`} onClick={() => setTab(t)}>
            {t==='planning'?'Calendrier':t==='equipe'?'Médecins':'Statistiques'}
          </button>
        ))}
      </div>

      <div className="container">

        {/* PLANNING */}
        {tab === 'planning' && (
          <div>
            <div className="cal-toolbar">
              <div className="month-nav">
                <button className="btn sm" onClick={() => chM(-1)}>←</button>
                <span className="month-label">{MONTHS[m]} {y}</span>
                <button className="btn sm" onClick={() => chM(1)}>→</button>
              </div>
              <button className="btn primary sm" onClick={() => openNewShift(null)}>+ Garde</button>
              <button className="btn sm" style={{background:'#f5f5f5'}} onClick={autoGenerate}>Générer le mois</button>
              <button className="btn sm danger" onClick={clearMonth}>Effacer</button>
            </div>
            <div className="cal-wrap">
              <table className="cal">
                <thead>
                  <tr>{['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche'].map(d => <th key={d}>{d}</th>)}</tr>
                </thead>
                <tbody>{renderCalendar()}</tbody>
              </table>
            </div>
            <div className="legend">
              <span className="leg"><span className="ldot t-J"></span>Journée 9h–13h30</span>
              <span className="leg"><span className="ldot t-AM"></span>Après-midi 13h30–18h</span>
              <span className="leg"><span className="ldot t-N"></span>Nuit 18h–9h</span>
              <span className="leg"><span className="ldot t-WE"></span>WE/Férié 9h–9h (24h)</span>
              <span className="leg"><span className="ldot" style={{background:'#97C459'}}></span>Disponible</span>
              <span className="leg"><span className="ldot" style={{background:'#E24B4A'}}></span>Indisponible sem.</span>
              <span className="leg"><span className="ldot" style={{background:'#EF9F27'}}></span>Indisponible WE</span>
            </div>
          </div>
        )}

        {/* EQUIPE */}
        {tab === 'equipe' && (
          <div>
            <div style={{padding:'16px 0 12px',display:'flex',gap:10,alignItems:'center'}}>
              <button className="btn primary sm" onClick={() => setStaffModal(true)}>+ Ajouter un médecin</button>
              <span style={{fontSize:12,color:'#888'}}>{staff.filter(s=>!s.est_admin).length} médecin(s) enregistré(s)</span>
            </div>
            <div className="staff-grid">
              {staff.filter(s => !s.est_admin).map((s, idx) => {
                const c = sc(idx)
                const cnt = shifts.filter(sh => sh.medecin_id === s.id).length
                return (
                  <div key={s.id} className="scard">
                    <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:10}}>
                      <div className="avatar" style={{background:c.bg,color:c.fg}}>{ini(s)}</div>
                      <div>
                        <div style={{fontSize:14,fontWeight:600}}>Dr {s.prenom} {s.nom}</div>
                        <div style={{fontSize:11,color:'#888'}}>{s.role}</div>
                      </div>
                    </div>
                    <div style={{fontSize:12,color:'#888',marginBottom:4}}>{cnt} garde(s) ce mois</div>
                    <div style={{fontSize:12,color:'#aaa',marginBottom:10}}>Code : <strong style={{color:'#555'}}>{s.code_acces}</strong></div>
                    <div style={{textAlign:'right'}}>
                      <button className="btn sm danger" onClick={() => removeStaff(s.id)}>Retirer</button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* STATS */}
        {tab === 'stats' && (
          <div style={{padding:'16px 0'}}>
            <div style={{marginBottom:10,display:'flex',alignItems:'center',gap:8}}>
              <div className="month-nav">
                <button className="btn sm" onClick={() => chM(-1)}>←</button>
                <span className="month-label">{MONTHS[m]} {y}</span>
                <button className="btn sm" onClick={() => chM(1)}>→</button>
              </div>
            </div>
            {renderStats()}
          </div>
        )}
      </div>

      {/* MODAL Garde */}
      {shiftModal && (
        <div className="modal-overlay open" onClick={e => e.target.classList.contains('modal-overlay') && setShiftModal(false)}>
          <div className="modal">
            <h3>{editShift ? 'Modifier la garde' : 'Nouvelle garde'}</h3>
            <div className="form-group">
              <label>Médecin</label>
              <select value={sf.staffId} onChange={e => setSf(p=>({...p,staffId:e.target.value}))}>
                {staff.map(s => <option key={s.id} value={s.id}>Dr {s.prenom} {s.nom} · {s.role}</option>)}
              </select>
            </div>
            <div className="fg2">
              <div className="form-group">
                <label>Type</label>
                <select value={sf.type} onChange={e => onTypeChange(e.target.value)}>
                  <option value="J">Journée (9h–13h30)</option>
                  <option value="AM">Après-midi (13h30–18h)</option>
                  <option value="N">Nuit (18h–9h)</option>
                  <option value="WE">WE / Férié (9h–9h · 24h)</option>
                </select>
              </div>
              <div className="form-group">
                <label>Date</label>
                <input type="date" value={sf.date} onChange={e => setSf(p=>({...p,date:e.target.value}))} />
              </div>
            </div>
            {sf.type !== 'WE' && (
              <div className="fg2">
                <div className="form-group">
                  <label>Heure début</label>
                  <input type="time" value={sf.start} onChange={e => setSf(p=>({...p,start:e.target.value}))} />
                </div>
                <div className="form-group">
                  <label>Heure fin</label>
                  <input type="time" value={sf.end} onChange={e => setSf(p=>({...p,end:e.target.value}))} />
                </div>
              </div>
            )}
            <div className="form-group">
              <label>Remarque</label>
              <input type="text" value={sf.note} onChange={e => setSf(p=>({...p,note:e.target.value}))} placeholder="Astreinte, remplacement…" />
            </div>
            <div className="modal-footer">
              {editShift && <button className="btn danger sm" style={{marginRight:'auto'}} onClick={deleteShiftById}>Supprimer</button>}
              <button className="btn sm" onClick={() => setShiftModal(false)}>Annuler</button>
              <button className="btn primary sm" onClick={saveShift}>Enregistrer</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL Staff */}
      {staffModal && (
        <div className="modal-overlay open" onClick={e => e.target.classList.contains('modal-overlay') && setStaffModal(false)}>
          <div className="modal">
            <h3>Ajouter un médecin</h3>
            <div className="fg2">
              <div className="form-group">
                <label>Prénom</label>
                <input type="text" value={stf.prenom} onChange={e => setStf(p=>({...p,prenom:e.target.value}))} placeholder="Marie" />
              </div>
              <div className="form-group">
                <label>Nom</label>
                <input type="text" value={stf.nom} onChange={e => setStf(p=>({...p,nom:e.target.value}))} placeholder="Dupont" />
              </div>
            </div>
            <div className="form-group">
              <label>Grade / Spécialité</label>
              <select value={stf.role} onChange={e => setStf(p=>({...p,role:e.target.value}))}>
                <option>Médecin réanimateur</option>
                <option>Chef de service</option>
                <option>Médecin assistant</option>
                <option>Interne</option>
              </select>
            </div>
            <div className="form-group">
              <label>Code d'accès personnel</label>
              <input type="text" value={stf.code_acces} onChange={e => setStf(p=>({...p,code_acces:e.target.value}))} placeholder="Ex: MED001 ou NomPrenom" />
              <span style={{fontSize:11,color:'#aaa'}}>Ce code permet au médecin de se connecter. Choisissez quelque chose de mémorisable.</span>
            </div>
            <div className="modal-footer">
              <button className="btn sm" onClick={() => setStaffModal(false)}>Annuler</button>
              <button className="btn primary sm" onClick={saveStaff}>Ajouter</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
