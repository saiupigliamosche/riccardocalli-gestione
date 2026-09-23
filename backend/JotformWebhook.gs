const JOTFORM_FORM_ID_ = '262643062831050';
const JOTFORM_MODULE_SHEET_ = 'Moduli iscrizione';

function isJotformWebhookRequest_(e) {
  const p = (e && e.parameter) || {};
  const formId = p.formID || p.formId;
  const submissionId = p.submissionID || p.submissionId;
  return !!(formId && submissionId && p.rawRequest);
}

function handleJotformWebhook_(e) {
  const p = (e && e.parameter) || {};
  const expectedSecret = PropertiesService.getScriptProperties().getProperty('JOTFORM_WEBHOOK_SECRET') || str_(config_('Jotform webhook secret'));
  const providedSecret = str_(p.jf_secret || p.secret);

  if (!expectedSecret || !providedSecret || providedSecret !== expectedSecret) {
    throw new Error('Webhook Jotform non autorizzato.');
  }
  const formId = p.formID || p.formId;
  if (str_(formId) !== JOTFORM_FORM_ID_) {
    throw new Error('Form Jotform non autorizzato.');
  }

  const submissionId = clean_(p.submissionID || p.submissionId);
  if (!submissionId) throw new Error('Submission ID mancante.');

  let raw = {};
  try {
    raw = JSON.parse(String(p.rawRequest || '{}'));
  } catch (err) {
    jfLogWebhookError_(submissionId, p.formID, 'rawRequest non valido: ' + err.message, String(p.rawRequest || ''));
    throw new Error('Payload Jotform non valido.');
  }

  try {
    const payload = jfParseSubmission_(raw, p, submissionId);
    if (!payload.name || !payload.email) {
      throw new Error('Nome o email mancanti nel payload Jotform.');
    }

    const moduleSh = sheet_(JOTFORM_MODULE_SHEET_);
    const memberSh = sheet_(ADMIN.sheets.members);
    const moduleExisting = jfFindRowByHeader_(moduleSh, 'Jotform Submission ID', submissionId);
    const existingMember = jfFindMemberRow_(payload.name, payload.email, payload.phone, submissionId);

    if (moduleExisting && existingMember) {
      setCellByHeader_(moduleSh, moduleExisting.row, moduleExisting.headers, 'Stato sincronizzazione', jfSyncStatus_(payload));
      return { ok:true, duplicate:true, submissionId:submissionId, personId:str_(existingMember.obj['Persona ID']) };
    }

    const trial = jfFindTrialRow_(payload.name, payload.email, payload.phone);
    const personId = existingMember
      ? str_(existingMember.obj['Persona ID'])
      : (trial && str_(trial.obj['Persona ID'])) || ('PER-JF-' + submissionId);

    if (trial) {
      setCellByHeader_(trial.sh, trial.row, trial.headers, 'Persona ID', personId);
      setCellByHeader_(trial.sh, trial.row, trial.headers, 'Stato', 'Iscritto');
      if (!trial.obj['Data conversione']) {
        setCellByHeader_(trial.sh, trial.row, trial.headers, 'Data conversione', new Date());
      }
    }

    jfUpsertMember_(payload, personId, existingMember, trial);

    if (moduleExisting) {
      setCellByHeader_(moduleSh, moduleExisting.row, moduleExisting.headers, 'Stato sincronizzazione', jfSyncStatus_(payload));
    } else {
      appendByHeaders_(moduleSh, {
        'Jotform Submission ID': submissionId,
        'Data/Ora invio': payload.submittedAt,
        'Nome e cognome': payload.name,
        'Data di nascita': payload.birthDateText,
        'Luogo di nascita': payload.birthPlace,
        'Codice fiscale': payload.taxCode,
        'Indirizzo': payload.address,
        'CAP': payload.postalCode,
        'Comune': payload.city,
        'Provincia': payload.province,
        'Telefono': payload.phone,
        'Email': payload.email,
        'Maggiorenne': payload.adult,
        'Frequenza': payload.frequencyRaw,
        'Giorni frequenza': payload.days,
        'Pacchetto': payload.plan,
        'Approvazione clausole 1341-1342': payload.clauseApproval,
        'Firma approvazione specifica': payload.signatureSpecific,
        'Firma dichiarazione': payload.signatureDeclaration,
        'Luogo sottoscrizione': payload.signPlace,
        'Data sottoscrizione': payload.signDateText,
        'Privacy presa visione': payload.privacy,
        'Consenso immagini web/social': payload.consentSocial,
        'Consenso immagini materiali': payload.consentMaterials,
        'Versione modulo': payload.version,
        'Stato sincronizzazione': jfSyncStatus_(payload)
      });
    }

    return { ok:true, submissionId:submissionId, personId:personId, member:payload.name };
  } catch (err) {
    jfLogWebhookError_(submissionId, p.formID, err.message, JSON.stringify(raw));
    try {
      MailApp.sendEmail(
        ADMIN.ownerEmail,
        'ERRORE WEBHOOK ISCRIZIONE PARKOUR',
        'Submission ID: ' + submissionId + '\nErrore: ' + err.message
      );
    } catch (_) {}
    throw err;
  }
}

function jfParseSubmission_(raw, params, submissionId) {
  // Jotform rawRequest usa chiavi del tipo q23_nomeE, q24_dataDi, ecc.
  // Gli ID domanda sono il riferimento più stabile e disambiguano anche campi
  // che condividono lo stesso nome interno (es. q53 e q54).
  const nameValue = jfField_(raw, 23, ['nomeE'], [['nome','cognome'], ['fullname']]);
  const birthValue = jfField_(raw, 24, ['dataDi'], [['data','nascita'], ['birth']]);
  const signDateValue = jfField_(raw, 47, ['dataDi47'], [['data','sottoscrizione']]);

  const birthDate = jfParseDate_(birthValue);
  const signDate = jfParseDate_(signDateValue);

  const frequencyRaw = jfValueText_(jfField_(raw, 35, ['frequenzaDesiderata'], [['frequenza']]));
  const daysRaw = jfValueText_(jfField_(raw, 57, ['giorniDi'], [['giorni','frequenza']]));
  const days = jfCanonicalDays_(daysRaw, frequencyRaw);

  const phone = jfNormalizePhone_(jfValueText_(jfField_(raw, 31, ['telefono'], [['telefono'], ['phone']])));
  const email = jfValueText_(jfField_(raw, 32, ['email'], [['email']])).toLowerCase();

  const clause1 = jfYesNo_(jfField_(raw, 40, ['clausola1'], [['clausola1']]));
  const clause2 = jfYesNo_(jfField_(raw, 41, ['clausola2'], [['clausola2']]));
  const clauseApproval = (clause1 === 'Sì' && clause2 === 'Sì')
    ? 'Sì'
    : ((clause1 || clause2) ? 'No' : '');

  const submitted = params.submissionDate || params.created_at || params.createdAt ||
    raw.created_at || raw.createdAt || raw.submissionDate || new Date();

  return {
    submissionId: submissionId,
    submittedAt: jfDateTimeText_(submitted),
    name: jfValueText_(nameValue),
    birthDate: birthDate,
    birthDateText: birthDate ? Utilities.formatDate(birthDate, ADMIN.timezone, 'dd/MM/yyyy') : jfValueText_(birthValue),
    age: birthDate ? jfAge_(birthDate) : '',
    birthPlace: jfValueText_(jfField_(raw, 25, ['luogoDi'], [['luogo','nascita']])),
    taxCode: jfValueText_(jfField_(raw, 26, ['codiceFiscale'], [['codice','fiscale']])),
    address: jfValueText_(jfField_(raw, 27, ['indirizzoDi'], [['indirizzo','residenza'], ['indirizzo']])),
    postalCode: jfValueText_(jfField_(raw, 28, ['cap'], [['cap'], ['postal']])),
    city: jfValueText_(jfField_(raw, 29, ['comune'], [['comune'], ['city']])),
    province: jfValueText_(jfField_(raw, 30, ['provincia'], [['provincia'], ['province'], ['state']])).toUpperCase(),
    phone: phone,
    email: email,
    adult: jfYesNo_(jfField_(raw, 33, ['dichiaroDi'], [['almeno','18'], ['maggiorenne']])),
    frequencyRaw: frequencyRaw,
    frequency: jfCanonicalFrequency_(frequencyRaw, days),
    days: days,
    plan: jfValueText_(jfField_(raw, 36, ['pacchettoScelto'], [['pacchetto']])),
    clauseApproval: clauseApproval,
    signatureSpecific: jfValueText_(jfField_(raw, 43, ['firmaPer'], [['firma','approvazione','specifica']])),
    signatureDeclaration: jfValueText_(jfField_(raw, 48, ['firmaDel'], [['firma','partecipante'], ['firma','dichiarazione']])),
    signPlace: jfValueText_(jfField_(raw, 46, ['luogoDi46'], [['luogo','sottoscrizione']])),
    signDate: signDate,
    signDateText: signDate ? Utilities.formatDate(signDate, ADMIN.timezone, 'yyyy-MM-dd') : jfValueText_(signDateValue),
    privacy: jfYesNo_(jfField_(raw, 51, ['dichiaroDi51'], [['informativa','privacy'], ['privacy']])),
    consentSocial: jfYesNo_(jfField_(raw, 53, ['autorizzoLutilizzo'], [['sito','web','canali','social'], ['immagini','web','social']])),
    consentMaterials: jfYesNo_(jfField_(raw, 54, ['autorizzoLutilizzo'], [['materiale','promozionale'], ['immagini','materiali']])),
    version: jfValueText_(jfField_(raw, 56, ['versioneModulo'], [['versione','modulo']])) ||
      str_(config_('Versione modulo iscrizione')) || '2026.1'
  };
}

function jfField_(raw, questionId, internalNames, fallbackAlternatives) {
  const obj = raw || {};
  const keys = Object.keys(obj);
  const prefix = 'q' + String(questionId) + '_';

  // 1) Match per ID domanda: evita collisioni tra nomi interni duplicati.
  for (const key of keys) {
    if (key.indexOf(prefix) === 0) return obj[key];
  }

  // 2) Fallback su nome interno esatto/normalizzato.
  const wantedNames = (internalNames || []).map(jfNorm_);
  for (const wanted of wantedNames) {
    for (const key of keys) {
      const nk = jfNorm_(key.replace(/^q\d+_/, ''));
      if (nk === wanted) return obj[key];
    }
  }

  // 3) Compatibilità con payload futuri/alternativi.
  return jfFind_(obj, fallbackAlternatives || []);
}

function jfSyncStatus_(payload) {
  return payload && payload.birthDate
    ? 'SINCRONIZZATO VIA WEBHOOK'
    : 'SINCRONIZZATO VIA WEBHOOK - DATA NASCITA NON VALIDA';
}

function jfUpsertMember_(p, personId, existing, trial) {
  const sh = sheet_(ADMIN.sheets.members);
  const origin = trial ? jfOriginFromTrial_(trial.obj) : (existing && str_(existing.obj['Origine acquisizione'])) || 'Modulo iscrizione diretto';
  const campaign = trial ? str_(trial.obj['UTM campaign'] || trial.obj['Campagna']) : (existing && str_(existing.obj['Campagna acquisizione'])) || '';
  const creative = trial ? str_(trial.obj['UTM content'] || trial.obj['Creatività']) : (existing && str_(existing.obj['Creatività acquisizione'])) || '';
  const bookingId = trial ? str_(trial.obj['Booking ID']) : (existing && str_(existing.obj['Booking ID origine'])) || '';
  const firstTrial = trial ? trial.obj['Data prova'] : (existing && existing.obj['Data prima prova']) || '';
  const joinedAt = (existing && existing.obj['Data iscrizione']) || p.signDate || new Date();

  const values = {
    'Persona ID': personId,
    'Nome e cognome': p.name,
    'Età': p.age,
    'Telefono': p.phone,
    'Email': p.email,
    'Data prima prova': firstTrial,
    'Data iscrizione': joinedAt,
    'Pacchetto': p.plan,
    'Frequenza': p.frequency,
    'Stato': 'Attivo',
    'Rischio drop': (existing && str_(existing.obj['Rischio drop'])) || 'BASSO',
    'Origine acquisizione': origin,
    'Campagna acquisizione': campaign,
    'Creatività acquisizione': creative,
    'Booking ID origine': bookingId,
    'Data uscita': '',
    'Motivo uscita': '',
    'Ultimo aggiornamento': new Date(),
    'Giorni frequenza': p.days,
    'Modulo iscrizione': 'FIRMATO',
    'Data firma modulo': p.signDate || new Date(),
    'Versione modulo': p.version,
    'Jotform Submission ID': p.submissionId,
    'Consenso immagini web/social': jfConsentLabel_(p.consentSocial),
    'Consenso immagini materiali': jfConsentLabel_(p.consentMaterials)
  };

  if (!existing) {
    values['Presenze 30gg'] = 0;
    values['Assenze consecutive'] = 0;
  }

  if (existing) {
    Object.keys(values).forEach(k => {
      if (k === 'Età' && values[k] === '') return;
      setCellByHeader_(sh, existing.row, existing.headers, k, values[k]);
    });
  } else {
    appendByHeaders_(sh, values);
  }
}

function jfFindTrialRow_(name, email, phone) {
  const sh = sheet_(ADMIN.sheets.trials);
  return jfFindPersonRow_(sh, name, email, phone, '');
}

function jfFindMemberRow_(name, email, phone, submissionId) {
  const sh = sheet_(ADMIN.sheets.members);
  const headers = headers_(sh);
  const rows = sh.getDataRange().getValues();

  const sidCol = headers.indexOf('Jotform Submission ID');
  if (submissionId && sidCol >= 0) {
    for (let i=1; i<rows.length; i++) {
      if (str_(rows[i][sidCol]) === submissionId) {
        return { sh:sh, row:i+1, headers:headers, obj:rowObj_(headers, rows[i]) };
      }
    }
  }
  return jfFindPersonRow_(sh, name, email, phone, submissionId);
}

function jfFindPersonRow_(sh, name, email, phone) {
  const headers = headers_(sh);
  const rows = sh.getDataRange().getValues();
  const nameCol = headers.indexOf('Nome e cognome');
  const emailCol = headers.indexOf('Email');
  const phoneCol = headers.indexOf('Telefono');
  const targetEmail = jfNorm_(email);
  const targetPhone = jfNormalizePhone_(phone);
  const targetName = jfNorm_(name);

  const match = predicate => {
    for (let i=1; i<rows.length; i++) {
      if (rowBlank_(rows[i])) continue;
      if (predicate(rows[i])) return { sh:sh, row:i+1, headers:headers, obj:rowObj_(headers, rows[i]) };
    }
    return null;
  };

  if (targetEmail && emailCol >= 0) {
    const x = match(r => jfNorm_(r[emailCol]) === targetEmail);
    if (x) return x;
  }
  if (targetPhone && phoneCol >= 0) {
    const x = match(r => jfNormalizePhone_(r[phoneCol]) === targetPhone);
    if (x) return x;
  }
  if (targetName && nameCol >= 0) {
    const x = match(r => jfNorm_(r[nameCol]) === targetName);
    if (x) return x;
  }
  return null;
}

function jfFindRowByHeader_(sh, header, value) {
  const headers = headers_(sh);
  const col = headers.indexOf(header);
  if (col < 0) return null;
  const rows = sh.getDataRange().getValues();
  for (let i=1; i<rows.length; i++) {
    if (str_(rows[i][col]) === str_(value)) {
      return { sh:sh, row:i+1, headers:headers, obj:rowObj_(headers, rows[i]) };
    }
  }
  return null;
}

function jfOriginFromTrial_(r) {
  const medium = jfNorm_(r['UTM medium']);
  const campaign = jfNorm_(r['UTM campaign'] || r['Campagna']);
  const source = str_(r['UTM source']);
  if (/paid|cpc|ads/.test(medium) || str_(r['Meta ad ID'])) return 'Ads';
  if (campaign.indexOf('richiestainfodiretta') >= 0) return 'Contatto diretto';
  return source ? 'Organico' : 'Organico';
}

function jfFind_(raw, alternatives) {
  const keys = Object.keys(raw || {});
  for (const tokens of alternatives) {
    const wanted = tokens.map(jfNorm_);
    for (const key of keys) {
      const nk = jfNorm_(key);
      if (wanted.every(t => nk.indexOf(t) >= 0)) return raw[key];
    }
  }
  return '';
}

function jfValueText_(v) {
  if (v == null) return '';
  if (Array.isArray(v)) return v.map(jfValueText_).filter(Boolean).join(' ');
  if (typeof v !== 'object') return str_(v);

  if (v.first || v.last || v.middle) {
    return [v.first, v.middle, v.last].map(str_).filter(Boolean).join(' ');
  }
  if (v.full) return str_(v.full);
  if (v.areaCode || v.phoneNumber) return [v.areaCode, v.phoneNumber].map(str_).filter(Boolean).join('');
  if (v.day && v.month && v.year) {
    return [String(v.day).padStart(2,'0'), String(v.month).padStart(2,'0'), v.year].join('/');
  }

  const addressKeys = ['addr_line1','addr_line2','city','state','postal','country'];
  const addressParts = addressKeys.map(k => str_(v[k])).filter(Boolean);
  if (addressParts.length) return addressParts.join(' ');

  return Object.keys(v).map(k => jfValueText_(v[k])).filter(Boolean).join(' ');
}

function jfParseDate_(v) {
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    const d = Number(v.day), m = Number(v.month), y = Number(v.year);
    if (d && m && y) return jfValidDate_(y,m,d);
  }
  const s = jfValueText_(v);
  let m;
  if ((m = s.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/))) return jfValidDate_(+m[1],+m[2],+m[3]);
  if ((m = s.match(/^(\d{1,2})[\/\-.\s]+(\d{1,2})[\/\-.\s]+(\d{4})/))) return jfValidDate_(+m[3],+m[2],+m[1]);
  return null;
}

function jfValidDate_(y,m,d) {
  if (y < 1900 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const x = new Date(y,m-1,d,12,0,0,0);
  if (x.getFullYear() !== y || x.getMonth() !== m-1 || x.getDate() !== d) return null;
  return x;
}

function jfAge_(birthDate) {
  const now = new Date();
  let age = now.getFullYear() - birthDate.getFullYear();
  const md = now.getMonth() - birthDate.getMonth();
  if (md < 0 || (md === 0 && now.getDate() < birthDate.getDate())) age--;
  return age >= 0 ? age : '';
}

function jfCanonicalDays_(daysRaw, frequencyRaw) {
  const s = jfNorm_(daysRaw + ' ' + frequencyRaw);
  const tue = s.indexOf('martedi') >= 0;
  const thu = s.indexOf('giovedi') >= 0;
  if (tue && thu) return 'Martedì+Giovedì';
  if (thu) return 'Giovedì';
  if (tue) return 'Martedì';
  if (/2volte|2x/.test(s)) return 'Martedì+Giovedì';
  return '';
}

function jfCanonicalFrequency_(frequencyRaw, days) {
  const f = jfNorm_(frequencyRaw);
  if (/2volte|2x/.test(f) || days === 'Martedì+Giovedì') return '2x/settimana - Martedì+Giovedì';
  if (days === 'Giovedì') return '1x/settimana - Giovedì';
  if (days === 'Martedì') return '1x/settimana - Martedì';
  return frequencyRaw;
}

function jfYesNo_(v) {
  const s = jfNorm_(jfValueText_(v));
  if (!s) return '';
  if (/^(si|yes|true|1)$/.test(s) || s.indexOf('autorizzo') >= 0 || s.indexOf('dichiaro') >= 0 || s.indexOf('approvo') >= 0) return 'Sì';
  if (/^(no|false|0)$/.test(s)) return 'No';
  return jfValueText_(v);
}

function jfConsentLabel_(v) {
  const s = jfNorm_(v);
  return s === 'si' || s === 'yes' || s === 'true' || s === '1' ? 'SÌ' : 'NO';
}

function jfNormalizePhone_(v) {
  return String(v == null ? '' : v).replace(/\D/g,'');
}

function jfNorm_(v) {
  return String(v == null ? '' : v)
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .toLowerCase().replace(/[^a-z0-9]/g,'');
}

function jfDateTimeText_(v) {
  if (v instanceof Date && !isNaN(v)) return Utilities.formatDate(v, ADMIN.timezone, 'yyyy-MM-dd HH:mm:ss');
  const s = str_(v);
  const d = new Date(s);
  if (!isNaN(d)) return Utilities.formatDate(d, ADMIN.timezone, 'yyyy-MM-dd HH:mm:ss');
  return Utilities.formatDate(new Date(), ADMIN.timezone, 'yyyy-MM-dd HH:mm:ss');
}

function jfLogWebhookError_(submissionId, formId, message, raw) {
  try {
    const ss = SpreadsheetApp.openById(ADMIN.spreadsheetId);
    let sh = ss.getSheetByName('Webhook errori');
    if (!sh) {
      sh = ss.insertSheet('Webhook errori');
      sh.appendRow(['Timestamp','Submission ID','Form ID','Errore','Raw payload']);
      sh.setFrozenRows(1);
    }
    sh.appendRow([
      new Date(),
      str_(submissionId),
      str_(formId),
      str_(message),
      String(raw || '').slice(0,45000)
    ]);
  } catch (_) {}
}
