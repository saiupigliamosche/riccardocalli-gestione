const CONFIG = {
  API_BASE: "",
  AUTH_EMAIL: "riccardo.calli@gmail.com",
  VERSION: "0.1.0"
};

const state = {
  view: "today",
  loading: false,
  me: null,
  today: null,
  trials: [],
  members: [],
  payments: [],
  dashboard: null
};

const $ = (sel) => document.querySelector(sel);
const viewEl = $("#view");
const titleEl = $("#pageTitle");
const toastEl = $("#toast");

function toast(msg){
  toastEl.textContent = msg;
  toastEl.hidden = false;
  setTimeout(()=>toastEl.hidden=true,2200);
}

function fmtDate(v){
  if(!v) return "—";
  const d = new Date(v);
  return new Intl.DateTimeFormat("it-IT",{weekday:"long",day:"numeric",month:"long",year:"numeric"}).format(d);
}
function initials(name=""){return name.split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]?.toUpperCase()).join("") || "?"}

async function api(path, options={}){
  if(!CONFIG.API_BASE) throw new Error("Backend amministrativo non ancora collegato");
  const res = await fetch(CONFIG.API_BASE + path, {
    credentials:"include",
    headers:{"Content-Type":"application/json",...(options.headers||{})},
    ...options
  });
  if(!res.ok) throw new Error(await res.text() || "Errore backend");
  return res.json();
}

function loading(){
  viewEl.innerHTML = '<div class="skeleton"></div><div style="height:10px"></div><div class="skeleton"></div><div style="height:10px"></div><div class="skeleton"></div>';
}

function renderToday(){
  titleEl.textContent="Oggi";
  const t=state.today;
  if(!t){
    viewEl.innerHTML=`
      <div class="hero">
        <div class="date">Gestionale pronto</div>
        <div class="time">Backend da collegare</div>
        <div class="meta">L'interfaccia è pronta. Nessun dato personale è salvato nel repository pubblico.</div>
      </div>
      <div class="empty">Quando collegheremo il backend amministrativo, qui comparirà automaticamente la lezione di oggi.</div>`;
    return;
  }
  const members=t.members||[], trials=t.trials||[];
  viewEl.innerHTML=`
    <div class="hero">
      <div class="date">${fmtDate(t.date)}</div>
      <div class="time">${t.time || "19:00–20:30"}</div>
      <div class="meta">${members.length} iscritti attesi · ${trials.length} prove</div>
    </div>
    <div class="kpi-row">
      <div class="kpi"><strong>${members.filter(x=>x.present).length}</strong><span>iscritti presenti</span></div>
      <div class="kpi"><strong>${trials.filter(x=>x.present).length}</strong><span>prove presenti</span></div>
      <div class="kpi"><strong>${members.length+trials.length}</strong><span>attesi</span></div>
    </div>
    ${personSection("ISCRITTI",members,false)}
    ${personSection("IN PROVA",trials,true)}
    <div class="actions">
      <button class="primary" onclick="closeLesson()">CHIUDI LEZIONE</button>
      <button class="secondary" onclick="walkIn()">+ PERSONA NON PREVISTA</button>
    </div>`;
}

function personSection(title, list, trial){
  return `<section class="section">
    <div class="section-head"><h2>${title}</h2><span class="badge ${trial?"trial":"ok"}">${list.length}</span></div>
    <div class="person-list">
      ${list.length ? list.map(p=>`
        <button class="person ${p.present?"present":""}" onclick="togglePresence('${p.id}','${trial?"trial":"member"}')">
          <span class="avatar">${initials(p.name)}</span>
          <span class="person-main">
            <span class="person-name">${escapeHtml(p.name)}</span>
            <span class="person-sub">${trial ? (p.age ? p.age+" anni · PROVA":"PROVA") : escapeHtml(p.plan||"Iscritto")}</span>
          </span>
          <span class="tick">✓</span>
        </button>`).join("") : '<div class="empty">Nessuna persona in questa sezione.</div>'}
    </div>
  </section>`;
}

function renderTrials(){
  titleEl.textContent="Prove";
  const rows=state.trials||[];
  viewEl.innerHTML=`
    <input class="search" placeholder="Cerca una prova…" oninput="filterCards(this.value,'trialCard')">
    <div class="section-head"><h2>Prossime e da gestire</h2><span class="badge trial">${rows.length}</span></div>
    <div id="trialCards">
      ${rows.length?rows.map(p=>`
      <div class="card trialCard" data-search="${escapeHtml((p.name||"").toLowerCase())}">
        <div class="card-row">
          <div><div class="card-title">${escapeHtml(p.name)}</div><div class="card-sub">${p.age||"—"} anni · ${fmtDate(p.date)}</div></div>
          <span class="badge ${p.status==="Presentato"?"ok":"trial"}">${escapeHtml(p.status||"Prenotato")}</span>
        </div>
        <div class="actions grid2">
          <button class="primary" onclick="convertTrial('${p.id}')">ISCRIVI</button>
          <button class="secondary" onclick="markTrial('${p.id}','Non interessato')">NON INTERESSATO</button>
        </div>
      </div>`).join(""):'<div class="empty">Nessuna prova da gestire.</div>'}
    </div>`;
}

function renderMembers(){
  titleEl.textContent="Iscritti";
  const rows=state.members||[];
  viewEl.innerHTML=`
    <input class="search" placeholder="Cerca un iscritto…" oninput="filterCards(this.value,'memberCard')">
    <div class="section-head"><h2>Iscritti attivi</h2><span class="badge ok">${rows.filter(x=>x.status==="Attivo").length}</span></div>
    <div>
      ${rows.length?rows.map(p=>`
        <div class="card memberCard" data-search="${escapeHtml((p.name||"").toLowerCase())}">
          <div class="card-row">
            <div><div class="card-title">${escapeHtml(p.name)}</div><div class="card-sub">${escapeHtml(p.plan||"Piano non impostato")} · ultima presenza ${p.lastAttendance?fmtDate(p.lastAttendance):"—"}</div></div>
            <span class="badge ${p.risk==="ALTO"?"danger":"ok"}">${escapeHtml(p.status||"Attivo")}</span>
          </div>
          <div class="actions grid2">
            <button class="primary" onclick="newPayment('${p.id}')">PAGAMENTO</button>
            <button class="secondary" onclick="memberDetail('${p.id}')">DETTAGLI</button>
          </div>
        </div>`).join(""):'<div class="empty">Nessun iscritto caricato.</div>'}
    </div>`;
}

function renderPayments(){
  titleEl.textContent="Pagamenti";
  viewEl.innerHTML=`
    <button class="primary" onclick="newPayment()">+ REGISTRA PAGAMENTO</button>
    <section class="section">
      <div class="section-head"><h2>Ultimi pagamenti</h2></div>
      ${state.payments?.length?state.payments.map(x=>`
        <div class="card"><div class="card-row"><div><div class="card-title">${escapeHtml(x.name)}</div><div class="card-sub">${fmtDate(x.date)} · ${escapeHtml(x.method||"")}</div></div><strong>€ ${Number(x.amount||0).toFixed(2)}</strong></div></div>
      `).join(""):'<div class="empty">Nessun pagamento registrato.</div>'}
    </section>`;
}

function renderDashboard(){
  titleEl.textContent="Dashboard";
  const d=state.dashboard||{};
  const metrics=[
    ["Iscritti attivi",d.activeMembers??"—","35–40"],
    ["Nuovi da ads",d.adMembers??"—",""],
    ["Prove prenotate",d.bookings??"—",""],
    ["Prove settimana",d.weekTrials??"—",""],
    ["Trial → pagante",d.trialToPaid!=null?Math.round(d.trialToPaid*100)+"%":"—",""],
    ["CAC pagante",d.cac!=null?"€ "+Number(d.cac).toFixed(2):"—",""],
    ["Incassato stagione",d.revenue!=null?"€ "+Number(d.revenue).toFixed(2):"—",""],
    ["A rischio drop",d.atRisk??"—",""]
  ];
  viewEl.innerHTML=`
    <div class="grid2">
      ${metrics.map(m=>`<div class="kpi"><strong>${m[1]}</strong><span>${m[0]}${m[2]?" · "+m[2]:""}</span></div>`).join("")}
    </div>`;
}

function escapeHtml(s=""){return String(s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[m]))}
function filterCards(q, cls){q=q.toLowerCase();document.querySelectorAll("."+cls).forEach(el=>el.style.display=(el.dataset.search||"").includes(q)?"":"none")}

async function loadAll(){
  state.loading=true; loading();
  try{
    if(!CONFIG.API_BASE){state.loading=false;render();return;}
    const data=await api("/bootstrap");
    Object.assign(state,data);
  }catch(e){toast(e.message)}
  finally{state.loading=false;render()}
}
function render(){
  document.querySelectorAll(".nav-item").forEach(b=>b.classList.toggle("active",b.dataset.view===state.view));
  if(state.view==="today")renderToday();
  if(state.view==="trials")renderTrials();
  if(state.view==="members")renderMembers();
  if(state.view==="payments")renderPayments();
  if(state.view==="dashboard")renderDashboard();
}
document.querySelectorAll(".nav-item").forEach(b=>b.addEventListener("click",()=>{state.view=b.dataset.view;render()}));
$("#syncBtn").addEventListener("click",loadAll);

async function togglePresence(id,type){try{await api("/presence",{method:"POST",body:JSON.stringify({id,type})});await loadAll()}catch(e){toast(e.message)}}
async function closeLesson(){if(!confirm("Chiudere la lezione? I non selezionati verranno registrati come assenti."))return;try{await api("/lesson/close",{method:"POST",body:"{}"});toast("Lezione chiusa");await loadAll()}catch(e){toast(e.message)}}
function walkIn(){toast("Funzione persona non prevista: pronta per il backend")}
function convertTrial(id){toast("Conversione prova → iscritto: pronta per il backend")}
function markTrial(id,status){toast(status)}
function newPayment(id){toast("Registrazione pagamento: pronta per il backend")}
function memberDetail(id){toast("Scheda iscritto: pronta per il backend")}

if("serviceWorker" in navigator) window.addEventListener("load",()=>navigator.serviceWorker.register("sw.js").catch(()=>{}));
loadAll();
