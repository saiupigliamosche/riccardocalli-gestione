const MEMBER_PORTAL = {
  url: 'https://saiupigliamosche.github.io/riccardocalli-gestione/iscritti/',
  loginMinutes: 30,
  sessionDays: 30,
  maxDocumentBytes: 4500000,
  folderName: 'Parkour Course OS - Documenti iscritti',
  seasonStart: '2026-10-01',
  seasonEnd: '2027-06-09',
  installmentDates: ['2026-10-01','2027-01-01','2027-04-01']
};

const MEMBER_PORTAL_SCHEMA_VERSION = '2026-09-29-r2';

const MEMBER_PORTAL_HEADERS = {
  deadlines: ['Scadenza ID','Persona ID','Nome e cognome','Tipo','Numero rata','Importo','Data scadenza','Stato','Pagamento ID','Data pagamento','Promemoria -7','Promemoria giorno','Sollecito','Note','Ultimo aggiornamento'],
  documents: ['Documento ID','Persona ID','Nome e cognome','Tipo','Titolo','File ID','Nome file','MIME type','Dimensione','Data caricamento','Visibile iscritto','Caricato da','Note'],
  rsvps: ['Conferma ID','Lezione ID','Data lezione','Persona ID','Nome e cognome','Previsto','Risposta','Data risposta','Notifica 09','Promemoria 16','Ultimo aggiornamento'],
  access: ['Accesso ID','Persona ID','Email','Tipo','Token hash','Creato','Scadenza','Usato','Revocato','Ultimo accesso','Motivo'],
  push: ['Dispositivo ID','Persona ID','Nome e cognome','Email','Token FCM','Piattaforma','User agent','Creato','Ultimo aggiornamento','Ultimo invio','Ultimo errore','Revocato']
};

function isMemberPortalAction_(action) {
  return ['memberRequestLink','memberLogin','memberBootstrap','memberSetRsvp','memberGetDocument','memberPushConfig','memberRegisterPush','memberUnregisterPush','memberLogout'].indexOf(action) >= 0;
}

function dispatchMemberPortalAction_(action, data) {
  ensureMemberPortalSchemaOnce_();
  if (action === 'memberRequestLink') return memberRequestLink_(data);
  if (action === 'memberLogin') return memberLogin_(data);
  if (action === 'memberBootstrap') return memberBootstrap_(data);
  if (action === 'memberSetRsvp') return memberSetRsvp_(data);
  if (action === 'memberGetDocument') return memberGetDocument_(data);
  if (action === 'memberPushConfig') return memberPushConfig_(data);
  if (action === 'memberRegisterPush') return memberRegisterPush_(data);
  if (action === 'memberUnregisterPush') return memberUnregisterPush_(data);
  if (action === 'memberLogout') return memberLogout_(data);
  throw new Error('Azione area iscritti non valida.');
}

function ensureMemberPortalSchemaOnce_() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('MEMBER_PORTAL_SCHEMA_VERSION') === MEMBER_PORTAL_SCHEMA_VERSION) return;
  ensureMemberPortalSchema_();
  props.setProperty('MEMBER_PORTAL_SCHEMA_VERSION', MEMBER_PORTAL_SCHEMA_VERSION);
}

function ensureMemberPortalSchema_() {
  ensurePortalSheet_(ADMIN.sheets.deadlines, MEMBER_PORTAL_HEADERS.deadlines);
  ensurePortalSheet_(ADMIN.sheets.documents, MEMBER_PORTAL_HEADERS.documents);
  ensurePortalSheet_(ADMIN.sheets.rsvps, MEMBER_PORTAL_HEADERS.rsvps);
  ensurePortalSheet_(ADMIN.sheets.memberAccess, MEMBER_PORTAL_HEADERS.access);
  ensurePortalSheet_(ADMIN.sheets.pushSubscriptions, MEMBER_PORTAL_HEADERS.push);
}

function ensurePortalSheet_(name, requiredHeaders) {
  const ss = SpreadsheetApp.openById(ADMIN.spreadsheetId);
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  if (sh.getLastRow() === 0 || sh.getLastColumn() === 0) {
    sh.getRange(1,1,1,requiredHeaders.length).setValues([requiredHeaders]);
    sh.setFrozenRows(1);
    return sh;
  }
  const current = headers_(sh);
  requiredHeaders.forEach(function(header) {
    if (current.indexOf(header) < 0) {
      sh.getRange(1, sh.getLastColumn() + 1).setValue(header);
      current.push(header);
    }
  });
  return sh;
}

function portalAdminData_(memberRows) {
  ensureUpcomingRsvps_(6);
  return {
    deadlines: deadlineList_(),
    documents: documentList_(),
    rsvps: rsvpList_(memberRows),
    portalUrl: MEMBER_PORTAL.url,
    automationActive: ScriptApp.getProjectTriggers().some(function(t) { return t.getHandlerFunction() === 'runMemberPortalAutomation'; })
  };
}

function memberRequestLink_(data) {
  const email = normalizeEmail_(data.email);
  if (!email) throw new Error('Inserisci un indirizzo email valido.');
  const member = findMemberByEmail_(email);
  if (member && !recentLoginLinkExists_(email, 2)) sendMagicLinkEmail_(member, 'accesso');
  return { ok: true, message: 'Se l’email è registrata, riceverai il link di accesso entro pochi minuti.' };
}

function memberLogin_(data) {
  const raw = clean_(data.loginToken);
  if (!raw) throw new Error('Link di accesso non valido.');
  const access = findAccessByHash_(tokenHash_(raw), 'Login');
  if (!access || access.revoked) throw new Error('Il link non è valido oppure è stato revocato.');
  const member = memberForAccess_(access);
  if (!member || member.status !== 'Attivo') throw new Error('Area personale non disponibile per questo profilo.');
  markAccess_(access.row, {'Usato': new Date(), 'Ultimo accesso': new Date()});
  const sessionToken = randomToken_();
  const expires = new Date(Date.now() + MEMBER_PORTAL.sessionDays * 86400000);
  appendByHeaders_(sheet_(ADMIN.sheets.memberAccess), {
    'Accesso ID': id_('ACC'), 'Persona ID': member.id, 'Email': member.email,
    'Tipo': 'Sessione', 'Token hash': tokenHash_(sessionToken), 'Creato': new Date(),
    'Scadenza': expires, 'Ultimo accesso': new Date(), 'Motivo': 'Area iscritti'
  });
  return { ok: true, data: { sessionToken: sessionToken, expiresAt: expires.toISOString(), portal: memberPortalPayload_(member) } };
}

function memberBootstrap_(data) {
  const auth = authorizeMemberSession_(data.sessionToken);
  return { ok: true, data: memberPortalPayload_(auth.member) };
}

function memberLogout_(data) {
  const auth = authorizeMemberSession_(data.sessionToken);
  markAccess_(auth.row, {'Revocato': new Date()});
  CacheService.getScriptCache().remove('member-session-' + auth.tokenHash);
  return { ok: true };
}

function memberPortalPayload_(member) {
  let deadlines = deadlineList_().filter(function(x) { return x.personId === member.id; });
  if (!deadlines.length) {
    ensureMemberDeadlines_(member);
    deadlines = deadlineList_().filter(function(x) { return x.personId === member.id; });
  }
  const nextDate = nextScheduledLessonForMember_(member, new Date());
  let rsvp = null;
  if (nextDate) {
    let rsvps = rsvpList_();
    rsvp = rsvps.find(function(x) { return x.personId === member.id && x.date === nextDate; }) || null;
    if (!rsvp) {
      ensureRsvpsForDate_(nextDate);
      rsvps = rsvpList_();
      rsvp = rsvps.find(function(x) { return x.personId === member.id && x.date === nextDate; }) || null;
    }
  }
  return {
    member: { id: member.id, name: member.name, email: member.email, plan: member.plan, frequency: member.frequency, status: member.status },
    deadlines: deadlines,
    payments: memberPaymentList_(member.id),
    documents: documentList_().filter(function(x) { return x.personId === member.id && x.visible; }),
    rsvp: rsvp,
    push: pushMemberStatus_(member.id),
    generatedAt: new Date().toISOString()
  };
}

function authorizeMemberSession_(rawToken) {
  const token = clean_(rawToken);
  if (!token) throw new Error('Sessione scaduta. Accedi di nuovo.');
  const hash = tokenHash_(token), cache = CacheService.getScriptCache(), cacheKey = 'member-session-' + hash;
  let access = null;
  try {
    const cached = cache.get(cacheKey);
    if (cached) {
      access = JSON.parse(cached);
      access.expiresAt = new Date(access.expiresAt);
    }
  } catch (_) { access = null; }
  if (!access) {
    access = findAccessByHash_(hash, 'Sessione');
    if (access && !access.revoked) cache.put(cacheKey, JSON.stringify({row:access.row,personId:access.personId,email:access.email,used:access.used,revoked:false,expiresAt:access.expiresAt.toISOString()}), 21600);
  }
  if (!access || access.revoked || access.expiresAt.getTime() < Date.now()) throw new Error('Sessione scaduta. Accedi di nuovo.');
  const member = memberForAccess_(access);
  if (!member || member.status !== 'Attivo') throw new Error('Area personale non disponibile.');
  const touchKey = 'member-touch-' + hash;
  if (!cache.get(touchKey)) {
    markAccess_(access.row, {'Ultimo accesso': new Date()});
    cache.put(touchKey, '1', 21600);
  }
  return { member: member, row: access.row, tokenHash: hash };
}

function findAccessByHash_(hash, type) {
  const sh = sheet_(ADMIN.sheets.memberAccess), h = headers_(sh), values = sh.getDataRange().getValues();
  for (let i = values.length - 1; i >= 1; i--) {
    const r = rowObj_(h, values[i]);
    if (str_(r['Token hash']) === hash && str_(r['Tipo']) === type) {
      return { row: i + 1, personId: str_(r['Persona ID']), email: str_(r['Email']), used: !!r['Usato'], revoked: !!r['Revocato'], expiresAt: r['Scadenza'] instanceof Date ? r['Scadenza'] : new Date(r['Scadenza']) };
    }
  }
  return null;
}

function markAccess_(row, fields) {
  const sh = sheet_(ADMIN.sheets.memberAccess), h = headers_(sh);
  Object.keys(fields).forEach(function(k) { setCellByHeader_(sh, row, h, k, fields[k]); });
}

function normalizeEmail_(value) {
  const email = clean_(value).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';
}

function findMemberByEmail_(email) {
  return memberList_().find(function(m) { return normalizeEmail_(m.email) === email && m.status === 'Attivo'; }) || null;
}

function memberForAccess_(access) {
  return findMember_(access.personId, true) || findMemberByEmail_(access.email);
}

function recentLoginLinkExists_(email, minutes) {
  const cutoff = Date.now() - minutes * 60000;
  return table_(sheet_(ADMIN.sheets.memberAccess)).some(function(r) {
    const created = r['Creato'] instanceof Date ? r['Creato'].getTime() : new Date(r['Creato']).getTime();
    return normalizeEmail_(r['Email']) === email && str_(r['Tipo']) === 'Login' && created >= cutoff;
  });
}

function randomToken_() {
  return Utilities.getUuid().replace(/-/g,'') + Utilities.getUuid().replace(/-/g,'');
}

function tokenHash_(token) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(token), Utilities.Charset.UTF_8).map(function(b) {
    const n = b < 0 ? b + 256 : b;
    return ('0' + n.toString(16)).slice(-2);
  }).join('');
}

function createMagicLink_(member, reason) {
  const raw = randomToken_();
  appendByHeaders_(sheet_(ADMIN.sheets.memberAccess), {
    'Accesso ID': id_('ACC'), 'Persona ID': member.id, 'Email': member.email,
    'Tipo': 'Login', 'Token hash': tokenHash_(raw), 'Creato': new Date(),
    'Scadenza': '', 'Motivo': (reason || 'Accesso') + ' · Link permanente'
  });
  return MEMBER_PORTAL.url + '?login=' + encodeURIComponent(raw);
}

function sendMagicLinkEmail_(member, reason) {
  if (!normalizeEmail_(member.email)) return false;
  const link = createMagicLink_(member, reason);
  const body = '<p>Ciao ' + html_(member.name) + ',</p><p>usa il pulsante qui sotto per accedere alla tua area personale del Corso Parkour Padova.</p>' + emailButton_(link, 'APRI AREA PERSONALE') + '<p style="color:#66736f;font-size:13px">Questo link personale non scade e può essere usato su più dispositivi. Non inoltrarlo ad altre persone.</p>';
  MailApp.sendEmail({ to: member.email, subject: 'Accesso area personale · Corso Parkour Padova', htmlBody: emailLayout_('Area personale', body), name: 'Corso Parkour Padova' });
  return true;
}

function sendMemberAccessLink_(data) {
  const member = findMember_(clean_(data.personId));
  if (!normalizeEmail_(member.email)) throw new Error('Questo iscritto non ha un’email valida.');
  sendMagicLinkEmail_(member, 'Invito amministratore');
  return { ok: true };
}

function ensureAllMemberDeadlines_() {
  memberList_().filter(function(m) { return m.status === 'Attivo'; }).forEach(ensureMemberDeadlines_);
}

function ensureMemberDeadlines_(member) {
  if (!member || !member.id) return;
  const existing = table_(sheet_(ADMIN.sheets.deadlines)).filter(function(r) { return str_(r['Persona ID']) === member.id; });
  if (existing.length) return;
  const plan = str_(member.plan).toLowerCase(), twice = /^2/.test(str_(member.frequency));
  let definitions = [];
  if (plan.indexOf('3 rate') >= 0) {
    const amount = twice ? 165 : 110;
    definitions = installmentDates_().map(function(date, i) { return { type: 'Rata', number: i + 1, amount: amount, date: date }; });
  } else if (plan.indexOf('annuale') >= 0) {
    definitions = [{ type: 'Annuale', number: 1, amount: twice ? 480 : 290, date: annualDeadline_(member) }];
  } else if (plan.indexOf('mese') >= 0) {
    definitions = [{ type: 'Mese di prova', number: 1, amount: twice ? 60 : 45, date: joinedDate_(member) }];
  }
  const payments = memberPaymentList_(member.id).slice().sort(function(a,b) { return String(a.date).localeCompare(String(b.date)); });
  definitions.forEach(function(def, index) {
    const payment = payments[index] || null;
    appendByHeaders_(sheet_(ADMIN.sheets.deadlines), {
      'Scadenza ID': id_('SCA'), 'Persona ID': member.id, 'Nome e cognome': member.name,
      'Tipo': def.type, 'Numero rata': def.number, 'Importo': def.amount,
      'Data scadenza': parseKey_(def.date), 'Stato': payment ? 'Pagata' : 'Da pagare',
      'Pagamento ID': payment ? payment.id : '', 'Data pagamento': payment && payment.date ? new Date(payment.date) : '',
      'Ultimo aggiornamento': new Date()
    });
  });
}

function installmentDates_() {
  return [config_('Scadenza rata 1'), config_('Scadenza rata 2'), config_('Scadenza rata 3')].map(function(v,i) { return dateKey_(v) || MEMBER_PORTAL.installmentDates[i]; });
}

function joinedDate_(member) {
  return dateKey_(member.joinedAt) || Utilities.formatDate(new Date(), ADMIN.timezone, 'yyyy-MM-dd');
}

function annualDeadline_(member) {
  const joined = joinedDate_(member), configured = dateKey_(config_('Scadenza annuale')) || MEMBER_PORTAL.seasonStart;
  return joined > configured ? joined : configured;
}

function deadlineList_() {
  const today = Utilities.formatDate(new Date(), ADMIN.timezone, 'yyyy-MM-dd');
  return table_(sheet_(ADMIN.sheets.deadlines)).map(function(r) {
    const due = dateKey_(r['Data scadenza']), stored = str_(r['Stato']) || 'Da pagare';
    const status = stored === 'Pagata' ? 'Pagata' : (due && due < today ? 'Scaduta' : 'Da pagare');
    return { id: str_(r['Scadenza ID']), personId: str_(r['Persona ID']), name: str_(r['Nome e cognome']), type: str_(r['Tipo']), installment: num_(r['Numero rata']), amount: num_(r['Importo']), dueDate: due, status: status, paymentId: str_(r['Pagamento ID']), paidAt: dateIso_(r['Data pagamento']), note: str_(r['Note']) };
  }).filter(function(x) { return x.id && x.personId; }).sort(function(a,b) { return String(a.dueDate).localeCompare(String(b.dueDate)); });
}

function updateDeadline_(data) {
  const id = clean_(data.deadlineId), due = clean_(data.dueDate), amount = num_(data.amount), status = clean_(data.status);
  if (!id || !/^\d{4}-\d{2}-\d{2}$/.test(due) || amount <= 0) throw new Error('Scadenza non valida.');
  const allowed = ['Da pagare','Pagata','Annullata'];
  if (allowed.indexOf(status) < 0) throw new Error('Stato scadenza non valido.');
  const sh = sheet_(ADMIN.sheets.deadlines), h = headers_(sh), rows = sh.getDataRange().getValues();
  for (let i=1;i<rows.length;i++) {
    if (str_(rows[i][h.indexOf('Scadenza ID')]) !== id) continue;
    setCellByHeader_(sh,i+1,h,'Data scadenza',parseKey_(due));
    setCellByHeader_(sh,i+1,h,'Importo',amount);
    setCellByHeader_(sh,i+1,h,'Stato',status);
    setCellByHeader_(sh,i+1,h,'Note',clean_(data.note));
    setCellByHeader_(sh,i+1,h,'Ultimo aggiornamento',new Date());
    return { ok: true };
  }
  throw new Error('Scadenza non trovata.');
}

function settleNextDeadline_(personId, amount, paymentId) {
  ensureMemberPortalSchema_();
  const member = findMember_(personId, true);
  if (member) ensureMemberDeadlines_(member);
  const sh = sheet_(ADMIN.sheets.deadlines), h = headers_(sh), rows = sh.getDataRange().getValues(), candidates = [];
  for (let i=1;i<rows.length;i++) {
    const r = rowObj_(h,rows[i]);
    if (str_(r['Pagamento ID']) === paymentId) return;
    if (str_(r['Persona ID']) === personId && str_(r['Stato']) !== 'Pagata' && str_(r['Stato']) !== 'Annullata') candidates.push({row:i+1,due:dateKey_(r['Data scadenza']),amount:num_(r['Importo'])});
  }
  candidates.sort(function(a,b) { return a.due.localeCompare(b.due); });
  const match = candidates.find(function(x) { return Math.abs(x.amount - amount) < 0.01; }) || candidates[0];
  if (!match) return;
  setCellByHeader_(sh,match.row,h,'Stato','Pagata');
  setCellByHeader_(sh,match.row,h,'Pagamento ID',paymentId);
  setCellByHeader_(sh,match.row,h,'Data pagamento',new Date());
  setCellByHeader_(sh,match.row,h,'Ultimo aggiornamento',new Date());
}

function memberPaymentList_(personId) {
  return table_(sheet_(ADMIN.sheets.payments)).map(function(r) {
    return { id: str_(r['Pagamento ID']), personId: str_(r['Persona ID']), name: str_(r['Nome e cognome']), date: dateIso_(r['Data']), type: str_(r['Tipo pagamento']), amount: num_(r['Importo']), method: str_(r['Metodo']), installment: str_(r['Periodo/Rata']) };
  }).filter(function(p) { return p.personId === personId; }).sort(function(a,b) { return String(b.date).localeCompare(String(a.date)); });
}

function documentList_() {
  return table_(sheet_(ADMIN.sheets.documents)).map(function(r) {
    return { id: str_(r['Documento ID']), personId: str_(r['Persona ID']), name: str_(r['Nome e cognome']), type: str_(r['Tipo']), title: str_(r['Titolo']), fileName: str_(r['Nome file']), mimeType: str_(r['MIME type']), size: num_(r['Dimensione']), uploadedAt: dateIso_(r['Data caricamento']), visible: str_(r['Visibile iscritto']) !== 'No', deleted: str_(r['Note']).indexOf('[ELIMINATO]') >= 0 };
  }).filter(function(x) { return x.id && !x.deleted; }).sort(function(a,b) { return String(b.uploadedAt).localeCompare(String(a.uploadedAt)); });
}

function uploadMemberDocument_(data) {
  const member = findMember_(clean_(data.personId));
  const title = clean_(data.title), type = clean_(data.type) || 'Documento';
  const mime = clean_(data.mimeType).toLowerCase(), fileName = sanitizeFileName_(clean_(data.fileName) || title);
  const allowed = ['application/pdf','image/jpeg','image/png'];
  if (!title) throw new Error('Inserisci il titolo del documento.');
  if (allowed.indexOf(mime) < 0) throw new Error('Sono ammessi PDF, JPG e PNG.');
  const base64 = String(data.contentBase64 || '').replace(/^data:[^;]+;base64,/, '');
  const bytes = Utilities.base64Decode(base64);
  if (!bytes.length || bytes.length > MEMBER_PORTAL.maxDocumentBytes) throw new Error('Il file deve pesare meno di 4,5 MB.');
  const blob = Utilities.newBlob(bytes, mime, fileName), file = portalFolder_().createFile(blob);
  file.setDescription('Documento area iscritti · ' + member.name + ' · ' + type);
  const documentId = id_('DOC');
  appendByHeaders_(sheet_(ADMIN.sheets.documents), {
    'Documento ID': documentId, 'Persona ID': member.id, 'Nome e cognome': member.name,
    'Tipo': type, 'Titolo': title, 'File ID': file.getId(), 'Nome file': fileName,
    'MIME type': mime, 'Dimensione': bytes.length, 'Data caricamento': new Date(),
    'Visibile iscritto': data.visible === false ? 'No' : 'Sì', 'Caricato da': ADMIN.ownerEmail,
    'Note': clean_(data.note)
  });
  return { ok: true, documentId: documentId };
}

function deleteMemberDocument_(data) {
  const id = clean_(data.documentId), sh = sheet_(ADMIN.sheets.documents), h = headers_(sh), rows = sh.getDataRange().getValues();
  for (let i=1;i<rows.length;i++) {
    const r = rowObj_(h,rows[i]);
    if (str_(r['Documento ID']) !== id) continue;
    const fileId = str_(r['File ID']);
    if (fileId) try { DriveApp.getFileById(fileId).setTrashed(true); } catch (_) {}
    setCellByHeader_(sh,i+1,h,'Visibile iscritto','No');
    setCellByHeader_(sh,i+1,h,'Note',(str_(r['Note']) + ' [ELIMINATO]').trim());
    return { ok: true };
  }
  throw new Error('Documento non trovato.');
}

function memberGetDocument_(data) {
  const auth = authorizeMemberSession_(data.sessionToken), id = clean_(data.documentId);
  const sh = sheet_(ADMIN.sheets.documents), h = headers_(sh), values = sh.getDataRange().getValues();
  for (let i=1;i<values.length;i++) {
    const r = rowObj_(h,values[i]);
    if (str_(r['Documento ID']) !== id || str_(r['Persona ID']) !== auth.member.id || str_(r['Visibile iscritto']) === 'No') continue;
    const blob = DriveApp.getFileById(str_(r['File ID'])).getBlob();
    return { ok: true, data: { fileName: str_(r['Nome file']), mimeType: str_(r['MIME type']), contentBase64: Utilities.base64Encode(blob.getBytes()) } };
  }
  throw new Error('Documento non disponibile.');
}

function pushSettings_() {
  const props = PropertiesService.getScriptProperties();
  let webConfig = {};
  try { webConfig = JSON.parse(props.getProperty('FCM_WEB_CONFIG') || '{}'); } catch (_) {}
  const settings = {
    projectId: clean_(props.getProperty('FCM_PROJECT_ID') || webConfig.projectId),
    clientEmail: clean_(props.getProperty('FCM_CLIENT_EMAIL')),
    privateKey: String(props.getProperty('FCM_PRIVATE_KEY') || '').replace(/\\n/g,'\n'),
    vapidKey: clean_(props.getProperty('FCM_VAPID_PUBLIC_KEY')),
    webConfig: webConfig
  };
  settings.enabled = !!(settings.projectId && settings.clientEmail && settings.privateKey && settings.vapidKey && settings.webConfig.apiKey && settings.webConfig.messagingSenderId && settings.webConfig.appId);
  return settings;
}

function memberPushConfig_(data) {
  authorizeMemberSession_(data.sessionToken);
  const settings = pushSettings_();
  return { ok:true, data:{ enabled:settings.enabled, firebaseConfig:settings.enabled ? settings.webConfig : {}, vapidKey:settings.enabled ? settings.vapidKey : '' } };
}

function pushMemberStatus_(personId) {
  const configured = pushSettings_().enabled;
  if (!configured) return { available:false, devices:0 };
  const devices = table_(sheet_(ADMIN.sheets.pushSubscriptions)).filter(function(r) {
    return str_(r['Persona ID']) === personId && str_(r['Token FCM']) && !r['Revocato'];
  }).length;
  return { available:true, devices:devices };
}

function memberRegisterPush_(data) {
  const auth = authorizeMemberSession_(data.sessionToken), token = String(data.fcmToken || '').trim();
  const deviceId = clean_(data.deviceId).slice(0,120), platform = clean_(data.platform).slice(0,80), userAgent = clean_(data.userAgent).slice(0,500);
  if (!pushSettings_().enabled) throw new Error('Le notifiche push non sono ancora configurate.');
  if (!deviceId || token.length < 20 || token.length > 4096) throw new Error('Registrazione del dispositivo non valida.');
  const sh = sheet_(ADMIN.sheets.pushSubscriptions), h = headers_(sh), rows = sh.getDataRange().getValues();
  let row = 0;
  for (let i=1;i<rows.length;i++) {
    const r = rowObj_(h,rows[i]);
    if ((str_(r['Dispositivo ID']) === deviceId && str_(r['Persona ID']) === auth.member.id) || str_(r['Token FCM']) === token) { row = i + 1; break; }
  }
  const values = {
    'Dispositivo ID':deviceId, 'Persona ID':auth.member.id, 'Nome e cognome':auth.member.name,
    'Email':auth.member.email, 'Token FCM':token, 'Piattaforma':platform, 'User agent':userAgent,
    'Ultimo aggiornamento':new Date(), 'Ultimo errore':'', 'Revocato':''
  };
  if (row) Object.keys(values).forEach(function(k) { setCellByHeader_(sh,row,h,k,values[k]); });
  else {
    values['Creato'] = new Date();
    appendByHeaders_(sh,values);
  }
  const test = sendFcmToken_(token, {
    title:'Notifiche attivate',
    body:'Riceverai qui conferme delle lezioni e promemoria dei pagamenti.',
    url:MEMBER_PORTAL.url,
    tag:'push-enabled'
  });
  if (!test.ok) markPushToken_(token, {'Ultimo errore':test.error || 'Invio di prova non riuscito'});
  return { ok:true, data:{ registered:true, testSent:test.ok, devices:pushMemberStatus_(auth.member.id).devices } };
}

function memberUnregisterPush_(data) {
  const auth = authorizeMemberSession_(data.sessionToken), token = String(data.fcmToken || '').trim(), deviceId = clean_(data.deviceId);
  const sh = sheet_(ADMIN.sheets.pushSubscriptions), h = headers_(sh), rows = sh.getDataRange().getValues();
  for (let i=1;i<rows.length;i++) {
    const r = rowObj_(h,rows[i]);
    if (str_(r['Persona ID']) !== auth.member.id) continue;
    if ((token && str_(r['Token FCM']) === token) || (deviceId && str_(r['Dispositivo ID']) === deviceId)) {
      setCellByHeader_(sh,i+1,h,'Revocato',new Date());
      setCellByHeader_(sh,i+1,h,'Ultimo aggiornamento',new Date());
    }
  }
  return { ok:true };
}

function markPushToken_(token, fields) {
  const sh = sheet_(ADMIN.sheets.pushSubscriptions), h = headers_(sh), rows = sh.getDataRange().getValues();
  for (let i=1;i<rows.length;i++) {
    if (str_(rows[i][h.indexOf('Token FCM')]) !== token) continue;
    Object.keys(fields).forEach(function(k) { setCellByHeader_(sh,i+1,h,k,fields[k]); });
    return;
  }
}

function activePushTokens_(personId) {
  return table_(sheet_(ADMIN.sheets.pushSubscriptions)).filter(function(r) {
    return str_(r['Persona ID']) === personId && str_(r['Token FCM']) && !r['Revocato'];
  }).map(function(r) { return str_(r['Token FCM']); });
}

function sendMemberPush_(personId, message) {
  if (!pushSettings_().enabled) return { sent:0, failed:0 };
  let sent = 0, failed = 0;
  activePushTokens_(personId).forEach(function(token) {
    const result = sendFcmToken_(token,message);
    if (result.ok) {
      sent++;
      markPushToken_(token, {'Ultimo invio':new Date(),'Ultimo errore':''});
    } else {
      failed++;
      const fields = {'Ultimo errore':result.error || 'Invio non riuscito','Ultimo aggiornamento':new Date()};
      if (result.invalid) fields['Revocato'] = new Date();
      markPushToken_(token,fields);
    }
  });
  return { sent:sent, failed:failed };
}

function sendFcmToken_(token, message) {
  try {
    const settings = pushSettings_();
    if (!settings.enabled) return { ok:false, error:'Firebase non configurato' };
    const response = UrlFetchApp.fetch('https://fcm.googleapis.com/v1/projects/' + encodeURIComponent(settings.projectId) + '/messages:send', {
      method:'post', contentType:'application/json', muteHttpExceptions:true,
      headers:{Authorization:'Bearer ' + fcmAccessToken_(settings)},
      payload:JSON.stringify({message:{token:token,data:{
        title:String(message.title || 'Corso Parkour Padova'),
        body:String(message.body || ''),
        url:String(message.url || MEMBER_PORTAL.url),
        tag:String(message.tag || 'parkour-update')
      },webpush:{headers:{TTL:'86400'}}}})
    });
    const code = response.getResponseCode(), body = response.getContentText();
    if (code >= 200 && code < 300) return { ok:true };
    let detail = body;
    try { const parsed = JSON.parse(body); detail = parsed.error && parsed.error.message ? parsed.error.message : body; } catch (_) {}
    return { ok:false, error:('FCM ' + code + ': ' + detail).slice(0,500), invalid:code === 404 || /UNREGISTERED|not a valid FCM registration token/i.test(detail) };
  } catch (err) {
    return { ok:false, error:safeError_(err).slice(0,500) };
  }
}

function fcmAccessToken_(settings) {
  const cache = CacheService.getScriptCache(), cached = cache.get('FCM_ACCESS_TOKEN');
  if (cached) return cached;
  const now = Math.floor(Date.now()/1000), header = {alg:'RS256',typ:'JWT'}, claims = {
    iss:settings.clientEmail,
    scope:'https://www.googleapis.com/auth/firebase.messaging',
    aud:'https://oauth2.googleapis.com/token',
    iat:now,
    exp:now + 3600
  };
  const unsigned = base64UrlText_(JSON.stringify(header)) + '.' + base64UrlText_(JSON.stringify(claims));
  const signature = Utilities.computeRsaSha256Signature(unsigned,settings.privateKey);
  const assertion = unsigned + '.' + Utilities.base64EncodeWebSafe(signature).replace(/=+$/,'');
  const response = UrlFetchApp.fetch('https://oauth2.googleapis.com/token', {
    method:'post', contentType:'application/x-www-form-urlencoded', muteHttpExceptions:true,
    payload:{grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:assertion}
  });
  if (response.getResponseCode() !== 200) throw new Error('Autorizzazione Firebase non riuscita: ' + response.getContentText());
  const token = JSON.parse(response.getContentText()).access_token;
  if (!token) throw new Error('Firebase non ha restituito un token di accesso.');
  cache.put('FCM_ACCESS_TOKEN',token,3300);
  return token;
}

function base64UrlText_(value) {
  return Utilities.base64EncodeWebSafe(String(value),Utilities.Charset.UTF_8).replace(/=+$/,'');
}

function portalFolder_() {
  const props = PropertiesService.getScriptProperties(), saved = props.getProperty('MEMBER_DOCUMENTS_FOLDER_ID');
  if (saved) try { return DriveApp.getFolderById(saved); } catch (_) {}
  const matches = DriveApp.getFoldersByName(MEMBER_PORTAL.folderName), folder = matches.hasNext() ? matches.next() : DriveApp.createFolder(MEMBER_PORTAL.folderName);
  props.setProperty('MEMBER_DOCUMENTS_FOLDER_ID', folder.getId());
  return folder;
}

function sanitizeFileName_(name) {
  return str_(name).replace(/[\\/:*?"<>|]/g,'-').slice(0,120) || 'documento';
}

function ensureUpcomingRsvps_(count) {
  let d = new Date(), made = 0, keys = [];
  d.setHours(12,0,0,0);
  if (Utilities.formatDate(d,ADMIN.timezone,'yyyy-MM-dd') < MEMBER_PORTAL.seasonStart) d = parseKey_(MEMBER_PORTAL.seasonStart);
  while (made < count && Utilities.formatDate(d,ADMIN.timezone,'yyyy-MM-dd') <= MEMBER_PORTAL.seasonEnd) {
    if (isCourseDay_(d)) { keys.push(Utilities.formatDate(d,ADMIN.timezone,'yyyy-MM-dd')); made++; }
    d.setDate(d.getDate()+1);
  }
  ensureRsvpsForDates_(keys);
}

function ensureRsvpsForDate_(key) {
  ensureRsvpsForDates_([key]);
}

function ensureRsvpsForDates_(dateKeys) {
  const keys = dateKeys.filter(function(key) { return isSeasonLessonKey_(key) && isCourseDay_(parseKey_(key)); });
  if (!keys.length) return;
  const lock = LockService.getScriptLock();
  lock.waitLock(5000);
  try {
    const sh = sheet_(ADMIN.sheets.rsvps), h = headers_(sh), values = sh.getDataRange().getValues(), existing = {};
    values.slice(1).forEach(function(row) {
      const r = rowObj_(h,row), key = dateKey_(r['Data lezione']);
      if (keys.indexOf(key) >= 0) existing[key + '|' + str_(r['Persona ID'])] = true;
    });
    const members = memberList_().filter(function(m) { return m.status === 'Attivo'; }), additions = [], now = new Date();
    keys.forEach(function(key) {
      members.filter(function(m) { return scheduledForMember_(m,key); }).forEach(function(m) {
        if (existing[key + '|' + m.id]) return;
        const record = {'Conferma ID':id_('RSV'),'Lezione ID':lessonId_(key),'Data lezione':parseKey_(key),'Persona ID':m.id,'Nome e cognome':m.name,'Previsto':'Sì','Risposta':'In attesa','Ultimo aggiornamento':now};
        additions.push(h.map(function(header) { return Object.prototype.hasOwnProperty.call(record,header) ? record[header] : ''; }));
        existing[key + '|' + m.id] = true;
      });
    });
    if (additions.length) sh.getRange(sh.getLastRow()+1,1,additions.length,h.length).setValues(additions);
  } finally {
    try { lock.releaseLock(); } catch (_) {}
  }
}

function rsvpList_(memberRows) {
  const min = new Date(); min.setDate(min.getDate()-35);
  const max = new Date(); max.setDate(max.getDate()+50);
  const minKey = Utilities.formatDate(min,ADMIN.timezone,'yyyy-MM-dd'), maxKey = Utilities.formatDate(max,ADMIN.timezone,'yyyy-MM-dd');
  const liveNames = {};
  (memberRows || []).forEach(function(member) { liveNames[member.id] = member.name; });
  return table_(sheet_(ADMIN.sheets.rsvps)).map(function(r) {
    const personId = str_(r['Persona ID']);
    return { id:str_(r['Conferma ID']), lessonId:str_(r['Lezione ID']), date:dateKey_(r['Data lezione']), personId:personId, name:liveNames[personId] || str_(r['Nome e cognome']), expected:str_(r['Previsto']) !== 'No', response:str_(r['Risposta']) || 'In attesa', respondedAt:dateIso_(r['Data risposta']) };
  }).filter(function(x) { return x.date >= minKey && x.date <= maxKey; });
}

function memberSetRsvp_(data) {
  const auth = authorizeMemberSession_(data.sessionToken), key = clean_(data.lessonDate), response = clean_(data.response);
  if (['Sì','No'].indexOf(response) < 0) throw new Error('Risposta non valida.');
  if (!scheduledForMember_(auth.member,key)) throw new Error('Questa lezione non è prevista dal tuo abbonamento.');
  const today = Utilities.formatDate(new Date(),ADMIN.timezone,'yyyy-MM-dd'), hour = num_(Utilities.formatDate(new Date(),ADMIN.timezone,'H'));
  if (key < today || (key === today && hour >= 19)) throw new Error('Le conferme per questa lezione sono chiuse.');
  const sh = sheet_(ADMIN.sheets.rsvps), h = headers_(sh);
  let rows = sh.getDataRange().getValues(), rowIndex = findRsvpRowIndex_(rows,h,key,auth.member.id);
  if (rowIndex < 1) {
    ensureRsvpsForDate_(key);
    rows = sh.getDataRange().getValues();
    rowIndex = findRsvpRowIndex_(rows,h,key,auth.member.id);
  }
  if (rowIndex >= 1) {
    const next = rows[rowIndex].slice(), now = new Date();
    next[h.indexOf('Risposta')] = response;
    next[h.indexOf('Data risposta')] = now;
    next[h.indexOf('Ultimo aggiornamento')] = now;
    sh.getRange(rowIndex+1,1,1,h.length).setValues([next]);
    return { ok:true, data:{ response:response, updatedAt:now.toISOString() } };
  }
  throw new Error('Conferma lezione non trovata.');
}

function findRsvpRowIndex_(rows, headers, key, personId) {
  for (let i=1;i<rows.length;i++) {
    const r = rowObj_(headers,rows[i]);
    if (dateKey_(r['Data lezione']) === key && str_(r['Persona ID']) === personId) return i;
  }
  return -1;
}

function scheduledForMember_(member, key) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;
  const day = parseKey_(key).getDay(), frequency = str_(member.frequency).toLowerCase();
  if (frequency.indexOf('2') === 0 || frequency.indexOf('2x') >= 0 || frequency.indexOf('2×') >= 0) return day === 2 || day === 4;
  if (day === 2) return frequency.indexOf('mart') >= 0;
  if (day === 4) return frequency.indexOf('giov') >= 0;
  return false;
}

function nextScheduledLessonForMember_(member, start) {
  const d = new Date(start); d.setHours(12,0,0,0);
  if (Utilities.formatDate(d,ADMIN.timezone,'yyyy-MM-dd') < MEMBER_PORTAL.seasonStart) d.setTime(parseKey_(MEMBER_PORTAL.seasonStart).getTime());
  if (Utilities.formatDate(d,ADMIN.timezone,'yyyy-MM-dd') > MEMBER_PORTAL.seasonEnd) return '';
  const todayKey = Utilities.formatDate(d,ADMIN.timezone,'yyyy-MM-dd'), hour = num_(Utilities.formatDate(new Date(),ADMIN.timezone,'H'));
  if (hour >= 19 && scheduledForMember_(member,todayKey)) d.setDate(d.getDate()+1);
  for (let i=0;i<15;i++) {
    const key = Utilities.formatDate(d,ADMIN.timezone,'yyyy-MM-dd');
    if (key > MEMBER_PORTAL.seasonEnd) return '';
    if (scheduledForMember_(member,key)) return key;
    d.setDate(d.getDate()+1);
  }
  return '';
}

function isCourseDay_(date) { return date.getDay() === 2 || date.getDay() === 4; }
function isSeasonLessonKey_(key) { return /^\d{4}-\d{2}-\d{2}$/.test(key) && key >= MEMBER_PORTAL.seasonStart && key <= MEMBER_PORTAL.seasonEnd; }

function installMemberPortalAutomation_() {
  ScriptApp.getProjectTriggers().filter(function(t) { return t.getHandlerFunction() === 'runMemberPortalAutomation'; }).forEach(function(t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('runMemberPortalAutomation').timeBased().everyHours(1).create();
  return { ok:true, message:'Automazioni attive ogni ora.' };
}

function runMemberPortalAutomation() {
  ensureMemberPortalSchema_();
  ensureAllMemberDeadlines_();
  const now = new Date(), hour = num_(Utilities.formatDate(now,ADMIN.timezone,'H')), key = Utilities.formatDate(now,ADMIN.timezone,'yyyy-MM-dd');
  if (isSeasonLessonKey_(key) && isCourseDay_(parseKey_(key)) && (hour === 9 || hour === 16)) sendRsvpNotifications_(key,hour);
  if (hour === 9) sendPaymentReminders_(key);
}

function sendRsvpNotifications_(key, hour) {
  ensureRsvpsForDate_(key);
  const sh = sheet_(ADMIN.sheets.rsvps), h = headers_(sh), rows = sh.getDataRange().getValues();
  for (let i=1;i<rows.length;i++) {
    const r = rowObj_(h,rows[i]);
    if (dateKey_(r['Data lezione']) !== key || str_(r['Previsto']) === 'No') continue;
    if (hour === 16 && str_(r['Risposta']) !== 'In attesa') continue;
    const flag = hour === 9 ? 'Notifica 09' : 'Promemoria 16';
    if (r[flag]) continue;
    const member = findMember_(str_(r['Persona ID']),true);
    if (!member) continue;
    const intro = hour === 9 ? 'Oggi c’è lezione. Ci sarai?' : 'Non hai ancora confermato la presenza alla lezione di oggi.';
    if (normalizeEmail_(member.email)) {
      const link = createMagicLink_(member,hour === 9 ? 'Conferma lezione' : 'Promemoria conferma');
      const body = '<p>Ciao '+html_(member.name)+',</p><p>'+intro+'</p>'+emailButton_(link,'CONFERMA SÌ O NO')+'<p style="color:#66736f;font-size:13px">Puoi modificare la risposta fino alle 19:00.</p>';
      MailApp.sendEmail({to:member.email,subject:(hour===9?'Conferma presenza':'Promemoria presenza')+' · lezione di oggi',htmlBody:emailLayout_('Lezione di oggi',body),name:'Corso Parkour Padova'});
    }
    sendMemberPush_(member.id,{
      title:hour === 9 ? 'Conferma la lezione di oggi' : 'Conferma ancora in attesa',
      body:hour === 9 ? 'Lezione 19:00–20:30. Tocca per rispondere Sì o No.' : 'La lezione inizia alle 19:00. Tocca per confermare.',
      url:MEMBER_PORTAL.url + '#home',
      tag:'rsvp-' + key
    });
    setCellByHeader_(sh,i+1,h,flag,new Date());
  }
}

function sendPaymentReminders_(todayKey) {
  const sh = sheet_(ADMIN.sheets.deadlines), h = headers_(sh), rows = sh.getDataRange().getValues();
  for (let i=1;i<rows.length;i++) {
    const r = rowObj_(h,rows[i]);
    if (str_(r['Stato']) === 'Pagata' || str_(r['Stato']) === 'Annullata') continue;
    const due = dateKey_(r['Data scadenza']); if (!due) continue;
    const delta = Math.round((parseKey_(due).getTime()-parseKey_(todayKey).getTime())/86400000);
    let flag = ''; if (delta === 7) flag = 'Promemoria -7'; else if (delta === 0) flag = 'Promemoria giorno'; else if (delta === -3) flag = 'Sollecito';
    if (!flag || r[flag]) continue;
    const member = findMember_(str_(r['Persona ID']),true); if (!member) continue;
    const amount = num_(r['Importo']).toFixed(2).replace('.',',');
    if (normalizeEmail_(member.email)) {
      const link = createMagicLink_(member,'Promemoria pagamento');
      const body = '<p>Ciao '+html_(member.name)+',</p><p>promemoria per il pagamento di <strong>€ '+amount+'</strong>, con scadenza '+html_(due)+'.</p>'+emailButton_(link,'VEDI PAGAMENTI')+'<p style="color:#66736f;font-size:13px">Se hai già pagato, ignora questo messaggio: l’amministratore aggiornerà lo stato.</p>';
      MailApp.sendEmail({to:member.email,subject:'Promemoria pagamento · Corso Parkour Padova',htmlBody:emailLayout_('Scadenza pagamento',body),name:'Corso Parkour Padova'});
    }
    sendMemberPush_(member.id,{
      title:delta < 0 ? 'Pagamento scaduto' : 'Pagamento in scadenza',
      body:'Importo € '+amount+' · scadenza '+due+'. Tocca per vedere i dettagli.',
      url:MEMBER_PORTAL.url + '#payments',
      tag:'payment-' + str_(r['Scadenza ID'])
    });
    setCellByHeader_(sh,i+1,h,flag,new Date());
  }
}

function emailButton_(url,label) { return '<p style="margin:24px 0"><a href="'+html_(url)+'" style="display:inline-block;background:#17352e;color:#fff;text-decoration:none;padding:14px 20px;border-radius:12px;font-weight:700">'+html_(label)+'</a></p>'; }
function emailLayout_(title,body) { return '<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#14231e"><div style="letter-spacing:.12em;color:#66736f;font-size:12px;font-weight:700">CORSO PARKOUR PADOVA</div><h1 style="font-size:26px;margin:8px 0 20px">'+html_(title)+'</h1>'+body+'</div>'; }
function html_(value) { return String(value == null ? '' : value).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }
