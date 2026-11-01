/* app.js — interfaccia del Magazzino scolastico. Logica in core.js, import in importa.js/leggi.js, sync in github.js. */
(function () {
  'use strict';
  const APP_VERSION = '2.0.0';
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fq = (q, u) => Core.fmtQty(q, u);
  const ul = u => Core.UNITS[Core.normUnit(u)].label;
  const opts = (list, sel, vuoto) => (vuoto != null ? `<option value="">${esc(vuoto)}</option>` : '') + list.map(v => `<option value="${esc(v)}" ${v === sel ? 'selected' : ''}>${esc(v)}</option>`).join('');
  const unitOpts = (sel, solo) => (solo || Core.UNIT_LIST).map(u => `<option value="${u}" ${u === sel ? 'selected' : ''}>${Core.UNITS[u].label}</option>`).join('');
  const UNITA_MISURA = ['g', 'kg', 'ml', 'cl', 'l'];

  // ---------- Stato ----------
  let S = load();
  let tab = 'dispensa';
  const ui = { search: '', cat: '', forn: '', soloSotto: false, pSearch: '', pClasse: '', pMateria: '', ordFiltro: 'aperti', ordSede: '', od: { forn: '', cat: '', sede: '' } };

  function load() {
    try { const raw = localStorage.getItem('mag.state'); if (raw) return Core.migrate(JSON.parse(raw)); } catch (e) { console.error(e); }
    return Core.emptyState();
  }
  function save(opts = {}) {
    localStorage.setItem('mag.state', JSON.stringify(S));
    localStorage.setItem('mag.dirty', String(Date.now()));
    if (!opts.silent) render(); else { aggiornaDatalist(); setSyncUI(); }
    scheduleSync();
  }

  // ---------- Sync ----------
  let syncTimer = null, syncing = false, syncErr = '';
  function scheduleSync() {
    if (!Sync.loggedIn() || !navigator.onLine) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => doSync(false), 4000);
  }
  async function doSync(interactive) {
    if (syncing) return;
    if (!Sync.configured()) { if (interactive) openSyncSetup(); return; }
    if (!navigator.onLine) { setSyncUI(); if (interactive) toast('Sei offline: i dati restano salvati su questo dispositivo'); return; }
    syncing = true; setSyncUI();
    const dirtyPrima = localStorage.getItem('mag.dirty');
    try {
      const merged = await Sync.sync(S);
      // eventuali modifiche fatte mentre il sync era in corso non vanno perse
      S = localStorage.getItem('mag.dirty') === dirtyPrima ? merged : Core.merge(S, merged);
      localStorage.setItem('mag.state', JSON.stringify(S));
      if (localStorage.getItem('mag.dirty') === dirtyPrima) localStorage.removeItem('mag.dirty'); else scheduleSync();
      syncErr = '';
      if (!overlay.classList.contains('open')) render();
      if (interactive) toast('Sincronizzato');
    } catch (e) {
      console.warn(e); syncErr = e.message;
      if (interactive) toast('Sincronizzazione non riuscita: ' + e.message);
    } finally { syncing = false; setSyncUI(); }
  }
  /** Bollino di stato: verde sincronizzato, arancione modifiche da inviare, blu in corso, rosso errore/offline, grigio non collegato. */
  function statoSync() {
    const ls = Sync.lastSync();
    const ora = ls ? new Date(ls).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'mai';
    if (!Sync.loggedIn()) return { cls: 'off', txt: 'Non collegato', tip: 'I dati sono solo su questo dispositivo. Tocca per collegare GitHub.' };
    if (syncing) return { cls: 'busy', txt: 'Sincronizzo…', tip: 'Sincronizzazione in corso' };
    if (!navigator.onLine) return { cls: 'err', txt: 'Offline', tip: 'Nessuna connessione: le modifiche sono salvate sul dispositivo e verranno inviate appena torna la rete' };
    if (syncErr) return { cls: 'err', txt: 'Non sincronizzato', tip: syncErr + ' — tocca per riprovare' };
    if (localStorage.getItem('mag.dirty')) return { cls: 'pending', txt: 'Da sincronizzare', tip: 'Ci sono modifiche non ancora inviate. Ultima sincronizzazione: ' + ora };
    return { cls: 'ok', txt: 'Sincronizzato', tip: 'Ultima sincronizzazione: ' + ora + '. Tocca per sincronizzare ora' };
  }
  function setSyncUI() {
    const st = statoSync(), b = $('#syncBtn');
    b.className = 'sync ' + st.cls; b.title = st.tip; $('#syncTxt').textContent = st.txt;
  }
  $('#syncBtn').addEventListener('click', () => Sync.loggedIn() ? doSync(true) : openSyncSetup());
  window.addEventListener('online', () => { setSyncUI(); scheduleSync(); });
  window.addEventListener('offline', setSyncUI);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && Sync.loggedIn()) doSync(false); });

  // ---------- Toast ----------
  let toastTimer = null;
  function toast(msg, action) {
    const t = $('#toast');
    t.innerHTML = esc(msg) + (action ? `<button>${esc(action.label)}</button>` : '');
    if (action) $('button', t).onclick = () => { action.fn(); hideToast(); };
    t.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(hideToast, action ? 6000 : 3200);
  }
  function hideToast() { $('#toast').classList.remove('show'); }

  // ---------- Sheet ----------
  const overlay = $('#overlay'), sheet = $('#sheet');
  function openSheet(html, wide) {
    sheet.onchange = null; sheet.oninput = null; sheet.onclick = null;
    sheet.className = 'sheet' + (wide ? ' wide' : '');
    sheet.innerHTML = '<div class="handle"></div><button class="close" data-close aria-label="Chiudi">✕</button>' + html;
    overlay.classList.add('open'); sheet.scrollTop = 0;
    const f = $('[autofocus]', sheet); if (f && window.innerWidth > 720) f.focus();
  }
  function closeSheet() { overlay.classList.remove('open'); sheet.innerHTML = ''; sheet.onchange = null; sheet.oninput = null; sheet.onclick = null; render(); }
  overlay.addEventListener('click', e => { if (e.target === overlay || e.target.closest('[data-close]')) closeSheet(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && overlay.classList.contains('open')) closeSheet(); });

  // ---------- Elenco prodotti per la ricerca (datalist condiviso) ----------
  function aggiornaDatalist() {
    $('#dlArt').innerHTML = Core.live(S.articoli).sort((a, b) => a.nome.localeCompare(b.nome))
      .map(a => `<option value="${esc(a.nome)}">${esc(a.categoria)}${a.fornitore ? ' · ' + esc(a.fornitore) : ''}</option>`).join('');
    $('#dlMaterie').innerHTML = [...new Set(['Enogastronomia', 'Pasticceria', 'Sala e vendita', 'Opzione dolciaria', 'Accoglienza turistica', ...Core.live(S.piani).map(p => p.materia).filter(Boolean)])]
      .map(m => `<option value="${esc(m)}">`).join('');
  }
  function artDaNome(nome) { const f = Core.trovaArticolo(S, nome); return f.art && f.come !== 'simile' ? f.art : null; }

  // ---------- Navigazione ----------
  $$('nav.tabs button').forEach(b => b.addEventListener('click', () => { tab = b.dataset.tab; render(); window.scrollTo(0, 0); }));
  $('#fab').addEventListener('click', () => {
    if (tab === 'dispensa') openArticolo();
    else if (tab === 'piani') openPiano();
    else if (tab === 'ordini') openNuovoOrdine();
  });

  function render() {
    $$('nav.tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
    $('#fab').hidden = tab === 'altro';
    $('#fab').title = { dispensa: 'Nuovo prodotto', piani: 'Nuovo piano', ordini: 'Nuovo ordine' }[tab] || '';
    $('#hTitle').textContent = { dispensa: 'Dispensa', piani: 'Piani di lavoro', ordini: 'Ordini', altro: 'Impostazioni' }[tab];
    const low = Core.sottoScorta(S).length, ord = Core.live(S.ordini).filter(o => o.stato !== 'ricevuto').length;
    $('#badgeLow').hidden = !low; $('#badgeLow').textContent = low;
    $('#badgeOrd').hidden = !ord; $('#badgeOrd').textContent = ord;
    $('#main').innerHTML = { dispensa: viewDispensa, piani: viewPiani, ordini: viewOrdini, altro: viewAltro }[tab]();
    aggiornaDatalist();
    setSyncUI();
  }

  // ---------- Vista: Dispensa ----------
  function viewDispensa() {
    const arts = Core.live(S.articoli);
    const r = Core.riepilogo(S);
    const q = Core.normNome(ui.search);
    const list = arts.filter(a => (!q || Core.normNome(a.nome).includes(q) || Core.normNome(a.fornitore).includes(q) || (a.alias || []).some(x => x.includes(q)))
      && (!ui.cat || a.categoria === ui.cat) && (!ui.forn || (a.fornitore || '') === (ui.forn === '—' ? '' : ui.forn))
      && (!ui.soloSotto || (a.scortaMinima > 0 && a.giacenza < a.scortaMinima)));
    list.sort((a, b) => a.nome.localeCompare(b.nome));
    const cats = [...new Set([...S.impostazioni.categorie, ...arts.map(a => a.categoria)])];
    let html = `<div class="summary">
      <div class="stat"><b>${r.articoli}</b><small>prodotti</small></div>
      <div class="stat ${r.sottoScorta ? 'warn' : ''}"><b>${r.sottoScorta}</b><small>sotto scorta</small></div>
      <div class="stat"><b>${r.ordiniAperti}</b><small>ordini aperti</small></div></div>
      <div class="toolbar">
        <input class="search" id="search" type="search" placeholder="Cerca prodotto…" value="${esc(ui.search)}">
        <button class="btn sec" data-act="impArt">Importa da file</button>
      </div>
      <div class="filters">
        <select data-f="cat" class="${ui.cat ? 'on' : ''}">${opts(cats, ui.cat, 'Tutte le categorie')}</select>
        <select data-f="forn" class="${ui.forn ? 'on' : ''}">${opts([...S.impostazioni.fornitori, '—'], ui.forn, 'Tutti i fornitori').replace('>—<', '>Senza fornitore<')}</select>
        <button class="chip warn ${ui.soloSotto ? 'on' : ''}" data-act="sotto">Sotto scorta</button>
        ${ui.cat || ui.forn || ui.soloSotto || ui.search ? '<button class="chip link" data-act="azzera">Azzera filtri</button>' : ''}
      </div>`;
    if (!arts.length) return html + `<div class="empty"><b>La dispensa è vuota</b>Aggiungi i prodotti con il tasto <b>+</b> oppure importali da un file Excel, CSV, Word o PDF con «Importa da file».</div>`;
    if (!list.length) return html + `<div class="empty">Nessun prodotto corrisponde ai filtri.</div>`;
    const groups = new Map();
    for (const a of list) { if (!groups.has(a.categoria)) groups.set(a.categoria, []); groups.get(a.categoria).push(a); }
    const ordineCat = c => { const i = cats.indexOf(c); return i < 0 ? 999 : i; };
    for (const [cat, items] of [...groups].sort((a, b) => ordineCat(a[0]) - ordineCat(b[0]))) {
      html += `<h2>${esc(cat)} <span class="count">${items.length}</span></h2><div class="card list">` + items.map(a => {
        const low = a.scortaMinima > 0 && a.giacenza < a.scortaMinima;
        return `<div class="item ${low ? 'low' : ''}" data-art="${a.id}">
          <div class="grow"><div class="title">${esc(a.nome)}</div>
          <div class="muted">${a.fornitore ? esc(a.fornitore) : '<i>nessun fornitore</i>'}${a.scortaMinima ? ' · min ' + fq(a.scortaMinima, a.unita) : ''}</div></div>
          <div class="qty">${fq(a.giacenza, a.unita)}${low ? '<small>sotto scorta</small>' : ''}</div>
          <button class="btn sec icon" data-mov="${a.id}" title="Carico / scarico / inventario" aria-label="Carico o scarico">±</button>
        </div>`;
      }).join('') + '</div>';
    }
    return html;
  }

  function openArticolo(id, preset) {
    const a = id ? Core.byId(S.articoli, id) : null;
    const v = a || Object.assign({ nome: '', categoria: '', unita: 'kg', fornitore: '', note: '', pezzo: null, alias: [] }, preset || {});
    const cats = [...new Set([...S.impostazioni.categorie, v.categoria].filter(Boolean))];
    const movs = a ? S.movimenti.filter(m => m.articoloId === a.id).slice(-8).reverse() : [];
    openSheet(`<h3>${a ? 'Modifica prodotto' : 'Nuovo prodotto'}</h3>
      <form id="fArt">
        <label class="f">Nome<input name="nome" required autofocus value="${esc(v.nome)}" placeholder="es. Farina 00"></label>
        <div class="grid2">
          <label class="f">Categoria<select name="categoria">${opts(cats, v.categoria || Core.indovinaCategoria(v.nome) || 'Altro')}</select></label>
          <label class="f">Unità di magazzino<select name="unita">${unitOpts(v.unita)}</select></label>
        </div>
        <div class="grid2">
          <label class="f">${a ? 'Giacenza attuale' : 'Giacenza iniziale'}<input name="giacenza" inputmode="decimal" value="${a ? a.giacenza : ''}" placeholder="0"></label>
          <label class="f">Scorta minima<input name="scortaMinima" inputmode="decimal" value="${a?.scortaMinima || ''}" placeholder="avviso sotto…"></label>
        </div>
        <label class="f">Fornitore<select name="fornitore">${opts([...new Set([...S.impostazioni.fornitori, v.fornitore].filter(Boolean))], v.fornitore, '— nessuno —')}</select></label>
        <fieldset class="conv"><legend>Conversione pezzi ↔ peso/volume <span class="muted">(facoltativa)</span></legend>
          <div class="muted">Serve quando nei piani il prodotto è scritto in modo diverso dal magazzino: es. limoni «n. 3» ma in magazzino a kg, oppure liquore «10 cl» ma in magazzino a bottiglie.</div>
          <div class="row">1 pezzo / confezione / bottiglia ≈ <input name="pq" inputmode="decimal" value="${v.pezzo ? v.pezzo.qta : ''}" placeholder="es. 120" style="width:90px"> <select name="pu">${unitOpts(v.pezzo ? v.pezzo.unita : 'g', UNITA_MISURA)}</select></div>
        </fieldset>
        <label class="f">Note<input name="note" value="${esc(v.note)}"></label>
        ${a && a.alias.length ? `<div class="f">Nomi riconosciuti nei piani<div class="chips wrap">${a.alias.map(x => `<span class="chip">${esc(x)} <button type="button" class="x" data-delalias="${esc(x)}" aria-label="Rimuovi">✕</button></span>`).join('')}</div></div>` : ''}
        <div class="actions"><button class="btn" type="submit">Salva</button>${a ? '<button class="btn warn" type="button" id="delArt">Elimina</button>' : ''}</div>
      </form>
      ${movs.length ? `<h2>Ultimi movimenti</h2>${movs.map(movHtml).join('')}` : ''}`);
    $('#fArt').onsubmit = e => {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(e.target));
      const pezzo = Core.num(d.pq) > 0 ? { qta: d.pq, unita: d.pu } : null;
      const dup = artDaNome(d.nome);
      if (dup && dup.id !== a?.id && !confirm(`Esiste già "${dup.nome}". Salvare comunque un secondo prodotto con lo stesso nome?`)) return;
      try {
        let art;
        if (a) {
          const g = Core.num(d.giacenza);
          Core.updateArticolo(S, a.id, { nome: d.nome, categoria: d.categoria, unita: d.unita, scortaMinima: d.scortaMinima, fornitore: d.fornitore, note: d.note, pezzo });
          if (g !== a.giacenza) Core.movimento(S, a.id, g, 'rettifica', 'Modifica manuale');
          art = a;
        } else art = Core.addArticolo(S, { ...d, pezzo });
        save(); closeSheet(); toast(a ? 'Prodotto aggiornato' : 'Prodotto aggiunto');
        if (preset && preset.onCreate) preset.onCreate(art);
      } catch (err) { toast(err.message); }
    };
    sheet.onclick = e => {
      const da = e.target.closest('[data-delalias]');
      if (da && a) { a.alias = a.alias.filter(x => x !== da.dataset.delalias); a.u = new Date().toISOString(); save({ silent: true }); da.closest('.chip').remove(); }
    };
    if (a) $('#delArt').onclick = () => {
      if (!confirm(`Eliminare "${a.nome}"?`)) return;
      const snap = JSON.stringify(S);
      Core.deleteArticolo(S, a.id); save(); closeSheet();
      toast('Prodotto eliminato', { label: 'Annulla', fn: () => { S = Core.migrate(JSON.parse(snap)); save(); } });
    };
  }
  function movHtml(m) {
    const a = Core.byId(S.articoli, m.articoloId) || S.articoli.find(x => x.id === m.articoloId);
    const tipo = { carico: 'Carico', scarico: 'Scarico', rettifica: 'Inventario' }[m.tipo] || m.tipo;
    return `<div class="mov"><span class="d">${new Date(m.data).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' })}</span><span class="grow">${a && tab === 'altro' ? '<b>' + esc(a.nome) + '</b> · ' : ''}${tipo}${m.nota ? ' · ' + esc(m.nota) : ''}</span><span class="v ${m.delta < 0 ? 'neg' : 'pos'}">${m.delta > 0 ? '+' : ''}${fq(m.delta, a?.unita)}</span></div>`;
  }

  function openMovimento(id) {
    const a = Core.byId(S.articoli, id);
    openSheet(`<h3>${esc(a.nome)}</h3><div class="muted">Giacenza attuale: <b>${fq(a.giacenza, a.unita)}</b></div>
      <form id="fMov">
        <div class="seg" style="margin-top:12px">
          <label><input type="radio" name="tipo" value="scarico" checked><span>− Scarico</span></label>
          <label><input type="radio" name="tipo" value="carico"><span>+ Carico</span></label>
          <label><input type="radio" name="tipo" value="rettifica"><span>= Inventario</span></label>
        </div>
        <label class="f">Quantità (${ul(a.unita)})<input name="qta" inputmode="decimal" required autofocus placeholder="0"></label>
        <label class="f">Nota (facoltativa)<input name="nota" placeholder="es. esercitazione 3B"></label>
        <div class="actions"><button class="btn" type="submit">Registra</button></div>
      </form>`);
    $('#fMov').onsubmit = e => {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(e.target));
      let q = Core.num(d.qta);
      if (d.tipo === 'scarico') q = -q;
      Core.movimento(S, a.id, q, d.tipo, d.nota);
      save(); closeSheet(); toast(`${a.nome}: ora ${fq(Core.byId(S.articoli, a.id).giacenza, a.unita)}`);
    };
  }

  // ---------- Vista: Piani ----------
  const ordineClasse = c => { const i = Core.CLASSI.indexOf(c); return i < 0 ? 99 : i; };
  function viewPiani() {
    const tutti = Core.live(S.piani);
    const q = Core.normNome(ui.pSearch);
    const piani = tutti.filter(p => (!q || Core.normNome(p.nome + ' ' + p.materia + ' ' + p.file).includes(q))
      && (!ui.pClasse || p.classe === ui.pClasse) && (!ui.pMateria || p.materia === ui.pMateria));
    const materie = [...new Set(tutti.map(p => p.materia).filter(Boolean))].sort();
    let html = `<div class="toolbar">
        <input class="search" id="pSearch" type="search" placeholder="Cerca piano…" value="${esc(ui.pSearch)}">
        <button class="btn" data-act="impPiani">Importa piani (Word / PDF)</button>
      </div>
      <div class="filters">
        <select data-f="pClasse" class="${ui.pClasse ? 'on' : ''}">${opts(Core.CLASSI, ui.pClasse, 'Tutte le classi')}</select>
        <select data-f="pMateria" class="${ui.pMateria ? 'on' : ''}">${opts(materie, ui.pMateria, 'Tutte le materie')}</select>
        ${ui.pClasse || ui.pMateria || ui.pSearch ? '<button class="chip link" data-act="azzeraP">Azzera filtri</button>' : ''}
      </div>`;
    if (!tutti.length) return html + `<div class="empty"><b>Nessun piano di lavoro</b>Importa i piani dai file Word o PDF dei docenti con «Importa piani»: l'app legge ricette e quantità e ti fa controllare ciò che sembra strano. Oppure creane uno a mano con il tasto <b>+</b>.</div>`;
    if (!piani.length) return html + `<div class="empty">Nessun piano corrisponde ai filtri.</div>`;
    const groups = new Map();
    for (const p of piani.sort((a, b) => ordineClasse(a.classe) - ordineClasse(b.classe) || a.nome.localeCompare(b.nome))) {
      const k = p.classe ? (p.classe.startsWith('Serale') ? p.classe : 'Classe ' + p.classe) : 'Classe non indicata';
      if (!groups.has(k)) groups.set(k, []); groups.get(k).push(p);
    }
    for (const [k, ps] of groups) html += `<h2>${esc(k)} <span class="count">${ps.length}</span></h2><div class="card list">${ps.map(p => `<div class="item" data-piano="${p.id}">
      <div class="grow"><div class="title">${esc(p.nome)}</div><div class="muted">${[p.materia, p.lezione && (/^\d/.test(p.lezione) ? 'Lez. ' + p.lezione : p.lezione), p.righe.length + ' ingredienti', p.qb.length ? p.qb.length + ' q.b.' : ''].filter(Boolean).map(esc).join(' · ')}</div></div>
      <button class="btn sec sm" data-scarica="${p.id}" title="Togli dalla dispensa gli ingredienti di un'esercitazione svolta">Scarica</button></div>`).join('')}</div>`;
    return html + `<p class="muted center">Le quantità dei piani sono <b>per una classe</b>. «Scarica» toglie dalla dispensa gli ingredienti di un'esercitazione svolta.</p>`;
  }

  function openPiano(id, copia) {
    const p = id ? Core.byId(S.piani, id) : null;
    const righe = p ? p.righe.map(r => ({ ...r, nome: Core.byId(S.articoli, r.articoloId)?.nome || '' })) : [{ nome: '', qta: '', unita: 'g' }];
    const rigaHtml = r => `<div class="riga-piano">
      <input name="art" list="dlArt" placeholder="cerca prodotto…" value="${esc(r.nome)}" autocomplete="off" title="${esc(r.testo || '')}">
      <input name="qta" inputmode="decimal" placeholder="qtà" value="${r.qta || ''}">
      <select name="un">${unitOpts(r.unita)}</select>
      <button type="button" class="x" data-rm aria-label="Rimuovi">✕</button></div>`;
    openSheet(`<h3>${p && !copia ? 'Modifica piano' : 'Nuovo piano di lavoro'}</h3>
      <form id="fPiano">
        <label class="f">Nome<input name="nome" required autofocus value="${esc(p ? p.nome + (copia ? ' (copia)' : '') : '')}" placeholder="es. Cacio e pepe / Panzanella"></label>
        <div class="grid3">
          <label class="f">Classe<select name="classe">${opts(Core.CLASSI, p?.classe || '', '—')}</select></label>
          <label class="f">Materia<input name="materia" list="dlMaterie" value="${esc(p?.materia || '')}"></label>
          <label class="f">Lezione<input name="lezione" value="${esc(p?.lezione || '')}" placeholder="es. 1-2"></label>
        </div>
        ${p?.file ? `<div class="muted" style="margin-top:6px">Importato da: ${esc(p.file)}</div>` : ''}
        <div class="f">Ingredienti <b>per una classe</b></div>
        <div id="righe">${righe.map(rigaHtml).join('')}</div>
        <button type="button" class="btn sec sm" id="addRiga" style="margin-top:8px">+ ingrediente</button>
        <label class="f">Ingredienti «q.b.» (non entrano nell'ordine; separali con la virgola)<input name="qb" value="${esc((p?.qb || []).join(', '))}" placeholder="es. Sale, Pepe"></label>
        <label class="f">Note<input name="descrizione" value="${esc(p?.descrizione || '')}"></label>
        <div class="actions"><button class="btn" type="submit">Salva</button>
          ${p && !copia ? `<button class="btn sec" type="button" id="dupPiano">Duplica</button><button class="btn warn" type="button" id="delPiano">Elimina</button>` : ''}</div>
      </form>`);
    const cont = $('#righe');
    cont.addEventListener('change', e => {
      if (e.target.name !== 'art') return;
      const a = artDaNome(e.target.value), row = e.target.closest('.riga-piano');
      if (a && !$('[name=qta]', row).value) $('[name=un]', row).value = a.unita === 'kg' ? 'g' : a.unita === 'l' ? 'ml' : a.unita;
    });
    cont.addEventListener('click', e => { if (e.target.closest('[data-rm]')) e.target.closest('.riga-piano').remove(); });
    $('#addRiga').onclick = () => { cont.insertAdjacentHTML('beforeend', rigaHtml({ nome: '', qta: '', unita: 'g' })); $('.riga-piano:last-child input', cont).focus(); };
    $('#fPiano').onsubmit = e => {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(e.target));
      const rows = $$('.riga-piano', cont).map(r => ({ nome: $('[name=art]', r).value.trim(), qta: $('[name=qta]', r).value, unita: $('[name=un]', r).value, testo: $('[name=art]', r).title }))
        .filter(r => r.nome && Core.num(r.qta) > 0);
      const nuovi = rows.filter(r => !artDaNome(r.nome));
      if (nuovi.length && !confirm(`Questi prodotti non sono ancora in dispensa e verranno aggiunti:\n\n${nuovi.map(r => '• ' + r.nome).join('\n')}\n\nContinuare?`)) return;
      for (const r of nuovi) Core.addArticolo(S, { nome: r.nome, unita: Core.unitaMagazzino(r.unita, r.nome) });
      const righeOk = rows.map(r => { const a = artDaNome(r.nome); return { articoloId: a.id, qta: r.qta, unita: r.unita, testo: r.testo }; });
      const senzaConv = righeOk.filter(r => { const a = Core.byId(S.articoli, r.articoloId); return Core.convert(1, r.unita, a.unita, a.pezzo) == null; })
        .map(r => Core.byId(S.articoli, r.articoloId));
      if (senzaConv.length && !confirm(`Per questi prodotti l'unità del piano non si converte in quella del magazzino (serve la conversione nella scheda del prodotto):\n\n${senzaConv.map(a => '• ' + a.nome + ' (magazzino in ' + ul(a.unita) + ')').join('\n')}\n\nSalvare comunque?`)) return;
      const dati = { nome: d.nome, classe: d.classe, materia: d.materia.trim(), lezione: d.lezione.trim(), descrizione: d.descrizione, righe: righeOk, qb: d.qb.split(',') };
      try {
        if (p && !copia) Core.updatePiano(S, p.id, dati);
        else Core.addPiano(S, { ...dati, file: copia ? p.file : '' });
        save(); closeSheet(); toast('Piano salvato');
      } catch (err) { toast(err.message); }
    };
    if (p && !copia) {
      $('#dupPiano').onclick = () => openPiano(p.id, true);
      $('#delPiano').onclick = () => { if (!confirm(`Eliminare "${p.nome}"?`)) return; Core.deletePiano(S, p.id); save(); closeSheet(); toast('Piano eliminato'); };
    }
  }

  function openScarica(id) {
    const p = Core.byId(S.piani, id);
    openSheet(`<h3>Scarica «${esc(p.nome)}»</h3><p class="muted">Toglie dalla dispensa gli ingredienti del piano moltiplicati per il numero di classi (esercitazione svolta).</p>
      <form id="fSc"><label class="f">Numero di classi<input name="classi" inputmode="numeric" required autofocus value="1"></label>
      <div id="anteprima"></div>
      <div class="actions"><button class="btn" type="submit">Scarica dalla dispensa</button></div></form>`);
    const prev = () => {
      const n = Core.num($('#fSc [name=classi]').value);
      const fb = Core.fabbisogno(S, [{ pianoId: p.id, classi: n }]);
      $('#anteprima').innerHTML = `<table class="t" style="margin-top:10px"><tr><th>Ingrediente</th><th class="n">Scarico</th><th class="n">Resta</th></tr>` +
        [...fb].map(([aid, e]) => { const a = Core.byId(S.articoli, aid); const resto = a.giacenza - e.qta; return `<tr><td>${esc(a.nome)}${e.errori.length ? ' <span class="tag warn" title="' + esc(e.errori.join('\n')) + '">unità?</span>' : ''}</td><td class="n">${fq(e.qta, a.unita)}</td><td class="n ${resto < 0 ? 'neg' : ''}">${fq(resto, a.unita)}</td></tr>`; }).join('') + '</table>';
    };
    prev(); $('#fSc [name=classi]').addEventListener('input', prev);
    $('#fSc').onsubmit = e => { e.preventDefault(); const n = Core.num($('#fSc [name=classi]').value); if (n <= 0) return; Core.scaricaPiano(S, p.id, n); save(); closeSheet(); toast(`Scaricato ${p.nome} × ${n}`); };
  }

  // ---------- Import dei piani ----------
  async function importaPiani(files) {
    const docs = [], errori = [];
    toast('Leggo ' + (files.length > 1 ? files.length + ' file…' : 'il file…'));
    for (const f of files) {
      try { docs.push(await Leggi.file(f)); } catch (e) { errori.push(e.message); }
    }
    hideToast();
    if (errori.length) alert('Alcuni file non sono stati letti:\n\n' + errori.join('\n\n'));
    const esito = { salvati: 0, saltati: 0 };
    const prossimo = i => {
      if (i >= docs.length) { closeSheet(); if (docs.length) toast(`Piani importati: ${esito.salvati}` + (esito.saltati ? ` · saltati: ${esito.saltati}` : '')); return; }
      let p;
      try { p = Importa.analizzaPiano(S, docs[i]); } catch (e) { alert(`${docs[i].nomeFile}: ${e.message}`); esito.saltati++; return prossimo(i + 1); }
      revisionePiano(p, i, docs.length, ok => { esito[ok ? 'salvati' : 'saltati']++; prossimo(i + 1); });
    };
    prossimo(0);
  }

  function revisionePiano(p, idx, tot, done) {
    let soloDubbi = false;
    const giaImportato = Core.live(S.piani).find(x => x.file && x.file === p.nomeFile);
    const conteggi = () => {
      const att = p.righe.filter(r => !r.escludi);
      return { tot: att.length, dubbi: att.filter(r => r.flags.length).length, nuovi: att.filter(r => !r.articoloId && !(r.qb && !(Core.num(r.qta) > 0))).length, qb: att.filter(r => r.qb && !(Core.num(r.qta) > 0)).length };
    };
    const rigaHtml = (r, i) => {
      const qbVuota = r.qb && !(Core.num(r.qta) > 0);
      const stato = r.escludi ? '<span class="tag">esclusa</span>' : qbVuota ? '<span class="tag">q.b.</span>' : r.articoloId ? '<span class="tag ok">in dispensa</span>' : '<span class="tag acc">nuovo prodotto</span>';
      return `<div class="rv ${r.flags.length && !r.escludi ? 'flag' : ''} ${r.escludi ? 'off' : ''}" data-i="${i}" ${soloDubbi && !r.flags.length ? 'hidden' : ''}>
        <div class="rv-orig"><span class="muted">Nel file:</span> <b>${esc(r.testo)}</b> <span class="muted">— ${esc([r.qtaOrig, r.umOrig].filter(Boolean).join(' ') || 'nessuna quantità')}${r.nota ? ' · ' + esc(r.nota) : ''}</span> ${stato}</div>
        <div class="rv-grid">
          <input class="rv-art" list="dlArt" value="${esc(r.nomeArticolo || '')}" placeholder="prodotto" autocomplete="off" aria-label="Prodotto" ${r.escludi ? 'disabled' : ''}>
          <input class="rv-q" inputmode="decimal" value="${r.qta ?? ''}" placeholder="${r.qb ? 'q.b.' : 'qtà'}" aria-label="Quantità" ${r.escludi ? 'disabled' : ''}>
          <select class="rv-u" aria-label="Unità" ${r.escludi ? 'disabled' : ''}>${r.unita ? '' : '<option value="">—</option>'}${unitOpts(r.unita)}</select>
          <button type="button" class="x" data-escludi title="${r.escludi ? 'Ripristina la riga' : 'Escludi la riga'}">${r.escludi ? '↺' : '✕'}</button>
        </div>
        ${!r.escludi && r.pezzoServe ? `<div class="rv-conv">Conversione: 1 ${esc(Core.unitLabel(r.pezzo.unitaPezzo, 1))} di ${esc(r.nomeArticolo)} ≈ <input class="rv-pq" inputmode="decimal" value="${r.pezzo.qta ?? ''}" placeholder="?"> <select class="rv-pu">${unitOpts(r.pezzo.unita, UNITA_MISURA)}</select></div>` : ''}
        ${!r.escludi && !r.articoloId && r.simili && r.simili.length ? `<div class="rv-sugg">Forse è già in dispensa come: ${r.simili.map(s => `<button type="button" class="chip" data-sugg="${s.id}">${esc(s.nome)}</button>`).join('')}</div>` : ''}
        ${!r.escludi && r.flags.length ? `<ul class="rv-flags">${r.flags.map(f => `<li class="${f.tipo}">${esc(f.msg)}</li>`).join('')}</ul>` : ''}
      </div>`;
    };
    const statsHtml = () => { const c = conteggi(); return `<b>${c.tot}</b> righe · <b class="${c.dubbi ? 'warn' : ''}">${c.dubbi}</b> da controllare · <b>${c.nuovi}</b> prodotti nuovi · <b>${c.qb}</b> q.b.`; };
    const classeAvv = p.avvisi.find(a => a.tipo === 'classe');
    openSheet(`<h3>Controlla il piano importato ${tot > 1 ? `<span class="muted">(${idx + 1} di ${tot})</span>` : ''}</h3>
      <div class="file">📄 ${esc(p.nomeFile)}</div>
      ${giaImportato ? `<div class="avviso">Questo file è già stato importato come «${esc(giaImportato.nome)}». Salvandolo avrai due piani.</div>` : ''}
      ${classeAvv ? `<div class="avviso forte"><b>Classe da confermare.</b> ${esc(classeAvv.msg)}
        <div class="seg" style="margin-top:8px"><label><input type="radio" name="sceltaClasse" value="${esc(p.classeFile)}"><span>${esc(p.classeFile)} <small>(nome del file)</small></span></label><label><input type="radio" name="sceltaClasse" value="${esc(p.classeTesto)}"><span>${esc(p.classeTesto)} <small>(nel documento)</small></span></label></div></div>` : ''}
      ${p.avvisi.filter(a => a.tipo !== 'classe').map(a => `<div class="avviso">${esc(a.msg)}</div>`).join('')}
      <div class="grid-rev">
        <label class="f">Nome del piano<input id="rvNome" value="${esc(p.nome)}"></label>
        <label class="f">Classe<select id="rvClasse">${opts(Core.CLASSI, p.classe, '— scegli —')}</select></label>
        <label class="f">Materia<input id="rvMateria" list="dlMaterie" value="${esc(p.materia)}"></label>
        <label class="f">Lezione<input id="rvLez" value="${esc(p.lezione)}"></label>
      </div>
      <div class="rv-bar"><span id="rvStats">${statsHtml()}</span><label class="chk"><input type="checkbox" id="rvSolo"> solo da controllare</label></div>
      <p class="muted">Quantità <b>per una classe</b>. Le righe in arancione hanno qualcosa da controllare: dove possibile ho già inserito una proposta, che puoi modificare.</p>
      <div id="rvRighe">${p.righe.map(rigaHtml).join('')}</div>
      <div class="actions sticky"><button class="btn" id="rvSalva">Salva piano</button><button class="btn sec" id="rvSalta">${tot > 1 && idx + 1 < tot ? 'Salta questo file' : 'Annulla'}</button></div>`, true);

    const ridisegna = i => {
      const el = $(`.rv[data-i="${i}"]`, sheet);
      if (el) el.outerHTML = rigaHtml(p.righe[i], i);
      $('#rvStats').textContent = ''; $('#rvStats').innerHTML = statsHtml();
    };
    const ricontrollaDoppi = () => { Importa.segnaDoppi(p.righe); p.righe.forEach((_, i) => ridisegna(i)); };
    sheet.onchange = e => {
      const t = e.target;
      if (t.name === 'sceltaClasse') { $('#rvClasse').value = t.value; return; }
      if (t.id === 'rvSolo') { soloDubbi = t.checked; p.righe.forEach((_, i) => ridisegna(i)); return; }
      const el = t.closest('.rv'); if (!el) return;
      const i = +el.dataset.i, r = p.righe[i];
      const pezzoPrima = r.pezzo;
      if (t.classList.contains('rv-art')) {
        r.nomeArticolo = t.value.trim(); r.articoloId = null; r.simili = [];
        Importa.abbina(S, r);
        r.flags = r.flags.filter(f => f.tipo !== 'simile');
      } else if (t.classList.contains('rv-q') || t.classList.contains('rv-u')) {
        if (t.classList.contains('rv-q')) r.qta = t.value.trim() === '' ? null : Core.num(t.value); else r.unita = t.value;
        r.flags = r.flags.filter(f => !['scala', 'qta', 'unita'].includes(f.tipo));
        Importa.controllaUnita(S, r);
      } else if (t.classList.contains('rv-pq') || t.classList.contains('rv-pu')) {
        if (t.classList.contains('rv-pq')) r.pezzo.qta = t.value; else r.pezzo.unita = t.value;
        return;
      }
      if (pezzoPrima && r.pezzo && pezzoPrima.unitaPezzo === r.pezzo.unitaPezzo && pezzoPrima.qta !== '') { r.pezzo.qta = pezzoPrima.qta; r.pezzo.unita = pezzoPrima.unita; }
      if (t.classList.contains('rv-art')) ricontrollaDoppi(); else ridisegna(i);
    };
    sheet.onclick = e => {
      const el = e.target.closest('.rv');
      if (el && e.target.closest('[data-escludi]')) { const r = p.righe[+el.dataset.i]; r.escludi = !r.escludi; ricontrollaDoppi(); return; }
      const sg = e.target.closest('[data-sugg]');
      if (el && sg) { const r = p.righe[+el.dataset.i]; r.nomeArticolo = Core.byId(S.articoli, sg.dataset.sugg).nome; r.articoloId = null; Importa.abbina(S, r); ricontrollaDoppi(); }
    };
    $('#rvSalta').onclick = () => { if (tot > 1 && idx + 1 < tot) done(false); else closeSheet(); };
    $('#rvSalva').onclick = () => {
      p.nome = $('#rvNome').value.trim(); p.classe = $('#rvClasse').value; p.materia = $('#rvMateria').value.trim(); p.lezione = $('#rvLez').value.trim();
      if (!p.nome) { toast('Scrivi il nome del piano'); $('#rvNome').focus(); return; }
      if (!p.classe) { toast(classeAvv ? 'Conferma la classe giusta prima di salvare' : 'Scegli la classe'); $('#rvClasse').focus(); return; }
      const att = p.righe.filter(r => !r.escludi && !(r.qb && !(Core.num(r.qta) > 0)));
      const incomplete = att.filter(r => !(Core.num(r.qta) > 0) || !r.unita || !r.nomeArticolo);
      if (incomplete.length) {
        toast(`Mancano prodotto, quantità o unità in ${incomplete.length} righe (oppure escludile con ✕)`);
        const i = p.righe.indexOf(incomplete[0]); const el = $(`.rv[data-i="${i}"]`, sheet); if (el) { el.hidden = false; el.scrollIntoView({ block: 'center', behavior: 'smooth' }); el.classList.add('flag'); }
        return;
      }
      const senzaConv = att.filter(r => r.pezzoServe && !(Core.num(r.pezzo.qta) > 0));
      if (senzaConv.length && !confirm(`Manca la conversione per: ${senzaConv.map(r => r.nomeArticolo).join(', ')}.\nPer questi prodotti il fabbisogno non verrà calcolato finché non la inserisci nella scheda del prodotto. Salvare comunque?`)) return;
      try { Importa.applicaPiano(S, p); save({ silent: true }); done(true); } catch (err) { toast(err.message); }
    };
  }

  // ---------- Import di prodotti ----------
  async function importaArticoli(f) {
    let an;
    try { toast('Leggo il file…'); an = Importa.analizzaArticoli(S, await Leggi.file(f)); hideToast(); }
    catch (e) { toast(e.message); return; }
    if (!an.voci.length) { alert('Non ho trovato prodotti in questo file. Serve una tabella con una colonna «Nome» o «Descrizione» (e possibilmente U.M., Fornitore, Categoria).'); return; }
    const cats = () => [...new Set([...S.impostazioni.categorie, ...an.voci.map(v => v.categoria)])];
    const riga = (v, i) => {
      const fs = Importa.fornitoreVoce(an, v);
      return `<tr class="${v.azione === 'salta' ? 'off' : ''}" data-i="${i}">
        <td><input type="checkbox" class="ia-ok" ${v.azione !== 'salta' ? 'checked' : ''} aria-label="Importa"></td>
        <td><input class="ia-nome" value="${esc(v.nome)}">${v.avviso ? `<div class="warn small">${esc(v.avviso)}</div>` : ''}${v.simile ? `<div class="muted small">Simile a «${esc(v.simile)}» già in dispensa</div>` : ''}</td>
        <td><select class="ia-u">${unitOpts(v.unita)}</select></td>
        <td><select class="ia-cat">${opts(cats(), v.categoria)}</select></td>
        <td><select class="ia-forn">${opts([...new Set([...S.impostazioni.fornitori, fs].filter(Boolean))], v.fornitore, v.sezione ? `(dalla sezione: ${an.sezioni.find(s => s.nome === v.sezione)?.fornitore || 'nessuno'})` : '— nessuno —')}</select></td>
        <td>${v.azione === 'aggiorna' ? '<span class="tag">già presente</span>' : '<span class="tag acc">nuovo</span>'}</td></tr>`;
    };
    const disegna = () => {
      const n = an.voci.filter(v => v.azione !== 'salta');
      openSheet(`<h3>Importa prodotti</h3><div class="file">📄 ${esc(an.nomeFile)}</div>
        ${an.sezioni.length ? `<h2>Sezioni trovate nel file</h2><p class="muted">Ogni sezione può corrispondere a un fornitore: scegli quale (i prodotti della sezione lo prenderanno).</p>
          <div class="sezioni">${an.sezioni.map((s, i) => `<label class="f">${esc(s.nome)}<select data-sez="${i}">${opts(S.impostazioni.fornitori, s.fornitore, '— nessun fornitore —')}</select></label>`).join('')}</div>` : ''}
        <p class="muted"><b>${n.filter(v => v.azione === 'nuovo').length}</b> nuovi · <b>${n.filter(v => v.azione === 'aggiorna').length}</b> già presenti (verranno aggiornati) · <b>${an.voci.length - n.length}</b> esclusi. Categoria e unità sono proposte: correggile se serve.</p>
        <div class="scroll-x"><table class="t ia"><tr><th></th><th>Prodotto</th><th>Unità</th><th>Categoria</th><th>Fornitore</th><th></th></tr>${an.voci.map(riga).join('')}</table></div>
        <div class="actions sticky"><button class="btn" id="iaOk">Importa ${n.length} prodotti</button><button class="btn sec" data-close>Annulla</button></div>`, true);
    };
    const collega = () => {
    sheet.onchange = e => {
      const t = e.target;
      if (t.dataset.sez != null) { an.sezioni[+t.dataset.sez].fornitore = t.value; const y = sheet.scrollTop; disegna(); collega(); sheet.scrollTop = y; return; }
      const tr = t.closest('tr[data-i]'); if (!tr) return;
      const v = an.voci[+tr.dataset.i];
      if (t.classList.contains('ia-ok')) { v.azione = t.checked ? (v.articoloId ? 'aggiorna' : 'nuovo') : 'salta'; tr.classList.toggle('off', !t.checked); $('#iaOk').textContent = `Importa ${an.voci.filter(x => x.azione !== 'salta').length} prodotti`; }
      if (t.classList.contains('ia-nome')) v.nome = t.value.trim();
      if (t.classList.contains('ia-u')) v.unita = t.value;
      if (t.classList.contains('ia-cat')) v.categoria = t.value;
      if (t.classList.contains('ia-forn')) v.fornitore = t.value;
    };
    sheet.onclick = e => {
      if (e.target.id !== 'iaOk') return;
      const r = Importa.applicaArticoli(S, an);
      save(); closeSheet(); toast(`Prodotti: ${r.inseriti} aggiunti, ${r.aggiornati} aggiornati`);
    };
    };
    disegna(); collega();
  }

  // ---------- Vista: Ordini ----------
  function viewOrdini() {
    const all = Core.live(S.ordini).sort((a, b) => (b.settimana || '').localeCompare(a.settimana || '') || (b.data || '').localeCompare(a.data || ''));
    const list = all.filter(o => (ui.ordFiltro === 'aperti' ? o.stato !== 'ricevuto' : o.stato === 'ricevuto') && (!ui.ordSede || o.voci.some(v => v.sede === ui.ordSede)));
    let html = `<div class="filters">
      <div class="seg small"><label><input type="radio" name="of" data-of="aperti" ${ui.ordFiltro === 'aperti' ? 'checked' : ''}><span>In corso</span></label><label><input type="radio" name="of" data-of="ricevuti" ${ui.ordFiltro === 'ricevuti' ? 'checked' : ''}><span>Ricevuti</span></label></div>
      ${S.impostazioni.sedi.length ? `<select data-f="ordSede" class="${ui.ordSede ? 'on' : ''}">${opts(S.impostazioni.sedi, ui.ordSede, 'Tutte le sedi')}</select>` : ''}
    </div>`;
    if (!all.length) return html + `<div class="empty"><b>Nessun ordine</b>Con il tasto <b>+</b> crei l'ordine di una settimana: scegli i piani di lavoro, quante classi li fanno e in quale sede. L'app calcola il <b>fabbisogno</b>, lo confronta con la <b>giacenza</b> e propone le quantità <b>da ordinare</b>.</div>`;
    if (!list.length) return html + `<div class="empty">Nessun ordine ${ui.ordFiltro === 'aperti' ? 'in corso' : 'ricevuto'}${ui.ordSede ? ' per ' + esc(ui.ordSede) : ''}.</div>`;
    return html + `<div class="card list">${list.map(o => {
      const n = o.righe.filter(r => r.daOrdinare > 0).length;
      const st = { bozza: '<span class="tag">bozza</span>', inviato: '<span class="tag acc">inviato</span>', ricevuto: '<span class="tag ok">ricevuto</span>' }[o.stato];
      const sedi = Core.sediOrdine(S, o).filter(Boolean);
      return `<div class="item" data-ord="${o.id}"><div class="grow"><div class="title">${esc(o.nome || 'Settimana del ' + Core.fmtData(o.settimana))} ${st}</div>
        <div class="muted">${o.nome ? 'Settimana del ' + Core.fmtData(o.settimana) + ' · ' : ''}${o.voci.length} ${o.voci.length === 1 ? 'piano' : 'piani'}${sedi.length ? ' · ' + sedi.map(esc).join(', ') : ''}</div></div>
        <div class="qty">${n}<small>da ordinare</small></div></div>`;
    }).join('')}</div>`;
  }

  function pianoOptions(sel) {
    const groups = new Map();
    for (const p of Core.live(S.piani).sort((a, b) => ordineClasse(a.classe) - ordineClasse(b.classe) || a.nome.localeCompare(b.nome))) {
      const k = p.classe ? (p.classe.startsWith('Serale') ? p.classe : 'Classe ' + p.classe) : 'Classe non indicata';
      if (!groups.has(k)) groups.set(k, []); groups.get(k).push(p);
    }
    return '<option value="">— scegli il piano —</option>' + [...groups].map(([k, ps]) => `<optgroup label="${esc(k)}">${ps.map(p => `<option value="${p.id}" ${sel === p.id ? 'selected' : ''}>${esc(p.nome)}${p.materia ? ' · ' + esc(p.materia) : ''}</option>`).join('')}</optgroup>`).join('');
  }
  function vociEditorHtml(voci) {
    const sedi = S.impostazioni.sedi;
    const riga = v => `<div class="riga-voce">
      <select name="piano" aria-label="Piano">${pianoOptions(v.pianoId)}</select>
      <input name="classi" inputmode="numeric" placeholder="classi" value="${v.classi || ''}" aria-label="Numero di classi">
      <select name="sede" aria-label="Sede">${opts([...new Set([...sedi, v.sede].filter(Boolean))], v.sede || '', sedi.length ? '— sede —' : '(nessuna sede)')}</select>
      <button type="button" class="x" data-rmvoce aria-label="Rimuovi">✕</button></div>`;
    return `<div class="voci-head"><span>Piano di lavoro</span><span>Classi</span><span>Sede</span><span></span></div><div id="voci">${voci.map(riga).join('')}</div>
      <button type="button" class="btn sec sm" id="addVoce" style="margin-top:8px">+ aggiungi piano</button>
      <template id="tplVoce">${riga({ pianoId: '', classi: '', sede: '' })}</template>`;
  }
  function bindVoci(onChange) {
    const cont = $('#voci');
    $('#addVoce').onclick = () => { cont.insertAdjacentHTML('beforeend', $('#tplVoce').innerHTML); $('.riga-voce:last-child select', cont).focus(); };
    cont.addEventListener('click', e => { if (e.target.closest('[data-rmvoce]')) { e.target.closest('.riga-voce').remove(); onChange && onChange(); } });
    if (onChange) cont.addEventListener('change', onChange);
  }
  function readVoci() { return $$('#voci .riga-voce').map(r => ({ pianoId: $('[name=piano]', r).value, classi: $('[name=classi]', r).value, sede: $('[name=sede]', r).value })).filter(v => v.pianoId && Core.num(v.classi) > 0); }

  function openNuovoOrdine() {
    if (!Core.live(S.piani).length) { toast('Prima importa o crea almeno un piano di lavoro'); return; }
    openSheet(`<h3>Nuovo ordine</h3><form id="fOrd">
      <div class="grid2"><label class="f">Settimana del (lunedì)<input type="date" name="settimana" value="${Core.lunediProssimo()}"></label>
      <label class="f">Nome (facoltativo)<input name="nome" placeholder="es. Esercitazioni 3–7 novembre"></label></div>
      <div class="f">Piani della settimana: numero di classi e sede</div>
      ${vociEditorHtml([{ pianoId: '', classi: '', sede: '' }])}
      ${S.impostazioni.sedi.length ? '' : '<p class="muted">Suggerimento: aggiungi le sedi in Impostazioni per dividere il fabbisogno per sede.</p>'}
      <div class="actions"><button class="btn" type="submit">Calcola ordine</button></div></form>`, true);
    bindVoci();
    $('#fOrd').onsubmit = e => {
      e.preventDefault();
      const voci = readVoci(); if (!voci.length) { toast('Aggiungi almeno un piano con il numero di classi'); return; }
      const d = Object.fromEntries(new FormData(e.target));
      const o = Core.addOrdine(S, { nome: d.nome.trim(), settimana: Core.lunediDi(d.settimana || Core.lunediProssimo()), voci });
      ui.od = { forn: '', cat: '', sede: '' };
      save({ silent: true }); openOrdine(o.id);
    };
  }

  /** Righe visibili con i filtri del dettaglio ordine; con una sede scelta il fabbisogno è quello della sede. */
  function righeFiltrate(o) {
    const f = ui.od;
    return o.righe.filter(r => (!f.forn || (r.fornitore || '—') === f.forn) && (!f.cat || r.categoria === f.cat) && (!f.sede || ((r.perSede || {})[f.sede === '—' ? '' : f.sede] || 0) > 0));
  }

  function openOrdine(id) {
    const o = Core.byId(S.ordini, id);
    const chiuso = o.stato === 'ricevuto';
    if (!chiuso) { const prima = JSON.stringify(o.righe); const nuove = Core.righeOrdine(S, o.voci, o.righe); if (JSON.stringify(nuove) !== prima) { o.righe = nuove; o.u = new Date().toISOString(); save({ silent: true }); } }
    const sedi = Core.sediOrdine(S, o);
    const fornitori = [...new Set(o.righe.map(r => r.fornitore || '—'))];
    const categorie = [...new Set(o.righe.map(r => r.categoria).filter(Boolean))];
    const f = ui.od;
    if (f.forn && !fornitori.includes(f.forn)) f.forn = '';
    if (f.cat && !categorie.includes(f.cat)) f.cat = '';
    const sedeKey = f.sede === '—' ? '' : f.sede;
    const qbList = Core.qbOrdine(S, o);
    const sc = S.impostazioni.sedeCentrale;
    const righeHtml = () => {
      const righe = righeFiltrate(o);
      if (!righe.length) return `<tr><td colspan="4" class="empty">Nessun prodotto con questi filtri.</td></tr>`;
      let last = null, h = '';
      for (const r of righe) {
        if ((r.fornitore || '') !== last) { last = r.fornitore || ''; h += `<tr class="grp"><th colspan="4">${esc(last || 'Senza fornitore')}</th></tr>`; }
        const art = Core.byId(S.articoli, r.articoloId);
        const giac = art ? art.giacenza : r.giacenza;
        const ps = Object.entries(r.perSede || {}).filter(([, q]) => q > 0);
        const perSede = ps.length > 1 || (ps.length === 1 && ps[0][0]) ? `<div class="persede">${ps.map(([s, q]) => `<span>${s && s === sc ? '<b>' + esc(s) + '</b> (magazzino)' : esc(s || 'sede non indicata')}: ${fq(q, r.unita)}</span>`).join('')}</div>` : '';
        const tip = r.dettaglio.map(d => `${d.nome} × ${d.classi}${d.sede ? ' (' + d.sede + ')' : ''}: ${fq(d.qta, r.unita)}`).join('\n');
        const fabb = f.sede ? (r.perSede || {})[sedeKey] || 0 : r.fabbisogno;
        h += `<tr><td title="${esc(tip)}"><div class="nome">${esc(r.nome)}${r.extra ? ' <span class="tag">extra</span>' : ''}${r.errori.length ? ` <span class="tag warn" title="${esc(r.errori.join('\n'))}">conversione mancante</span>` : ''}</div>${f.sede ? '' : perSede}</td>
          <td class="n" data-l="Fabbisogno${f.sede ? ' ' + esc(f.sede === '—' ? '' : f.sede) : ''}">${fq(fabb, r.unita)}</td>
          <td class="n ${giac > 0 ? '' : 'muted'}" data-l="In magazzino">${fq(giac, r.unita)}</td>
          <td class="n" data-l="${chiuso ? 'Ricevuto' : 'Da ordinare'}">${chiuso ? `<b>${fq(r.ricevuto ?? r.daOrdinare, r.unita)}</b>` : `<span class="qin"><input class="q ${r.manuale ? 'man' : ''} ${r.daOrdinare > 0 ? '' : 'zero'}" data-q="${r.articoloId}" inputmode="decimal" value="${String(r.daOrdinare).replace('.', ',')}" aria-label="Da ordinare"><span class="muted">${ul(r.unita)}</span></span>`}</td></tr>`;
      }
      return h;
    };
    const titolo = o.nome || 'Ordine';
    openSheet(`<h3>${esc(titolo)} <span class="muted">· settimana del ${Core.fmtData(o.settimana)}</span></h3>
      <div class="muted">Stato: <b>${o.stato}</b>${o.dataRicezione ? ' il ' + Core.fmtData(o.dataRicezione) : ''}</div>
      ${chiuso ? `<div class="muted" style="margin-top:6px">${o.voci.map(v => { const p = Core.byId(S.piani, v.pianoId) || S.piani.find(x => x.id === v.pianoId); return p ? `${esc(p.nome)} × ${v.classi}${v.sede ? ' (' + esc(v.sede) + ')' : ''}` : ''; }).filter(Boolean).join(' · ')}</div>`
        : `<details class="voci" ${o.voci.length ? '' : 'open'}><summary>Piani della settimana (${o.voci.length}) — tocca per modificare</summary><form id="fVoci">${vociEditorHtml(o.voci)}</form></details>`}
      <div class="filters" style="margin-top:12px">
        <select id="odForn" class="${f.forn ? 'on' : ''}">${opts(fornitori, f.forn, 'Tutti i fornitori').replace('>—<', '>Senza fornitore<')}</select>
        <select id="odCat" class="${f.cat ? 'on' : ''}">${opts(categorie, f.cat, 'Tutte le categorie')}</select>
        ${sedi.length > 1 || sedi[0] ? `<select id="odSede" class="${f.sede ? 'on' : ''}">${opts(sedi.map(s => s || '—'), f.sede, 'Tutte le sedi').replace('>—<', '>Sede non indicata<')}</select>` : ''}
      </div>
      ${sc ? '' : S.impostazioni.sedi.length && (sedi.length > 1 || sedi[0]) ? `<div class="avviso forte">Non hai indicato quale sede è il magazzino centrale (Impostazioni → Sedi): per ora la giacenza viene scalata dal fabbisogno di tutte le sedi.</div>` : ''}
      <p class="muted legenda"><b>Fabbisogno</b> = piani × classi${f.sede ? ` (solo ${esc(f.sede === '—' ? 'sede non indicata' : f.sede)})` : ''} · <b>In magazzino</b> = giacenza del magazzino centrale · <b>Da ordinare</b> = ${sc ? `fabbisogno delle altre sedi + (fabbisogno di ${esc(sc)} − magazzino)` : 'fabbisogno − magazzino'}${chiuso ? '' : ', modificabile (in arancione se cambiata a mano)'}. Bottiglie e confezioni sono arrotondate per eccesso sede per sede.</p>
      <div class="scroll-x ordwrap"><table class="t ord"><thead><tr><th>Prodotto</th><th class="n">Fabbisogno</th><th class="n">In magazzino</th><th class="n">${chiuso ? 'Ricevuto' : 'Da ordinare'}</th></tr></thead><tbody>${righeHtml()}</tbody></table></div>
      ${qbList.length ? `<div class="qb"><b>Da controllare (q.b., non calcolati):</b> ${qbList.map(q => `<span title="${esc(q.piani.join(', '))}">${esc(q.nome)}</span>`).join(', ')}</div>` : ''}
      ${chiuso ? '' : `<div class="extra"><input id="extraArt" list="dlArt" placeholder="+ aggiungi un prodotto fuori piano…" autocomplete="off"><input id="extraQ" inputmode="decimal" placeholder="qtà"><button class="btn sec sm" id="extraAdd">Aggiungi</button></div>
      <label class="f">Note per il fornitore<textarea id="ordNote" rows="2">${esc(o.note || '')}</textarea></label>`}
      <h2>Invia o stampa</h2>
      <div class="row wrap">
        <select id="fornSel" class="grow">${fornitori.length > 1 ? '<option value="">Testo per tutti i fornitori</option>' : ''}${fornitori.map(x => `<option value="${esc(x === '—' ? '' : x)}">Solo ${esc(x === '—' ? 'senza fornitore' : x)}</option>`).join('')}</select>
        <button class="btn sec" id="copia">Copia testo</button>
        ${navigator.share ? '<button class="btn sec" id="condividi">Condividi</button>' : ''}
      </div>
      <div class="actions">
        <button class="btn sec" id="stampa">Stampa ordine</button>
        ${sedi.length > 1 || sedi[0] ? '<button class="btn sec" id="stampaSedi">Stampa per sede</button>' : ''}
        <button class="btn sec" id="csv">Scarica CSV (Excel)</button>
      </div>
      ${chiuso ? '' : `<div class="actions">
        ${o.stato === 'bozza' ? '<button class="btn" id="inviato">Segna come inviato</button>' : ''}
        <button class="btn ok" id="ricevi">Merce ricevuta → carica in dispensa</button>
        <button class="btn warn" id="delOrd">Elimina ordine</button></div>`}`, true);

    const ridisegna = () => { const y = sheet.scrollTop; openOrdine(o.id); sheet.scrollTop = y; };
    sheet.onchange = e => {
      const t = e.target;
      if (t.id === 'odForn') { f.forn = t.value; return ridisegna(); }
      if (t.id === 'odCat') { f.cat = t.value; return ridisegna(); }
      if (t.id === 'odSede') { f.sede = t.value; return ridisegna(); }
      if (chiuso) return;
      if (t.dataset.q) {
        Core.setDaOrdinare(S, o.id, t.dataset.q, t.value); save({ silent: true });
        const r = o.righe.find(r => r.articoloId === t.dataset.q);
        t.classList.toggle('man', r.manuale); t.classList.toggle('zero', !(r.daOrdinare > 0));
      }
      if (t.id === 'ordNote') { Core.updateOrdine(S, o.id, { note: t.value }); save({ silent: true }); }
    };
    if (!chiuso) {
      bindVoci(() => { const voci = readVoci(); Core.updateOrdine(S, o.id, { voci }); save({ silent: true }); const y = sheet.scrollTop; openOrdine(o.id); $('details.voci', sheet).open = true; sheet.scrollTop = y; });
      $('#extraAdd').onclick = () => {
        const nome = $('#extraArt').value.trim(), q = $('#extraQ').value;
        if (!nome) { $('#extraArt').focus(); return; }
        const aggiungi = a => { if (!(Core.num(q) > 0)) { toast('Scrivi la quantità'); $('#extraQ').focus(); return; } Core.addRigaExtra(S, o.id, a.id, q); save({ silent: true }); ridisegna(); };
        const a = artDaNome(nome);
        if (a) aggiungi(a);
        else if (confirm(`"${nome}" non è in dispensa. Vuoi aggiungerlo come nuovo prodotto?`)) {
          const art = Core.addArticolo(S, { nome, unita: Core.unitaMagazzino('', nome) });
          save({ silent: true }); aggiungi(art);
          toast(`"${nome}" aggiunto alla dispensa: completa la scheda (fornitore, unità) quando puoi`);
        }
      };
      if ($('#inviato')) $('#inviato').onclick = () => { Core.updateOrdine(S, o.id, { stato: 'inviato' }); save({ silent: true }); openOrdine(o.id); toast('Ordine segnato come inviato'); };
      $('#ricevi').onclick = () => openRicezione(o.id);
      $('#delOrd').onclick = () => { if (!confirm('Eliminare questo ordine?')) return; Core.deleteOrdine(S, o.id); save(); closeSheet(); toast('Ordine eliminato'); };
    }
    const fornScelto = () => { const s = $('#fornSel'); return s && (s.value !== '' || fornitori.length === 1) ? s.value : null; };
    const testo = () => Core.testoOrdine(S, o.id, fornScelto());
    $('#copia').onclick = async () => { try { await navigator.clipboard.writeText(testo()); toast('Testo copiato: incollalo in una mail o su WhatsApp'); } catch (e) { prompt('Copia il testo:', testo()); } };
    if ($('#condividi')) $('#condividi').onclick = () => navigator.share({ title: 'Ordine', text: testo() }).catch(() => {});
    $('#csv').onclick = () => download(`ordine-${o.settimana}.csv`, '﻿' + Core.csvOrdine(S, o.id), 'text/csv');
    $('#stampa').onclick = () => stampaOrdine(o);
    if ($('#stampaSedi')) $('#stampaSedi').onclick = () => stampaSedi(o);
  }

  function openRicezione(id) {
    const o = Core.byId(S.ordini, id);
    const righe = o.righe.filter(r => r.daOrdinare > 0);
    const sc = S.impostazioni.sedeCentrale;
    openSheet(`<h3>Merce ricevuta</h3><p class="muted">Indica quanto è arrivato <b>al magazzino centrale${sc ? ' (' + esc(sc) + ')' : ''}</b>: verrà caricato in dispensa e l'ordine sarà chiuso.${sc ? ' La merce delle altre sedi non entra in dispensa: la proposta è già al netto della loro parte.' : ''}</p>
      <table class="t"><tr><th>Prodotto</th><th class="n">In dispensa</th></tr>
      ${righe.map(r => { const q = Core.quotaMagazzino(r); return `<tr><td>${esc(r.nome)}<div class="muted">ordinato ${fq(r.daOrdinare, r.unita)}${r.altre > 0 ? ` · di cui per le altre sedi ${fq(r.altre, r.unita)}` : ''}</div></td><td class="n"><span class="qin"><input class="q ${q > 0 ? '' : 'zero'}" data-r="${r.articoloId}" inputmode="decimal" value="${String(q).replace('.', ',')}"><span class="muted">${ul(r.unita)}</span></span></td></tr>`; }).join('')}</table>
      <div class="actions"><button class="btn ok" id="confRic">Conferma e carica</button><button class="btn sec" id="back">Indietro</button></div>`, true);
    $('#back').onclick = () => openOrdine(id);
    $('#confRic').onclick = () => {
      const q = {}; $$('[data-r]', sheet).forEach(i => q[i.dataset.r] = Core.num(i.value));
      for (const r of o.righe) if (!(r.articoloId in q)) q[r.articoloId] = 0;
      Core.riceviOrdine(S, o.id, q); save(); closeSheet(); toast('Merce caricata in dispensa');
    };
  }

  const STILE_STAMPA = `body{font:13px/1.35 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;padding:18px;color:#111}h1{font-size:18px;margin:0 0 4px}h2{font-size:15px;margin:18px 0 6px;padding:5px 8px;background:#e8eef0;border-radius:4px}
    table{border-collapse:collapse;width:100%}td,th{border-bottom:1px solid #ccc;padding:5px 6px;text-align:left}th{font-size:11px;text-transform:uppercase;color:#555}.n{text-align:right;white-space:nowrap}.b{font-weight:700}.sub{color:#555;font-size:12px}
    .piani{color:#333;font-size:12px;margin:6px 0 10px}@media print{h2{break-after:avoid}tr{break-inside:avoid}.pag{break-before:page}}`;
  function finestraStampa(titolo, corpo) {
    const w = window.open('', '_blank');
    if (!w) { toast('Il browser ha bloccato la finestra di stampa: consenti i popup per questa app'); return; }
    w.document.write(`<!doctype html><html lang="it"><head><meta charset="utf-8"><title>${esc(titolo)}</title><style>${STILE_STAMPA}</style></head><body>${corpo}<script>setTimeout(()=>print(),300)<\/script></body></html>`);
    w.document.close();
  }
  const pianiOrdine = o => o.voci.map(v => { const p = Core.byId(S.piani, v.pianoId) || S.piani.find(x => x.id === v.pianoId); return p ? `${esc(p.nome)}${p.classe ? ' [' + esc(p.classe) + ']' : ''} × ${v.classi}${v.sede ? ' – ' + esc(v.sede) : ''}` : ''; }).filter(Boolean).join('<br>');
  function stampaOrdine(o) {
    const rows = righeFiltrate(o).filter(r => r.daOrdinare > 0 || r.fabbisogno > 0);
    const per = new Map(); for (const r of rows) { const k = r.fornitore || 'Senza fornitore'; if (!per.has(k)) per.set(k, []); per.get(k).push(r); }
    let corpo = `<h1>Ordine ${esc(o.nome || '')} – settimana del ${Core.fmtData(o.settimana)}</h1><div class="sub">Stampato il ${new Date().toLocaleDateString('it-IT')}${ui.od.forn || ui.od.cat ? ' · filtri: ' + esc([ui.od.forn, ui.od.cat].filter(Boolean).join(', ')) : ''}</div><div class="piani">${pianiOrdine(o)}</div>`;
    for (const [forn, rr] of per) corpo += `<h2>${esc(forn)}</h2><table><tr><th>Prodotto</th><th class="n">Fabbisogno</th><th class="n">In magazzino</th><th class="n">Da ordinare</th><th>✓</th></tr>${rr.map(r => {
      const art = Core.byId(S.articoli, r.articoloId);
      return `<tr><td>${esc(r.nome)}</td><td class="n">${fq(r.fabbisogno, r.unita)}</td><td class="n">${fq(art ? art.giacenza : r.giacenza, r.unita)}</td><td class="n b">${r.daOrdinare > 0 ? fq(r.daOrdinare, r.unita) : '—'}</td><td>☐</td></tr>`;
    }).join('')}</table>`;
    const qb = Core.qbOrdine(S, o);
    if (qb.length) corpo += `<p><b>Da controllare (q.b.):</b> ${qb.map(q => esc(q.nome)).join(', ')}</p>`;
    if (o.note) corpo += `<p><b>Note:</b> ${esc(o.note)}</p>`;
    finestraStampa('Ordine ' + Core.fmtData(o.settimana), corpo);
  }
  function stampaSedi(o) {
    const sedi = Core.sediOrdine(S, o);
    let corpo = '';
    sedi.forEach((s, i) => {
      const rows = o.righe.filter(r => ((r.perSede || {})[s] || 0) > 0);
      const per = new Map(); for (const r of rows) { const k = r.fornitore || 'Senza fornitore'; if (!per.has(k)) per.set(k, []); per.get(k).push(r); }
      const piani = o.voci.filter(v => (v.sede || '') === s).map(v => { const p = Core.byId(S.piani, v.pianoId); return p ? `${esc(p.nome)} × ${v.classi}` : ''; }).filter(Boolean).join('<br>');
      corpo += `<div class="${i ? 'pag' : ''}"><h1>Sede: ${esc(s || 'non indicata')}</h1><div class="sub">Settimana del ${Core.fmtData(o.settimana)}</div><div class="piani">${piani}</div>`;
      for (const [forn, rr] of per) corpo += `<h2>${esc(forn)}</h2><table><tr><th>Prodotto</th><th class="n">Quantità</th><th>✓</th></tr>${rr.map(r => `<tr><td>${esc(r.nome)}</td><td class="n b">${fq(r.perSede[s], r.unita)}</td><td>☐</td></tr>`).join('')}</table>`;
      corpo += '</div>';
    });
    finestraStampa('Distribuzione per sede ' + Core.fmtData(o.settimana), corpo);
  }

  // ---------- Vista: Altro ----------
  function listaEditabile(lista, titolo, aiuto, ph) {
    const items = S.impostazioni[lista];
    return `<h2>${titolo}</h2><div class="card"><div class="muted">${aiuto}</div><div class="chips wrap" style="margin-top:8px">${items.map(c => `<span class="chip">${esc(c)} <button class="x" data-del="${lista}" data-v="${esc(c)}" aria-label="Rimuovi ${esc(c)}">✕</button></span>`).join('') || '<span class="muted">Nessuna voce.</span>'}</div>
      <form class="row" data-add="${lista}" style="margin-top:8px"><input class="grow" name="v" placeholder="${ph}"><button class="btn sm">Aggiungi</button></form></div>`;
  }
  function viewAltro() {
    const cfg = Sync.config(), st = statoSync();
    return `<h2>Sincronizzazione</h2><div class="card">
      ${Sync.loggedIn() ? `<div class="row"><span class="dot ${st.cls}"></span><div class="grow"><div class="title">${esc(st.txt)}</div><div class="muted">${esc(st.tip)}</div></div></div>
        <div class="muted" style="margin-top:8px">Repo privato <code>${esc(cfg.repo)}</code> · file <code>${esc(cfg.path)}</code>. Un backup al giorno nella cartella <code>backup/</code>.</div>
        <div class="actions"><button class="btn" data-act="sync">Sincronizza ora</button><button class="btn sec" data-act="setup">Modifica</button><button class="btn warn" data-act="logout">Scollega</button></div>`
      : `<div class="title">Non collegata</div><div class="muted">I dati sono salvati solo su questo dispositivo. Collega il repo GitHub privato per averli su PC e telefono.</div>
        <div class="actions"><button class="btn" data-act="setup">Collega GitHub</button></div>`}</div>
      <h2>Importa ed esporta</h2><div class="card">
        <div class="muted">Prodotti da <b>Excel, CSV, Word o PDF</b>: ti mostro un'anteprima con categoria, unità e fornitore da confermare. Piani di lavoro da <b>Word (.docx) o PDF</b>.</div>
        <div class="actions"><button class="btn sec" data-act="impArt">Importa prodotti</button><button class="btn sec" data-act="impPiani">Importa piani</button><button class="btn sec" data-act="expCsv">Esporta prodotti (CSV)</button></div>
        <div class="actions"><button class="btn sec" data-act="expJson">Scarica backup completo</button><button class="btn sec" data-act="impJson">Ripristina / unisci da file</button></div></div>
      ${listaEditabile('sedi', 'Sedi', 'Le sedi a cui destinare le esercitazioni: negli ordini il fabbisogno è diviso per sede.', 'Nuova sede')}
      ${S.impostazioni.sedi.length ? `<div class="card"><label class="f" style="margin:0">Sede del magazzino centrale<select data-sedecentrale>${opts(S.impostazioni.sedi, S.impostazioni.sedeCentrale, '— non impostata —')}</select></label>
        <div class="muted" style="margin-top:6px">La giacenza della dispensa è quella del magazzino centrale: copre solo il fabbisogno di questa sede. Per le altre sedi si ordina tutto il fabbisogno, e alla ricezione si carica in dispensa solo la parte della sede centrale.</div></div>` : ''}
      ${listaEditabile('fornitori', 'Fornitori', 'Usati per filtrare la dispensa e per dividere gli ordini.', 'Nuovo fornitore')}
      ${listaEditabile('categorie', 'Categorie', 'Le categorie dei prodotti in dispensa.', 'Nuova categoria')}
      <h2>Movimenti recenti</h2><div class="card">${S.movimenti.slice(-15).reverse().map(movHtml).join('') || '<span class="muted">Nessun movimento.</span>'}</div>
      <p class="muted center">Magazzino Scuola v${APP_VERSION} · ${Core.live(S.articoli).length} prodotti · ${Core.live(S.piani).length} piani · ${S.movimenti.length} movimenti</p>`;
  }

  function openSyncSetup() {
    const c = Sync.config();
    openSheet(`<h3>Collega GitHub</h3>
      <p class="muted">I dati vengono salvati nel file <code>magazzino.json</code> di un repo GitHub <b>privato</b>. Il token resta solo su questo dispositivo: va inserito una volta sia sul PC sia sul telefono.</p>
      <form id="fG">
        <label class="f">Repo (utente/nome)<input name="repo" required autofocus value="${esc(c.repo || '')}" placeholder="utente/magazzino-dati" autocapitalize="off" autocorrect="off" spellcheck="false"></label>
        <label class="f">Token di accesso<input name="token" type="password" required value="${esc(c.token || '')}" placeholder="github_pat_…" autocapitalize="off" autocorrect="off" spellcheck="false"></label>
        <label class="f">Nome file<input name="path" value="${esc(c.path || 'magazzino.json')}"></label>
        <div class="actions"><button class="btn" type="submit">Salva e sincronizza</button><button class="btn sec" type="button" id="testG">Verifica</button></div>
      </form>`);
    const read = () => Object.fromEntries(new FormData($('#fG')));
    $('#testG').onclick = async () => { Sync.setConfig(read()); try { toast('OK: ' + await Sync.test()); } catch (e) { toast(e.message); } };
    $('#fG').onsubmit = async e => {
      e.preventDefault();
      Sync.setConfig(read()); syncErr = '';
      closeSheet(); await doSync(true);
    };
  }

  function download(name, content, type) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([content], { type })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // ---------- Eventi (delegati, registrati una sola volta) ----------
  const main = $('#main');
  main.addEventListener('input', e => {
    const t = e.target;
    if (t.id === 'search' || t.id === 'pSearch') {
      ui[t.id === 'search' ? 'search' : 'pSearch'] = t.value;
      const pos = t.selectionStart; render(); const s2 = $('#' + t.id); s2.focus(); s2.setSelectionRange(pos, pos);
    }
  });
  main.addEventListener('change', e => {
    const t = e.target;
    if (t.dataset.f) { ui[t.dataset.f] = t.value; render(); return; }
    if (t.hasAttribute('data-sedecentrale')) { S.impostazioni.sedeCentrale = t.value; S.impostazioni.u = new Date().toISOString(); save(); toast(t.value ? `Magazzino centrale: ${t.value}` : 'Sede centrale non impostata'); return; }
    if (t.dataset.of) { ui.ordFiltro = t.dataset.of; render(); }
  });
  main.addEventListener('submit', e => {
    const fm = e.target.closest('[data-add]'); if (!fm) return;
    e.preventDefault();
    const v = fm.v.value.trim();
    if (v && Core.aggiungiVoce(S, fm.dataset.add, v)) save(); else if (v) toast('È già presente');
  });
  main.addEventListener('click', e => {
    const t = e.target;
    const mov = t.closest('[data-mov]'); if (mov) { openMovimento(mov.dataset.mov); return; }
    const art = t.closest('[data-art]'); if (art) { openArticolo(art.dataset.art); return; }
    const sc = t.closest('[data-scarica]'); if (sc) { openScarica(sc.dataset.scarica); return; }
    const pi = t.closest('[data-piano]'); if (pi) { openPiano(pi.dataset.piano); return; }
    const od = t.closest('[data-ord]'); if (od) { ui.od = { forn: '', cat: '', sede: ui.ordSede || '' }; openOrdine(od.dataset.ord); return; }
    const del = t.closest('[data-del]'); if (del) {
      const lista = del.dataset.del, v = del.dataset.v;
      const usati = lista === 'fornitori' ? Core.live(S.articoli).filter(a => a.fornitore === v).length : lista === 'categorie' ? Core.live(S.articoli).filter(a => a.categoria === v).length : 0;
      if (usati && !confirm(`"${v}" è usato da ${usati} prodotti, che resteranno con questo valore. Rimuoverlo dall'elenco?`)) return;
      Core.rimuoviVoce(S, lista, v); save(); return;
    }
    const act = t.closest('[data-act]'); if (!act) return;
    switch (act.dataset.act) {
      case 'sotto': ui.soloSotto = !ui.soloSotto; render(); break;
      case 'azzera': Object.assign(ui, { search: '', cat: '', forn: '', soloSotto: false }); render(); break;
      case 'azzeraP': Object.assign(ui, { pSearch: '', pClasse: '', pMateria: '' }); render(); break;
      case 'setup': openSyncSetup(); break;
      case 'sync': doSync(true); break;
      case 'logout': if (confirm('Scollegare GitHub? I dati restano su questo dispositivo e nel repo.')) { Sync.logout(); render(); } break;
      case 'impArt': $('#fileArticoli').click(); break;
      case 'impPiani': $('#filePiani').click(); break;
      case 'expCsv': download('prodotti.csv', '﻿' + Core.esportaArticoliCSV(S), 'text/csv'); break;
      case 'expJson': download(`magazzino-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(S, null, 1), 'application/json'); break;
      case 'impJson': $('#fileJson').click(); break;
    }
  });
  $('#filePiani').addEventListener('change', e => { const fs = [...e.target.files]; e.target.value = ''; if (fs.length) importaPiani(fs); });
  $('#fileArticoli').addEventListener('change', e => { const f = e.target.files[0]; e.target.value = ''; if (f) importaArticoli(f); });
  $('#fileJson').addEventListener('change', async e => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (!confirm('Unire il contenuto del file con i dati attuali? (Per ogni elemento resta la versione più recente.)')) return;
      S = Core.merge(S, data); save(); toast('Dati uniti dal file');
    } catch (err) { toast('File non valido'); }
  });

  // ---------- Avvio ----------
  render();
  if (Sync.loggedIn() && navigator.onLine) doSync(false);
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
  window.MagApp = { get state() { return S; }, set state(v) { S = v; save(); }, render, openOrdine };
})();
