const CONFIG={VERSION:"0.3.0",OWNER:"riccardo.calli@gmail.com",DEFAULT_API:"https://script.google.com/macros/s/AKfycbyy-lBBedchYGG4Ob-oqLJCeFjvkEswzEH9XV8kNGIYpXAEIAKKB-8-s6N5OB4f6I1d/exec"};
const now=new Date();
const state={view:"home",today:null,trials:[],members:[],payments:[],dashboard:null,monthYear:now.getFullYear(),monthIndex:now.getMonth(),selectedDate:null};
const $=s=>document.querySelector(s),viewEl=$("#view"),titleEl=$("#pageTitle"),toastEl=$("#toast");
const backend=()=>localStorage.getItem("parkour_admin_endpoint")||CONFIG.DEFAULT_API;
const token=()=>localStorage.getItem("parkour_admin_token")||"";

function toast(m){toastEl.textContent=m;toastEl.hidden=false;setTimeout(()=>toastEl.hidden=true,2300)}
function esc(s=""){return String(s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[m]))}
function initials(n=""){return n.split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]?.toUpperCase()).join("")||"?"}
function fmtDate(v){if(!v)return"—";const d=new Date(String(v).length===10?v+"T12:00:00":v);return new Intl.DateTimeFormat("it-IT",{weekday:"long",day:"numeric",month:"long",year:"numeric"}).format(d)}
function money(v){return new Intl.NumberFormat("it-IT",{style:"currency",currency:"EUR"}).format(Number(v||0))}
function dateKey(d){const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,"0"),day=String(d.getDate()).padStart(2,"0");return y+"-"+m+"-"+day}
function todayKey(){return dateKey(new Date())}

async function api(action,data={}){
  if(!backend()||!token())throw new Error("Gestionale non collegato");
  const r=await fetch(backend(),{method:"POST",headers:{"Content-Type":"text/plain;charset=utf-8"},body:JSON.stringify({token:token(),action,data})});
  if(!r.ok)throw new Error("Backend non raggiungibile");
  const out=await r.json();
  if(!out.ok)throw new Error(out.error||"Errore backend");
  return out.data??out;
}
function connectBackend(){
  const tk=prompt("Incolla il token amministratore:",token());
  if(!tk)return;
  localStorage.setItem("parkour_admin_token",tk.trim());
  loadAll();
}
function disconnectBackend(){
  if(confirm("Rimuovere il token da questo dispositivo?")){
    localStorage.removeItem("parkour_admin_token");
    Object.assign(state,{today:null,trials:[],members:[],payments:[],dashboard:null});
    render();
  }
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
function lessonDetail(){
  const key=state.selectedDate;
  if(!key)return "";
  const d=new Date(key+"T12:00:00"),trials=trialsFor(key),isToday=key===todayKey()&&state.today;
  let html='<section class="section"><div class="card"><div class="card-row"><div><div class="card-title">'+esc(fmtDate(key))+'</div><div class="card-sub">19:00–20:30 · '+trials.length+' prove prenotate</div></div><span class="badge ok">LEZIONE</span></div></div>';
  if(trials.length){
    html+='<div class="section-head"><h2>Prove prenotate</h2><span class="badge trial">'+trials.length+'</span></div>';
    html+=trials.map(t=>'<div class="card"><div class="card-title">'+esc(t.name)+'</div><div class="card-sub">'+(t.age||"—")+' anni · '+esc(t.status||"Prenotato")+'</div></div>').join("");
  }
  if(isToday){
    const members=state.today.members||[],todaysTrials=state.today.trials||[];
    html+=personSection("ISCRITTI PREVISTI",members,false)+personSection("IN PROVA",todaysTrials,true);
    html+='<div class="empty warning-box">La chiusura automatica della lezione è temporaneamente disattivata finché assegniamo correttamente martedì/giovedì agli iscritti 1× settimana.</div>';
  } else {
    html+='<div class="empty">Puoi consultare la lezione in anticipo. Le presenze verranno gestite dalla Home il giorno della lezione.</div>';
  }
  return html+'</section>';
}
function personSection(title,list,trial){
  return '<section class="section"><div class="section-head"><h2>'+title+'</h2><span class="badge '+(trial?"trial":"ok")+'">'+list.length+'</span></div><div class="person-list">'+
  (list.length?list.map(p=>'<button class="person '+(p.present?"present":"")+'" onclick="togglePresence(\''+esc(p.id)+'\',\''+(trial?"trial":"member")+'\')"><span class="avatar">'+initials(p.name)+'</span><span class="person-main"><span class="person-name">'+esc(p.name)+'</span><span class="person-sub">'+(trial?((p.age||"—")+" anni · PROVA"):esc(p.plan||"Iscritto"))+'</span></span><span class="tick">✓</span></button>').join(""):'<div class="empty">Nessuna persona.</div>')+
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
  (rows.length?rows.map(p=>'<div class="card trialCard" data-search="'+esc((p.name||"").toLowerCase())+'"><div class="card-row"><div><div class="card-title">'+esc(p.name)+'</div><div class="card-sub">'+(p.age||"—")+' anni · '+fmtDate(p.date)+'</div></div><span class="badge '+(p.status==="Presentato"?"ok":"trial")+'">'+esc(p.status||"Prenotato")+'</span></div><div class="actions grid2"><button class="primary" onclick="convertTrial(\''+esc(p.id)+'\')">ISCRIVI</button><button class="secondary" onclick="markTrial(\''+esc(p.id)+'\',\'Non interessato\')">NON INTERESSATO</button></div></div>').join(""):'<div class="empty">Nessuna prova da gestire.</div>');
}
function renderMembers(){
  titleEl.textContent="Iscritti";
  if(!backend()||!token()){viewEl.innerHTML=connectionCard();return}
  const rows=state.members||[];
  viewEl.innerHTML='<button class="primary" onclick="newMember()">+ NUOVO ISCRITTO</button><div style="height:12px"></div><input class="search" placeholder="Cerca un iscritto…" oninput="filterCards(this.value,\'memberCard\')"><div class="section-head"><h2>Iscritti attivi</h2><span class="badge ok">'+rows.filter(x=>x.status==="Attivo").length+'</span></div>'+
  (rows.length?rows.map(p=>'<div class="card memberCard" data-search="'+esc((p.name||"").toLowerCase())+'"><div class="card-row"><div><div class="card-title">'+esc(p.name)+'</div><div class="card-sub">'+esc(p.plan||"Piano non impostato")+' · '+esc(p.frequency||"frequenza non impostata")+'</div></div><span class="badge '+(p.risk==="ALTO"?"danger":"ok")+'">'+esc(p.status||"Attivo")+'</span></div><div class="actions grid2"><button class="primary" onclick="newPayment(\''+esc(p.id)+'\')">PAGAMENTO</button><button class="secondary" onclick="memberDetail(\''+esc(p.id)+'\')">DETTAGLI</button></div></div>').join(""):'<div class="empty">Nessun iscritto caricato.</div>');
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
async function loadAll(){viewEl.innerHTML='<div class="skeleton"></div>';try{if(backend()&&token())Object.assign(state,await api("bootstrap"))}catch(e){toast(e.message)}render()}
function render(){document.querySelectorAll(".nav-item").forEach(b=>b.classList.toggle("active",b.dataset.view===state.view));({home:renderHome,trials:renderTrials,members:renderMembers,payments:renderPayments,dashboard:renderDashboard}[state.view])()}
document.querySelectorAll(".nav-item").forEach(b=>b.addEventListener("click",()=>{state.view=b.dataset.view;render()}));$("#syncBtn").addEventListener("click",loadAll);

async function togglePresence(id,type){try{const p=type==="trial"?state.trials.find(x=>x.id===id):state.members.find(x=>x.id===id);await api("togglePresence",{id,personId:type==="trial"?(p?.personId||id):id,type,lessonDate:todayKey()});await loadAll()}catch(e){toast(e.message)}}
async function markTrial(id,status){try{await api("setTrialStatus",{bookingId:id,status});toast(status);await loadAll()}catch(e){toast(e.message)}}
async function convertTrial(id){
  const freq=prompt("Frequenza: 1 oppure 2 volte a settimana?","1");if(!freq)return;
  let day="Martedì+Giovedì";if(String(freq).trim()==="1"){day=prompt("Giorno abituale: Martedì oppure Giovedì","Martedì");if(!day)return}
  const plan=prompt("Pacchetto: Mese di prova / Annuale / 3 rate","Annuale");if(!plan)return;
  const payNow=confirm("Registrare anche un pagamento adesso?");let payment=null;
  if(payNow){const amount=Number(prompt("Importo in euro:",String(freq).trim()==="2"?"480":"290"));if(!amount)return;const method=prompt("Metodo: Contanti / Bonifico / PayPal / Altro","Contanti")||"Altro";payment={type:plan,amount,method,invoiced:"No"}}
  try{await api("convertTrial",{bookingId:id,frequency:String(freq)+"x/settimana - "+day,plan,payment});toast("Iscritto creato");await loadAll()}catch(e){toast(e.message)}
}
async function newMember(){
  const name=prompt("Nome e cognome:");if(!name)return;
  const age=Number(prompt("Età:","18"));if(!age||age<18){toast("Età non valida");return}
  const phone=prompt("Telefono (opzionale):","")||"";
  const email=prompt("Email (opzionale):","")||"";
  const freq=prompt("Frequenza: 1 oppure 2 volte a settimana?","1");if(!freq)return;
  let day="Martedì+Giovedì";if(String(freq).trim()==="1"){day=prompt("Giorno abituale: Martedì oppure Giovedì","Martedì");if(!day)return}
  const plan=prompt("Pacchetto: Mese di prova / Annuale / 3 rate","Annuale")||"Annuale";
  try{
    const out=await api("walkIn",{name,age,phone,email,plan,frequency:String(freq)+"x/settimana - "+day});
    toast("Nuovo iscritto aggiunto");
    if(confirm("Vuoi registrare subito anche un pagamento?")){
      const amount=Number(prompt("Importo in euro:",String(freq).trim()==="2"?"480":"290"));if(amount){const method=prompt("Metodo: Contanti / Bonifico / PayPal / Altro","Contanti")||"Altro";await api("recordPayment",{personId:out.personId,name,type:plan,amount,method,invoiced:"No"})}
    }
    await loadAll();
  }catch(e){toast(e.message)}
}
async function newPayment(personId){
  let member=personId?state.members.find(x=>x.id===personId):null;
  if(!member){const name=prompt("Nome dell'iscritto:");if(!name)return;member=state.members.find(x=>x.name.toLowerCase().includes(name.toLowerCase()));if(!member){toast("Iscritto non trovato");return}}
  const amount=Number(prompt("Importo in euro:","110"));if(!amount)return;
  const type=prompt("Tipo pagamento:","Rata")||"Pagamento";
  const method=prompt("Metodo: Contanti / Bonifico / PayPal / Altro","Contanti")||"Altro";
  const installment=prompt("Periodo/Rata (opzionale):","")||"";
  try{await api("recordPayment",{personId:member.id,name:member.name,type,amount,method,installment,invoiced:"No"});toast("Pagamento registrato");await loadAll()}catch(e){toast(e.message)}
}
async function memberDetail(id){const m=state.members.find(x=>x.id===id);if(!m)return;alert(m.name+"\n"+(m.plan||"")+"\n"+(m.frequency||"")+"\nUltima presenza: "+(m.lastAttendance?fmtDate(m.lastAttendance):"—")+"\nRischio drop: "+(m.risk||"—"))}

if("serviceWorker"in navigator)window.addEventListener("load",()=>navigator.serviceWorker.register("sw.js").catch(()=>{}));
loadAll();
