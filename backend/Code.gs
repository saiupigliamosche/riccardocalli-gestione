const ADMIN = {
  spreadsheetId: '1xt-n4ovYRPuSR60PbRVZ6zTdw9jnzGMCv2M6eEpNEqw',
  timezone: 'Europe/Rome',
  ownerEmail: 'riccardo.calli@gmail.com',
  sheets: {
    trials: 'Prove',
    members: 'Iscritti',
    payments: 'Pagamenti',
    attendance: 'Presenze',
    lessons: 'Lezioni',
    campaigns: 'Campagne',
    config: 'Config'
  }
};

function doGet() {
  return json_({ ok: true, service: 'Parkour Course OS Admin API', version: '1.2.0' });
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    if (typeof isJotformWebhookRequest_ === 'function' && isJotformWebhookRequest_(e)) {
      lock.waitLock(10000);
      return json_(handleJotformWebhook_(e));
    }

    const p = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    authorize_(p.token);
    lock.waitLock(10000);

    const action = clean_(p.action);
    const data = p.data || {};

    if (action === 'bootstrap') return json_({ ok: true, data: bootstrap_() });
    if (action === 'togglePresence') return json_(togglePresence_(data));
    if (action === 'setPresence') return json_(setPresence_(data));
    if (action === 'closeLesson') return json_(closeLesson_(data));
    if (action === 'convertTrial') return json_(convertTrial_(data));
    if (action === 'setTrialStatus') return json_(setTrialStatus_(data));
    if (action === 'recordPayment') return json_(recordPayment_(data));
    if (action === 'setMemberStatus') return json_(setMemberStatus_(data));
    if (action === 'updateMember') return json_(updateMember_(data));
    if (action === 'walkIn') return json_(createWalkIn_(data));

    return json_({ ok: false, error: 'Azione non valida.' });
  } catch (err) {
    return json_({ ok: false, error: safeError_(err) });
  } finally {
    try { lock.releaseLock(); } catch (_) {}
  }
}

function authorize_(token) {
  const expected = PropertiesService.getScriptProperties().getProperty('ADMIN_TOKEN');
  if (!expected || !token || token !== expected) throw new Error('Accesso non autorizzato.');
}

function bootstrap_() {
  ensureIds_();
  return {
    today: todayPayload_(),
    trials: trialList_(),
    members: memberList_(),
    payments: paymentList_(),
    dashboard: dashboard_(),
    meta: {
      generatedAt: new Date().toISOString(),
      owner: ADMIN.ownerEmail
    }
  };
}

function todayPayload_() {
  const key = Utilities.formatDate(new Date(), ADMIN.timezone, 'yyyy-MM-dd');
  const day = new Date().getDay();
  const isCourseDay = day === 2 || day === 4;
  if (!isCourseDay) return null;

  const lesson = ensureLesson_(key);
  const members = memberList_().filter(m => m.status === 'Attivo');
  const trials = trialList_().filter(t => t.date === key && !['Annullato','Non interessato'].includes(t.status));

  const att = attendanceMap_(key);
  members.forEach(m => m.present = att[m.id] === 'Sì');
  trials.forEach(t => t.present = att[t.personId || ('booking:' + t.id)] === 'Sì');

  return {
    id: lesson.id,
    date: key,
    time: config_('Orario corso') || '19:00-20:30',
    spot: config_('Spot nome') || config_('Spot corrente') || 'DA DEFINIRE',
    status: lesson.status,
    members,
    trials
  };
}

function trialList_() {
  const sh = sheet_(ADMIN.sheets.trials);
  const rows = table_(sh);
  return rows.map(r => ({
    id: str_(r['Booking ID']),
    personId: str_(r['Persona ID']),
    name: str_(r['Nome e cognome']),
    age: num_(r['Età']),
    phone: str_(r['Telefono']),
    email: str_(r['Email']),
    date: dateKey_(r['Data prova']),
    bookedAt: dateIso_(r['Data prenotazione']),
    status: normalizeTrialStatus_(r['Stato']),
    present: str_(r['Presente']) === 'Sì',
    paid: str_(r['Pagato']) === 'Sì',
    amount: num_(r['Importo']),
    campaign: str_(r['UTM campaign'] || r['Campagna']),
    creative: str_(r['UTM content'] || r['Creatività']),
    source: str_(r['UTM source']),
    medium: str_(r['UTM medium'])
  })).filter(x => x.name);
}

function memberList_() {
  const rows = table_(sheet_(ADMIN.sheets.members));
  return rows.map(r => ({
    id: str_(r['Persona ID']),
    name: str_(r['Nome e cognome']),
    age: num_(r['Età']),
    phone: str_(r['Telefono']),
    email: str_(r['Email']),
    plan: str_(r['Pacchetto']),
    frequency: str_(r['Frequenza']),
    status: str_(r['Stato']) || 'Attivo',
    joinedAt: dateIso_(r['Data iscrizione']),
    firstTrial: dateIso_(r['Data prima prova']),
    lastAttendance: dateIso_(r['Ultima presenza']),
    attendance30: num_(r['Presenze 30gg']),
    consecutiveAbsences: num_(r['Assenze consecutive']),
    risk: str_(r['Rischio drop']),
    origin: str_(r['Origine acquisizione']),
    campaign: str_(r['Campagna acquisizione']),
    creative: str_(r['Creatività acquisizione'])
  })).filter(x => x.name);
}

function paymentList_() {
  return table_(sheet_(ADMIN.sheets.payments)).map(r => ({
    id: str_(r['Pagamento ID']),
    personId: str_(r['Persona ID']),
    name: str_(r['Nome e cognome']),
    date: dateIso_(r['Data']),
    type: str_(r['Tipo pagamento']),
    amount: num_(r['Importo']),
    method: str_(r['Metodo']),
    invoiced: str_(r['Fattura emessa']),
    installment: str_(r['Periodo/Rata']),
    origin: str_(r['Origine acquisizione'])
  })).filter(x => x.name).sort((a,b) => String(b.date).localeCompare(String(a.date))).slice(0,50);
}

function dashboard_() {
  const members = memberList_();
  const trials = trialList_();
  const payments = paymentListAll_();
  const campaigns = table_(sheet_(ADMIN.sheets.campaigns));
  const activeMembers = members.filter(x => x.status === 'Attivo').length;
  const adMembers = members.filter(x => x.origin === 'Ads' && x.status === 'Attivo').length;
  const bookings = trials.filter(x => !['Annullato'].includes(x.status)).length;

  const now = new Date();
  const weekEnd = new Date(now); weekEnd.setDate(weekEnd.getDate() + 7);
  const weekTrials = trials.filter(x => {
    if (!x.date) return false;
    const d = parseKey_(x.date);
    return d >= dayStart_(now) && d <= dayEnd_(weekEnd) && x.status !== 'Annullato';
  }).length;

  const completedTrials = trials.filter(x => x.present === true).length;
  const paidTrials = trials.filter(x => x.paid === true).length;
  const trialToPaid = completedTrials ? paidTrials / completedTrials : 0;

  const spend = campaigns.reduce((s,r) => s + num_(r['Spesa']),0);
  const cac = adMembers ? spend / adMembers : 0;
  const revenue = payments.reduce((s,p) => s + num_(p.amount),0);
  const adRevenue = payments.filter(p=>p.origin==='Ads').reduce((s,p)=>s+num_(p.amount),0);
  const roas = spend ? adRevenue / spend : 0;

  return {
    activeMembers,
    adMembers,
    bookings,
    weekTrials,
    trialToPaid,
    cac,
    revenue,
    spend,
    adRevenue,
    roas,
    atRisk: members.filter(x => x.risk === 'ALTO').length
  };
}

function togglePresence_(d) {
  const lessonKey = d.lessonDate || Utilities.formatDate(new Date(), ADMIN.timezone, 'yyyy-MM-dd');
  const personId = clean_(d.personId || d.id);
  const type = clean_(d.type) === 'trial' ? 'Prova' : 'Iscritto';
  if (!personId) throw new Error('Persona non valida.');

  const sh = sheet_(ADMIN.sheets.attendance);
  const headers = headers_(sh);
  const rows = sh.getDataRange().getValues();
  let found = -1;
  for (let i=1;i<rows.length;i++) {
    const obj=rowObj_(headers,rows[i]);
    if (dateKey_(obj['Data lezione'])===lessonKey && str_(obj['Persona ID'])===personId) { found=i+1; break; }
  }

  if (found > 0) {
    const col = headers.indexOf('Presente') + 1;
    const current = sh.getRange(found,col).getValue();
    sh.getRange(found,col).setValue(String(current)==='Sì' ? 'No' : 'Sì');
  } else {
    const entity = type==='Prova' ? findTrialEntity_(personId) : findMember_(personId);
    appendByHeaders_(sh, {
      'Data lezione': parseKey_(lessonKey),
      'Nome e cognome': entity.name,
      'Presente': 'Sì',
      'Tipo': type,
      'Orario': config_('Orario corso') || '19:00-20:30',
      'Spot': config_('Spot nome') || config_('Spot corrente') || '',
      'Presenza ID': id_('ATT'),
      'Persona ID': type==='Prova' ? (entity.personId || personId) : personId,
      'Lezione ID': lessonId_(lessonKey),
      'Booking ID': type==='Prova' ? entity.id : '',
      'Timestamp': new Date()
    });
  }
  refreshMemberMetrics_();
  return { ok:true };
}


function setPresence_(d) {
  const lessonKey = clean_(d.lessonDate) || Utilities.formatDate(new Date(), ADMIN.timezone, 'yyyy-MM-dd');
  const personId = clean_(d.personId || d.id);
  const type = clean_(d.type) === 'trial' ? 'Prova' : 'Iscritto';
  const present = d.present === true || clean_(d.present) === 'Sì';
  if (!personId) throw new Error('Persona non valida.');

  const sh = sheet_(ADMIN.sheets.attendance);
  const headers = headers_(sh);
  const rows = sh.getDataRange().getValues();
  let found = -1;

  for (let i=1;i<rows.length;i++) {
    const obj=rowObj_(headers,rows[i]);
    if (dateKey_(obj['Data lezione'])===lessonKey && str_(obj['Persona ID'])===personId) {
      found=i+1;
      break;
    }
  }

  if (found > 0) {
    setCellByHeader_(sh,found,headers,'Presente',present?'Sì':'No');
    setCellByHeader_(sh,found,headers,'Timestamp',new Date());
  } else {
    const entity = type==='Prova' ? findTrialEntity_(personId) : findMember_(personId);
    appendByHeaders_(sh, {
      'Data lezione': parseKey_(lessonKey),
      'Nome e cognome': entity.name,
      'Presente': present ? 'Sì' : 'No',
      'Tipo': type,
      'Orario': config_('Orario corso') || '19:00-20:30',
      'Spot': config_('Spot nome') || config_('Spot corrente') || '',
      'Presenza ID': id_('ATT'),
      'Persona ID': type==='Prova' ? (entity.personId || personId) : personId,
      'Lezione ID': lessonId_(lessonKey),
      'Booking ID': type==='Prova' ? entity.id : '',
      'Timestamp': new Date()
    });
  }

  if (type==='Prova') {
    const entity = findTrialEntity_(personId);
    if (entity && entity.id) setTrialPresence_(entity.id,present?'Sì':'No');
  }

  refreshMemberMetrics_();
  return { ok:true, present };
}

function closeLesson_(d) {
  const key = clean_(d.lessonDate) || Utilities.formatDate(new Date(), ADMIN.timezone, 'yyyy-MM-dd');
  const lesson = ensureLesson_(key);
  const att = attendanceMap_(key);

  memberList_().filter(m=>m.status==='Attivo').forEach(m=>{
    if (!(m.id in att)) appendAttendance_(key,m.id,m.name,'Iscritto','No','');
  });

  trialList_().filter(t=>t.date===key && t.status!=='Annullato').forEach(t=>{
    const pid=t.personId || ('booking:'+t.id);
    if (!(pid in att)) appendAttendance_(key,pid,t.name,'Prova','No',t.id);
    setTrialPresence_(t.id, att[pid] === 'Sì' ? 'Sì' : 'No');
  });

  updateLesson_(key,'Chiusa');
  refreshMemberMetrics_();
  return { ok:true, lessonId:lesson.id };
}

function convertTrial_(d) {
  const bookingId=clean_(d.bookingId||d.id);
  const trial=findTrial_(bookingId);
  if (!trial) throw new Error('Prova non trovata.');

  let personId=trial.personId || id_('PER');
  const memberSh=sheet_(ADMIN.sheets.members);
  const existing=findMember_(personId,true);
  if (!existing) {
    appendByHeaders_(memberSh,{
      'Persona ID':personId,
      'Nome e cognome':trial.name,
      'Età':trial.age,
      'Telefono':trial.phone,
      'Email':trial.email,
      'Data prima prova':trial.date ? parseKey_(trial.date) : '',
      'Data iscrizione':new Date(),
      'Pacchetto':clean_(d.plan),
      'Frequenza':clean_(d.frequency),
      'Stato':'Attivo',
      'Rischio drop':'BASSO',
      'Origine acquisizione':trial.source ? 'Ads' : 'Organico',
      'Campagna acquisizione':trial.campaign,
      'Creatività acquisizione':trial.creative,
      'Booking ID origine':trial.id,
      'Ultimo aggiornamento':new Date()
    });
  }

  updateTrialFields_(bookingId,{
    'Persona ID':personId,
    'Stato':'Iscritto',
    'Pagato': d.payment && num_(d.payment.amount)>0 ? 'Sì' : '',
    'Data conversione':new Date()
  });

  if (d.payment && num_(d.payment.amount)>0) {
    recordPayment_({
      personId,
      name:trial.name,
      type:clean_(d.payment.type||d.plan),
      amount:num_(d.payment.amount),
      method:clean_(d.payment.method),
      invoiced:clean_(d.payment.invoiced||'No'),
      installment:clean_(d.payment.installment),
      origin:trial.source ? 'Ads' : 'Organico',
      campaign:trial.campaign,
      creative:trial.creative,
      bookingId
    });
    updateTrialFields_(bookingId,{'Data pagamento':new Date(),'Importo':num_(d.payment.amount)});
  }
  return {ok:true,personId};
}

function setTrialStatus_(d) {
  const id=clean_(d.bookingId||d.id), status=clean_(d.status);
  if(!id||!status) throw new Error('Dati incompleti.');
  updateTrialFields_(id,{'Stato':status});
  return {ok:true};
}

function recordPayment_(d) {
  const personId=clean_(d.personId);
  const member=personId ? findMember_(personId,true) : null;
  const name=clean_(d.name || (member&&member.name));
  const amount=num_(d.amount);
  if(!name||amount<=0) throw new Error('Pagamento non valido.');

  appendByHeaders_(sheet_(ADMIN.sheets.payments),{
    'Data':new Date(),
    'Nome e cognome':name,
    'Tipo pagamento':clean_(d.type),
    'Importo':amount,
    'Metodo':clean_(d.method),
    'Fattura emessa':clean_(d.invoiced||'No'),
    'Periodo/Rata':clean_(d.installment),
    'Note':clean_(d.note),
    'Pagamento ID':id_('PAY'),
    'Persona ID':personId,
    'Origine acquisizione':clean_(d.origin || (member&&member.origin)),
    'Campagna':clean_(d.campaign || (member&&member.campaign)),
    'Creatività':clean_(d.creative || (member&&member.creative)),
    'Registrato da':ADMIN.ownerEmail,
    'Timestamp':new Date()
  });
  return {ok:true};
}

function setMemberStatus_(d) {
  const id=clean_(d.personId||d.id), status=clean_(d.status);
  const sh=sheet_(ADMIN.sheets.members), headers=headers_(sh), rows=sh.getDataRange().getValues();
  const idCol=headers.indexOf('Persona ID'), statusCol=headers.indexOf('Stato');
  for(let i=1;i<rows.length;i++){
    if(str_(rows[i][idCol])===id){
      sh.getRange(i+1,statusCol+1).setValue(status);
      const upd=headers.indexOf('Ultimo aggiornamento'); if(upd>=0) sh.getRange(i+1,upd+1).setValue(new Date());
      if(status==='Uscito'){const c=headers.indexOf('Data uscita');if(c>=0)sh.getRange(i+1,c+1).setValue(new Date());}
      return {ok:true};
    }
  }
  throw new Error('Iscritto non trovato.');
}

function updateMember_(d) {
  const id=clean_(d.personId||d.id), name=clean_(d.name);
  if(!id||!name) throw new Error('Dati iscritto incompleti.');
  const sh=sheet_(ADMIN.sheets.members), headers=headers_(sh), rows=sh.getDataRange().getValues();
  const idCol=headers.indexOf('Persona ID');
  for(let i=1;i<rows.length;i++){
    if(str_(rows[i][idCol])!==id) continue;
    setCellByHeader_(sh,i+1,headers,'Nome e cognome',name);
    setCellByHeader_(sh,i+1,headers,'Età',num_(d.age)||'');
    setCellByHeader_(sh,i+1,headers,'Telefono',clean_(d.phone));
    setCellByHeader_(sh,i+1,headers,'Email',clean_(d.email));
    setCellByHeader_(sh,i+1,headers,'Frequenza',clean_(d.frequency));
    setCellByHeader_(sh,i+1,headers,'Pacchetto',clean_(d.plan));
    setCellByHeader_(sh,i+1,headers,'Stato',clean_(d.status)||'Attivo');
    setCellByHeader_(sh,i+1,headers,'Ultimo aggiornamento',new Date());
    if(clean_(d.status)==='Uscito') setCellByHeader_(sh,i+1,headers,'Data uscita',new Date());
    return {ok:true};
  }
  throw new Error('Iscritto non trovato.');
}

function createWalkIn_(d) {
  const name=clean_(d.name), age=num_(d.age);
  if(!name) throw new Error('Nome obbligatorio.');
  const personId=id_('PER');
  appendByHeaders_(sheet_(ADMIN.sheets.members),{
    'Persona ID':personId,'Nome e cognome':name,'Età':age||'','Telefono':clean_(d.phone),'Email':clean_(d.email),
    'Data iscrizione':new Date(),'Pacchetto':clean_(d.plan),'Frequenza':clean_(d.frequency),'Stato':'Attivo',
    'Origine acquisizione':'Altro','Note':'Inserito dal gestionale come persona non prevista','Ultimo aggiornamento':new Date()
  });
  return {ok:true,personId};
}

function ensureIds_() {
  ensureTableIds_(ADMIN.sheets.trials,'Booking ID','BKG');
  ensureTableIds_(ADMIN.sheets.members,'Persona ID','PER');
  ensureTableIds_(ADMIN.sheets.payments,'Pagamento ID','PAY');
  ensureTableIds_(ADMIN.sheets.attendance,'Presenza ID','ATT');
  backfillPersonLinks_();
}

function ensureTableIds_(sheetName,header,prefix){
  const sh=sheet_(sheetName), h=headers_(sh), col=h.indexOf(header);
  if(col<0)return;
  const rows=sh.getDataRange().getValues();
  for(let i=1;i<rows.length;i++){
    if(rowBlank_(rows[i]))continue;
    if(!rows[i][col])sh.getRange(i+1,col+1).setValue(id_(prefix));
  }
}

function backfillPersonLinks_(){
  const members=memberList_();
  const byEmail={}; members.forEach(m=>{if(m.email)byEmail[m.email.toLowerCase()]=m.id;});
  const sh=sheet_(ADMIN.sheets.trials), h=headers_(sh), rows=sh.getDataRange().getValues();
  const emailCol=h.indexOf('Email'), personCol=h.indexOf('Persona ID');
  for(let i=1;i<rows.length;i++){
    if(!rows[i][personCol] && rows[i][emailCol]){
      const id=byEmail[String(rows[i][emailCol]).trim().toLowerCase()];
      if(id)sh.getRange(i+1,personCol+1).setValue(id);
    }
  }
}

function ensureLesson_(key){
  const sh=sheet_(ADMIN.sheets.lessons), h=headers_(sh), rows=sh.getDataRange().getValues();
  for(let i=1;i<rows.length;i++){
    const r=rowObj_(h,rows[i]);
    if(dateKey_(r['Data'])===key)return {id:str_(r['Lezione ID'])||lessonId_(key),status:str_(r['Stato'])||'Aperta'};
  }
  const id=lessonId_(key);
  appendByHeaders_(sh,{
    'Data':parseKey_(key),
    'Giorno':Utilities.formatDate(parseKey_(key),ADMIN.timezone,'EEEE'),
    'Orario':config_('Orario corso')||'19:00-20:30',
    'Spot':config_('Spot nome')||config_('Spot corrente')||'',
    'Lezione ID':id,
    'Stato':'Aperta'
  });
  return {id,status:'Aperta'};
}

function updateLesson_(key,status){
  const sh=sheet_(ADMIN.sheets.lessons),h=headers_(sh),rows=sh.getDataRange().getValues();
  for(let i=1;i<rows.length;i++){const r=rowObj_(h,rows[i]);if(dateKey_(r['Data'])===key){
    sh.getRange(i+1,h.indexOf('Stato')+1).setValue(status);
    sh.getRange(i+1,h.indexOf('Chiusura timestamp')+1).setValue(new Date());
    const att=attendanceRows_(key);
    const memberPresent=att.filter(x=>x.type==='Iscritto'&&x.present==='Sì').length;
    const trialPresent=att.filter(x=>x.type==='Prova'&&x.present==='Sì').length;
    setCellByHeader_(sh,i+1,h,'Iscritti presenti',memberPresent);
    setCellByHeader_(sh,i+1,h,'Prove presenti',trialPresent);
    setCellByHeader_(sh,i+1,h,'Totale presenti',memberPresent+trialPresent);
    setCellByHeader_(sh,i+1,h,'Prove prenotate',trialList_().filter(t=>t.date===key&&t.status!=='Annullato').length);
    return;
  }}
}

function attendanceMap_(key){
  const out={};
  table_(sheet_(ADMIN.sheets.attendance)).forEach(r=>{if(dateKey_(r['Data lezione'])===key){
    const id=str_(r['Persona ID']) || (str_(r['Booking ID']) ? 'booking:'+str_(r['Booking ID']) : '');
    if(id)out[id]=str_(r['Presente']);
  }});
  return out;
}
function attendanceRows_(key){return table_(sheet_(ADMIN.sheets.attendance)).filter(r=>dateKey_(r['Data lezione'])===key).map(r=>({type:str_(r['Tipo']),present:str_(r['Presente'])}));}
function appendAttendance_(key,pid,name,type,present,bookingId){appendByHeaders_(sheet_(ADMIN.sheets.attendance),{'Data lezione':parseKey_(key),'Nome e cognome':name,'Presente':present,'Tipo':type,'Orario':config_('Orario corso')||'19:00-20:30','Spot':config_('Spot nome')||'','Presenza ID':id_('ATT'),'Persona ID':pid,'Lezione ID':lessonId_(key),'Booking ID':bookingId||'','Timestamp':new Date()});}

function refreshMemberMetrics_(){
  const sh=sheet_(ADMIN.sheets.members),h=headers_(sh),rows=sh.getDataRange().getValues(),att=table_(sheet_(ADMIN.sheets.attendance));
  const now=new Date(),since=new Date(now);since.setDate(since.getDate()-30);
  for(let i=1;i<rows.length;i++){
    const r=rowObj_(h,rows[i]),id=str_(r['Persona ID']); if(!id)continue;
    const a=att.filter(x=>str_(x['Persona ID'])===id&&str_(x['Tipo'])==='Iscritto').sort((x,y)=>dateKey_(x['Data lezione']).localeCompare(dateKey_(y['Data lezione'])));
    const yes=a.filter(x=>str_(x['Presente'])==='Sì');
    const recent=yes.filter(x=>{const d=x['Data lezione'] instanceof Date?x['Data lezione']:null;return d&&d>=since;}).length;
    let consec=0;for(let j=a.length-1;j>=0;j--){if(str_(a[j]['Presente'])==='No')consec++;else break;}
    const last=yes.length?yes[yes.length-1]['Data lezione']:'';
    const risk=consec>=3?'ALTO':consec===2?'MEDIO':'BASSO';
    setCellByHeader_(sh,i+1,h,'Ultima presenza',last);
    setCellByHeader_(sh,i+1,h,'Presenze 30gg',recent);
    setCellByHeader_(sh,i+1,h,'Assenze consecutive',consec);
    setCellByHeader_(sh,i+1,h,'Rischio drop',risk);
    setCellByHeader_(sh,i+1,h,'Ultimo aggiornamento',new Date());
  }
}

function setTrialPresence_(bookingId,value){updateTrialFields_(bookingId,{'Presente':value,'Stato':value==='Sì'?'Presentato':'No-show'});}
function updateTrialFields_(bookingId,fields){const sh=sheet_(ADMIN.sheets.trials),h=headers_(sh),rows=sh.getDataRange().getValues(),c=h.indexOf('Booking ID');for(let i=1;i<rows.length;i++){if(str_(rows[i][c])===bookingId){Object.keys(fields).forEach(k=>setCellByHeader_(sh,i+1,h,k,fields[k]));return;}}throw new Error('Prenotazione non trovata.');}
function findTrial_(id){return trialList_().find(x=>x.id===id)||null;}
function findTrialEntity_(id){return trialList_().find(x=>x.id===id||x.personId===id)||null;}
function findMember_(id,quiet){const m=memberList_().find(x=>x.id===id)||null;if(!m&&!quiet)throw new Error('Iscritto non trovato.');return m;}
function paymentListAll_(){return table_(sheet_(ADMIN.sheets.payments)).map(r=>({amount:num_(r['Importo']),origin:str_(r['Origine acquisizione'])}));}

function sheet_(name){const sh=SpreadsheetApp.openById(ADMIN.spreadsheetId).getSheetByName(name);if(!sh)throw new Error('Foglio mancante: '+name);return sh;}
function headers_(sh){return sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0].map(str_);}
function table_(sh){const values=sh.getDataRange().getValues();if(values.length<2)return[];const h=values[0].map(str_);return values.slice(1).filter(r=>!rowBlank_(r)).map(r=>rowObj_(h,r));}
function rowObj_(h,r){const o={};h.forEach((x,i)=>o[x]=r[i]);return o;}
function rowBlank_(r){return r.every(v=>v===''||v==null);}
function appendByHeaders_(sh,obj){const h=headers_(sh);sh.appendRow(h.map(k=>Object.prototype.hasOwnProperty.call(obj,k)?obj[k]:''));}
function setCellByHeader_(sh,row,h,name,value){const c=h.indexOf(name);if(c>=0)sh.getRange(row,c+1).setValue(value);}
function config_(key){const rows=sheet_(ADMIN.sheets.config).getDataRange().getValues();const r=rows.find(x=>str_(x[0])===key);return r?r[1]:'';}
function id_(prefix){return prefix+'-'+Date.now().toString(36).toUpperCase()+'-'+Utilities.getUuid().slice(0,8).toUpperCase();}
function lessonId_(key){return 'LES-'+String(key).replace(/-/g,'');}
function dateKey_(v){if(v instanceof Date&&!isNaN(v))return Utilities.formatDate(v,ADMIN.timezone,'yyyy-MM-dd');if(/^\d{4}-\d{2}-\d{2}$/.test(str_(v)))return str_(v);return'';}
function dateIso_(v){return v instanceof Date&&!isNaN(v)?v.toISOString():dateKey_(v);}
function parseKey_(s){const p=String(s).split('-').map(Number);return new Date(p[0],p[1]-1,p[2]);}
function dayStart_(d){const x=new Date(d);x.setHours(0,0,0,0);return x;}function dayEnd_(d){const x=new Date(d);x.setHours(23,59,59,999);return x;}
function str_(v){return String(v==null?'':v).trim();}
function clean_(v){return str_(v).slice(0,500);}
function num_(v){const n=Number(v);return isFinite(n)?n:0;}
function normalizeTrialStatus_(v){const s=str_(v);if(s==='Prenotata')return'Prenotato';return s;}
function safeError_(e){const m=String(e&&e.message||e||'Errore');return /autorizzato/i.test(m)?'Accesso non autorizzato.':m.slice(0,240);}
function json_(o){return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);}
