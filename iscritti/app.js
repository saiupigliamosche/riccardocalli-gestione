const CONFIG={API:"https://script.google.com/macros/s/AKfycbyy-lBBedchYGG4Ob-oqLJCeFjvkEswzEH9XV8kNGIYpXAEIAKKB-8-s6N5OB4f6I1d/exec",VERSION:"1.2.0",FIREBASE_SDK:"10.14.1"};
const state={view:"home",portal:null,loading:false,pushBusy:false,rsvpBusy:false};
const $=s=>document.querySelector(s),viewEl=$("#view"),titleEl=$("#pageTitle"),navEl=$("#bottomNav"),profileBtn=$("#profileBtn"),toastEl=$("#toast");
const session=()=>localStorage.getItem("parkour_member_session")||"";
const pushToken=()=>localStorage.getItem("parkour_push_token")||"";
const MEMBER_SNAPSHOT_KEY="parkour_member_snapshot_v2";
function readMemberSnapshot(){try{return JSON.parse(localStorage.getItem(MEMBER_SNAPSHOT_KEY)||"null")}catch(_){return null}}
function saveMemberSnapshot(){try{if(state.portal)localStorage.setItem(MEMBER_SNAPSHOT_KEY,JSON.stringify(state.portal))}catch(_){}}
const deviceId=()=>{let id=localStorage.getItem("parkour_device_id");if(!id){id=crypto.randomUUID?crypto.randomUUID():Date.now()+"-"+Math.random().toString(36).slice(2);localStorage.setItem("parkour_device_id",id)}return id};
const esc=(s="")=>String(s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[m]));
const money=v=>new Intl.NumberFormat("it-IT",{style:"currency",currency:"EUR"}).format(Number(v||0));
function fmtDate(v,weekday=true){if(!v)return"—";const d=new Date(String(v).length===10?v+"T12:00:00":v);return new Intl.DateTimeFormat("it-IT",weekday?{weekday:"long",day:"numeric",month:"long",year:"numeric"}:{day:"numeric",month:"short",year:"numeric"}).format(d)}
function initials(name=""){return name.split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0].toUpperCase()).join("")||"?"}
function toast(message){toastEl.textContent=message;toastEl.hidden=false;setTimeout(()=>toastEl.hidden=true,2600)}
async function api(action,data={}){
  const r=await fetch(CONFIG.API,{method:"POST",headers:{"Content-Type":"text/plain;charset=utf-8"},body:JSON.stringify({action,data}),cache:"no-store",credentials:"omit",redirect:"follow"});
  if(!r.ok)throw new Error("Servizio momentaneamente non raggiungibile.");
  const out=await r.json();if(!out.ok)throw new Error(out.error||"Operazione non riuscita.");return out.data??out;
}
function setSession(value){if(value)localStorage.setItem("parkour_member_session",value);else localStorage.removeItem("parkour_member_session")}
function setLoading(on,message="Caricamento…"){state.loading=on;if(on)viewEl.innerHTML='<div class="loading"><span></span>'+esc(message)+'</div>'}
function loginScreen(message=""){
  navEl.hidden=true;profileBtn.hidden=true;titleEl.textContent="Area iscritti";
  viewEl.innerHTML='<section class="login-card"><div class="login-mark">PK</div><div class="eyebrow">ACCESSO PERSONALE</div><h2>Tutto il corso, in un solo posto.</h2><p>Inserisci l’email usata per l’iscrizione. Riceverai un link personale permanente, utilizzabile su più dispositivi.</p>'+(message?'<div class="notice">'+esc(message)+'</div>':'')+'<form id="loginForm"><label for="loginEmail">Email</label><input id="loginEmail" type="email" autocomplete="email" inputmode="email" placeholder="nome@email.it" required><button class="primary" type="submit">INVIA LINK DI ACCESSO</button></form></section>';
  $("#loginForm").addEventListener("submit",requestLink);
}
async function requestLink(e){e.preventDefault();const email=$("#loginEmail").value.trim(),btn=e.currentTarget.querySelector("button");btn.disabled=true;btn.textContent="INVIO…";try{const out=await api("memberRequestLink",{email});loginScreen(out.message||"Controlla la tua email.")}catch(err){showMessage("Accesso non riuscito",err.message,()=>loginScreen())}}
function showMessage(title,message,onClose){
  document.body.insertAdjacentHTML("beforeend",'<div class="modal-backdrop visible" id="messageModal"><section class="app-modal" role="dialog" aria-modal="true"><div class="modal-header"><div><div class="eyebrow">AREA ISCRITTI</div><h2>'+esc(title)+'</h2></div><button class="modal-close" aria-label="Chiudi">×</button></div><div class="modal-message">'+esc(message)+'</div><button class="primary modal-button">CHIUDI</button></section></div>');
  const close=()=>{$("#messageModal")?.remove();if(onClose)onClose()};$("#messageModal .modal-close").onclick=close;$("#messageModal .modal-button").onclick=close;
}
async function exchangeLoginToken(raw){setLoading(true,"Accesso in corso…");try{const out=await api("memberLogin",{loginToken:raw});setSession(out.sessionToken);state.portal=out.portal;saveMemberSnapshot();history.replaceState({},"",location.pathname+location.hash);renderShell()}catch(err){history.replaceState({},"",location.pathname);setSession("");loginScreen();showMessage("Link non valido",err.message)}}
async function loadPortal(){
  if(!session()){loginScreen();return}
  const cached=readMemberSnapshot();
  if(cached){state.portal=cached;renderShell()}else setLoading(true);
  try{state.portal=await api("memberBootstrap",{sessionToken:session()});saveMemberSnapshot();renderShell()}
  catch(err){setSession("");localStorage.removeItem(MEMBER_SNAPSHOT_KEY);loginScreen();showMessage("Accedi di nuovo",err.message)}
}
function renderShell(){navEl.hidden=false;profileBtn.hidden=false;profileBtn.textContent=initials(state.portal.member.name);render()}
function render(){document.querySelectorAll("#bottomNav button").forEach(b=>b.classList.toggle("active",b.dataset.view===state.view));({home:renderHome,payments:renderPayments,documents:renderDocuments}[state.view]||renderHome)()}
function pushCard(){
  const p=state.portal?.push;if(!p?.available)return"";
  const needsInstall=iosDevice()&&!standaloneApp();
  if(needsInstall)return '<section class="card push-card"><div class="push-icon">●</div><div><strong>Installa l’app per le notifiche</strong><span>Su iPhone apri questa pagina in Safari e aggiungila alla schermata Home.</span></div><button class="push-on" onclick="enablePush()">COME FARE</button></section>';
  const permission=typeof Notification==="undefined"?"unsupported":Notification.permission,active=permission==="granted"&&!!pushToken();
  if(active)return '<section class="card push-card active"><div class="push-icon">●</div><div><strong>Notifiche attive</strong><span>Questo dispositivo riceverà conferme delle lezioni e promemoria dei pagamenti.</span></div><button class="push-off" onclick="disablePush()" '+(state.pushBusy?'disabled':'')+'>DISATTIVA</button></section>';
  const blocked=permission==="denied";
  return '<section class="card push-card"><div class="push-icon">●</div><div><strong>'+(blocked?'Notifiche bloccate':'Attiva le notifiche')+'</strong><span>'+(blocked?'Abilitale dalle impostazioni del dispositivo.':'Ricevi gli avvisi anche quando l’app è chiusa.')+'</span></div>'+(blocked?'':'<button class="push-on" onclick="enablePush()" '+(state.pushBusy?'disabled':'')+'>'+(state.pushBusy?'ATTIVAZIONE…':'ATTIVA')+'</button>')+'</section>';
}
function renderHome(){
  titleEl.textContent="Ciao, "+state.portal.member.name.split(/\s+/)[0];const m=state.portal.member,r=state.portal.rsvp;
  const next=(state.portal.deadlines||[]).filter(x=>x.status!=="Pagata"&&x.status!=="Annullata").sort((a,b)=>a.dueDate.localeCompare(b.dueDate))[0];
  let rsvp='<section class="card"><div class="empty-block"><strong>Nessuna lezione da confermare</strong><span>Qui comparirà la prossima lezione prevista dal tuo abbonamento.</span></div></section>';
  if(r){const yes=r.response==="Sì",no=r.response==="No";rsvp='<section class="hero"><div class="eyebrow light">PROSSIMA LEZIONE</div><h2>'+esc(fmtDate(r.date))+'</h2><p>19:00–20:30 · La Cittadella della Stanga</p><div class="question">Ci sarai?</div><div class="rsvp-grid"><button class="rsvp '+(yes?'selected':'')+'" onclick="setRsvp(\'Sì\')" '+(state.rsvpBusy?'disabled':'')+'>SÌ, CI SARÒ</button><button class="rsvp '+(no?'selected no':'')+'" onclick="setRsvp(\'No\')" '+(state.rsvpBusy?'disabled':'')+'>NO</button></div><small>'+(state.rsvpBusy?'Salvataggio in corso…':'Puoi modificare la risposta fino alle 19:00.')+'</small></section>'}
  viewEl.innerHTML=rsvp+pushCard()+'<section><div class="section-head"><h2>Il tuo corso</h2></div><div class="summary-grid"><div class="summary"><span>Frequenza</span><strong>'+esc(m.frequency||"—")+'</strong></div><div class="summary"><span>Pacchetto</span><strong>'+esc(m.plan||"—")+'</strong></div></div></section>'+(next?'<section><div class="section-head"><h2>Prossima scadenza</h2></div>'+deadlineCard(next)+'</section>':'<section class="card paid-all"><strong>Pagamenti in ordine</strong><span>Non risultano scadenze aperte.</span></section>');
}
function iosDevice(){return /iphone|ipad|ipod/i.test(navigator.userAgent)}
function standaloneApp(){return matchMedia("(display-mode: standalone)").matches||navigator.standalone===true}
async function firebaseMessaging(config){
  const base="https://www.gstatic.com/firebasejs/"+CONFIG.FIREBASE_SDK;
  const [{initializeApp,getApps,getApp},{getMessaging,getToken}]=await Promise.all([import(base+"/firebase-app.js"),import(base+"/firebase-messaging.js")]);
  const app=getApps().length?getApp():initializeApp(config.firebaseConfig);
  return {messaging:getMessaging(app),getToken};
}
async function enablePush(){
  if(state.pushBusy)return;
  if(iosDevice()&&!standaloneApp()){showMessage("Installa l’app su iPhone","Apri questa pagina in Safari. Tocca Condividi, scegli “Aggiungi alla schermata Home”, poi apri l’icona Parkour Padova e premi di nuovo Attiva.");return}
  if(!("serviceWorker" in navigator)||!("PushManager" in window)||typeof Notification==="undefined"){showMessage("Notifiche non supportate","Questo dispositivo o browser non supporta le notifiche push.");return}
  state.pushBusy=true;renderHome();
  try{
    const config=await api("memberPushConfig",{sessionToken:session()});
    if(!config.enabled)throw new Error("Il servizio notifiche non è ancora configurato.");
    const permission=await Notification.requestPermission();
    if(permission!=="granted")throw new Error("Autorizzazione alle notifiche non concessa.");
    const registration=await navigator.serviceWorker.register("sw.js");
    const firebase=await firebaseMessaging(config),token=await firebase.getToken(firebase.messaging,{vapidKey:config.vapidKey,serviceWorkerRegistration:registration});
    if(!token)throw new Error("Il dispositivo non ha restituito un token notifiche.");
    localStorage.setItem("parkour_push_token",token);
    const result=await api("memberRegisterPush",{sessionToken:session(),fcmToken:token,deviceId:deviceId(),platform:navigator.userAgentData?.platform||navigator.platform||"",userAgent:navigator.userAgent});
    state.portal.push.devices=result.devices||1;saveMemberSnapshot();toast(result.testSent?"Notifiche attivate":"Dispositivo registrato");
  }catch(err){localStorage.removeItem("parkour_push_token");showMessage("Notifiche non attivate",err.message)}finally{state.pushBusy=false;renderHome()}
}
async function disablePush(){
  if(state.pushBusy)return;state.pushBusy=true;renderHome();
  try{await api("memberUnregisterPush",{sessionToken:session(),fcmToken:pushToken(),deviceId:deviceId()});localStorage.removeItem("parkour_push_token");saveMemberSnapshot();toast("Notifiche disattivate su questo dispositivo")}catch(err){showMessage("Notifiche non disattivate",err.message)}finally{state.pushBusy=false;renderHome()}
}
async function setRsvp(response){
  if(state.rsvpBusy||!state.portal?.rsvp)return;
  const previous=state.portal.rsvp.response,lessonDate=state.portal.rsvp.date;
  state.portal.rsvp.response=response;state.rsvpBusy=true;saveMemberSnapshot();renderHome();
  try{await api("memberSetRsvp",{sessionToken:session(),lessonDate,response});toast("Risposta salvata")}
  catch(err){state.portal.rsvp.response=previous;saveMemberSnapshot();showMessage("Risposta non salvata",err.message)}
  finally{state.rsvpBusy=false;renderHome()}
}
function deadlineCard(d){return '<div class="card deadline '+(d.status==="Scaduta"?'overdue':'')+'"><div><span class="tag">'+esc(d.status)+'</span><h3>'+esc(d.type)+(d.installment>1?' · rata '+d.installment:'')+'</h3><p>Scadenza '+esc(fmtDate(d.dueDate,false))+'</p></div><strong>'+money(d.amount)+'</strong></div>'}
function renderPayments(){
  titleEl.textContent="Pagamenti";const deadlines=state.portal.deadlines||[],payments=state.portal.payments||[];
  viewEl.innerHTML='<section><div class="section-head"><h2>Scadenze</h2><span>'+deadlines.length+'</span></div><div class="stack">'+(deadlines.length?deadlines.map(deadlineCard).join(""):'<div class="empty-block">Nessuna scadenza disponibile.</div>')+'</div></section><section><div class="section-head"><h2>Storico pagamenti</h2><span>'+payments.length+'</span></div><div class="stack">'+(payments.length?payments.map(p=>'<div class="card payment"><div><h3>'+esc(p.type||"Pagamento")+'</h3><p>'+esc(fmtDate(p.date,false))+(p.method?' · '+esc(p.method):'')+'</p></div><strong>'+money(p.amount)+'</strong></div>').join(""):'<div class="empty-block">Nessun pagamento registrato.</div>')+'</div></section>';
}
function renderDocuments(){
  titleEl.textContent="Documenti";const docs=state.portal.documents||[];
  viewEl.innerHTML='<section><div class="section-head"><div><h2>Il tuo archivio</h2><p>Documenti firmati e fatture caricati dall’amministratore.</p></div><span>'+docs.length+'</span></div><div class="stack">'+(docs.length?docs.map(d=>'<button class="card document" onclick="downloadDocument(\''+esc(d.id)+'\',this)"><span class="doc-icon">PDF</span><span><strong>'+esc(d.title)+'</strong><small>'+esc(d.type)+' · '+esc(fmtDate(d.uploadedAt,false))+'</small></span><b>↓</b></button>').join(""):'<div class="empty-block"><strong>Archivio vuoto</strong><span>I documenti caricati per te appariranno qui.</span></div>')+'</div></section>';
}
async function downloadDocument(id,button){if(button)button.disabled=true;toast("Preparazione documento…");try{const file=await api("memberGetDocument",{sessionToken:session(),documentId:id}),binary=atob(file.contentBase64),bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);const url=URL.createObjectURL(new Blob([bytes],{type:file.mimeType||"application/octet-stream"})),a=document.createElement("a");a.href=url;a.download=file.fileName||"documento";document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000)}catch(err){showMessage("Documento non disponibile",err.message)}finally{if(button)button.disabled=false}}
function openProfile(){const m=state.portal.member;document.body.insertAdjacentHTML("beforeend",'<div class="modal-backdrop visible" id="profileModal"><section class="app-modal"><div class="modal-header"><div><div class="eyebrow">PROFILO</div><h2>'+esc(m.name)+'</h2></div><button class="modal-close" aria-label="Chiudi">×</button></div><div class="profile-details"><span>Email</span><strong>'+esc(m.email)+'</strong><span>Frequenza</span><strong>'+esc(m.frequency||"—")+'</strong><span>Pacchetto</span><strong>'+esc(m.plan||"—")+'</strong></div><button class="secondary logout">ESCI DA QUESTO DISPOSITIVO</button></section></div>');$("#profileModal .modal-close").onclick=()=>$("#profileModal").remove();$("#profileModal .logout").onclick=logout}
async function logout(){try{if(pushToken())await api("memberUnregisterPush",{sessionToken:session(),fcmToken:pushToken(),deviceId:deviceId()});await api("memberLogout",{sessionToken:session()})}catch(_){}localStorage.removeItem("parkour_push_token");localStorage.removeItem(MEMBER_SNAPSHOT_KEY);setSession("");state.portal=null;$("#profileModal")?.remove();loginScreen()}
document.querySelectorAll("#bottomNav button").forEach(b=>b.addEventListener("click",()=>{state.view=b.dataset.view;history.replaceState({},"",location.pathname+"#"+state.view);render()}));profileBtn.addEventListener("click",openProfile);
(async function init(){const requested=location.hash.slice(1);if(["home","payments","documents"].includes(requested))state.view=requested;const raw=new URLSearchParams(location.search).get("login");if(raw)await exchangeLoginToken(raw);else await loadPortal()})();
if("serviceWorker" in navigator)window.addEventListener("load",()=>navigator.serviceWorker.register("sw.js").catch(()=>{}));
