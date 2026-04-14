import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const MONTHS = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre']
const BG = ['#B5D4F4','#C0DD97','#CECBF6','#FAC775','#F5C4B3','#9FE1CB','#F4C0D1','#D3D1C7','#85B7EB','#5DCAA5','#B5D4F4','#C0DD97','#CECBF6','#FAC775','#F5C4B3','#9FE1CB','#F4C0D1','#D3D1C7','#85B7EB','#5DCAA5']
const FG = ['#0C447C','#27500A','#3C3489','#633806','#993C1D','#085041','#72243E','#444441','#185FA5','#0F6E56','#0C447C','#27500A','#3C3489','#633806','#993C1D','#085041','#72243E','#444441','#185FA5','#0F6E56']

const SHIFT_DEF = {
  J:  { label:'Journée',    start:'09:00', end:'13:30' },
  AM: { label:'Après-midi', start:'13:30', end:'18:00' },
  N:  { label:'Nuit',       start:'18:00', end:'09:00' },
  WE: { label:'WE/Férié',   start:'09:00', end:'09:00' }
}

// ─── JOURS FÉRIÉS BELGES ─────────────────────────────────────────────────────
function getEaster(y) {
  const a=y%19,b=Math.floor(y/100),c=y%100
  const d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25)
  const g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30
  const i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7
  const m2=Math.floor((a+11*h+22*l)/451)
  const mo=Math.floor((h+l-7*m2+114)/31)
  const da=((h+l-7*m2+114)%31)+1
  return new Date(y,mo-1,da)
}
function getFeriesBelges(y) {
  const easter=getEaster(y)
  const add=(date,days)=>{const d=new Date(date);d.setDate(d.getDate()+days);return d}
  const fmt=(d)=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
  const list=[
    {date:`${y}-01-01`,label:'Nouvel an'},
    {date:fmt(add(easter,1)),label:'Lundi de Pâques'},
    {date:`${y}-05-01`,label:'Fête du travail'},
    {date:fmt(add(easter,39)),label:'Ascension'},
    {date:fmt(add(easter,50)),label:'Lundi de Pentecôte'},
    {date:`${y}-07-21`,label:'Fête nationale'},
    {date:`${y}-08-15`,label:'Assomption'},
    {date:`${y}-11-01`,label:'Toussaint'},
    {date:`${y}-11-11`,label:'Armistice'},
    {date:`${y}-12-25`,label:'Noël'},
  ]
  const set=new Set(list.map(f=>f.date))
  const labels={}
  list.forEach(f=>{labels[f.date]=f.label})
  return {set,labels}
}

function dateStr(y,m,d){return `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`}
function isWE(ds){const d=new Date(ds+'T12:00').getDay();return d===0||d===6}
function ini(s){return (s.prenom[0]||'')+(s.nom[0]||'')}
function sc(idx){return {bg:BG[idx%BG.length],fg:FG[idx%FG.length]}}

// Profils de garde par défaut
const DEFAULT_PROFIL = {J:true,AM:true,N:true,WE:true}
function getProfil(s){
  try { return s.profil_gardes ? JSON.parse(s.profil_gardes) : DEFAULT_PROFIL }
  catch { return DEFAULT_PROFIL }
}

export default function AdminApp({user,onLogout}) {
  const now=new Date()
  const [tab,setTab]=useState('planning')
  const [y,setY]=useState(now.getFullYear())
  const [m,setM]=useState(now.getMonth())
  const [staff,setStaff]=useState([])
  const [shifts,setShifts]=useState([])
  const [dispos,setDispos]=useState([])
  const [loading,setLoading]=useState(true)
  const [shiftModal,setShiftModal]=useState(false)
  const [staffModal,setStaffModal]=useState(false)
  const [editShiftId,setEditShiftId]=useState(null)
  const [editStaff,setEditStaff]=useState(null)
  const [sf,setSf]=useState({staffId:'',type:'J',date:'',start:'09:00',end:'13:30',note:''})
  const [stf,setStf]=useState({prenom:'',nom:'',role:'Médecin réanimateur',code_acces:'',profil:{J:true,AM:true,N:true,WE:true}})

  useEffect(()=>{loadAll()},[])
  useEffect(()=>{loadMonthData()},[y,m])

  async function loadAll(){
    const {data}=await supabase.from('medecins').select('*').order('nom')
    setStaff(data||[])
    setLoading(false)
  }
  async function loadMonthData(){
    const start=dateStr(y,m,1)
    const end=dateStr(y,m,new Date(y,m+1,0).getDate())
    const [s1,s2]=await Promise.all([
      supabase.from('gardes').select('*').gte('date',start).lte('date',end),
      supabase.from('desiderata').select('*').gte('date',start).lte('date',end)
    ])
    setShifts(s1.data||[])
    setDispos(s2.data||[])
  }

  function chM(dir){
    let nm=m+dir,ny=y
    if(nm>11){nm=0;ny++}
    if(nm<0){nm=11;ny--}
    setM(nm);setY(ny)
  }

  // ─── SHIFT ────────────────────────────────────────────────────────────────
  function openNewShift(){
    setEditShiftId(null)
    setSf({staffId:staff.find(s=>!s.est_admin)?.id||'',type:'J',date:'',start:'09:00',end:'13:30',note:''})
    setShiftModal(true)
  }
  function openEditShift(sh){
    setEditShiftId(sh.id)
    setSf({staffId:sh.medecin_id,type:sh.type,date:sh.date,start:sh.heure_debut,end:sh.heure_fin,note:sh.note||''})
    setShiftModal(true)
  }
  function onTypeChange(t){
    const def=SHIFT_DEF[t]
    setSf(p=>({...p,type:t,start:def.start,end:def.end}))
  }
  async function saveShift(){
    const row={medecin_id:sf.staffId,type:sf.type,date:sf.date,heure_debut:sf.start,heure_fin:sf.end,note:sf.note}
    if(editShiftId){await supabase.from('gardes').update(row).eq('id',editShiftId)}
    else{await supabase.from('gardes').insert(row)}
    setShiftModal(false);loadMonthData()
  }
  async function deleteShiftById(){
    await supabase.from('gardes').delete().eq('id',editShiftId)
    setShiftModal(false);loadMonthData()
  }

  // ─── AUTO GENERATE ────────────────────────────────────────────────────────
  async function autoGenerate(){
    if(!staff.length){alert('Aucun médecin enregistré.');return}
    const {set:feriesSet}=getFeriesBelges(y)
    const days=new Date(y,m+1,0).getDate()
    const rows=[]
    const medecins=staff.filter(s=>!s.est_admin)

    // Séparer les médecins par profil
    const canDo=(doc,type)=>getProfil(doc)[type]===true

    let idxJ=0,idxAM=0,idxN=0,idxWE=0

    for(let d=1;d<=days;d++){
      const ds=dateStr(y,m,d)
      const exists=shifts.some(s=>s.date===ds)
      if(exists) continue
      const we=isWE(ds)||feriesSet.has(ds)

      if(we){
        // WE ou férié : garde 24h
        const pool=medecins.filter(doc=>canDo(doc,'WE'))
        if(pool.length){
          const doc=pool[idxWE%pool.length];idxWE++
          rows.push({medecin_id:doc.id,type:'WE',date:ds,heure_debut:'09:00',heure_fin:'09:00',note:'Auto'})
        }
      } else {
        // Journée
        const poolJ=medecins.filter(doc=>canDo(doc,'J'))
        if(poolJ.length){
          const doc=poolJ[idxJ%poolJ.length];idxJ++
          rows.push({medecin_id:doc.id,type:'J',date:ds,heure_debut:'09:00',heure_fin:'13:30',note:'Auto'})
        }
        // Après-midi
        const poolAM=medecins.filter(doc=>canDo(doc,'AM'))
        if(poolAM.length){
          const doc=poolAM[idxAM%poolAM.length];idxAM++
          rows.push({medecin_id:doc.id,type:'AM',date:ds,heure_debut:'13:30',heure_fin:'18:00',note:'Auto'})
        }
        // Nuit — pas 2 nuits consécutives
        const poolN=medecins.filter(doc=>{
          if(!canDo(doc,'N')) return false
          const prev=new Date(new Date(ds+'T12:00').getTime()-86400000).toISOString().split('T')[0]
          const hadNight=rows.some(r=>r.medecin_id===doc.id&&r.date===prev&&r.type==='N')
            ||shifts.some(s=>s.medecin_id===doc.id&&s.date===prev&&s.type==='N')
          return !hadNight
        })
        if(poolN.length){
          const doc=poolN[idxN%poolN.length];idxN++
          rows.push({medecin_id:doc.id,type:'N',date:ds,heure_debut:'18:00',heure_fin:'09:00',note:'Auto'})
        }
      }
    }

    if(rows.length>0) await supabase.from('gardes').insert(rows)
    loadMonthData()
    alert(`${rows.length} garde(s) générée(s) pour ${MONTHS[m]} ${y}.`)
  }

  async function clearMonth(){
    if(!confirm('Effacer toutes les gardes de ce mois ?')) return
    const start=dateStr(y,m,1)
    const end=dateStr(y,m,new Date(y,m+1,0).getDate())
    await supabase.from('gardes').delete().gte('date',start).lte('date',end)
    loadMonthData()
  }

  // ─── STAFF ────────────────────────────────────────────────────────────────
  function openAddStaff(){
    setEditStaff(null)
    setStf({prenom:'',nom:'',role:'Médecin réanimateur',code_acces:'',profil:{J:true,AM:true,N:true,WE:true}})
    setStaffModal(true)
  }
  function openEditStaff(s){
    setEditStaff(s.id)
    setStf({prenom:s.prenom,nom:s.nom,role:s.role,code_acces:s.code_acces,profil:getProfil(s)})
    setStaffModal(true)
  }
  async function saveStaff(){
    if(!stf.prenom||!stf.nom||!stf.code_acces){alert('Remplissez tous les champs.');return}
    const row={prenom:stf.prenom,nom:stf.nom,role:stf.role,code_acces:stf.code_acces,profil_gardes:JSON.stringify(stf.profil),est_admin:false}
    if(editStaff){await supabase.from('medecins').update(row).eq('id',editStaff)}
    else{await supabase.from('medecins').insert(row)}
    setStaffModal(false);loadAll()
  }
  async function removeStaff(id){
    if(!confirm('Retirer ce médecin ?')) return
    await supabase.from('medecins').delete().eq('id',id)
    loadAll();loadMonthData()
  }
  function toggleProfil(type){
    setStf(p=>({...p,profil:{...p.profil,[type]:!p.profil[type]}}))
  }

  // ─── CALENDAR ────────────────────────────────────────────────────────────
  function renderCalendar(){
    const {set:feriesSet,labels:feriesLabels}=getFeriesBelges(y)
    const firstDay=new Date(y,m,1).getDay()
    const off=firstDay===0?6:firstDay-1
    const days=new Date(y,m+1,0).getDate()
    const total=Math.ceil((off+days)/7)*7
    const rows=[]
    let day=1
    for(let i=0;i<total;i+=7){
      const cells=[]
      for(let j=0;j<7;j++){
        const ci=i+j
        if(ci<off||day>days){cells.push(<td key={j} className="empty"></td>);continue}
        const ds=dateStr(y,m,day)
        const we=j>=5
        const isFerie=feriesSet.has(ds)
        const ferieLabel=isFerie?feriesLabels[ds]:null
        const isToday=now.getFullYear()===y&&now.getMonth()===m&&now.getDate()===day
        const dayShifts=shifts.filter(s=>s.date===ds)
        const dayDispos=dispos.filter(d=>d.date===ds)

        // Background couleur
        let tdStyle={}
        if(isFerie) tdStyle={background:'#FFF3E0',border:'1px solid #FFCC80'}
        else if(we) tdStyle={background:'#fff8f8'}

        cells.push(
          <td key={j} style={{...tdStyle,verticalAlign:'top',padding:3,border:isFerie?'1px solid #FFCC80':'1px solid #eee',height:90}}>
            <div style={{display:'flex',alignItems:'center',gap:3,marginBottom:2}}>
              <div className={isToday?'dn today':'dn'}>{day}</div>
              {isFerie&&<div style={{fontSize:8,color:'#E65100',fontWeight:600,lineHeight:1.2,flex:1,overflow:'hidden',whiteSpace:'nowrap',textOverflow:'ellipsis'}}>{ferieLabel}</div>}
            </div>
            {dayShifts.map((sh,si)=>{
              const idx=staff.findIndex(s=>s.id===sh.medecin_id)
              const c=sc(idx)
              const doc=staff.find(s=>s.id===sh.medecin_id)
              return(
                <div key={si} className={`pill t-${sh.type}`}
                  style={{background:c.bg,color:c.fg}}
                  onClick={()=>openEditShift(sh)}
                  title={doc?`${doc.prenom} ${doc.nom} · ${sh.heure_debut}→${sh.heure_fin}`:''}>
                  {doc?ini(doc):'?'} {sh.type}
                </div>
              )
            })}
            <div className="dispo-bar">
              {dayDispos.map((d,di)=>(
                <div key={di} className={`db ${d.statut==='dispo'?'db-dispo':d.statut==='indispo'?'db-indispo':'db-we'}`}
                  title={(()=>{const doc=staff.find(s=>s.id===d.medecin_id);return doc?`${doc.prenom} ${doc.nom}: ${d.statut}`:''})()}
                />
              ))}
            </div>
          </td>
        )
        day++
      }
      rows.push(<tr key={i}>{cells}</tr>)
      if(day>days) break
    }
    return rows
  }

  // ─── STATS ────────────────────────────────────────────────────────────────
  function renderStats(){
    const byT={J:0,AM:0,N:0,WE:0}
    shifts.forEach(sh=>{if(byT[sh.type]!==undefined)byT[sh.type]++})
    const med=staff.filter(s=>!s.est_admin)
    const avg=med.length?Math.round(shifts.length/med.length*10)/10:0
    return(
      <div>
        <div className="metrics">
          <div className="metric"><div className="ml">Gardes ce mois</div><div className="mv">{shifts.length}</div></div>
          <div className="metric"><div className="ml">Médecins</div><div className="mv">{med.length}</div></div>
          <div className="metric"><div className="ml">Moy. / médecin</div><div className="mv">{avg}</div></div>
          <div className="metric"><div className="ml">Nuits</div><div className="mv">{byT.N}</div></div>
          <div className="metric"><div className="ml">WE / Fériés</div><div className="mv">{byT.WE}</div></div>
        </div>
        {med.map((s,idx)=>{
          const mine=shifts.filter(sh=>sh.medecin_id===s.id)
          const mt={J:0,AM:0,N:0,WE:0}
          mine.forEach(sh=>{if(mt[sh.type]!==undefined)mt[sh.type]++})
          const c=sc(idx)
          const pct=Math.min(100,Math.round(mine.length/20*100))
          const profil=getProfil(s)
          return(
            <div key={s.id} style={{display:'flex',alignItems:'center',gap:10,padding:'8px 0',borderBottom:'1px solid #eee',flexWrap:'wrap'}}>
              <div className="avatar" style={{background:c.bg,color:c.fg,width:30,height:30,fontSize:11}}>{ini(s)}</div>
              <div style={{flex:1,fontSize:13,fontWeight:600,minWidth:120}}>Dr {s.prenom} {s.nom}</div>
              <div style={{display:'flex',gap:3}}>
                {['J','AM','N','WE'].map(t=>(
                  <span key={t} style={{fontSize:9,padding:'1px 4px',borderRadius:3,background:profil[t]?'#eee':'#fff0f0',color:profil[t]?'#555':'#ccc',border:'1px solid #ddd'}}>{t}</span>
                ))}
              </div>
              <div style={{flex:2,minWidth:80}}>
                <div style={{height:5,background:'#eee',borderRadius:3,overflow:'hidden'}}>
                  <div style={{width:`${pct}%`,height:'100%',borderRadius:3,background:pct>90?'#E24B4A':pct>70?'#EF9F27':'#639922'}}/>
                </div>
              </div>
              <div style={{fontSize:12,color:'#888',minWidth:30}}>{mine.length}</div>
              <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
                {Object.entries(mt).filter(([,v])=>v>0).map(([t,v])=>(
                  <span key={t} className={`badge b-${t}`}>{v} {t}</span>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  if(loading) return <div style={{padding:40,textAlign:'center',color:'#888'}}>Chargement…</div>

  return(
    <div>
      <div className="app-header">
        <span className="app-badge">SI · Admin</span>
        <span className="app-title">Planning — Soins Intensifs</span>
        <div className="app-user">
          <span>Dr {user.prenom} {user.nom}</span>
          <button className="btn sm" onClick={onLogout}>Déconnexion</button>
        </div>
      </div>

      <div className="tabs">
        {['planning','equipe','stats'].map(t=>(
          <button key={t} className={`tab ${tab===t?'active':''}`} onClick={()=>setTab(t)}>
            {t==='planning'?'Calendrier':t==='equipe'?'Médecins':'Statistiques'}
          </button>
        ))}
      </div>

      <div className="container">

        {tab==='planning'&&(
          <div>
            <div className="cal-toolbar">
              <div className="month-nav">
                <button className="btn sm" onClick={()=>chM(-1)}>←</button>
                <span className="month-label">{MONTHS[m]} {y}</span>
                <button className="btn sm" onClick={()=>chM(1)}>→</button>
              </div>
              <button className="btn primary sm" onClick={openNewShift}>+ Garde</button>
              <button className="btn sm" style={{background:'#f5f5f5'}} onClick={autoGenerate}>Générer le mois</button>
              <button className="btn sm danger" onClick={clearMonth}>Effacer</button>
            </div>
            <div className="cal-wrap">
              <table className="cal">
                <thead>
                  <tr>{['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche'].map(d=><th key={d}>{d}</th>)}</tr>
                </thead>
                <tbody>{renderCalendar()}</tbody>
              </table>
            </div>
            <div className="legend">
              <span className="leg"><span className="ldot t-J"></span>Journée 9h–13h30</span>
              <span className="leg"><span className="ldot t-AM"></span>Après-midi 13h30–18h</span>
              <span className="leg"><span className="ldot t-N"></span>Nuit 18h–9h</span>
              <span className="leg"><span className="ldot t-WE"></span>WE/Férié 9h–9h (24h)</span>
              <span className="leg"><span className="ldot" style={{background:'#FFF3E0',border:'1px solid #FFCC80'}}></span>Jour férié belge</span>
              <span className="leg"><span className="ldot" style={{background:'#97C459'}}></span>Disponible</span>
              <span className="leg"><span className="ldot" style={{background:'#E24B4A'}}></span>Indisponible sem.</span>
              <span className="leg"><span className="ldot" style={{background:'#EF9F27'}}></span>Indisponible WE</span>
            </div>
          </div>
        )}

        {tab==='equipe'&&(
          <div>
            <div style={{padding:'16px 0 12px',display:'flex',gap:10,alignItems:'center'}}>
              <button className="btn primary sm" onClick={openAddStaff}>+ Ajouter un médecin</button>
              <span style={{fontSize:12,color:'#888'}}>{staff.filter(s=>!s.est_admin).length} médecin(s)</span>
            </div>
            <div className="staff-grid">
              {staff.filter(s=>!s.est_admin).map((s,idx)=>{
                const c=sc(idx)
                const cnt=shifts.filter(sh=>sh.medecin_id===s.id).length
                const profil=getProfil(s)
                return(
                  <div key={s.id} className="scard">
                    <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:10}}>
                      <div className="avatar" style={{background:c.bg,color:c.fg}}>{ini(s)}</div>
                      <div style={{flex:1}}>
                        <div style={{fontSize:14,fontWeight:600}}>Dr {s.prenom} {s.nom}</div>
                        <div style={{fontSize:11,color:'#888'}}>{s.role}</div>
                      </div>
                    </div>
                    <div style={{marginBottom:8}}>
                      <div style={{fontSize:11,color:'#888',marginBottom:4}}>Gardes autorisées :</div>
                      <div style={{display:'flex',gap:5}}>
                        {[['J','Journée'],['AM','Après-midi'],['N','Nuit'],['WE','WE/Férié']].map(([t,l])=>(
                          <span key={t} style={{fontSize:10,padding:'2px 6px',borderRadius:4,background:profil[t]?'#C0DD97':'#f5f5f5',color:profil[t]?'#27500A':'#bbb',border:`1px solid ${profil[t]?'#97C459':'#eee'}`,fontWeight:profil[t]?600:400}}>
                            {l}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div style={{fontSize:11,color:'#888',marginBottom:4}}>{cnt} garde(s) ce mois</div>
                    <div style={{fontSize:11,color:'#aaa',marginBottom:10}}>Code : <strong style={{color:'#555'}}>{s.code_acces}</strong></div>
                    <div style={{display:'flex',gap:6,justifyContent:'flex-end'}}>
                      <button className="btn sm" onClick={()=>openEditStaff(s)}>Modifier</button>
                      <button className="btn sm danger" onClick={()=>removeStaff(s.id)}>Retirer</button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {tab==='stats'&&(
          <div style={{padding:'16px 0'}}>
            <div style={{marginBottom:10,display:'flex',alignItems:'center',gap:8}}>
              <div className="month-nav">
                <button className="btn sm" onClick={()=>chM(-1)}>←</button>
                <span className="month-label">{MONTHS[m]} {y}</span>
                <button className="btn sm" onClick={()=>chM(1)}>→</button>
              </div>
            </div>
            {renderStats()}
          </div>
        )}
      </div>

      {/* MODAL Garde */}
      {shiftModal&&(
        <div className="modal-overlay open" onClick={e=>e.target.classList.contains('modal-overlay')&&setShiftModal(false)}>
          <div className="modal">
            <h3>{editShiftId?'Modifier la garde':'Nouvelle garde'}</h3>
            <div className="form-group">
              <label>Médecin</label>
              <select value={sf.staffId} onChange={e=>setSf(p=>({...p,staffId:e.target.value}))}>
                {staff.filter(s=>!s.est_admin).map(s=><option key={s.id} value={s.id}>Dr {s.prenom} {s.nom} · {s.role}</option>)}
              </select>
            </div>
            <div className="fg2">
              <div className="form-group">
                <label>Type</label>
                <select value={sf.type} onChange={e=>onTypeChange(e.target.value)}>
                  <option value="J">Journée (9h–13h30)</option>
                  <option value="AM">Après-midi (13h30–18h)</option>
                  <option value="N">Nuit (18h–9h)</option>
                  <option value="WE">WE / Férié (9h–9h · 24h)</option>
                </select>
              </div>
              <div className="form-group">
                <label>Date</label>
                <input type="date" value={sf.date} onChange={e=>setSf(p=>({...p,date:e.target.value}))}/>
              </div>
            </div>
            {sf.type!=='WE'&&(
              <div className="fg2">
                <div className="form-group">
                  <label>Heure début</label>
                  <input type="time" value={sf.start} onChange={e=>setSf(p=>({...p,start:e.target.value}))}/>
                </div>
                <div className="form-group">
                  <label>Heure fin</label>
                  <input type="time" value={sf.end} onChange={e=>setSf(p=>({...p,end:e.target.value}))}/>
                </div>
              </div>
            )}
            <div className="form-group">
              <label>Remarque</label>
              <input type="text" value={sf.note} onChange={e=>setSf(p=>({...p,note:e.target.value}))} placeholder="Astreinte, remplacement…"/>
            </div>
            <div className="modal-footer">
              {editShiftId&&<button className="btn danger sm" style={{marginRight:'auto'}} onClick={deleteShiftById}>Supprimer</button>}
              <button className="btn sm" onClick={()=>setShiftModal(false)}>Annuler</button>
              <button className="btn primary sm" onClick={saveShift}>Enregistrer</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL Staff */}
      {staffModal&&(
        <div className="modal-overlay open" onClick={e=>e.target.classList.contains('modal-overlay')&&setStaffModal(false)}>
          <div className="modal">
            <h3>{editStaff?'Modifier le médecin':'Ajouter un médecin'}</h3>
            <div className="fg2">
              <div className="form-group">
                <label>Prénom</label>
                <input type="text" value={stf.prenom} onChange={e=>setStf(p=>({...p,prenom:e.target.value}))} placeholder="Marie"/>
              </div>
              <div className="form-group">
                <label>Nom</label>
                <input type="text" value={stf.nom} onChange={e=>setStf(p=>({...p,nom:e.target.value}))} placeholder="Dupont"/>
              </div>
            </div>
            <div className="form-group">
              <label>Grade / Spécialité</label>
              <select value={stf.role} onChange={e=>setStf(p=>({...p,role:e.target.value}))}>
                <option>Médecin réanimateur</option>
                <option>Chef de service</option>
                <option>Médecin assistant</option>
                <option>Interne</option>
              </select>
            </div>
            <div className="form-group">
              <label>Code d'accès</label>
              <input type="text" value={stf.code_acces} onChange={e=>setStf(p=>({...p,code_acces:e.target.value}))} placeholder="Ex: DupontM2025"/>
            </div>
            <div className="form-group">
              <label>Gardes autorisées</label>
              <div style={{display:'flex',gap:10,flexWrap:'wrap',marginTop:4}}>
                {[['J','Journée (9h–13h30)'],['AM','Après-midi (13h30–18h)'],['N','Nuit (18h–9h)'],['WE','WE / Férié (24h)']].map(([t,l])=>(
                  <label key={t} style={{display:'flex',alignItems:'center',gap:6,fontSize:13,cursor:'pointer',padding:'6px 10px',borderRadius:6,border:`1px solid ${stf.profil[t]?'#97C459':'#ddd'}`,background:stf.profil[t]?'#f0fff0':'#fafafa'}}>
                    <input type="checkbox" checked={!!stf.profil[t]} onChange={()=>toggleProfil(t)} style={{width:14,height:14}}/>
                    {l}
                  </label>
                ))}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn sm" onClick={()=>setStaffModal(false)}>Annuler</button>
              <button className="btn primary sm" onClick={saveStaff}>Enregistrer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
