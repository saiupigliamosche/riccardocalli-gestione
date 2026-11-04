const SHIRTS = {
  sizes: ['XS', 'S', 'M', 'L', 'XL', '2XL'],
  requests: 'Preordini maglie',
  batches: 'Lotti maglie',
  requestHeaders: ['Lotto', 'Persona ID', 'Taglie', 'Aggiornato', 'Saldato', 'Consegnato'],
  batchHeaders: ['Lotto', 'Chiuso', 'Stima unitaria cent', 'Ordinato', 'Prezzo unitario cent', 'Riferimento'],
  pricingKey: 'SHIRTS_TEEFARM_PRICING'
};

// Cart prices supplied by Saiu. Between measured quantities, use the
// preceding rate as a provisional estimate, including the 7-to-8 cent change.
const SHIRTS_INITIAL_PRICING = {
  checkedAt: '2026-11-04',
  validUntil: '',
  maxQuantity: 25,
  observedQuantities: [1, 5, 7, 8, 10, 25],
  tiers: [
    { min: 1, cents: 2457 },
    { min: 5, cents: 2363 },
    { min: 7, cents: 2362 },
    { min: 8, cents: 2363 },
    { min: 10, cents: 2249 },
    { min: 25, cents: 2136 }
  ]
};

function shirtsSheet_(book, name, expectedHeaders, create) {
  let sheet = book.getSheetByName(name);
  if (!sheet && create) sheet = book.insertSheet(name);
  if (!sheet) return null;
  if (!sheet.getLastRow() && create) {
    sheet.getRange(1, 1, 1, expectedHeaders.length).setValues([expectedHeaders]);
    sheet.setFrozenRows(1);
  }
  if (!sheet.getLastRow()) return null;
  const actual = sheet.getRange(1, 1, 1, expectedHeaders.length).getValues()[0];
  if (actual.some((name, index) => name !== expectedHeaders[index])) {
    throw new Error('Controlla le intestazioni di ' + name + '.');
  }
  return sheet;
}

function shirtsRows_(sheet, width) {
  if (!sheet || sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, width).getValues();
}

function shirtsRead_() {
  const book = SpreadsheetApp.openById(ADMIN.spreadsheetId);
  const requestSheet = shirtsSheet_(book, SHIRTS.requests, SHIRTS.requestHeaders, false);
  const batchSheet = shirtsSheet_(book, SHIRTS.batches, SHIRTS.batchHeaders, false);
  const requests = shirtsRows_(requestSheet, SHIRTS.requestHeaders.length)
    .map((r, index) => r[0] ? {
      batchId: Number(r[0]), personId: str_(r[1]), quantities: JSON.parse(r[2]),
      updatedAt: dateIso_(r[3]), paidAt: dateIso_(r[4]), deliveredAt: dateIso_(r[5]), row: index + 2
    } : null).filter(Boolean);
  const batches = shirtsRows_(batchSheet, SHIRTS.batchHeaders.length)
    .map((r, index) => r[0] ? {
      id: Number(r[0]), closedAt: dateIso_(r[1]), estimateCents: r[2] === '' ? null : Number(r[2]),
      orderedAt: dateIso_(r[3]), finalCents: r[4] === '' ? null : Number(r[4]),
      reference: str_(r[5]), row: index + 2
    } : null).filter(Boolean);
  const batchId = Math.max(0, ...batches.map(b => b.id)) + 1;
  const current = requests.filter(r => r.batchId === batchId);
  const savedPricing = PropertiesService.getScriptProperties().getProperty(SHIRTS.pricingKey);
  const pricing = savedPricing ? JSON.parse(savedPricing) : SHIRTS_INITIAL_PRICING;
  return { book, requestSheet, batchSheet, requests, batches, batchId, current, pricing };
}

function shirtsTotals_(requests) {
  const bySize = Object.fromEntries(SHIRTS.sizes.map(size => [size, 0]));
  requests.forEach(r => SHIRTS.sizes.forEach(size => { bySize[size] += r.quantities[size] || 0; }));
  return { bySize, total: Object.values(bySize).reduce((sum, qty) => sum + qty, 0) };
}

function shirtsPricingIsCurrent_(pricing) {
  return !!pricing && (!pricing.validUntil || pricing.validUntil >= dateKey_(new Date()));
}

function shirtsQuote_(pricing, total) {
  if (!shirtsPricingIsCurrent_(pricing) || total > pricing.maxQuantity) return null;
  const tier = pricing.tiers.filter(t => t.min <= Math.max(total, 1)).pop();
  return tier ? tier.cents : null;
}

function shirtsMemberPayload_(data, personId) {
  const mine = data.current.find(r => r.personId === personId);
  const total = shirtsTotals_(data.current).total;
  return {
    batchId: data.batchId,
    total,
    unitCents: shirtsQuote_(data.pricing, total),
    pricing: shirtsPricingIsCurrent_(data.pricing) ? data.pricing : null,
    quantities: mine ? mine.quantities : {},
    updatedAt: mine ? mine.updatedAt : '',
    history: data.requests.filter(r => r.personId === personId && r.batchId !== data.batchId)
      .map(r => {
        const batch = data.batches.find(b => b.id === r.batchId);
        return batch ? {
          id: batch.id, quantities: r.quantities, orderedAt: batch.orderedAt,
          deliveredAt: r.deliveredAt, paidAt: r.paidAt, finalCents: batch.finalCents
        } : null;
      }).filter(Boolean).reverse()
  };
}

function shirtsMember_(action, input) {
  const auth = authorizeMemberSession_(input.sessionToken);
  const data = shirtsRead_();
  const personId = auth.member.id;
  if (action === 'memberShirts') return { ok: true, data: shirtsMemberPayload_(data, personId) };

  if (input.batchId !== data.batchId) throw new Error('È aperto un nuovo lotto. Aggiorna prima di salvare.');
  if (!input.quantities || typeof input.quantities !== 'object' || Array.isArray(input.quantities) ||
      Object.keys(input.quantities).some(size => SHIRTS.sizes.indexOf(size) < 0)) {
    throw new Error('Controlla le taglie selezionate.');
  }
  const quantities = {};
  SHIRTS.sizes.forEach(size => {
    const qty = Object.prototype.hasOwnProperty.call(input.quantities, size) ? input.quantities[size] : 0;
    if (!Number.isSafeInteger(qty) || qty < 0 || qty > 99) throw new Error('Scegli una quantità da 0 a 99 per taglia.');
    if (qty) quantities[size] = qty;
  });
  const existing = data.current.find(r => r.personId === personId);
  if (JSON.stringify(quantities) === JSON.stringify(existing ? existing.quantities : {})) {
    return { ok: true, data: shirtsMemberPayload_(data, personId) };
  }
  if (input.updatedAt !== (existing ? existing.updatedAt : '')) {
    throw new Error('La richiesta è cambiata. Aggiorna prima di salvare.');
  }
  if (!Object.keys(quantities).length) {
    data.requestSheet.deleteRow(existing.row);
  } else {
    const sheet = data.requestSheet || shirtsSheet_(data.book, SHIRTS.requests, SHIRTS.requestHeaders, true);
    const row = [data.batchId, personId, JSON.stringify(quantities), new Date(), '', ''];
    if (existing) sheet.getRange(existing.row, 1, 1, row.length).setValues([row]);
    else sheet.appendRow(row);
  }
  SpreadsheetApp.flush();
  return { ok: true, data: shirtsMemberPayload_(shirtsRead_(), personId) };
}

function shirtsPricing_(input) {
  const today = dateKey_(new Date());
  const validUntil = str_(input.validUntil);
  const calendarDate = new Date(validUntil + 'T12:00:00Z');
  if (!dateKey_(validUntil) || isNaN(calendarDate) || calendarDate.toISOString().slice(0, 10) !== validUntil || validUntil < today) {
    throw new Error('Inserisci una data di validità del listino.');
  }
  const maxQuantity = input.maxQuantity;
  if (!Number.isSafeInteger(maxQuantity) || maxQuantity < 1 || maxQuantity > 10000 ||
      !Array.isArray(input.tiers) || !input.tiers.length || input.tiers.length > 100) {
    throw new Error('Controlla le fasce e la quantità massima verificata.');
  }
  const tiers = input.tiers.map(t => ({ min: t?.min, cents: t?.cents }));
  if (tiers[0].min !== 1 || tiers.some((t, i) =>
    !Number.isSafeInteger(t.min) || t.min < 1 || t.min > maxQuantity ||
    !Number.isSafeInteger(t.cents) || t.cents <= 0 || t.cents > 1000000 ||
    (i > 0 && (tiers[i - 1].min >= t.min || tiers[i - 1].cents + 1 < t.cents))
  )) throw new Error('Parti da 1 pezzo e inserisci soglie crescenti con prezzi positivi. È ammesso un aumento di un centesimo per arrotondamento.');
  return { checkedAt: today, validUntil, maxQuantity, tiers };
}

function shirtsRevision_(data) {
  return tokenHash_(JSON.stringify([data.batchId, data.current, shirtsQuote_(data.pricing, shirtsTotals_(data.current).total)]));
}

function shirtsAdminPayload_(data) {
  const names = new Map(memberList_().map(m => [m.id, m.name]));
  const people = rows => rows.map(r => ({
    name: names.get(r.personId) || r.personId, personId: r.personId, quantities: r.quantities,
    updatedAt: r.updatedAt, paidAt: r.paidAt, deliveredAt: r.deliveredAt
  }));
  const totals = shirtsTotals_(data.current);
  return {
    batchId: data.batchId, revision: shirtsRevision_(data), pricing: data.pricing,
    unitCents: shirtsQuote_(data.pricing, totals.total),
    current: Object.assign({}, totals, { people: people(data.current) }),
    batches: data.batches.slice().reverse().map(batch => {
      const requests = data.requests.filter(r => r.batchId === batch.id);
      return Object.assign({}, batch, shirtsTotals_(requests), { people: people(requests) });
    })
  };
}

function shirtsAdmin_(action, input) {
  if (action === 'shirtsPricing') {
    PropertiesService.getScriptProperties().setProperty(SHIRTS.pricingKey, JSON.stringify(shirtsPricing_(input)));
  } else if (action !== 'shirtsAdmin') {
    const data = shirtsRead_();
    if (action === 'shirtsPrepare') {
      if (data.batches.some(b => b.id === input.batchId)) return { ok: true, data: shirtsAdminPayload_(data) };
      if (input.batchId !== data.batchId || input.revision !== shirtsRevision_(data)) {
        throw new Error('Quantità o prezzo cambiati. Aggiorna il riepilogo prima di preparare il lotto.');
      }
      const total = shirtsTotals_(data.current).total;
      if (!total) throw new Error('Il lotto è vuoto.');
      const sheet = data.batchSheet || shirtsSheet_(data.book, SHIRTS.batches, SHIRTS.batchHeaders, true);
      sheet.appendRow([data.batchId, new Date(), shirtsQuote_(data.pricing, total) ?? '', '', '', '']);
    } else {
      const batch = data.batches.find(b => b.id === input.batchId);
      if (!batch) throw new Error('Lotto non trovato.');
      if (action === 'shirtsRecordOrder' && !batch.orderedAt) {
        const cents = input.finalCents;
        const reference = clean_(input.reference);
        if (!Number.isSafeInteger(cents) || cents < 1 || cents > 1000000 || !reference) {
          throw new Error('Inserisci il prezzo unitario finale e il riferimento dell’ordine.');
        }
        data.batchSheet.getRange(batch.row, 4, 1, 3).setValues([[new Date(), cents, 'Ordine ' + reference]]);
      } else if (action === 'shirtsRequestStatus') {
        if (!batch.orderedAt) throw new Error('Registra prima l’ordine effettuato.');
        const request = data.requests.find(r => r.batchId === batch.id && r.personId === input.personId);
        const columns = { paidAt: 5, deliveredAt: 6 };
        if (!request || !Object.prototype.hasOwnProperty.call(columns, input.field) || typeof input.checked !== 'boolean') {
          throw new Error('Stato del preordine non valido.');
        }
        data.requestSheet.getRange(request.row, columns[input.field]).setValue(input.checked ? new Date() : '');
      }
    }
    SpreadsheetApp.flush();
  }
  return { ok: true, data: shirtsAdminPayload_(shirtsRead_()) };
}
