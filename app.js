const CONFIG={VERSION:"0.8.2",OWNER:"riccardo.calli@gmail.com",DEFAULT_API:"https://script.google.com/macros/s/AKfycbyy-lBBedchYGG4Ob-oqLJCeFjvkEswzEH9XV8kNGIYpXAEIAKKB-8-s6N5OB4f6I1d/exec",ENROLLMENT_FORM:"https://form.jotform.com/262643062831050",SEASON_START:"2026-10-01",SEASON_END:"2027-06-09"};
const now=new Date();
const state={view:"home",today:null,trials:[],members:[],payments:[],lessons:[],dashboard:null,monthYear:now.getFullYear(),monthIndex:now.getMonth(),selectedDate:null};
const memberDirectory={filter:"Attivo",query:""};
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
    Object.assign(state,{today:null,trials:[],members:[],payments:[],lessons:[],dashboard:null});
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
  const todayById=(key===todayKey()&&state.today)?new Map((state.today.members||[]).map(x=>[x.id,x])):null;
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
    if(cp!==null)m.present=cp;
    else if(todayById&&todayById.has(m.id))m.present=!!todayById.get(m.id).present;
    else m.present=false;
    return m;
  });
}
function lessonDetail(){
  const key=state.selectedDate;
  if(!key)return "";
  const trials=trialsFor(key).map(t=>{
    const cp=cachedPresence(key,t.id);
    if(cp!==null)t.present=cp;
    return t;
  });
  const members=expectedMembersForSelectedDate(key);
  let html='<section class="section"><div class="card"><div class="card-row"><div><div class="card-title">'+esc(fmtDate(key))+'</div><div class="card-sub">19:00–20:30 · La Cittadella della Stanga · '+members.length+' iscritti previsti · '+trials.length+' prove</div><div class="card-sub"><a href="https://maps.app.goo.gl/G5zFoprsZqDC37xw6" target="_blank" rel="noopener">Apri su Google Maps</a></div></div><span class="badge ok">LEZIONE</span></div></div>';
  html+=personSection("ISCRITTI PREVISTI",members,false);
  if(trials.length){
    html+='<div class="section-head"><h2>IN PROVA</h2><span class="badge trial">'+trials.length+'</span></div>';
    html+=trials.map(t=>'<button class="person '+(t.present?"present":"")+'" onclick="togglePresence(\''+esc(t.id)+'\',\'trial\')"><span class="avatar">'+initials(t.name)+'</span><span class="person-main"><span class="person-name">'+esc(t.name)+'</span><span class="person-sub">'+(t.age||"—")+' anni · PROVA</span></span><span class="tick">✓</span></button>').join("");
  }
  html+='<div class="actions grid2"><button class="secondary" onclick="openAddPresence()">+ AGGIUNGI PRESENZA</button><button class="secondary" onclick="openDidacticsNote(\''+key+'\')">DIDATTICA</button></div>';
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
function memberStatusClass(status){return status==="Eliminato"||status==="Uscito"?"danger":status==="Sospeso"?"trial":"ok"}
function memberPlanShort(p){
  const plan=String(p.plan||"").toLowerCase();
  const freq=String(p.frequency||"").toLowerCase();
  const freqLabel=freq.includes("2")?"2×":freq.includes("giov")?"1× Gio":freq.includes("mart")?"1× Mar":"1×";
  let planLabel="Piano non impostato";
  if(plan.includes("annuale"))planLabel="Annuale";
  else if(plan.includes("3 rate"))planLabel="3 rate";
  else if(plan.includes("mese di prova"))planLabel="Mese prova";
  return freqLabel+" · "+planLabel;
}
function memberRowHtml(p){
  const search=[p.name,p.status,p.plan,p.frequency].filter(Boolean).join(" ").toLowerCase();
  const freq=String(p.frequency||"").toLowerCase();
  const freqKey=freq.includes("2")?"2x":"1x";
  return '<button class="member-row" data-member-row data-status="'+esc(p.status||"Attivo")+'" data-frequency="'+freqKey+'" data-search="'+esc(search)+'" onclick="memberDetail(\''+esc(p.id)+'\')">'+
    '<span class="member-row-main"><span class="person-name">'+esc(p.name)+'</span><span class="person-sub">'+esc(memberPlanShort(p))+'</span></span>'+
    '<span class="member-row-end"><span class="member-status-dot '+memberStatusClass(p.status)+'" aria-hidden="true"></span><span class="member-status-text">'+esc(p.status||"Attivo")+'</span><span class="member-chevron" aria-hidden="true">›</span></span></button>';
}
function memberFilterCounts(rows){return{
  all:rows.filter(x=>x.status!=="Eliminato").length,
  Attivo:rows.filter(x=>(x.status||"Attivo")==="Attivo").length,
  "1x":rows.filter(x=>(x.status||"Attivo")==="Attivo"&&!String(x.frequency||"").toLowerCase().includes("2")).length,
  "2x":rows.filter(x=>(x.status||"Attivo")==="Attivo"&&String(x.frequency||"").toLowerCase().includes("2")).length,
  inactive:rows.filter(x=>x.status==="Sospeso"||x.status==="Uscito").length,
  Eliminato:rows.filter(x=>x.status==="Eliminato").length
}}
function memberFilterButton(value,label,count){return '<button type="button" class="member-filter '+(memberDirectory.filter===value?'selected':'')+'" data-member-filter="'+value+'" onclick="setMemberFilter(\''+value+'\')">'+label+' <span>'+count+'</span></button>'}
function applyMemberDirectory(){
  const query=memberDirectory.query.trim().toLowerCase();
  let visible=0;
  document.querySelectorAll("[data-member-row]").forEach(row=>{
    const status=row.dataset.status||"Attivo";
    const freq=row.dataset.frequency||"1x";
    let filterMatches=false;
    if(memberDirectory.filter==="all")filterMatches=status!=="Eliminato";
    else if(memberDirectory.filter==="Attivo")filterMatches=status==="Attivo";
    else if(memberDirectory.filter==="1x"||memberDirectory.filter==="2x")filterMatches=status==="Attivo"&&freq===memberDirectory.filter;
    else if(memberDirectory.filter==="inactive")filterMatches=status==="Sospeso"||status==="Uscito";
    else if(memberDirectory.filter==="Eliminato")filterMatches=status==="Eliminato";
    const queryMatches=!query||(row.dataset.search||"").includes(query);
    row.hidden=!(filterMatches&&queryMatches);
    if(!row.hidden)visible++;
  });
  const empty=document.querySelector("#memberListEmpty");
  if(empty)empty.hidden=visible>0;
  document.querySelectorAll("[data-member-filter]").forEach(btn=>btn.classList.toggle("selected",btn.dataset.memberFilter===memberDirectory.filter));
}
function setMemberFilter(value){memberDirectory.filter=value;applyMemberDirectory()}
function searchMembers(value){memberDirectory.query=value;applyMemberDirectory()}
function renderMembers(){
  titleEl.textContent="Iscritti";
  if(!backend()||!token()){viewEl.innerHTML=connectionCard();return}
  const rows=[...(state.members||[])].sort((a,b)=>String(a.name||"").localeCompare(String(b.name||""),"it",{sensitivity:"base"}));
  const counts=memberFilterCounts(rows);
  viewEl.innerHTML='<div class="member-toolbar"><label class="member-search"><span aria-hidden="true">⌕</span><input placeholder="Cerca iscritto…" value="'+esc(memberDirectory.query)+'" oninput="searchMembers(this.value)"></label><button class="primary member-add" onclick="newMember()">+ NUOVO</button></div>'+
    '<div class="member-filters" aria-label="Filtra iscritti">'+
      memberFilterButton("Attivo","Attivi",counts.Attivo)+memberFilterButton("1x","1×",counts["1x"])+memberFilterButton("2x","2×",counts["2x"])+memberFilterButton("all","Tutti",counts.all)+memberFilterButton("inactive","Usciti / sospesi",counts.inactive)+memberFilterButton("Eliminato","Eliminati",counts.Eliminato)+
    '</div><div class="member-list" aria-label="Elenco iscritti">'+rows.map(memberRowHtml).join("")+'<div id="memberListEmpty" class="empty member-empty">Nessun iscritto corrisponde alla ricerca.</div></div>';
  applyMemberDirectory();
}
function renderPayments(){
  titleEl.textContent="Pagamenti";
  if(!backend()||!token()){viewEl.innerHTML=connectionCard();return}
  viewEl.innerHTML='<button class="primary" onclick="newPayment()">+ REGISTRA PAGAMENTO</button><section class="section"><div class="section-head"><h2>Ultimi pagamenti</h2></div>'+
  (state.payments?.length?state.payments.map(x=>'<div class="card"><div class="card-row"><div><div class="card-title">'+esc(x.name)+'</div><div class="card-sub">'+fmtDate(x.date)+' · '+esc(x.method||"")+'</div></div><strong>'+money(x.amount)+'</strong></div></div>').join(""):'<div class="empty">Nessun pagamento registrato.</div>')+'</section>';
}
function lessonNoteCard(x){
  const today=todayKey(),label=x.date===today?"OGGI":x.date>today?"PROGRAMMATA":"SVOLTA";
  return '<article id="didactics-'+esc(x.date)+'" class="lesson-note-card didacticsCard" data-search="'+esc((x.date+' '+x.didactics).toLowerCase())+'"><header class="lesson-note-head"><span><strong>'+esc(fmtDate(x.date))+'</strong><small>'+(x.spot?esc(x.spot):"Lezione Parkour")+'</small></span><span class="badge '+(x.date>=today?'trial':'ok')+'">'+label+'</span></header><div class="lesson-note-body">'+esc(x.didactics)+'</div><button class="lesson-note-edit" onclick="openDidacticsNote(\''+esc(x.date)+'\')">MODIFICA LEZIONE <span aria-hidden="true">›</span></button></article>';
}
function lessonDateIndex(rows){return rows.length?'<nav class="didactics-index" aria-label="Vai a una lezione"><span>VAI A</span>'+rows.map(x=>'<button onclick="scrollToDidactics(\''+esc(x.date)+'\')">'+esc(new Intl.DateTimeFormat("it-IT",{day:"numeric",month:"short"}).format(new Date(x.date+"T12:00:00")))+'</button>').join("")+'</nav>':''}
function scrollToDidactics(date){document.querySelector("#didactics-"+date)?.scrollIntoView({behavior:"smooth",block:"start"})}
function lessonNoteSection(title,rows,{history=false}={}){return rows.length?'<section class="didactics-section '+(history?'didactics-history':'')+'"><div class="section-head didactics-section-head"><div><h2>'+title+'</h2>'+(history?'<small>Testo completo · lezioni più recenti prima</small>':'')+'</div><span class="badge ok">'+rows.length+'</span></div>'+(history?lessonDateIndex(rows.slice(0,10)):'')+'<div class="didactics-list">'+rows.map(lessonNoteCard).join("")+'</div></section>':''}
function renderDidactics(){
  titleEl.textContent="Didattica";
  if(!backend()||!token()){viewEl.innerHTML=connectionCard();return}
  const today=todayKey();
  const rows=(state.lessons||[]).filter(x=>String(x.didactics||"").trim());
  const upcoming=rows.filter(x=>x.date>=today).sort((a,b)=>a.date.localeCompare(b.date));
  const history=rows.filter(x=>x.date<today).sort((a,b)=>b.date.localeCompare(a.date));
  viewEl.innerHTML='<button class="primary" onclick="openDidacticsNote()">+ PROGRAMMA LEZIONE</button><div style="height:12px"></div><input class="search" placeholder="Cerca nella didattica…" oninput="filterCards(this.value,\'didacticsCard\')">'+
    (rows.length?lessonNoteSection("PROSSIME LEZIONI",upcoming)+lessonNoteSection("LEZIONI PRECEDENTI",history,{history:true}):'<div class="empty didactics-empty"><strong>Nessuna didattica salvata</strong><span>Programma la prima lezione mantenendo lo stesso formato libero che usi nelle Note.</span></div>');
}
function renderDashboard(){
  titleEl.textContent="Dashboard";
  if(!backend()||!token()){viewEl.innerHTML=connectionCard();return}
  const d=state.dashboard||{};
  const course=[["Iscritti attivi",d.activeMembers??"—"],["2× a settimana",d.membersTwiceWeekly??"—"],["1× a settimana",d.membersOnceWeekly??"—"],["Prove prenotate",d.bookings??"—"]];
  const finance=[["Incasso stagione",d.revenue!=null?money(d.revenue):"—","Totale registrato","total"],["Incasso mese corrente",d.currentMonthRevenue!=null?money(d.currentMonthRevenue):"—",""],["Media mensile",d.averageMonthlyRevenue!=null?money(d.averageMonthlyRevenue):"—","Totale ÷ 9 mesi"],["Netto stimato",d.netRevenue!=null?money(d.netRevenue):"—","67% del totale"],["Tasse stimate",d.taxRevenue!=null?money(d.taxRevenue):"—","33% del totale"]];
  const cards=items=>items.map(x=>'<div class="kpi dashboard-kpi '+(x[3]==="total"?'dashboard-total':'')+'"><strong>'+x[1]+'</strong><span>'+x[0]+'</span>'+(x[2]?'<small>'+x[2]+'</small>':'')+'</div>').join("");
  viewEl.innerHTML='<section class="dashboard-section"><div class="section-head"><h2>Corso</h2></div><div class="dashboard-grid">'+cards(course)+'</div></section><section class="dashboard-section"><div class="section-head"><h2>Economia</h2></div><div class="dashboard-grid dashboard-finance">'+cards(finance)+'</div></section><div class="actions"><button class="secondary" onclick="disconnectBackend()">DISCONNETTI QUESTO DISPOSITIVO</button></div>';
}
function filterCards(q,cls){q=q.toLowerCase();document.querySelectorAll("."+cls).forEach(el=>el.style.display=(el.dataset.search||"").includes(q)?"":"none")}
async function loadAll(){viewEl.innerHTML='<div class="skeleton"></div>';try{if(backend()&&token())Object.assign(state,await api("bootstrap"))}catch(e){showError(e.message,"Dati non caricati")}render()}
function render(){document.querySelectorAll(".nav-item").forEach(b=>b.classList.toggle("active",b.dataset.view===state.view));({home:renderHome,trials:renderTrials,members:renderMembers,payments:renderPayments,didactics:renderDidactics,dashboard:renderDashboard}[state.view])()}
document.querySelectorAll(".nav-item").forEach(b=>b.addEventListener("click",()=>{state.view=b.dataset.view;render()}));$("#syncBtn").addEventListener("click",loadAll);

function nextCourseDate(){
  const d=new Date(),seasonStart=new Date(CONFIG.SEASON_START+"T12:00:00");d.setHours(12,0,0,0);
  if(d<seasonStart)d.setTime(seasonStart.getTime());
  for(let i=0;i<8;i++){if(courseDay(d))return dateKey(d);d.setDate(d.getDate()+1)}
  return todayKey();
}
function openDidacticsNote(date=""){
  const selected=date||nextCourseDate();
  const lesson=(state.lessons||[]).find(x=>x.date===selected);
  const body='<label class="field-label" for="didacticsDate">Data lezione</label><input id="didacticsDate" class="big-input" type="date" value="'+esc(selected)+'" '+(date?'disabled':'')+'>'+
    '<div class="didactics-tools"><button type="button" class="choice-btn" onclick="insertDidacticsTemplate()">STRUTTURA BASE</button><button type="button" class="choice-btn" onclick="copyPreviousDidactics()">COPIA PRECEDENTE</button></div>'+
    '<label class="field-label" for="didacticsNotes">Programma e note</label><textarea id="didacticsNotes" class="big-input didactics-textarea" placeholder="– Riscaldamento&#10;  esercizi e quantità&#10;&#10;– Tecnica&#10;  progressioni e obiettivi&#10;&#10;– Applicazione&#10;  giochi o circuiti&#10;&#10;– Relax finale" autofocus>'+esc(lesson?.didactics||"")+'</textarea>';
  openModal({id:"didacticsModal",className:"didactics-modal",eyebrow:lesson?"MODIFICA DIDATTICA":"NUOVA DIDATTICA",title:lesson?esc(fmtDate(selected)):"Programma lezione",body,actions:'<button class="secondary" onclick="closeModal(\'didacticsModal\')">ANNULLA</button><button class="primary didactics-save" onclick="saveDidacticsNote()">SALVA</button>'});
}
function insertDidacticsTemplate(){
  const field=document.querySelector("#didacticsNotes");if(!field)return;
  const template="– Riscaldamento\n  \n\n– Tecnica\n  \n\n– Applicazione\n  \n\n– Relax finale\n  ";
  field.value=field.value.trim()?field.value.trim()+"\n\n"+template:template;field.focus();
}
function copyPreviousDidactics(){
  const date=document.querySelector("#didacticsDate")?.value||todayKey();
  const previous=(state.lessons||[]).filter(x=>x.date<date&&String(x.didactics||"").trim()).sort((a,b)=>b.date.localeCompare(a.date))[0];
  if(!previous){toast("Nessuna didattica precedente");return}
  const field=document.querySelector("#didacticsNotes");if(field){field.value=previous.didactics;field.focus()}
}
async function saveDidacticsNote(){
  const lessonDate=document.querySelector("#didacticsDate")?.value,notes=document.querySelector("#didacticsNotes")?.value.trim();
  if(!lessonDate){toast("Seleziona la data della lezione");document.querySelector("#didacticsDate")?.focus();return}
  if(!notes){toast("Inserisci il programma della lezione");document.querySelector("#didacticsNotes")?.focus();return}
  const btn=document.querySelector(".didactics-save");btn.disabled=true;btn.textContent="SALVATAGGIO…";
  try{
    await api("saveLessonDidactics",{lessonDate,notes});
    const existing=(state.lessons||[]).find(x=>x.date===lessonDate);
    if(existing)existing.didactics=notes;else state.lessons.push({date:lessonDate,didactics:notes,status:"Aperta"});
    closeModal("didacticsModal");state.view="didactics";renderDidactics();toast("Didattica salvata");
  }catch(e){btn.disabled=false;btn.textContent="SALVA";toast("Didattica non salvata: "+e.message)}
}

const presencePending=new Map();
let presenceSaving=false;
let presenceFlushWaiters=[];

function presenceKey(p){return [p.lessonDate,p.type,p.personId||p.id].join("|")}

async function savePresenceRobust(payload){
  try{
    return await api("setPresence",payload);
  }catch(e){
    const msg=String(e&&e.message||e||"");
    if(!/load failed|failed to fetch|networkerror|network request failed/i.test(msg))throw e;
    const body=JSON.stringify({token:token(),action:"setPresence",data:payload});
    let queued=false;
    if(navigator.sendBeacon){
      try{queued=navigator.sendBeacon(backend(),new Blob([body],{type:"text/plain;charset=UTF-8"}))}catch(_){}
    }
    if(!queued){
      try{
        await fetch(backend(),{method:"POST",mode:"no-cors",cache:"no-store",credentials:"omit",body});
        queued=true;
      }catch(_){}
    }
    if(!queued)throw e;
    await new Promise(r=>setTimeout(r,650));
    return {ok:true,queued:true};
  }
}

function enqueuePresenceSave(payload){
  presencePending.set(presenceKey(payload),payload);
  processPresenceQueue();
}

async function processPresenceQueue(){
  if(presenceSaving)return;
  presenceSaving=true;
  while(presencePending.size){
    const first=presencePending.entries().next().value;
    const key=first[0],payload=first[1];
    presencePending.delete(key);
    try{
      await savePresenceRobust(payload);
    }catch(e){
      presencePending.set(key,payload);
      await new Promise(r=>setTimeout(r,900));
      break;
    }
  }
  presenceSaving=false;
  if(!presencePending.size){
    const waiters=presenceFlushWaiters.splice(0);
    waiters.forEach(fn=>fn());
  }else{
    setTimeout(processPresenceQueue,700);
  }
}

function flushPresenceQueue(){
  if(!presenceSaving&&!presencePending.size)return Promise.resolve();
  return new Promise(resolve=>presenceFlushWaiters.push(resolve));
}

function togglePresence(id,type){
  const p=type==="trial"?state.trials.find(x=>x.id===id):state.members.find(x=>x.id===id);
  if(!p)return;
  const lessonDate=state.selectedDate||todayKey();
  const next=!p.present;
  p.present=next;
  setCachedPresence(lessonDate,id,next);
  setLessonConfirmed(lessonDate,false);
  renderHome();
  enqueuePresenceSave({id,personId:type==="trial"?(p.personId||id):id,type,lessonDate,present:next});
}
async function forceAbsent(entity,type,date){
  const payload={id:entity.id,personId:type==="trial"?(entity.personId||entity.id):entity.id,type,lessonDate:date,present:false};
  setCachedPresence(date,entity.id,false);
  enqueuePresenceSave(payload);
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
  toast("Lezione confermata · sincronizzazione in corso");
  try{
    absent.forEach(x=>forceAbsent(x.entity,x.type,key));
    await flushPresenceQueue();
    try{
      await api("closeLesson",{lessonDate:key});
    }catch(e){
      const msg=String(e&&e.message||e||"");
      if(!/load failed|failed to fetch|networkerror|network request failed/i.test(msg))throw e;
      const body=JSON.stringify({token:token(),action:"closeLesson",data:{lessonDate:key}});
      let queued=false;
      if(navigator.sendBeacon){
        try{queued=navigator.sendBeacon(backend(),new Blob([body],{type:"text/plain;charset=UTF-8"}))}catch(_){}
      }
      if(!queued)await fetch(backend(),{method:"POST",mode:"no-cors",cache:"no-store",credentials:"omit",body});
    }
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
function addExtraPresence(id){
  const p=state.members.find(x=>x.id===id);if(!p)return;
  const key=state.selectedDate||todayKey();
  setExtraId(key,id,true);
  setCachedPresence(key,id,true);
  p.present=true;p.extra=true;
  setLessonConfirmed(key,false);
  closePresenceModal();
  renderHome();
  enqueuePresenceSave({id,personId:id,type:"member",lessonDate:key,present:true});
  toast(p.name+" aggiunto");
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
    editChoiceGroup("Stato","status",[["Attivo","Attivo"],["Sospeso","Sospeso"],["Uscito","Uscito"]],editDraft.status)+
    (m.status!=="Eliminato"?'<button type="button" class="member-delete" onclick="confirmMemberDelete(\''+esc(m.id)+'\')">ELIMINA ISCRITTO</button>':'');
  openModal({id:"memberEditModal",eyebrow:"MODIFICA ISCRITTO",title:esc(m.name),body,actions:'<button class="secondary" onclick="closeModal(\'memberEditModal\')">ANNULLA</button><button class="primary edit-save" onclick="saveMemberEdit()">SALVA</button>'});
}
function editChoiceGroup(label,group,items,selected){return '<div class="choice-section"><div class="field-label">'+label+'</div><div class="choice-grid">'+items.map(x=>'<button type="button" class="choice-btn '+(x[0]===selected?'selected':'')+'" data-edit-group="'+group+'" onclick="chooseEditOption(\''+group+'\',\''+x[0]+'\',this)">'+x[1]+'</button>').join('')+'</div></div>'}
function chooseEditOption(group,value,btn){editDraft[group]=value;document.querySelectorAll('[data-edit-group="'+group+'"]').forEach(x=>x.classList.remove('selected'));btn.classList.add('selected');if(group==="frequency"){document.querySelector("#editDayGroup").style.display=value==="1"?"block":"none";editDraft.day=value==="1"?"Martedì":"Martedì+Giovedì"}}
function sendMemberStatusWrite(personId,status){
  const payload=JSON.stringify({token:token(),action:"setMemberStatus",data:{personId,status}});
  let beaconQueued=false;
  if(navigator.sendBeacon){
    try{beaconQueued=navigator.sendBeacon(backend(),new Blob([payload],{type:"text/plain;charset=UTF-8"}))}catch(_){}
  }
  try{
    fetch(backend(),{
      method:"POST",
      mode:"no-cors",
      cache:"no-store",
      credentials:"omit",
      keepalive:true,
      body:payload
    }).catch(()=>{});
  }catch(_){}
  return beaconQueued;
}
async function setMemberStatusRobust(personId,status){
  const localMember=(state.members||[]).find(x=>x.id===personId);
  if(localMember)localMember.status=status;
  sendMemberStatusWrite(personId,status);
  setTimeout(()=>syncMemberStatusInBackground(personId,status,0),1200);
  return {ok:true,queued:true};
}
async function syncMemberStatusInBackground(personId,status,attempt=0){
  try{
    const fresh=await api("bootstrap");
    const member=(fresh.members||[]).find(x=>x.id===personId);
    if(member?.status===status){
      Object.assign(state,fresh);
      if(state.view==="members")renderMembers();
      return;
    }
  }catch(_){}
  if(attempt<4){
    sendMemberStatusWrite(personId,status);
    setTimeout(()=>syncMemberStatusInBackground(personId,status,attempt+1),1400*(attempt+1));
  }else{
    toast("Modifica salvata localmente · sincronizzazione da verificare");
  }
}

function confirmMemberDelete(id){
  const member=(state.members||[]).find(x=>x.id===id);if(!member)return;
  closeModal("memberEditModal");
  showConfirm({eyebrow:"ARCHIVIO STUDENTI",title:"Elimina "+member.name,message:"Lo studente verrà spostato tra gli eliminati. Pagamenti e presenze resteranno nello storico e potrai ripristinarlo in seguito.",confirmLabel:"ELIMINA",danger:true,onConfirm:()=>deleteMember(id)});
}
async function deleteMember(id){
  const member=(state.members||[]).find(x=>x.id===id);if(!member)return;
  try{
    await setMemberStatusRobust(id,"Eliminato");
    memberDirectory.filter="Attivo";
    renderMembers();
    toast("Studente spostato negli eliminati");
  }catch(e){showError(e.message,"Eliminazione non riuscita")}
}

async function saveMemberEdit(){
  const name=document.querySelector("#editName")?.value.trim(),age=Number(document.querySelector("#editAge")?.value),phone=document.querySelector("#editPhone")?.value.trim(),email=document.querySelector("#editEmail")?.value.trim();
  if(!name){showError("Inserisci nome e cognome.","Dato mancante");return}
  const frequency=editDraft.frequency==="2"?"2x/settimana - Martedì+Giovedì":"1x/settimana - "+editDraft.day;
  const btn=document.querySelector(".edit-save");btn.disabled=true;btn.textContent="SALVATAGGIO…";
  try{
    await api("updateMember",{personId:editDraft.id,name,age,phone,email,frequency,plan:editDraft.plan,status:editDraft.status});
    closeModal("memberEditModal");
    toast("Dati aggiornati");
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
        await setMemberStatusRobust(id,"Attivo");
        memberDirectory.filter="current";
        renderMembers();
        toast("Studente ripristinato");
      }catch(e){showError(e.message,"Ripristino non riuscito")}
    }
  });
}

if("serviceWorker"in navigator)window.addEventListener("load",()=>navigator.serviceWorker.register("sw.js").catch(()=>{}));
loadAll();
