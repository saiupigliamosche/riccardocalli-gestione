const MEMBER_SHIRTS = {
  sizes: ['XS', 'S', 'M', 'L', 'XL', '2XL'],
  measurements: [[52, 60, '21'], [54, 63, '22,5'], [58, 67, '24'], [61, 71, '24,5'], [64, 73, '25'], [68, 75, '25,5']],
  images: [
    ['salto', 'Salto al muretto con vista del retro della maglia'],
    ['fronte', 'Dettaglio della grafica sul petto durante un volteggio'],
    ['retro', 'Dettaglio della grafica grande sul retro'],
    ['gruppo', 'Le maglie crema indossate dal gruppo']
  ],
  value: null,
  owner: '',
  loading: false,
  saving: false
};

function shirtsMemberQty(quantities) {
  return Object.values(quantities).reduce((sum, value) => sum + value, 0);
}

function shirtsMemberDraft(form) {
  return Object.fromEntries(MEMBER_SHIRTS.sizes.map(size => [
    size, Number(form.elements.namedItem(size).value || 0)
  ]));
}

function shirtsMemberPrice(form) {
  const value = MEMBER_SHIRTS.value;
  if (!value) return;
  const quantities = shirtsMemberDraft(form);
  const qty = shirtsMemberQty(quantities);
  const total = value.total - shirtsMemberQty(value.quantities) + qty;
  const pricing = value.pricing;
  const tier = pricing && total <= pricing.maxQuantity
    ? pricing.tiers.filter(t => t.min <= Math.max(1, total)).pop() : null;
  const saved = shirtsMemberQty(value.quantities);
  const quantityLabel = total === 1 ? '1 maglia' : total + ' maglie';
  form.querySelector('[data-shirts-total]').textContent =
    qty !== saved ? 'Con la tua scelta: ' + quantityLabel : quantityLabel + ' nel lotto';
  form.querySelector('[data-shirts-price]').textContent = tier
    ? money(tier.cents / 100) + ' a maglia'
    : 'Prezzo in verifica';
  let rateDetail = 'La stima sarà disponibile quando Saiu avrà verificato il prezzo per questa quantità.';
  if (tier) {
    const quantity = Math.max(1, total);
    const date = fmtDate(pricing.checkedAt, false);
    if (!pricing.observedQuantities) rateDetail = 'Listino aggiornato il ' + date + '.';
    else if (pricing.observedQuantities.includes(quantity)) {
      rateDetail = 'Prezzo TeeFarm rilevato per ' + quantity + (quantity === 1 ? ' pezzo' : ' pezzi') + ' il ' + date + '.';
    } else {
      rateDetail = 'Stima dalla quantità precedente rilevata il ' + date + '.';
    }
  }
  form.querySelector('[data-shirts-price-detail]').textContent =
    (tier && qty ? 'Totale stimato per la tua scelta: ' + money(tier.cents * qty / 100) + '. ' : '') + rateDetail;
  form.querySelector('[data-shirts-saved]').textContent = saved
    ? saved + (saved === 1 ? ' maglia prenotata' : ' maglie prenotate') : 'Nessuna richiesta nel lotto aperto';
  form.querySelector('[data-shirts-save]').textContent = qty
    ? (saved ? 'Aggiorna preordine' : 'Salva preordine')
    : 'Annulla preordine';
  form.querySelector('[data-shirts-save]').disabled = MEMBER_SHIRTS.saving || (!saved && !qty);
}

function shirtsMemberImages() {
  return '<div class="shirt-gallery">' + MEMBER_SHIRTS.images.map(([name, label]) =>
    '<a hidden href="maglie/' + name + '.webp" class="shirt-image" target="_blank" rel="noopener" aria-label="' +
    esc(label) + '"><img src="maglie/' + name + '.webp" alt="' + esc(label) + '"></a>'
  ).join('') + '</div><p class="shirt-image-pending">Le anteprime della maglia saranno disponibili qui.</p>';
}

function renderMemberShirts() {
  titleEl.textContent = 'Maglia del gruppo';
  const owner = state.portal?.member?.id;
  if (!owner || !session()) return;
  if (MEMBER_SHIRTS.owner !== owner) {
    MEMBER_SHIRTS.value = null;
    MEMBER_SHIRTS.owner = owner;
  }
  const value = MEMBER_SHIRTS.value;
  const options = MEMBER_SHIRTS.sizes.map(size =>
    '<label><span>' + size + '</span><input name="' + size + '" type="number" inputmode="numeric" min="0" max="99" step="1" value="' +
    (value?.quantities[size] || 0) + '" aria-label="Quantità taglia ' + size + '"></label>'
  ).join('');
  const measures = MEMBER_SHIRTS.sizes.map((size, i) =>
    '<tr><th scope="row">' + size + '</th>' + MEMBER_SHIRTS.measurements[i].map(n => '<td>' + n + '</td>').join('') + '</tr>'
  ).join('');
  viewEl.innerHTML =
    '<section class="shirt-intro"><p class="eyebrow">MAGLIA DEL CORSO</p><h2>Pirati del Movimento</h2>' +
    '<p>Relaxed mid-light unisex · Cream · Cotone biologico 155 g/m²</p>' + shirtsMemberImages() + '</section>' +
    '<details class="card shirt-measures"><summary>Guida alle taglie · vestibilità oversize</summary>' +
    '<p>Confronta le misure con una maglia che ti sta bene, stesa in piano.</p>' +
    '<table><caption>Misure del capo in centimetri</caption><thead><tr><th scope="col">Taglia</th><th scope="col">Larghezza</th>' +
    '<th scope="col">Lunghezza</th><th scope="col">Manica</th></tr></thead><tbody>' + measures + '</tbody></table></details>' +
    '<section class="card shirt-order"><h2>Preordina</h2><p>Scegli le taglie e le quantità. Puoi modificarle fino a quando Saiu prepara il lotto.</p>' +
    '<p>Il prezzo è una stima basata sulle maglie del lotto aperto. Saiu confermerà il costo prima dell’acquisto. Ritiro a lezione.</p>' +
    '<p id="shirtStatus" role="status"></p><button id="shirtRetry" class="secondary" type="button" hidden>Aggiorna</button>' +
    '<form id="shirtForm" ' + (value ? '' : 'hidden') + '><fieldset><legend>Quantità per taglia</legend><div class="shirt-quantities">' +
    options + '</div></fieldset><div class="shirt-estimate" aria-live="polite"><small data-shirts-total></small>' +
    '<strong data-shirts-price></strong><small data-shirts-price-detail></small></div><p data-shirts-saved></p>' +
    '<button class="primary" data-shirts-save type="submit">Salva preordine</button></form></section><div id="shirtHistory"></div>';
  viewEl.querySelectorAll('.shirt-image img').forEach(img => {
    const show = () => {
      img.parentElement.hidden = false;
      const pending = viewEl.querySelector('.shirt-image-pending');
      if (pending) pending.hidden = true;
    };
    img.addEventListener('load', show, { once: true });
    if (img.complete && img.naturalWidth) show();
  });
  const form = $('#shirtForm');
  form.oninput = () => {
    form.dataset.dirty = 'true';
    shirtsMemberPrice(form);
  };
  form.onsubmit = saveMemberShirts;
  $('#shirtRetry').onclick = refreshMemberShirts;
  if (value) {
    shirtsMemberPrice(form);
    renderShirtsHistory(value.history);
  }
  refreshMemberShirts();
}

function renderShirtsHistory(history) {
  const el = $('#shirtHistory');
  el.innerHTML = history.length ? '<section class="card shirt-order"><h2>I tuoi lotti precedenti</h2>' + history.map(batch => {
    const quantities = MEMBER_SHIRTS.sizes.filter(s => batch.quantities[s]).map(s => s + ' × ' + batch.quantities[s]).join(' · ');
    const status = (batch.deliveredAt ? 'Consegnato' : batch.orderedAt ? 'Ordinato' : 'In preparazione') + (batch.paidAt ? ' · Saldato' : '');
    return '<p><strong>Lotto ' + batch.id + ' · ' + status + '</strong><br>' + esc(quantities) +
      (batch.finalCents == null ? '' : ' · ' + money(batch.finalCents / 100) + ' a maglia') + '</p>';
  }).join('') + '</section>' : '';
}

function applyMemberShirts(value, force = false) {
  const previous = MEMBER_SHIRTS.value;
  MEMBER_SHIRTS.value = value;
  const form = $('#shirtForm');
  if (!form) return;
  const changed = previous && (previous.batchId !== value.batchId || previous.updatedAt !== value.updatedAt);
  const discarded = changed && form.dataset.dirty && !force;
  if (force || changed || !form.dataset.dirty) {
    MEMBER_SHIRTS.sizes.forEach(size => { form.elements.namedItem(size).value = value.quantities[size] || 0; });
    delete form.dataset.dirty;
  }
  form.hidden = false;
  $('#shirtRetry').hidden = true;
  $('#shirtStatus').textContent = discarded ? 'La richiesta è cambiata. Controlla le quantità prima di salvare.' : '';
  shirtsMemberPrice(form);
  renderShirtsHistory(value.history);
}

async function refreshMemberShirts() {
  if (state.view !== 'shirts' || !session() || MEMBER_SHIRTS.loading || MEMBER_SHIRTS.saving) return;
  const currentSession = session();
  MEMBER_SHIRTS.loading = true;
  if (!MEMBER_SHIRTS.value && $('#shirtStatus')) $('#shirtStatus').textContent = 'Caricamento preordini…';
  try {
    const value = await api('memberShirts', { sessionToken: currentSession });
    if (state.view === 'shirts' && session() === currentSession) applyMemberShirts(value);
  } catch (error) {
    if (state.view !== 'shirts' || session() !== currentSession || !$('#shirtStatus')) return;
    $('#shirtStatus').textContent = error.message === 'Azione non valida.'
      ? 'I preordini saranno disponibili dopo l’attivazione.' : error.message;
    $('#shirtRetry').hidden = false;
    const form = $('#shirtForm');
    if (form) form.hidden = true;
    if (MEMBER_SHIRTS.value) MEMBER_SHIRTS.value.pricing = null;
  } finally {
    MEMBER_SHIRTS.loading = false;
  }
}

async function saveMemberShirts(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const value = MEMBER_SHIRTS.value;
  if (!value || MEMBER_SHIRTS.saving || MEMBER_SHIRTS.loading || !form.reportValidity()) return;
  const currentSession = session();
  const quantities = shirtsMemberDraft(form);
  MEMBER_SHIRTS.saving = true;
  shirtsMemberPrice(form);
  form.querySelector('fieldset').disabled = true;
  try {
    const saved = await api('memberSaveShirts', {
      sessionToken: currentSession, batchId: value.batchId, updatedAt: value.updatedAt, quantities
    });
    if (state.view === 'shirts' && session() === currentSession) {
      applyMemberShirts(saved, true);
      toast(shirtsMemberQty(quantities) ? 'Preordine salvato' : 'Preordine annullato');
    }
  } catch (error) {
    if (state.view === 'shirts' && session() === currentSession) {
      showMessage('Preordine', error.message);
    }
  } finally {
    MEMBER_SHIRTS.saving = false;
    const current = $('#shirtForm');
    if (current && session() === currentSession) {
      current.querySelector('fieldset').disabled = false;
      shirtsMemberPrice(current);
    }
    refreshMemberShirts();
  }
}

setInterval(() => {
  if (document.visibilityState === 'visible') refreshMemberShirts();
}, 30000);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') refreshMemberShirts();
});
