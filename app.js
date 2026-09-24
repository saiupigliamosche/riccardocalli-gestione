const CONFIG={VERSION:"0.6.4",OWNER:"riccardo.calli@gmail.com",DEFAULT_API:"https://script.google.com/macros/s/AKfycbyy-lBBedchYGG4Ob-oqLJCeFjvkEswzEH9XV8kNGIYpXAEIAKKB-8-s6N5OB4f6I1d/exec",ENROLLMENT_FORM:"https://form.jotform.com/262643062831050"};
const now=new Date();
const state={view:"home",today:null,trials:[],members:[],payments:[],dashboard:null,monthYear:now.getFullYear(),monthIndex:now.getMonth(),selectedDate:null};
const $=s=>document.querySelector(s),viewEl=$("#view"),titleEl=$("#pageTitle"),toastEl=$("#toast");
const backend=()=>localStorage.getItem("parkour_admin_endpoint")||CONFIG.DEFAULT_API;
const token=()=>localStorage.getItem("parkour_admin_token")||"";
(function resetMemberCachesOnce(){
  try{
    const key="parkour_member_reset_20260920_v1";
    if(!localStorage.getItem(key)){
      localStorage.removeItem("parkour_attendance_cache");
      localStorage.removeItem("parkour_extra_attendance");
      localStorage.removeItem("parkour_confirmed_lessons");
      localStorage.setItem(key,"1");
    }
  }catch(_){}
})();
(function cleanupTestState(){
  try{
    const a=JSON.parse(localStorage.getItem("parkour_attendance_cache")||"{}");
    if(a["2026-09-22"]){delete a["2026-09-22"];localStorage.setItem("parkour_attendance_cache",JSON.stringify(a))}
    const l=JSON.parse(localStorage.getItem("parkour_confirmed_lessons")||"{}");
    if(l["2026-09-22"]){delete l["2026-09-22"];localStorage.setItem("parkour_confirmed_lessons",JSON.stringify(l))}
  }catch(_){}
})();

function toast(m){toastEl.textContent=m;toastEl.hidden=false;setTimeout(()=>toastEl.hidden=true,2300)}
function esc(s=""){return String(s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[m]))}
function initials(n=""){return n.split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]?.toUpperCase()).join("")||"?"}
function fmtDate(v){if(!v)return"—";const d=new Date(String(v).length===10?v+"T12:00:00":v);return new Intl.DateTimeFormat("it-IT",{weekday:"long",day:"numeric",month:"long",year:"numeric"}).format(d)}
function money(v){return new Intl.NumberFormat("it-IT",{style:"currency",currency:"EUR"}).format(Number(v||0))}
function dateKey(d){const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,"0"),day=String(d.getDate()).padStart(2,"0");return y+"-"+m+"-"+day}
function todayKey(){return dateKey(new Date())}
function attendanceCache(){try{return JSON.parse(localStorage.getItem("parkour_attendance_cache")||"{}")}catch(_){return{}}}
function cachedPresence(date,id){const c=attendanceCache();return c[date]&&Object.prototype.hasOwnProperty.call(c[date],id)?!!c[date][id]:null}
function setCachedPresence(date,id,value){const c=attendanceCache();c[date]=c[date]||{};c[date][id]=!!value;localStorage.setItem("parkour_attendance_cache",JSON.stringify(c))}
function confirmedLessons(){try{return JSON.parse(localStorage.getItem("parkour_confirmed_lessons")||"{}")}catch(_){return{}}}
function setLessonConfirmed(date,value){const c=confirmedLessons();if(value)c[date]=true;else delete c[date];localStorage.setItem("parkour_confirmed_lessons",JSON.stringify(c))}
function extraAttendance(){try{return JSON.parse(localStorage.getItem("parkour_extra_attendance")||"{}")}catch(_){return{}}}
function extraIds(date){return extraAttendance()[date]||[]}
function setExtraId(date,id,on=true){const c=extraAttendance();const s=new Set(c[date]||[]);on?s.add(id):s.delete(id);c[date]=[...s];localStorage.setItem("parkour_extra_attendance",JSON.stringify(c))}

let modalReturnFocus=null;
function modalShell({id,eyebrow,title,body="",actions="",className=""}){
  return '<div class="modal-backdrop" id="'+id+'" data-modal-backdrop role="presentation">'+
    '<section class="app-modal '+className+'" role="dialog" aria-modal="true" aria-labelledby="'+id+'Title" tabindex="-1">'+
      '<div class="modal-header"><div><div class="eyebrow">'+esc(eyebrow)+'</div><h2 id="'+id+'Title">'+title+'</h2></div><button type="button" class="modal-close" data-modal-close aria-label="Chiudi">×</button></div>'+
      '<div class="modal-body">'+body+'</div>'+(actions?'<div class="modal-actions">'+actions+'</div>':'')+
    '</section></div>';
}
function openModal(options){
  closeModal();
  modalReturnFocus=document.activeElement;
  document.body.insertAdjacentHTML("beforeend",modalShell(options));
  document.body.classList.add("modal-open");
  const backdrop=document.querySelector("#"+options.id),dialog=backdrop.querySelector(".app-modal");
  backdrop.addEventListener("click",e=>{if(e.target===backdrop&&!options.locked)closeModal(options.id)});
  backdrop.querySelector("[data-modal-close]").addEventListener("click",()=>closeModal(options.id));
  dialog.addEventListener("keydown",trapModalFocus);
  requestAnimationFrame(()=>{
    backdrop.classList.add("visible");
    (backdrop.querySelector("[autofocus]")||dialog).focus({preventScroll:true});
  });
  return backdrop;
}
function closeModal(id){
  const modal=id?document.querySelector("#"+id):document.querySelector("[data-modal-backdrop]");
  if(!modal)return;
  modal.remove();document.body.classList.remove("modal-open");
  if(modalReturnFocus?.isConnected)modalReturnFocus.focus({preventScroll:true});
  modalReturnFocus=null;
}
function trapModalFocus(e){
  if(e.key==="Escape"){closeModal(e.currentTarget.closest("[data-modal-backdrop]").id);return}
  if(e.key!=="Tab")return;
  const nodes=[...e.currentTarget.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href]')];
  if(!nodes.length)return;
  const first=nodes[0],last=nodes[nodes.length-1];
  if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}
  else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}
}
document.addEventListener("keydown",e=>{if(e.key==="Escape"){const m=document.querySelector("[data-modal-backdrop]");if(m)closeModal(m.id)}});
function showError(message,title="Operazione non riuscita"){
  openModal({id:"messageModal",eyebrow:"ERRORE",title:esc(title),body:'<div class="modal-message error-message">'+esc(message)+'</div>',actions:'<button class="primary" onclick="closeModal(\'messageModal\')">CHIUDI</button>'});
}
function showConfirm({eyebrow="CONFERMA",title,message,confirmLabel="CONFERMA",danger=false,onConfirm}){
  window.pendingModalConfirm=onConfirm;
  openModal({id:"confirmModal",eyebrow,title:esc(title),body:'<div class="modal-message">'+esc(message)+'</div>',actions:'<button class="secondary" onclick="closeModal(\'confirmModal\')">ANNULLA</button><button class="'+(danger?'danger-btn':'primary')+'" onclick="runModalConfirm()">'+esc(confirmLabel)+'</button>'});
}
function runModalConfirm(){const fn=window.pendingModalConfirm;window.pendingModalConfirm=null;closeModal("confirmModal");if(fn)fn()}



async function api(action,data={}){
  if(!backend()||!token())throw new Error("Gestionale non collegato");
  const r=await fetch(backend(),{method:"POST",headers:{"Content-Type":"text/plain;charset=utf-8"},body:JSON.stringify({token:token(),action,data}),cache:"no-store",credentials:"omit",redirect:"follow"});
  if(!r.ok)throw new Error("Backend non raggiungibile");
  const out=await r.json();
  if(!out.ok)throw new Error(out.error||"Errore backend");
  return out.data??out;
}
function connectBackend(){
  openModal({id:"backendModal",eyebrow:"COLLEGAMENTO",title:"Collega il backend",body:'<label class="field-label" for="adminToken">Token amministratore</label><input id="adminToken" class="big-input" type="password" autocomplete="current-password" value="'+esc(token())+'" placeholder="Incolla il token" autofocus>',actions:'<button class="secondary" onclick="closeModal(\'backendModal\')">ANNULLA</button><button class="primary" onclick="saveBackendToken()">COLLEGA</button>'});
}
function saveBackendToken(){const tk=document.querySelector("#adminToken")?.value.trim();if(!tk){showError("Inserisci il token amministratore.");return}localStorage.setItem("parkour_admin_token",tk);closeModal("backendModal");loadAll()}
function disconnectBackend(){
  showConfirm({eyebrow:"SICUREZZA",title:"Disconnetti dispositivo",message:"Il token amministratore verrà rimosso solo da questo dispositivo.",confirmLabel:"DISCONNETTI",danger:true,onConfirm:()=>{
    localStorage.removeItem("parkour_admin_token");
    Object.assign(state,{today:null,trials:[],members:[],payments:[],dashboard:null});
    render();
  }});
}
function connectionCard(){
  return '<div class="hero"><div class="date">PWA PRONTA</div><div class="time">Collega il backend</div><div class="meta">Endpoint già configurato. Il token resta salvato solo su questo dispositivo.</div></div><div class="actions"><button class="primary" onclick="connectBackend()">COLLEGA BACKEND</button></div>';
}

function courseDay(d){return d.getDay()===2||d.getDay()===4}
function monthName(){return new Intl.DateTimeFormat("it-IT",{month:"long",year:"numeric"}).format(new Date(state.monthYear,state.monthIndex,1))}
function moveMonth(delta){
  const d=new Date(state.monthYear,state.monthIndex+delta,1);
  state.monthYear=d.getFullYear();state.monthIndex=d.getMonth();state.selectedDate=null;renderHome();
}
function selectDate(key){state.selectedDate=key;renderHome()}
function defaultLessonDate(){
  const start=new Date(state.monthYear,state.monthIndex,1);
  const end=new Date(state.monthYear,state.monthIndex+1,0);
  const today=new Date();today.setHours(0,0,0,0);
  for(let d=new Date(start);d<=end;d.setDate(d.getDate()+1)){const x=new Date(d);if(courseDay(x)&&x>=today)return dateKey(x)}
  for(let d=new Date(start);d<=end;d.setDate(d.getDate()+1)){const x=new Date(d);if(courseDay(x))return dateKey(x)}
  return null;
}
function trialsFor(key){return (state.trials||[]).filter(t=>t.date===key&&t.status!=="Annullato")}
function calendarHtml(){
  const first=new Date(state.monthYear,state.monthIndex,1);
  const last=new Date(state.monthYear,state.monthIndex+1,0);
  const mondayIndex=(first.getDay()+6)%7;
  let html='<div class="calendar-head"><button class="cal-nav" onclick="moveMonth(-1)">‹</button><strong>'+esc(monthName())+'</strong><button class="cal-nav" onclick="moveMonth(1)">›</button></div>';
  html+='<div class="weekdays"><span>Lun</span><span>Mar</span><span>Mer</span><span>Gio</span><span>Ven</span><span>Sab</span><span>Dom</span></div><div class="month-grid">';
  for(let i=0;i<mondayIndex;i++)html+='<div class="day blank"></div>';
  for(let n=1;n<=last.getDate();n++){
    const d=new Date(state.monthYear,state.monthIndex,n),key=dateKey(d),lesson=courseDay(d),count=trialsFor(key).length,selected=state.selectedDate===key,today=key===todayKey();
    html+='<button '+(lesson?'onclick="selectDate(\''+key+'\')"':'disabled')+' class="day '+(lesson?'lesson ':'')+(selected?'selected ':'')+(today?'today ':'')+'"><span class="daynum">'+n+'</span>'+(lesson?'<span class="lesson-dot"></span>':'')+(count?'<span class="trial-count">'+count+' prove</span>':'')+'</button>';
  }
  html+='</div>';
  return html;
}
function expectedMembersForSelectedDate(key){
  const d=new Date(key+"T12:00:00");
  const day=d.getDay();
  const extras=new Set(extraIds(key));
  return (state.members||[]).filter(m=>{
    if((m.status||"Attivo")!=="Attivo")return false;
    const f=String(m.frequency||"").toLowerCase();
    const scheduled=f.includes("2") ||
      (day===2 && (f.includes("martedì")||f.includes("martedi"))) ||
      (day===4 && (f.includes("giovedì")||f.includes("giovedi")));
    return scheduled||extras.has(m.id);
  }).map(m=>{
    m.extra=extras.has(m.id);
    const cp=cachedPresence(key,m.id);
    m.present=cp!==null?cp:false;
    return m;
  });
}
function lessonDetail(){
  const key=state.selectedDate;
  if(!key)return "";
  const trials=trialsFor(key);
  const members=expectedMembersForSelectedDate(key);
  const isToday=key===todayKey()&&state.today;
  if(isToday){
    const todayById=new Map((state.today.members||[]).map(x=>[x.id,x]));
    members.forEach(m=>{if(todayById.has(m.id))m.present=!!todayById.get(m.id).present});
  }
  let html='<section class="section"><div class="card"><div class="card-row"><div><div class="card-title">'+esc(fmtDate(key))+'</div><div class="card-sub">19:00–20:30 · La Cittadella della Stanga · '+members.length+' iscritti previsti · '+trials.length+' prove</div><div class="card-sub"><a href="https://maps.app.goo.gl/G5zFoprsZqDC37xw6" target="_blank" rel="noopener">Apri su Google Maps</a></div></div><span class="badge ok">LEZIONE</span></div></div>';
  html+=personSection("ISCRITTI PREVISTI",members,false);
  if(trials.length){
    html+='<div class="section-head"><h2>IN PROVA</h2><span class="badge trial">'+trials.length+'</span></div>';
    html+=trials.map(t=>'<button class="person '+(t.present?"present":"")+'" onclick="togglePresence(\''+esc(t.id)+'\',\'trial\')"><span class="avatar">'+initials(t.name)+'</span><span class="person-main"><span class="person-name">'+esc(t.name)+'</span><span class="person-sub">'+(t.age||"—")+' anni · PROVA</span></span><span class="tick">✓</span></button>').join("");
  }
  html+='<div class="actions"><button class="secondary" onclick="openAddPresence()">+ AGGIUNGI PRESENZA</button></div>';
  const confirmed=!!confirmedLessons()[key];
  const totalPeople=members.length+trials.length;
  const presentCount=[...members,...trials].filter(x=>x.present).length;
  const absentCount=Math.max(0,totalPeople-presentCount);
  html+='<div class="lesson-summary"><div><strong>'+presentCount+'</strong><span>Presenti</span></div><div><strong>'+absentCount+'</strong><span>Assenti</span></div><div><strong>'+totalPeople+'</strong><span>Previsti</span></div></div>';
  html+='<div class="actions"><button class="primary confirm-lesson-btn '+(confirmed?"confirmed":"")+'" onclick="openLessonConfirm()">'+(confirmed?"LEZIONE CONFERMATA ✓":"CONFERMA LEZIONE")+'</button></div>';
  html+='<div class="empty attendance-hint">Tocca i presenti: la selezione è immediata. Quando hai finito, Conferma lezione registra come assenti solo le persone previste per questa data che non hai selezionato.</div>';
  return html+'</section>';
}
function personSection(title,list,trial){
  return '<section class="section"><div class="section-head"><h2>'+title+'</h2><span class="badge '+(trial?"trial":"ok")+'">'+list.length+'</span></div><div class="person-list">'+
  (list.length?list.map(p=>'<button class="person '+(p.present?"present":"")+'" onclick="togglePresence(\''+esc(p.id)+'\',\''+(trial?"trial":"member")+'\')"><span class="avatar">'+initials(p.name)+'</span><span class="person-main"><span class="person-name">'+esc(p.name)+'</span><span class="person-sub">'+(trial?((p.age||"—")+" anni · PROVA"):esc((p.plan||"Iscritto")+(p.extra?" · EXTRA":"")))+'</span></span><span class="tick">✓</span></button>').join(""):'<div class="empty">Nessuna persona.</div>')+
  '</div></section>';
}
function renderHome(){
  titleEl.textContent="Home";
  if(!backend()||!token()){viewEl.innerHTML=connectionCard();return}
  if(!state.selectedDate)state.selectedDate=defaultLessonDate();
  viewEl.innerHTML='<div class="calendar-card">'+calendarHtml()+'</div>'+lessonDetail();
}

function renderTrials(){
  titleEl.textContent="Prove";
  if(!backend()||!token()){viewEl.innerHTML=connectionCard();return}
  const rows=state.trials||[];
  viewEl.innerHTML='<input class="search" placeholder="Cerca una prova…" oninput="filterCards(this.value,\'trialCard\')"><div class="section-head"><h2>Prossime e da gestire</h2><span class="badge trial">'+rows.length+'</span></div>'+
  (rows.length?rows.map(p=>{
    const converted=p.status==="Iscritto";
    const actions=converted
      ? '<div class="empty compact-note">Conversione completata</div>'
      : '<div class="actions"><button class="primary" onclick="shareEnrollmentForm(\''+esc(p.id)+'\')">INVIA MODULO ISCRIZIONE</button></div><div class="actions grid2"><button class="secondary" onclick="window.open(CONFIG.ENROLLMENT_FORM,\'_blank\',\'noopener\')">APRI MODULO</button><button class="secondary" onclick="convertTrial(\''+esc(p.id)+'\')">ISCRIVI MANUALE</button></div><div class="actions"><button class="secondary" onclick="markTrial(\''+esc(p.id)+'\',\'Non interessato\')">NON INTERESSATO</button></div>';
    return '<div class="card trialCard" data-search="'+esc((p.name||"").toLowerCase())+'"><div class="card-row"><div><div class="card-title">'+esc(p.name)+'</div><div class="card-sub">'+(p.age||"—")+' anni · '+fmtDate(p.date)+'</div></div><span class="badge '+(converted||p.status==="Presentato"?"ok":"trial")+'">'+esc(p.status||"Prenotato")+'</span></div>'+actions+'</div>';
  }).join(""):'<div class="empty">Nessuna prova da gestire.</div>');
}
function memberCardHtml(p,archived=false){
  const badgeClass=archived?"danger":(p.risk==="ALTO"?"danger":"ok");
  const actions=archived
    ? '<div class="actions grid2"><button class="primary" onclick="restoreMember(\''+esc(p.id)+'\')">RIPRISTINA</button><button class="secondary" onclick="memberDetail(\''+esc(p.id)+'\')">DETTAGLI</button></div>'
    : '<div class="actions grid2"><button class="primary" onclick="newPayment(\''+esc(p.id)+'\')">PAGAMENTO</button><button class="secondary" onclick="memberDetail(\''+esc(p.id)+'\')">DETTAGLI</button></div>';
  return '<div class="card memberCard" data-search="'+esc((p.name||"").toLowerCase())+'"><div class="card-row"><div><div class="card-title">'+esc(p.name)+'</div><div class="card-sub">'+esc(p.plan||"Piano non impostato")+' · '+esc(p.frequency||"frequenza non impostata")+'</div></div><span class="badge '+badgeClass+'">'+esc(p.status||"Attivo")+'</span></div>'+actions+'</div>';
}
function renderMembers(){
  titleEl.textContent="Iscritti";
  if(!backend()||!token()){viewEl.innerHTML=connectionCard();return}
  const rows=state.members||[];
  const archived=rows.filter(x=>x.status==="Eliminato");
  const current=rows.filter(x=>x.status!=="Eliminato");
  const activeCount=current.filter(x=>x.status==="Attivo").length;
  viewEl.innerHTML='<button class="primary" onclick="newMember()">+ NUOVO ISCRITTO</button><div style="height:12px"></div><input class="search" placeholder="Cerca uno studente…" oninput="filterCards(this.value,\'memberCard\')">'+
    '<div class="section-head"><h2>Iscritti</h2><span class="badge ok">'+activeCount+' attivi</span></div>'+
    (current.length?current.map(p=>memberCardHtml(p,false)).join(""):'<div class="empty">Nessun iscritto caricato.</div>')+
    '<section class="section"><div class="section-head"><h2>Studenti eliminati</h2><span class="badge danger">'+archived.length+'</span></div>'+
    (archived.length?archived.map(p=>memberCardHtml(p,true)).join(""):'<div class="empty">Nessuno studente eliminato.</div>')+
    '</section>';
}
function renderPayments(){
  titleEl.textContent="Pagamenti";
  if(!backend()||!token()){viewEl.innerHTML=connectionCard();return}
  viewEl.innerHTML='<button class="primary" onclick="newPayment()">+ REGISTRA PAGAMENTO</button><section class="section"><div class="section-head"><h2>Ultimi pagamenti</h2></div>'+
  (state.payments?.length?state.payments.map(x=>'<div class="card"><div class="card-row"><div><div class="card-title">'+esc(x.name)+'</div><div class="card-sub">'+fmtDate(x.date)+' · '+esc(x.method||"")+'</div></div><strong>'+money(x.amount)+'</strong></div></div>').join(""):'<div class="empty">Nessun pagamento registrato.</div>')+'</section>';
}
function renderDashboard(){
  titleEl.textContent="Dashboard";
  if(!backend()||!token()){viewEl.innerHTML=connectionCard();return}
  const d=state.dashboard||{};
  const m=[["Iscritti attivi",d.activeMembers??"—","35–40"],["Nuovi da ads",d.adMembers??"—",""],["Prove prenotate",d.bookings??"—",""],["Prove settimana",d.weekTrials??"—",""],["Trial → pagante",d.trialToPaid!=null?Math.round(d.trialToPaid*100)+"%":"—",""],["CAC pagante",d.cac!=null?money(d.cac):"—",""],["Incassato stagione",d.revenue!=null?money(d.revenue):"—",""],["ROAS ads",d.roas!=null?Number(d.roas).toFixed(2)+"x":"—",""],["A rischio drop",d.atRisk??"—",""]];
  viewEl.innerHTML='<div class="grid2">'+m.map(x=>'<div class="kpi"><strong>'+x[1]+'</strong><span>'+x[0]+(x[2]?" · "+x[2]:"")+'</span></div>').join("")+'</div><div class="actions"><button class="secondary" onclick="disconnectBackend()">DISCONNETTI QUESTO DISPOSITIVO</button></div>';
}
function filterCards(q,cls){q=q.toLowerCase();document.querySelectorAll("."+cls).forEach(el=>el.style.display=(el.dataset.search||"").includes(q)?"":"none")}
async function loadAll(){viewEl.innerHTML='<div class="skeleton"></div>';try{if(backend()&&token())Object.assign(state,await api("bootstrap"))}catch(e){showError(e.message,"Dati non caricati")}render()}
function render(){document.querySelectorAll(".nav-item").forEach(b=>b.classList.toggle("active",b.dataset.view===state.view));({home:renderHome,trials:renderTrials,members:renderMembers,payments:renderPayments,dashboard:renderDashboard}[state.view])()}
document.querySelectorAll(".nav-item").forEach(b=>b.addEventListener("click",()=>{state.view=b.dataset.view;render()}));$("#syncBtn").addEventListener("click",loadAll);

async function togglePresence(id,type){
  const p=type==="trial"?state.trials.find(x=>x.id===id):state.members.find(x=>x.id===id);
  if(!p)return;
  const lessonDate=state.selectedDate||todayKey();
  const previous=!!p.present;
  const next=!previous;
  p.present=next;
  setCachedPresence(lessonDate,id,next);
  setLessonConfirmed(lessonDate,false);
  renderHome();
  try{
    await api("setPresence",{id,personId:type==="trial"?(p.personId||id):id,type,lessonDate,present:next});
  }catch(e){
    p.present=previous;
    setCachedPresence(lessonDate,id,previous);
    renderHome();
    showError(e.message,"Presenza non salvata");
  }
}
async function forceAbsent(entity,type,date){
  const payload={id:entity.id,personId:type==="trial"?(entity.personId||entity.id):entity.id,type,lessonDate:date,present:false};
  await api("setPresence",payload);
  setCachedPresence(date,entity.id,false);
}
function openLessonConfirm(){
  const key=state.selectedDate;
  if(!key)return;
  const members=expectedMembersForSelectedDate(key);
  const trials=trialsFor(key).map(t=>{const cp=cachedPresence(key,t.id);if(cp!==null)t.present=cp;return t});
  const all=[...members,...trials];
  const present=all.filter(x=>x.present).length;
  const absent=all.length-present;
  openModal({id:"lessonConfirmModal",eyebrow:"RIEPILOGO LEZIONE",title:esc(fmtDate(key)),body:'<div class="confirm-stats"><div><strong>'+present+'</strong><span>Presenti</span></div><div><strong>'+absent+'</strong><span>Assenti</span></div><div><strong>'+all.length+'</strong><span>Previsti</span></div></div><div class="modal-message">Confermando, chi non è selezionato verrà registrato come assente.</div>',actions:'<button class="secondary" onclick="closeLessonConfirm()">ANNULLA</button><button class="primary" onclick="confirmLesson()">CONFERMA</button>'});
}
function closeLessonConfirm(){closeModal("lessonConfirmModal")}
async function confirmLesson(){
  const key=state.selectedDate;
  if(!key)return;
  const members=expectedMembersForSelectedDate(key);
  const trials=trialsFor(key).map(t=>{const cp=cachedPresence(key,t.id);if(cp!==null)t.present=cp;return t});
  const people=[...members.map(x=>({entity:x,type:"member"})),...trials.map(x=>({entity:x,type:"trial"}))];
  const absent=people.filter(x=>!x.entity.present);
  closeLessonConfirm();
  setLessonConfirmed(key,true);
  renderHome();
  toast("Lezione confermata · salvataggio in corso");
  try{
    await Promise.all(absent.map(x=>forceAbsent(x.entity,x.type,key)));
    await api("closeLesson",{lessonDate:key});
    toast("Lezione confermata");
  }catch(e){
    setLessonConfirmed(key,false);
    renderHome();
    showError(e.message,"Lezione non confermata");
  }
}
function openAddPresence(){
  const key=state.selectedDate;
  if(!key)return;
  const current=new Set(expectedMembersForSelectedDate(key).map(x=>x.id));
  const candidates=(state.members||[]).filter(m=>(m.status||"Attivo")==="Attivo"&&!current.has(m.id));
  const cards=candidates.length?candidates.map(m=>'<button class="presence-pick" onclick="addExtraPresence(\''+esc(m.id)+'\')"><span class="avatar">'+initials(m.name)+'</span><span><strong>'+esc(m.name)+'</strong><small>'+esc(m.frequency||"Frequenza non impostata")+'</small></span><span class="plus">+</span></button>').join(""):'<div class="empty">Tutti gli iscritti attivi sono già previsti in questa lezione.</div>';
  openModal({id:"presenceModal",eyebrow:"PRESENZA EXTRA",title:esc(fmtDate(key)),body:'<input class="search modal-search" placeholder="Cerca iscritto…" oninput="filterPresencePicks(this.value)" autofocus><div id="presencePickList">'+cards+'</div>'});
}
function closePresenceModal(){closeModal("presenceModal")}
function filterPresencePicks(q){q=q.toLowerCase();document.querySelectorAll(".presence-pick").forEach(el=>el.style.display=el.innerText.toLowerCase().includes(q)?"":"none")}
async function addExtraPresence(id){
  const p=state.members.find(x=>x.id===id);if(!p)return;
  const key=state.selectedDate||todayKey();
  setExtraId(key,id,true);
  setCachedPresence(key,id,true);
  p.present=true;p.extra=true;
  setLessonConfirmed(key,false);
  closePresenceModal();
  renderHome();
  try{
    await api("setPresence",{id,personId:id,type:"member",lessonDate:key,present:true});
    toast(p.name+" aggiunto come presenza extra");
  }catch(e){
    setExtraId(key,id,false);setCachedPresence(key,id,false);p.present=false;p.extra=false;renderHome();
    showError(e.message,"Presenza non salvata");
  }
}
async function shareEnrollmentForm(id){
  const p=state.trials.find(x=>x.id===id);
  const first=((p?.name||"").trim().split(/\s+/)[0]||"");
  const text="Ciao"+(first?" "+first:"")+"! Per completare l’iscrizione al corso di Parkour Padova compila e firma questo modulo digitale:";
  const url=CONFIG.ENROLLMENT_FORM;
  try{
    if(navigator.share){
      await navigator.share({title:"Iscrizione Parkour Padova 2026/27",text,url});
      return;
    }
    await navigator.clipboard.writeText(text+"\n"+url);
    toast("Messaggio e link copiati");
  }catch(e){
    if(e?.name!=="AbortError"){
      try{await navigator.clipboard.writeText(text+"\n"+url);toast("Messaggio e link copiati")}catch(_){window.open(url,"_blank","noopener")}
    }
  }
}
function markTrial(id,status){
  const p=state.trials.find(x=>x.id===id);if(!p)return;
  showConfirm({eyebrow:"AGGIORNA PROVA",title:"Segna come non interessato",message:p.name+" non comparirà più tra le prove da gestire.",confirmLabel:"CONFERMA",danger:true,onConfirm:async()=>{try{await api("setTrialStatus",{bookingId:id,status});toast(status);await loadAll()}catch(e){showError(e.message,"Stato non aggiornato")}}});
}
let trialDraft={id:"",frequency:"1",day:"Martedì",plan:"Annuale",payment:"No",method:"Contanti"};
function convertTrial(id){
  const p=state.trials.find(x=>x.id===id);
  if(!p)return;
  trialDraft={id,frequency:"1",day:"Martedì",plan:"Annuale",payment:"No",method:"Contanti"};
  const body=trialChoiceGroup("Frequenza","frequency",[["1","1× settimana"],["2","2× settimana"]],"1")+
    '<div id="trialDayGroup">'+trialChoiceGroup("Giorno","day",[["Martedì","Martedì"],["Giovedì","Giovedì"]],"Martedì")+'</div>'+
    trialChoiceGroup("Pacchetto","plan",[["Annuale","Annuale"],["3 rate","3 rate"],["Mese di prova","Mese di prova"]],"Annuale")+
    trialChoiceGroup("Pagamento","payment",[["No","Non pagato"],["Sì","Pagato ora"]],"No")+
    '<div id="trialMethodGroup" style="display:none">'+trialChoiceGroup("Metodo","method",[["Contanti","Contanti"],["Bonifico","Bonifico"],["PayPal","PayPal"],["Altro","Altro"]],"Contanti")+'</div>'+
    '<div id="trialAmountNote" class="amount-note">Importo se pagato ora: '+money(trialAmount())+'</div>';
  openModal({id:"trialModal",eyebrow:"CONVERTI PROVA",title:esc(p.name),body,actions:'<button class="primary trial-save" onclick="saveTrialConversion()">SALVA ISCRIZIONE</button>'});
}
function trialChoiceGroup(label,group,items,selected){
  return '<div class="choice-section"><div class="field-label">'+label+'</div><div class="choice-grid">'+items.map(x=>'<button type="button" class="choice-btn '+(x[0]===selected?"selected":"")+'" data-trial-group="'+group+'" onclick="chooseTrialOption(\''+group+'\',\''+x[0]+'\',this)">'+x[1]+'</button>').join("")+'</div></div>';
}
function chooseTrialOption(group,value,btn){
  trialDraft[group]=value;
  document.querySelectorAll('[data-trial-group="'+group+'"]').forEach(x=>x.classList.remove("selected"));
  btn.classList.add("selected");
  if(group==="frequency"){
    const g=document.querySelector("#trialDayGroup");
    g.style.display=value==="1"?"block":"none";
    trialDraft.day=value==="1"?"Martedì":"Martedì+Giovedì";
  }
  if(group==="payment")document.querySelector("#trialMethodGroup").style.display=value==="Sì"?"block":"none";
  const n=document.querySelector("#trialAmountNote");if(n)n.textContent="Importo se pagato ora: "+money(trialAmount());
}
function trialAmount(){
  const f=trialDraft.frequency,p=trialDraft.plan;
  if(p==="Annuale")return f==="2"?480:290;
  if(p==="3 rate")return f==="2"?165:110;
  return f==="2"?60:45;
}
function closeTrialModal(){closeModal("trialModal")}
async function saveTrialConversion(){
  const btn=document.querySelector(".trial-save");
  btn.disabled=true;btn.textContent="SALVATAGGIO…";
  const frequency=trialDraft.frequency==="2"?"2x/settimana - Martedì+Giovedì":"1x/settimana - "+trialDraft.day;
  const payment=trialDraft.payment==="Sì"?{type:trialDraft.plan,amount:trialAmount(),method:trialDraft.method,invoiced:"No"}:null;
  try{
    await api("convertTrial",{bookingId:trialDraft.id,frequency,plan:trialDraft.plan,payment});
    closeTrialModal();
    toast("Iscrizione completata");
    await loadAll();
    state.view="trials";render();
  }catch(e){
    btn.disabled=false;btn.textContent="SALVA ISCRIZIONE";
    showError(e.message,"Iscrizione non salvata");
  }
}
let memberDraft={frequency:"2",day:"Martedì+Giovedì",plan:"Annuale",payment:"No",method:"Contanti"};
function newMember(){
  memberDraft={frequency:"2",day:"Martedì+Giovedì",plan:"Annuale",payment:"No",method:"Contanti"};
  const ages=Array.from({length:63},(_,i)=>i+18).map(a=>'<option value="'+a+'">'+a+'</option>').join("");
  const body='<label class="field-label">Nome e cognome</label><input id="memberName" class="big-input" autocomplete="name" placeholder="Es. Mario Rossi" autofocus>'+
    '<label class="field-label">Età</label><select id="memberAge" class="big-select">'+ages+'</select>'+
    choiceGroup("Frequenza","frequency",[["1","1× settimana"],["2","2× settimana"]],"2")+
    '<div id="memberDayGroup" style="display:none">'+choiceGroup("Giorno","day",[["Martedì","Martedì"],["Giovedì","Giovedì"]],"Martedì")+'</div>'+
    choiceGroup("Pacchetto","plan",[["Annuale","Annuale"],["3 rate","3 rate"],["Mese di prova","Mese di prova"]],"Annuale")+
    choiceGroup("Pagamento","payment",[["No","Non pagato"],["Sì","Pagato ora"]],"No")+
    '<div id="memberMethodGroup" style="display:none">'+choiceGroup("Metodo","method",[["Contanti","Contanti"],["Bonifico","Bonifico"],["PayPal","PayPal"],["Altro","Altro"]],"Contanti")+'</div>';
  openModal({id:"memberModal",eyebrow:"NUOVO ISCRITTO",title:"Aggiungi persona",body,actions:'<button class="primary modal-save" onclick="saveMember()">SALVA ISCRITTO</button>'});
}
function choiceGroup(label,group,items,selected){
  return '<div class="choice-section"><div class="field-label">'+label+'</div><div class="choice-grid">'+items.map(x=>'<button type="button" class="choice-btn '+(x[0]===selected?"selected":"")+'" data-group="'+group+'" data-value="'+x[0]+'" onclick="chooseMemberOption(\''+group+'\',\''+x[0]+'\',this)">'+x[1]+'</button>').join("")+'</div></div>';
}
function chooseMemberOption(group,value,btn){
  memberDraft[group]=value;
  document.querySelectorAll('[data-group="'+group+'"]').forEach(x=>x.classList.remove("selected"));
  btn.classList.add("selected");
  if(group==="frequency"){
    const g=document.querySelector("#memberDayGroup");
    g.style.display=value==="1"?"block":"none";
    memberDraft.day=value==="1"?"Martedì":"Martedì+Giovedì";
  }
  if(group==="payment"){
    document.querySelector("#memberMethodGroup").style.display=value==="Sì"?"block":"none";
  }
}
function closeMemberModal(){closeModal("memberModal")}
function memberAmount(){
  const f=memberDraft.frequency, p=memberDraft.plan;
  if(p==="Annuale")return f==="2"?480:290;
  if(p==="3 rate")return f==="2"?165:110;
  return f==="2"?60:45;
}
async function saveMember(){
  const name=document.querySelector("#memberName").value.trim();
  const age=Number(document.querySelector("#memberAge").value);
  if(!name){showError("Inserisci nome e cognome.","Dato mancante");return}
  const frequency=memberDraft.frequency==="2"?"2x/settimana - Martedì+Giovedì":"1x/settimana - "+memberDraft.day;
  const saveBtn=document.querySelector(".modal-save");
  saveBtn.disabled=true;saveBtn.textContent="SALVATAGGIO…";
  try{
    const out=await api("walkIn",{name,age,plan:memberDraft.plan,frequency});
    if(memberDraft.payment==="Sì"){
      await api("recordPayment",{personId:out.personId,name,type:memberDraft.plan,amount:memberAmount(),method:memberDraft.method,invoiced:"No"});
    }
    closeMemberModal();
    toast("Iscritto aggiunto");
    await loadAll();
    state.view="members";render();
  }catch(e){
    saveBtn.disabled=false;saveBtn.textContent="SALVA ISCRITTO";
    showError(e.message,"Iscritto non salvato");
  }
}
let paymentDraft={method:"Contanti"};
function paymentChoiceGroup(items,selected){return '<div class="choice-section"><div class="field-label">Metodo</div><div class="choice-grid">'+items.map(x=>'<button type="button" class="choice-btn '+(x===selected?'selected':'')+'" data-payment-method="'+esc(x)+'" onclick="choosePaymentMethod(\''+x+'\',this)">'+esc(x)+'</button>').join('')+'</div></div>'}
function choosePaymentMethod(value,btn){paymentDraft.method=value;document.querySelectorAll('[data-payment-method]').forEach(x=>x.classList.remove('selected'));btn.classList.add('selected')}
function newPayment(personId){
  paymentDraft={method:"Contanti"};
  const members=(state.members||[]).filter(x=>(x.status||"Attivo")==="Attivo");
  const options=members.map(m=>'<option value="'+esc(m.id)+'" '+(m.id===personId?'selected':'')+'>'+esc(m.name)+'</option>').join('');
  const body='<label class="field-label" for="paymentMember">Iscritto</label><select id="paymentMember" class="big-select" '+(personId?'':'autofocus')+'><option value="">Seleziona una persona</option>'+options+'</select>'+
    '<label class="field-label" for="paymentAmount">Importo in euro</label><input id="paymentAmount" class="big-input" type="number" min="1" step="0.01" inputmode="decimal" value="110" '+(personId?'autofocus':'')+'>'+
    '<label class="field-label" for="paymentType">Tipo pagamento</label><input id="paymentType" class="big-input" value="Rata" placeholder="Es. Rata, Annuale, Mese di prova">'+
    paymentChoiceGroup(["Contanti","Bonifico","PayPal","Altro"],"Contanti")+
    '<label class="field-label" for="paymentInstallment">Periodo / rata <span class="optional">opzionale</span></label><input id="paymentInstallment" class="big-input" placeholder="Es. Prima rata">';
  openModal({id:"paymentModal",eyebrow:"PAGAMENTO",title:"Registra pagamento",body,actions:'<button class="secondary" onclick="closeModal(\'paymentModal\')">ANNULLA</button><button class="primary payment-save" onclick="savePayment()">REGISTRA</button>'});
}
async function savePayment(){
  const personId=document.querySelector("#paymentMember")?.value;
  const member=state.members.find(x=>x.id===personId);
  const amount=Number(document.querySelector("#paymentAmount")?.value);
  const type=document.querySelector("#paymentType")?.value.trim()||"Pagamento";
  const installment=document.querySelector("#paymentInstallment")?.value.trim()||"";
  if(!member){showError("Seleziona un iscritto.","Dato mancante");return}
  if(!amount||amount<=0){showError("Inserisci un importo valido.","Dato mancante");return}
  const btn=document.querySelector(".payment-save");btn.disabled=true;btn.textContent="SALVATAGGIO…";
  try{await api("recordPayment",{personId:member.id,name:member.name,type,amount,method:paymentDraft.method,installment,invoiced:"No"});closeModal("paymentModal");toast("Pagamento registrato");await loadAll()}catch(e){btn.disabled=false;btn.textContent="REGISTRA";showError(e.message,"Pagamento non registrato")}
}
function memberDetail(id){
  const m=state.members.find(x=>x.id===id);
  if(!m)return;
  const value=v=>v&&String(v).trim()?esc(v):"—";
  const body='<div class="detail-grid">'+
      '<div class="detail-item"><span>Età</span><strong>'+value(m.age)+'</strong></div>'+
      '<div class="detail-item"><span>Stato</span><strong>'+value(m.status)+'</strong></div>'+
      '<div class="detail-item"><span>Pacchetto</span><strong>'+value(m.plan)+'</strong></div>'+
      '<div class="detail-item"><span>Frequenza</span><strong>'+value(m.frequency)+'</strong></div>'+
      '<div class="detail-item"><span>Ultima presenza</span><strong>'+(m.lastAttendance?esc(fmtDate(m.lastAttendance)):"—")+'</strong></div>'+
      '<div class="detail-item"><span>Rischio drop</span><strong>'+value(m.risk)+'</strong></div>'+
      '<div class="detail-item wide"><span>Telefono</span><strong>'+value(m.phone)+'</strong></div>'+
      '<div class="detail-item wide"><span>Email</span><strong>'+value(m.email)+'</strong></div>'+
    '</div>';
  const actions=m.status==="Eliminato"
    ? '<button class="secondary" onclick="editMember(\''+esc(m.id)+'\')">MODIFICA</button><button class="primary" onclick="closeMemberDetail();restoreMember(\''+esc(m.id)+'\')">RIPRISTINA</button>'
    : '<button class="secondary" onclick="editMember(\''+esc(m.id)+'\')">MODIFICA</button><button class="primary" onclick="detailPayment(\''+esc(m.id)+'\')">PAGAMENTO</button>';
  openModal({id:"memberDetailModal",eyebrow:"DETTAGLI ISCRITTO",title:esc(m.name),body,actions});
}
function closeMemberDetail(){closeModal("memberDetailModal")}
function detailPayment(id){closeMemberDetail();newPayment(id)}
let editDraft={frequency:"2",day:"Martedì+Giovedì",plan:"Annuale",status:"Attivo"};
function parseFrequency(value){const f=String(value||"").toLowerCase();if(f.includes("2"))return{frequency:"2",day:"Martedì+Giovedì"};return{frequency:"1",day:f.includes("giov")?"Giovedì":"Martedì"}}
function editMember(id){
  const m=state.members.find(x=>x.id===id);if(!m)return;
  const parsed=parseFrequency(m.frequency);editDraft={id,frequency:parsed.frequency,day:parsed.day,plan:m.plan||"Annuale",status:m.status||"Attivo"};
  const body='<label class="field-label">Nome e cognome</label><input id="editName" class="big-input" value="'+esc(m.name)+'" autocomplete="name" autofocus>'+
    '<label class="field-label">Età</label><input id="editAge" class="big-input" type="number" min="18" max="120" inputmode="numeric" value="'+esc(m.age||"")+'">'+
    '<label class="field-label">Telefono</label><input id="editPhone" class="big-input" type="tel" autocomplete="tel" value="'+esc(m.phone||"")+'">'+
    '<label class="field-label">Email</label><input id="editEmail" class="big-input" type="email" autocomplete="email" value="'+esc(m.email||"")+'">'+
    editChoiceGroup("Frequenza","frequency",[["1","1× settimana"],["2","2× settimana"]],editDraft.frequency)+
    '<div id="editDayGroup" style="display:'+(editDraft.frequency==="1"?'block':'none')+'">'+editChoiceGroup("Giorno","day",[["Martedì","Martedì"],["Giovedì","Giovedì"]],editDraft.day)+'</div>'+
    editChoiceGroup("Pacchetto","plan",[["Annuale","Annuale"],["3 rate","3 rate"],["Mese di prova","Mese di prova"]],editDraft.plan)+
    editChoiceGroup("Stato","status",[["Attivo","Attivo"],["Sospeso","Sospeso"],["Uscito","Uscito"],["Eliminato","Elimina"]],editDraft.status);
  openModal({id:"memberEditModal",eyebrow:"MODIFICA ISCRITTO",title:esc(m.name),body,actions:'<button class="secondary" onclick="closeModal(\'memberEditModal\')">ANNULLA</button><button class="primary edit-save" onclick="saveMemberEdit()">SALVA</button>'});
}
function editChoiceGroup(label,group,items,selected){return '<div class="choice-section"><div class="field-label">'+label+'</div><div class="choice-grid">'+items.map(x=>'<button type="button" class="choice-btn '+(x[0]===selected?'selected':'')+'" data-edit-group="'+group+'" onclick="chooseEditOption(\''+group+'\',\''+x[0]+'\',this)">'+x[1]+'</button>').join('')+'</div></div>'}
function chooseEditOption(group,value,btn){editDraft[group]=value;document.querySelectorAll('[data-edit-group="'+group+'"]').forEach(x=>x.classList.remove('selected'));btn.classList.add('selected');if(group==="frequency"){document.querySelector("#editDayGroup").style.display=value==="1"?"block":"none";editDraft.day=value==="1"?"Martedì":"Martedì+Giovedì"}}
async function setMemberStatusRobust(personId,status){
  try{
    return await api("setMemberStatus",{personId,status});
  }catch(e){
    const msg=String(e&&e.message||e||"");
    if(!/load failed|failed to fetch|networkerror|network request failed/i.test(msg))throw e;

    const payload=JSON.stringify({token:token(),action:"setMemberStatus",data:{personId,status}});
    let queued=false;

    if(navigator.sendBeacon){
      try{
        queued=navigator.sendBeacon(
          backend(),
          new Blob([payload],{type:"text/plain;charset=UTF-8"})
        );
      }catch(_){}
    }

    if(!queued){
      try{
        await fetch(backend(),{
          method:"POST",
          mode:"no-cors",
          cache:"no-store",
          credentials:"omit",
          body:payload
        });
        queued=true;
      }catch(_){}
    }

    if(!queued)throw e;

    await new Promise(r=>setTimeout(r,1400));

    try{
      const fresh=await api("bootstrap");
      const member=(fresh.members||[]).find(x=>x.id===personId);
      if(!member||member.status!==status)throw new Error("Aggiornamento non confermato dal backend.");
      Object.assign(state,fresh);
    }catch(verifyErr){
      const verifyMsg=String(verifyErr&&verifyErr.message||verifyErr||"");
      if(!/load failed|failed to fetch|networkerror|network request failed/i.test(verifyMsg))throw verifyErr;
      const localMember=(state.members||[]).find(x=>x.id===personId);
      if(localMember)localMember.status=status;
    }

    return {ok:true};
  }
}

async function saveMemberEdit(){
  const name=document.querySelector("#editName")?.value.trim(),age=Number(document.querySelector("#editAge")?.value),phone=document.querySelector("#editPhone")?.value.trim(),email=document.querySelector("#editEmail")?.value.trim();
  if(!name){showError("Inserisci nome e cognome.","Dato mancante");return}
  const frequency=editDraft.frequency==="2"?"2x/settimana - Martedì+Giovedì":"1x/settimana - "+editDraft.day;
  const btn=document.querySelector(".edit-save");btn.disabled=true;btn.textContent="SALVATAGGIO…";
  try{
    if(editDraft.status==="Eliminato"){
      await setMemberStatusRobust(editDraft.id,"Eliminato");
    }else{
      await api("updateMember",{personId:editDraft.id,name,age,phone,email,frequency,plan:editDraft.plan,status:editDraft.status});
    }
    closeModal("memberEditModal");
    toast(editDraft.status==="Eliminato"?"Studente eliminato":"Dati aggiornati");
    await loadAll();
    state.view="members";
    render();
  }catch(e){
    btn.disabled=false;
    btn.textContent="SALVA";
    showError(e.message,"Dati non aggiornati");
  }
}

function restoreMember(id){
  const m=state.members.find(x=>x.id===id);if(!m)return;
  showConfirm({
    eyebrow:"ARCHIVIO STUDENTI",
    title:"Ripristina "+m.name,
    message:"Lo studente tornerà nella lista degli iscritti con stato Attivo. Tutti i dati storici restano invariati.",
    confirmLabel:"RIPRISTINA",
    onConfirm:async()=>{
      try{
        await api("setMemberStatus",{personId:id,status:"Attivo"});
        toast("Studente ripristinato");
        await loadAll();
        state.view="members";render();
      }catch(e){showError(e.message,"Ripristino non riuscito")}
    }
  });
}

if("serviceWorker"in navigator)window.addEventListener("load",()=>navigator.serviceWorker.register("sw.js").catch(()=>{}));
loadAll();
