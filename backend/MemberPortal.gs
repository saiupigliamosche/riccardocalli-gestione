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

const MEMBER_PORTAL_HEADERS = {
  deadlines: ['Scadenza ID','Persona ID','Nome e cognome','Tipo','Numero rata','Importo','Data scadenza','Stato','Pagamento ID','Data pagamento','Promemoria -7','Promemoria giorno','Sollecito','Note','Ultimo aggiornamento'],
  documents: ['Documento ID','Persona ID','Nome e cognome','Tipo','Titolo','File ID','Nome file','MIME type','Dimensione','Data caricamento','Visibile iscritto','Caricato da','Note'],
  rsvps: ['Conferma ID','Lezione ID','Data lezione','Persona ID','Nome e cognome','Previsto','Risposta','Data risposta','Notifica 09','Promemoria 16','Ultimo aggiornamento'],
  access: ['Accesso ID','Persona ID','Email','Tipo','Token hash','Creato','Scadenza','Usato','Revocato','Ultimo accesso','Motivo']
};

function isMemberPortalAction_(action) {
  return ['memberRequestLink','memberLogin','memberBootstrap','memberSetRsvp','memberGetDocument','memberLogout'].indexOf(action) >= 0;
}

function dispatchMemberPortalAction_(action, data) {
  ensureMemberPortalSchema_();
  if (action === 'memberRequestLink') return memberRequestLink_(data);
  if (action === 'memberLogin') return memberLogin_(data);
  if (action === 'memberBootstrap') return memberBootstrap_(data);
  if (action === 'memberSetRsvp') return memberSetRsvp_(data);
  if (action === 'memberGetDocument') return memberGetDocument_(data);
  if (action === 'memberLogout') return memberLogout_(data);
  throw new Error('Azione area iscritti non valida.');
}

function ensureMemberPortalSchema_() {
  ensurePortalSheet_(ADMIN.sheets.deadlines, MEMBER_PORTAL_HEADERS.deadlines);
  ensurePortalSheet_(ADMIN.sheets.documents, MEMBER_PORTAL_HEADERS.documents);
  ensurePortalSheet_(ADMIN.sheets.rsvps, MEMBER_PORTAL_HEADERS.rsvps);
  ensurePortalSheet_(ADMIN.sheets.memberAccess, MEMBER_PORTAL_HEADERS.access);
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

function portalAdminData_() {
  ensureUpcomingRsvps_(6);
  return {
    deadlines: deadlineList_(),
    documents: documentList_(),
    rsvps: rsvpList_(),
    portalUrl: MEMBER_PORTAL.url,
    automationActive: ScriptApp.getProjectTriggers().some(function(t) { return t.getHandlerFunction() === 'runMemberPortalAutomation'; })
  };
}

function memberRequestLink_(data) {
  const email = normalizeEmail_(data.email);
  if (!email) throw new Error('Inserisci un indirizzo email valido.');
  const member = isReferenceEmail_(email) ? referenceMember_() : findMemberByEmail_(email);
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
  return { ok: true };
}

function memberPortalPayload_(member) {
  ensureMemberDeadlines_(member);
  const nextDate = nextScheduledLessonForMember_(member, new Date());
  let rsvp = null;
  if (nextDate) {
    ensureRsvpsForDate_(nextDate);
    rsvp = rsvpList_().find(function(x) { return x.personId === member.id && x.date === nextDate; }) || null;
  }
  return {
    member: { id: member.id, name: member.name, email: member.email, plan: member.plan, frequency: member.frequency, status: member.status },
    deadlines: deadlineList_().filter(function(x) { return x.personId === member.id; }),
    payments: memberPaymentList_(member.id),
    documents: documentList_().filter(function(x) { return x.personId === member.id && x.visible; }),
    rsvp: rsvp,
    generatedAt: new Date().toISOString()
  };
}

function authorizeMemberSession_(rawToken) {
  const token = clean_(rawToken);
  if (!token) throw new Error('Sessione scaduta. Accedi di nuovo.');
  const access = findAccessByHash_(tokenHash_(token), 'Sessione');
  if (!access || access.revoked || access.expiresAt.getTime() < Date.now()) throw new Error('Sessione scaduta. Accedi di nuovo.');
  const member = memberForAccess_(access);
  if (!member || member.status !== 'Attivo') throw new Error('Area personale non disponibile.');
  markAccess_(access.row, {'Ultimo accesso': new Date()});
  return { member: member, row: access.row };
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

function isReferenceEmail_(email) {
  return normalizeEmail_(email) === normalizeEmail_(ADMIN.ownerEmail);
}

function referenceMember_() {
  return {
    id: 'REFERENCE-OWNER',
    name: 'Riccardo Calli',
    email: ADMIN.ownerEmail,
    plan: 'Accesso di riferimento',
    frequency: '',
    status: 'Attivo'
  };
}

function memberForAccess_(access) {
  return isReferenceEmail_(access.email) ? referenceMember_() : findMember_(access.personId, true);
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
  let d = new Date(), made = 0;
  d.setHours(12,0,0,0);
  if (Utilities.formatDate(d,ADMIN.timezone,'yyyy-MM-dd') < MEMBER_PORTAL.seasonStart) d = parseKey_(MEMBER_PORTAL.seasonStart);
  while (made < count && Utilities.formatDate(d,ADMIN.timezone,'yyyy-MM-dd') <= MEMBER_PORTAL.seasonEnd) {
    if (isCourseDay_(d)) { ensureRsvpsForDate_(Utilities.formatDate(d,ADMIN.timezone,'yyyy-MM-dd')); made++; }
    d.setDate(d.getDate()+1);
  }
}

function ensureRsvpsForDate_(key) {
  if (!isSeasonLessonKey_(key) || !isCourseDay_(parseKey_(key))) return;
  const sh = sheet_(ADMIN.sheets.rsvps), existing = {};
  table_(sh).forEach(function(r) { if (dateKey_(r['Data lezione']) === key) existing[str_(r['Persona ID'])] = true; });
  const lesson = ensureLesson_(key);
  memberList_().filter(function(m) { return m.status === 'Attivo' && scheduledForMember_(m,key); }).forEach(function(m) {
    if (existing[m.id]) return;
    appendByHeaders_(sh, {'Conferma ID':id_('RSV'),'Lezione ID':lesson.id,'Data lezione':parseKey_(key),'Persona ID':m.id,'Nome e cognome':m.name,'Previsto':'Sì','Risposta':'In attesa','Ultimo aggiornamento':new Date()});
  });
}

function rsvpList_() {
  const min = new Date(); min.setDate(min.getDate()-35);
  const max = new Date(); max.setDate(max.getDate()+50);
  const minKey = Utilities.formatDate(min,ADMIN.timezone,'yyyy-MM-dd'), maxKey = Utilities.formatDate(max,ADMIN.timezone,'yyyy-MM-dd');
  return table_(sheet_(ADMIN.sheets.rsvps)).map(function(r) {
    return { id:str_(r['Conferma ID']), lessonId:str_(r['Lezione ID']), date:dateKey_(r['Data lezione']), personId:str_(r['Persona ID']), name:str_(r['Nome e cognome']), expected:str_(r['Previsto']) !== 'No', response:str_(r['Risposta']) || 'In attesa', respondedAt:dateIso_(r['Data risposta']) };
  }).filter(function(x) { return x.date >= minKey && x.date <= maxKey; });
}

function memberSetRsvp_(data) {
  const auth = authorizeMemberSession_(data.sessionToken), key = clean_(data.lessonDate), response = clean_(data.response);
  if (['Sì','No'].indexOf(response) < 0) throw new Error('Risposta non valida.');
  if (!scheduledForMember_(auth.member,key)) throw new Error('Questa lezione non è prevista dal tuo abbonamento.');
  const today = Utilities.formatDate(new Date(),ADMIN.timezone,'yyyy-MM-dd'), hour = num_(Utilities.formatDate(new Date(),ADMIN.timezone,'H'));
  if (key < today || (key === today && hour >= 19)) throw new Error('Le conferme per questa lezione sono chiuse.');
  ensureRsvpsForDate_(key);
  const sh = sheet_(ADMIN.sheets.rsvps), h = headers_(sh), rows = sh.getDataRange().getValues();
  for (let i=1;i<rows.length;i++) {
    const r = rowObj_(h,rows[i]);
    if (dateKey_(r['Data lezione']) === key && str_(r['Persona ID']) === auth.member.id) {
      setCellByHeader_(sh,i+1,h,'Risposta',response);
      setCellByHeader_(sh,i+1,h,'Data risposta',new Date());
      setCellByHeader_(sh,i+1,h,'Ultimo aggiornamento',new Date());
      return { ok:true, data:{ response:response } };
    }
  }
  throw new Error('Conferma lezione non trovata.');
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
    if (!member || !normalizeEmail_(member.email)) continue;
    const link = createMagicLink_(member,hour === 9 ? 'Conferma lezione' : 'Promemoria conferma');
    const intro = hour === 9 ? 'Oggi c’è lezione. Ci sarai?' : 'Non hai ancora confermato la presenza alla lezione di oggi.';
    const body = '<p>Ciao '+html_(member.name)+',</p><p>'+intro+'</p>'+emailButton_(link,'CONFERMA SÌ O NO')+'<p style="color:#66736f;font-size:13px">Puoi modificare la risposta fino alle 19:00.</p>';
    MailApp.sendEmail({to:member.email,subject:(hour===9?'Conferma presenza':'Promemoria presenza')+' · lezione di oggi',htmlBody:emailLayout_('Lezione di oggi',body),name:'Corso Parkour Padova'});
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
    const member = findMember_(str_(r['Persona ID']),true); if (!member || !normalizeEmail_(member.email)) continue;
    const link = createMagicLink_(member,'Promemoria pagamento'), amount = num_(r['Importo']).toFixed(2).replace('.',',');
    const body = '<p>Ciao '+html_(member.name)+',</p><p>promemoria per il pagamento di <strong>€ '+amount+'</strong>, con scadenza '+html_(due)+'.</p>'+emailButton_(link,'VEDI PAGAMENTI')+'<p style="color:#66736f;font-size:13px">Se hai già pagato, ignora questo messaggio: l’amministratore aggiornerà lo stato.</p>';
    MailApp.sendEmail({to:member.email,subject:'Promemoria pagamento · Corso Parkour Padova',htmlBody:emailLayout_('Scadenza pagamento',body),name:'Corso Parkour Padova'});
    setCellByHeader_(sh,i+1,h,flag,new Date());
  }
}

function emailButton_(url,label) { return '<p style="margin:24px 0"><a href="'+html_(url)+'" style="display:inline-block;background:#17352e;color:#fff;text-decoration:none;padding:14px 20px;border-radius:12px;font-weight:700">'+html_(label)+'</a></p>'; }
function emailLayout_(title,body) { return '<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#14231e"><div style="letter-spacing:.12em;color:#66736f;font-size:12px;font-weight:700">CORSO PARKOUR PADOVA</div><h1 style="font-size:26px;margin:8px 0 20px">'+html_(title)+'</h1>'+body+'</div>'; }
function html_(value) { return String(value == null ? '' : value).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }
