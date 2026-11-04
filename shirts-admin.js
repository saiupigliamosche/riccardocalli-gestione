const SHIRTS_PRODUCT_URL = 'https://tee.farm/products/t-shirt-relaxed-mid-light-unisex-personalizzazione';

function shirtsAdminQuantity(quantities) {
  return Object.entries(quantities).filter(([, qty]) => qty > 0).map(([size, qty]) => size + ' × ' + qty).join(' · ');
}

function shirtsAdminPeople(people, batch = null) {
  return people.length ? '<ul class="shirts-list">' + people.map(person =>
    '<li><strong>' + esc(person.name) + '</strong><span>' + esc(shirtsAdminQuantity(person.quantities)) + '</span>' +
    (batch?.orderedAt ? '<div class="shirts-status">' + [['paidAt', 'Saldato'], ['deliveredAt', 'Consegnato']].map(([field, label]) =>
      '<label><input type="checkbox" data-shirt-field="' + field + '" data-batch="' + batch.id +
      '" data-person="' + esc(person.personId) + '" ' + (person[field] ? 'checked' : '') + '> ' + label + '</label>'
    ).join('') + '</div>' : '') + '</li>'
  ).join('') + '</ul>' : '<p>Ancora nessun preordine.</p>';
}

function shirtsAdminPricing(pricing) {
  const lines = pricing ? pricing.tiers.map(tier => tier.min + ':' + (tier.cents / 100).toFixed(2).replace('.', ',')).join('\n') : '';
  return '<details class="card shirts-panel"><summary>Listino TeeFarm fronte e retro</summary>' +
    '<p>Inserisci le soglie e i prezzi unitari IVA inclusa verificati per il capo crema con entrambe le stampe.</p>' +
    (pricing ? '<p>Ultima verifica: ' + esc(pricing.checkedAt) + ' · Valido fino al ' + esc(pricing.validUntil) + '</p>' : '') +
    '<form id="shirtsPricingForm"><label class="field-label" for="shirtsTiers">Una fascia per riga, nel formato pezzi:prezzo</label>' +
    '<textarea class="big-input" id="shirtsTiers" name="tiers" rows="5" required>' + esc(lines) + '</textarea>' +
    '<label class="field-label" for="shirtsMax">Quantità massima verificata</label>' +
    '<input class="big-input" id="shirtsMax" name="max" type="number" min="1" max="10000" value="' +
    (pricing?.maxQuantity || '') + '" required>' +
    '<label class="field-label" for="shirtsValid">Listino valido fino al</label>' +
    '<input class="big-input" id="shirtsValid" name="valid" type="date" min="' + todayKey() + '" value="' +
    esc(pricing?.validUntil || '') + '" required><button class="primary" type="submit">Salva listino</button></form></details>';
}

function shirtsAdminBatch(batch) {
  const status = batch.orderedAt ? 'Ordinato' : 'In preparazione';
  return '<details class="card shirts-panel"><summary>Lotto ' + batch.id + ' · ' + batch.total + ' pezzi · ' + status + '</summary>' +
    '<p>' + esc(shirtsAdminQuantity(batch.bySize)) + '</p>' +
    (batch.estimateCents == null ? '' : '<p>Stima alla chiusura: ' + money(batch.estimateCents / 100) + ' a maglia.</p>') +
    (batch.finalCents == null ? '' : '<p>Prezzo unitario finale: ' + money(batch.finalCents / 100) + ' · ' + esc(batch.reference) + '</p>') +
    shirtsAdminPeople(batch.people, batch) +
    '<label class="field-label" for="shirtsBatch' + batch.id + '">Riepilogo per TeeFarm</label>' +
    '<textarea class="big-input" id="shirtsBatch' + batch.id + '" readonly rows="2">Pirati del Movimento · Relaxed mid-light unisex · Cream · Fronte e retro\n' +
    esc(shirtsAdminQuantity(batch.bySize)) + '</textarea>' +
    '<button class="secondary" type="button" data-shirts-copy="' + batch.id + '">Copia quantità</button>' +
    '<p><a href="' + SHIRTS_PRODUCT_URL + '" target="_blank" rel="noopener">Apri TeeFarm</a></p>' +
    (!batch.orderedAt ?
      '<form class="shirts-record" data-batch="' + batch.id + '"><label class="field-label">Prezzo unitario finale in euro' +
      '<input class="big-input" name="price" inputmode="decimal" required></label><label class="field-label">Riferimento ordine' +
      '<input class="big-input" name="reference" required maxlength="100"></label>' +
      '<button class="secondary" type="submit">Segna come ordinato</button></form>' :
      '') +
    '</details>';
}

async function renderShirtsAdmin() {
  titleEl.textContent = 'Ordini maglie';
  if (!backend() || !token()) { viewEl.innerHTML = connectionCard(); return; }
  const currentToken = token();
  viewEl.innerHTML = '<div class="card shirts-panel">Caricamento preordini…</div>';
  try {
    const data = await api('shirtsAdmin');
    if (state.view !== 'shirts' || token() !== currentToken) return;
    const current = data.current;
    viewEl.innerHTML = '<div class="actions"><button class="secondary" id="shirtsBack">Torna alla dashboard</button>' +
      '<button class="secondary" id="shirtsRefresh">Aggiorna</button></div>' +
      '<section class="card shirts-panel"><h2>Lotto aperto ' + data.batchId + '</h2><p><strong>' + current.total +
      ' maglie</strong> · ' + (data.unitCents == null ? 'Prezzo in verifica' : money(data.unitCents / 100) + ' a maglia, stima') + '</p>' +
      '<p>' + esc(shirtsAdminQuantity(current.bySize)) + '</p>' + shirtsAdminPeople(current.people) +
      '<button class="primary" id="shirtsPrepare" ' + (current.total ? '' : 'disabled') + '>Chiudi lotto e prepara ordine</button></section>' +
      shirtsAdminPricing(data.pricing) +
      '<section class="shirts-panel"><h2>Lotti precedenti</h2>' +
      (data.batches.length ? data.batches.map(shirtsAdminBatch).join('') : '<p>Nessun lotto preparato.</p>') + '</section>';
    $('#shirtsBack').onclick = () => { state.view = 'dashboard'; render(); };
    $('#shirtsRefresh').onclick = renderShirtsAdmin;
    $('#shirtsPrepare').onclick = () => showConfirm({
      title: 'Prepara lotto ' + data.batchId,
      message: 'Le ' + current.total + ' maglie passano al riepilogo da ordinare su TeeFarm. Le prossime richieste confluiranno in un nuovo lotto.',
      confirmLabel: 'CHIUDI LOTTO',
      onConfirm: () => shirtsAdminWrite('shirtsPrepare', { batchId: data.batchId, revision: data.revision }, 'Lotto preparato')
    });
    $('#shirtsPricingForm').onsubmit = saveShirtsPricing;
    viewEl.querySelectorAll('.shirts-record').forEach(form => { form.onsubmit = recordShirtsOrder; });
    viewEl.querySelectorAll('[data-shirts-copy]').forEach(button => {
      button.onclick = async () => {
        const field = $('#shirtsBatch' + button.dataset.shirtsCopy);
        try { await navigator.clipboard.writeText(field.value); toast('Quantità copiate'); }
        catch (_) { field.focus(); field.select(); }
      };
    });
    viewEl.querySelectorAll('[data-shirt-field]').forEach(input => {
      input.onchange = async () => {
        const checked = input.checked;
        input.disabled = true;
        const ok = await shirtsAdminWrite('shirtsRequestStatus', {
          batchId: Number(input.dataset.batch), personId: input.dataset.person,
          field: input.dataset.shirtField, checked
        }, 'Stato aggiornato', false);
        if (!ok) input.checked = !checked;
        input.disabled = false;
      };
    });
  } catch (error) {
    if (state.view !== 'shirts' || token() !== currentToken) return;
    viewEl.innerHTML = '<div class="card shirts-panel"><p>' + esc(error.message) +
      '</p><button class="secondary" id="shirtsRetry">Riprova</button></div>';
    $('#shirtsRetry').onclick = renderShirtsAdmin;
  }
}

function shirtsEuroCents(value) {
  const text = value.trim();
  if (!/^\d{1,5}([,.]\d{1,2})?$/.test(text)) throw new Error('Inserisci un prezzo in euro, con massimo due decimali.');
  return Math.round(Number(text.replace(',', '.')) * 100);
}

function saveShirtsPricing(event) {
  event.preventDefault();
  const form = event.currentTarget;
  try {
    const tiers = form.elements.namedItem('tiers').value.trim().split(/\r?\n/).filter(line => line.trim()).map(line => {
      const match = line.match(/^\s*(\d+)\s*:\s*(.+?)\s*$/);
      if (!match) throw new Error('Usa una fascia per riga nel formato pezzi:prezzo.');
      return { min: Number(match[1]), cents: shirtsEuroCents(match[2]) };
    });
    shirtsAdminWrite('shirtsPricing', {
      tiers, maxQuantity: Number(form.elements.namedItem('max').value), validUntil: form.elements.namedItem('valid').value
    }, 'Listino aggiornato');
  } catch (error) { showError(error.message); }
}

function recordShirtsOrder(event) {
  event.preventDefault();
  const form = event.currentTarget;
  try {
    shirtsAdminWrite('shirtsRecordOrder', {
      batchId: Number(form.dataset.batch), finalCents: shirtsEuroCents(form.elements.namedItem('price').value),
      reference: form.elements.namedItem('reference').value
    }, 'Ordine registrato');
  } catch (error) { showError(error.message); }
}

let shirtsAdminSaving = false;
async function shirtsAdminWrite(action, input, success, refresh = true) {
  if (shirtsAdminSaving) return false;
  shirtsAdminSaving = true;
  try {
    await api(action, input);
    toast(success);
    if (refresh && state.view === 'shirts') await renderShirtsAdmin();
    return true;
  } catch (error) { showError(error.message); return false; }
  finally { shirtsAdminSaving = false; }
}
