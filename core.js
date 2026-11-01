/* core.js — logica pura del Magazzino scolastico (nessun accesso al DOM).
 * Usata sia dall'app (browser) sia dai test (node test/core.test.js). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Core = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const VERSION = 2;

  // ---------- Unità di misura ----------
  // Famiglie: peso (g/kg), volume (ml/cl/dl/l), pezzi (pz, conf, bottiglie, mazzi…).
  // Peso e volume si convertono all'interno della famiglia; tra pezzi e peso/volume serve
  // la conversione dell'articolo (es. 1 limone ≈ 120 g, 1 bottiglia = 70 cl).
  const UNITS = {
    g:         { fam: 'peso',   k: 1,    label: 'g' },
    kg:        { fam: 'peso',   k: 1000, label: 'kg' },
    ml:        { fam: 'volume', k: 1,    label: 'ml' },
    cl:        { fam: 'volume', k: 10,   label: 'cl' },
    dl:        { fam: 'volume', k: 100,  label: 'dl' },
    l:         { fam: 'volume', k: 1000, label: 'l' },
    pz:        { fam: 'pezzi', label: 'pz' },
    conf:      { fam: 'pezzi', label: 'conf.' },
    bott:      { fam: 'pezzi', label: 'bott.' },
    mazzo:     { fam: 'pezzi', label: 'mazzi', one: 'mazzo' },
    testa:     { fam: 'pezzi', label: 'teste', one: 'testa' },
    bust:      { fam: 'pezzi', label: 'buste', one: 'busta' },
    barattolo: { fam: 'pezzi', label: 'barattoli', one: 'barattolo' },
    foglio:    { fam: 'pezzi', label: 'fogli', one: 'foglio' },
  };
  const UNIT_LIST = Object.keys(UNITS);
  const UNIT_ALIAS = {
    gr: 'g', grammi: 'g', grammo: 'g', kgr: 'kg', kilo: 'kg', kili: 'kg', chili: 'kg', chilo: 'kg', chilogrammi: 'kg',
    lt: 'l', lit: 'l', litri: 'l', litro: 'l', millilitri: 'ml', centilitri: 'cl', decilitri: 'dl',
    n: 'pz', nr: 'pz', num: 'pz', numero: 'pz', pezzi: 'pz', pezzo: 'pz', pc: 'pz', pz: 'pz',
    cf: 'conf', confezione: 'conf', confezioni: 'conf', pacco: 'conf', pacchi: 'conf', pacc: 'conf', pack: 'conf',
    bot: 'bott', bta: 'bott', bota: 'bott', btg: 'bott', bottiglia: 'bott', bottiglie: 'bott',
    maz: 'mazz', mazz: 'mazzo', mz: 'mazzo', mazzi: 'mazzo', mazzetto: 'mazzo', mazzetti: 'mazzo',
    test: 'testa', teste: 'testa',
    buste: 'bust', busta: 'bust', bustina: 'bust', bustine: 'bust', bus: 'bust',
    baratt: 'barattolo', barattoli: 'barattolo', bar: 'barattolo',
    fogli: 'foglio', fg: 'foglio',
  };

  /** Riconosce un'unità scritta a mano ("GR.", "Lt", "N°", "Bott."…). Ritorna la chiave, 'qb' oppure null se sconosciuta. */
  function parseUnit(u) {
    const s = String(u ?? '').toLowerCase().replace(/[.\s°º]/g, '');
    if (!s) return null;
    if (s === 'qb') return 'qb';
    let k = UNIT_ALIAS[s] || s;
    if (UNIT_ALIAS[k] && !UNITS[k]) k = UNIT_ALIAS[k];
    return UNITS[k] ? k : null;
  }
  function normUnit(u) { const k = parseUnit(u); return k && k !== 'qb' ? k : 'pz'; }
  const fam = u => UNITS[normUnit(u)].fam;

  /**
   * Converte qty da `from` a `to`. `pezzo` = {qta, unita}: quanto vale un pezzo dell'articolo
   * (es. {qta:120, unita:'g'} per un limone). Ritorna null se non convertibile.
   */
  function convert(qty, from, to, pezzo) {
    from = normUnit(from); to = normUnit(to);
    if (from === to) return qty;
    const a = UNITS[from], b = UNITS[to];
    if (a.fam === b.fam && a.fam !== 'pezzi') return qty * a.k / b.k;
    if (a.fam === 'pezzi' && b.fam === 'pezzi') return from === 'pz' || to === 'pz' ? qty : null;
    if (pezzo && num(pezzo.qta) > 0) {
      const pu = normUnit(pezzo.unita);
      if (a.fam === 'pezzi' && UNITS[pu].fam !== 'pezzi') return convert(qty * num(pezzo.qta), pu, to);
      if (b.fam === 'pezzi' && UNITS[pu].fam !== 'pezzi') { const v = convert(qty, from, pu); return v == null ? null : v / num(pezzo.qta); }
    }
    return null;
  }

  function unitLabel(u, q) { const x = UNITS[normUnit(u)]; return q === 1 && x.one ? x.one : x.label; }

  /** Formatta una quantità con l'unità, scegliendo una sotto-unità leggibile. */
  function fmtQty(qty, unit) {
    unit = normUnit(unit);
    if (qty == null || isNaN(qty)) return '—';
    let q = qty, u = unit;
    if (unit === 'kg' && Math.abs(q) < 1 && q !== 0) { q = q * 1000; u = 'g'; }
    else if (unit === 'l' && Math.abs(q) < 1 && q !== 0) { q = q * 1000; u = 'ml'; }
    else if (unit === 'g' && Math.abs(q) >= 1000) { q = q / 1000; u = 'kg'; }
    else if (unit === 'ml' && Math.abs(q) >= 1000) { q = q / 1000; u = 'l'; }
    const n = Math.round(q * 100) / 100;
    return n.toLocaleString('it-IT', { maximumFractionDigits: 2 }) + ' ' + unitLabel(u, n);
  }

  /** Quantità scritta nei piani: "1/2", "3,5", "300 ", "1 1/2". Ritorna {qta, qb, dubbia}. */
  function parseQta(v) {
    const s = String(v ?? '').trim().replace(/\s+/g, ' ');
    if (!s) return { qta: null };
    if (/^q\.?\s*b\.?$/i.test(s)) return { qta: null, qb: true };
    let m = s.match(/^(\d+) (\d+)\s*\/\s*(\d+)$/);
    if (m) return { qta: +m[1] + m[2] / m[3] };
    m = s.match(/^(\d+)\s*\/\s*(\d+)$/);
    if (m && +m[2]) return { qta: m[1] / m[2] };
    m = s.match(/^\d+(?:[.,]\d+)?$/);
    if (m) return { qta: num(s) };
    m = s.match(/^(\d+(?:[.,]\d+)?)/);
    if (m) return { qta: num(m[1]), dubbia: true };
    return { qta: null, dubbia: true };
  }

  // ---------- Testi e somiglianza ----------
  function normNome(s) {
    return String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[’'`´]/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
  }
  function bigrams(s) { const b = new Map(); s = s.replace(/ /g, ''); for (let i = 0; i < s.length - 1; i++) { const g = s.slice(i, i + 2); b.set(g, (b.get(g) || 0) + 1); } return b; }
  /** Somiglianza 0..1 tra due nomi (coefficiente di Dice sui bigrammi). */
  function somiglianza(a, b) {
    a = normNome(a); b = normNome(b);
    if (!a || !b) return 0;
    if (a === b) return 1;
    const A = bigrams(a), B = bigrams(b);
    let inter = 0, na = 0, nb = 0;
    for (const v of A.values()) na += v;
    for (const v of B.values()) nb += v;
    for (const [g, v] of A) inter += Math.min(v, B.get(g) || 0);
    return na + nb ? 2 * inter / (na + nb) : 0;
  }
  /** "OLIO EXTRAV. D'OLIVA" → "Olio extrav. d'oliva" (solo se tutto maiuscolo). */
  function capitalizza(s) {
    return String(s ?? '').replace(/\s+/g, ' ').trim().split(/\s+\/\s+/).map(p => {
      p = p.trim();
      if (p && p === p.toUpperCase() && /[A-Z]/.test(p)) p = p.toLowerCase();
      return p.charAt(0).toUpperCase() + p.slice(1);
    }).join(' / ');
  }

  // ---------- Classificazione automatica ----------
  const CATEGORIE_DEFAULT = ['Frutta e verdura', 'Carne', 'Pesce', 'Latticini e uova', 'Farine, pasta e riso', 'Dispensa secca',
    'Spezie e aromi', 'Surgelati', 'Bevande e alcolici', 'Materiale di consumo', 'Altro'];
  // il pesce ha un fornitore suo: categoria separata dalla carne
  const PESCE_RE = /pesce|tonno|salmon|acciug|alici|gamber|scampi|calamar|totan|seppi|polp[oi]\b|cozze|vongol|frutti di mare|baccal|stoccafiss|merluzz|nasell|orat[ae]|spigol|branzin|sgombr|sard[ei]|trot[ae]|cernia|dentice|ricciol|pesce spada|aragost|astice|bottarga|surimi/;
  const CAT_REGOLE = [
    ['Surgelati', /surgel|congel/],
    ['Farine, pasta e riso', /farina|semola|manitoba|polesani|\bpasta\b|spaghett|linguine|penne|rigatoni|tagliatell|\briso\b|cous|amido|maizena|fecola|\bpane\b|pangrattato|lievito/],
    ['Bevande e alcolici', /\bvin[oi]\b|marsala|brandy|cognac|armagnac|\bporto\b|liquor|amaretto|crema di (cacao|menta)|cointreau|triple sec|angostura|sciropp|succo|birra|\brum\b|whisk|vodka|\bgin\b|grappa|spumante|prosecco|acqua (minerale|frizzante|naturale)|bibit|bagna|\balcol/],
    ['Materiale di consumo', /tovagliol|carta|sottovuoto|stamp[io]|domopak|sac a poche|sacapoche|sottotorta|sotto torta|pellicol|alluminio|guant|detersiv|staccante|bicchier|piatti|posate|vaschett|sacchett|spugn|rotol/],
    ['Pesce', PESCE_RE],
    ['Carne', /carne|pollo|manzo|vitello|maiale|agnello|lonza|coppa|salsicc|pancetta|prosciutt|speck|salame|mortadell|bresaola|fesa|filetto|\bali\b|cosc[ei]|petto|\bossa\b|muscolo|macinat|fondo di vitello|tacchino|coniglio|anatra|faraona/],
    ['Latticini e uova', /latte|panna|burro|uova|uovo|tuorl|albume|formagg|grana|parmigian|pecorino|mozzarell|ricotta|edamer|emmenthal|provola|scamorza|mascarpone|yogurt|fontina|caciocavall/],
    ['Spezie e aromi', /\bpepe\b|\bsale\b|noce moscata|cannella|chiodi di garofano|anice|vanigli|zafferano|paprica|curcuma|coriandol|spezie|origano|basilico|prezzemolo|rosmarino|salvia|\btimo\b|alloro|\bmenta\b|maggiorana|finocchietto|erba cipollina|\bdado\b|peperoncino|zenzero/],
    ['Dispensa secca', /zuccher|\bolio\b|aceto|cacao|caff|decaffein|cioccolat|marmellat|confettur|miele|pelati|polpa|passata|concentrat|\bolive\b|capperi|ceci|lenticch|mandorl|nocciol|pinoli|pistacch|\bnoci\b|uvetta|sultanina|gelatina|glucosio|destrosio|dietor|dolcific|strutto|margarina|sottolio|conserv/],
    ['Frutta e verdura', /\b(carot|cipoll|sedano|patat|zucchin|melanzan|melenzan|pomodor|peperon|broccol|cavol|verza|fagiol|piselli|spinac|funghi|champignon|aglio|insalat|lattuga|rucola|finocch|carciof|asparag|cetriol|porr[oi]|scalogn|zucca|limon|aranc|\bmel[ae]\b|\bper[ae]\b|banan|fragol|kiwi|ananas|\buva\b|pesch|albicocc|frutti di bosco|lampon|ribes|mirtill|kachi|cachi|mandarin|pompelm|frutta|verdur|ortagg)/],
  ];
  /** Indovina la categoria dal nome; ritorna '' se non riconosciuta. */
  function indovinaCategoria(nome) {
    const n = normNome(nome);
    for (const [cat, re] of CAT_REGOLE) if (re.test(n)) return cat;
    return '';
  }

  // «Frutta e verdura» si mostra divisa in Frutta / Verdura: indovinato dal nome, correggibile sul prodotto (campo sotto).
  const FV = 'Frutta e verdura';
  const FRUTTA_RE = /\b(limon|lime\b|aranc|mandarin|clementin|pompelm|cedr[oi]\b|\bmel[ae]\b|\bper[ae]\b|banan|fragol|kiwi|ananas|\buva\b|pesch|albicocc|ciliegi|amaren|prugn|susin|\bfich|melone|anguria|cocomer|mango|papaya|cocco|melagran|melogran|avocado|frutti di bosco|lampon|ribes|mirtill|more\b|kachi|cachi|frutta)/;
  function sottogruppo(a) {
    if (!a || a.categoria !== FV) return '';
    return a.sotto === 'Frutta' || a.sotto === 'Verdura' ? a.sotto : FRUTTA_RE.test(normNome(a.nome)) ? 'Frutta' : 'Verdura';
  }
  /** Gruppo per le liste «per categoria»: la categoria, oppure Frutta / Verdura. */
  function gruppoCategoria(a) { return sottogruppo(a) || a.categoria || 'Altro'; }
  /** Ordina per gruppo (nell'ordine delle categorie in Impostazioni) e poi per nome. art(x) dà il prodotto da cui leggere categoria e nome. */
  function ordinaPerCategoria(state, items, art = x => x) {
    const gruppi = [];
    for (const c of state.impostazioni.categorie) if (c === FV) gruppi.push('Frutta', 'Verdura'); else gruppi.push(c);
    const idx = g => { const i = gruppi.indexOf(g); return i < 0 ? 999 : i; };
    return items.map(x => ({ x, g: gruppoCategoria(art(x) || x) }))
      .sort((a, b) => idx(a.g) - idx(b.g) || a.g.localeCompare(b.g) || (a.x.nome || '').localeCompare(b.x.nome || ''))
      .map(({ x, g }) => ({ item: x, gruppo: g }));
  }

  // Pesi/contenuti tipici: proposte di conversione (sempre modificabili).
  const PEZZI_TIPICI = [
    [/\baglio/, { qta: 50, unita: 'g' }], [/\blimon/, { qta: 120, unita: 'g' }], [/\baranc/, { qta: 200, unita: 'g' }],
    [/\bmel[ae]\b/, { qta: 180, unita: 'g' }], [/\bkiwi/, { qta: 80, unita: 'g' }], [/\bananas/, { qta: 1500, unita: 'g' }],
    [/\bcipoll/, { qta: 150, unita: 'g' }], [/\bpatat/, { qta: 150, unita: 'g' }], [/\bpomodor/, { qta: 120, unita: 'g' }],
    [/\bmelanzan|\bmelenzan/, { qta: 300, unita: 'g' }], [/\bzucchin/, { qta: 200, unita: 'g' }], [/\bpeperon/, { qta: 200, unita: 'g' }],
    [/\bcarot/, { qta: 100, unita: 'g' }], [/\bfinocch/, { qta: 300, unita: 'g' }], [/\bcetriol/, { qta: 250, unita: 'g' }],
    [/\bbroccol/, { qta: 500, unita: 'g' }], [/\bsedano/, { qta: 400, unita: 'g' }],
    [/\b(basilico|prezzemolo|rosmarino|salvia|menta|origano|maggiorana|timo|finocchietto)/, { qta: 30, unita: 'g' }],
    [/\b(brandy|cognac|armagnac|liquor|amaretto|crema di|cointreau|triple sec|rum|whisk|vodka|gin|grappa|apricot)/, { qta: 70, unita: 'cl' }],
    [/\b(vino|marsala|porto|spumante|prosecco|aceto)/, { qta: 75, unita: 'cl' }],
    [/\buov/, { qta: 60, unita: 'g' }],
  ];
  function pezzoTipico(nome) {
    const n = normNome(nome);
    for (const [re, p] of PEZZI_TIPICI) if (re.test(n)) return { ...p };
    return null;
  }
  /** Prodotti che in magazzino si gestiscono a peso anche se nei piani compaiono a pezzi (limoni, teste d'aglio…). */
  function siPesa(nome) { return /\b(aglio|limon|aranc|mel[ae]\b|kiwi|cipoll|patat|pomodor|melanzan|melenzan|zucchin|peperon|carot|finocch|cetriol|broccol|sedano)/.test(normNome(nome)); }

  /** Unità di magazzino proposta per un nuovo articolo, partendo dall'unità con cui compare in un documento. */
  function unitaMagazzino(unita, nome) {
    const u = parseUnit(unita);
    if (!u || u === 'qb') return siPesa(nome) ? 'kg' : 'pz';
    if (UNITS[u].fam === 'peso') return 'kg';
    if (UNITS[u].fam === 'volume') return 'l';
    if (siPesa(nome)) return 'kg';
    return u;
  }

  // ---------- Stato ----------
  function newId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }
  function now() { return new Date().toISOString(); }
  function today() { return new Date().toISOString().slice(0, 10); }

  const CLASSI = ['I', 'II', 'III', 'IV', 'V', 'Serale – 1° periodo', 'Serale – 2° periodo', 'Serale – 3° periodo'];

  function emptyState() {
    return {
      version: VERSION,
      articoli: [],   // {id, nome, categoria, unita, giacenza, scortaMinima, fornitore, note, pezzo:{qta,unita}|null, alias:[], u, del}
      movimenti: [],  // {id, data, articoloId, delta, tipo, nota, rifId, u}
      piani: [],      // {id, nome, descrizione, classe, materia, lezione, file, righe:[{articoloId, qta, unita, testo}], qb:[nome], u, del}
      ordini: [],     // {id, nome, settimana, data, stato, voci:[{pianoId, classi, sede}], righe:[...], note, u, del}
      impostazioni: { categorie: CATEGORIE_DEFAULT.slice(), fornitori: [], sedi: [], sedeCentrale: '', sezioni: {}, u: '1970-01-01T00:00:00.000Z' },
      conflitti: [],  // conflitti di sincronizzazione da far scegliere all'utente (vedi merge)
      updatedAt: now(),
    };
  }

  /** Porta uno stato (anche vecchio o parziale) alla forma corrente. */
  function migrate(s) {
    const e = emptyState();
    if (!s || typeof s !== 'object') return e;
    const out = Object.assign(e, s);
    for (const k of ['articoli', 'movimenti', 'piani', 'ordini', 'conflitti']) if (!Array.isArray(out[k])) out[k] = [];
    out.impostazioni = Object.assign(emptyState().impostazioni, s.impostazioni || {});
    for (const k of ['categorie', 'fornitori', 'sedi']) if (!Array.isArray(out.impostazioni[k])) out.impostazioni[k] = k === 'categorie' ? CATEGORIE_DEFAULT.slice() : [];
    if (typeof out.impostazioni.sedeCentrale !== 'string') out.impostazioni.sedeCentrale = '';
    if (!out.impostazioni.sezioni || typeof out.impostazioni.sezioni !== 'object') out.impostazioni.sezioni = {};
    for (const a of out.articoli) { if (!Array.isArray(a.alias)) a.alias = []; if (a.pezzo === undefined) a.pezzo = null; if (a.confezione === undefined) a.confezione = null; }
    // «Carne e pesce» (fino alla 2.1) diventa «Carne» e «Pesce». Senza toccare u: merge migra entrambe le parti,
    // e una copia vecchia rimasta su un dispositivo non deve passare davanti alle modifiche più recenti.
    const cats = out.impostazioni.categorie, ic = cats.indexOf('Carne e pesce');
    if (ic >= 0) cats.splice(ic, 1, ...['Carne', 'Pesce'].filter(c => !cats.includes(c)));
    for (const a of out.articoli) if (a.categoria === 'Carne e pesce') a.categoria = PESCE_RE.test(normNome(a.nome)) ? 'Pesce' : 'Carne';
    for (const p of out.piani) { if (!Array.isArray(p.qb)) p.qb = []; for (const k of ['classe', 'materia', 'lezione', 'file']) if (p[k] == null) p[k] = ''; }
    for (const o of out.ordini) for (const v of o.voci || []) if (v.sede == null) v.sede = '';
    out.version = VERSION;
    return out;
  }

  const byId = (arr, id) => arr.find(x => x.id === id && !x.del);
  const live = arr => arr.filter(x => !x.del);
  // nome del dispositivo che fa le modifiche (es. «Tablet Android»): serve a spiegare i conflitti
  let DISPOSITIVO = '';
  function setDispositivo(nome) { DISPOSITIVO = String(nome || ''); }
  function touch(obj) {
    const n = now(); // se un altro dispositivo ha l'orologio avanti, la modifica nuova deve comunque risultare più recente
    obj.u = obj.u && obj.u >= n ? new Date(Date.parse(obj.u) + 1).toISOString() : n;
    if (DISPOSITIVO) obj.d = DISPOSITIVO;
    return obj;
  }
  function touchImpostazioni(state) { state.impostazioni.u = now(); if (DISPOSITIVO) state.impostazioni.d = DISPOSITIVO; state.updatedAt = now(); }

  function aggiungiVoce(state, lista, valore) {
    valore = String(valore ?? '').trim();
    const arr = state.impostazioni[lista];
    if (!valore || arr.some(x => normNome(x) === normNome(valore))) return false;
    arr.push(valore); touchImpostazioni(state);
    return true;
  }
  function rimuoviVoce(state, lista, valore) {
    state.impostazioni[lista] = state.impostazioni[lista].filter(x => x !== valore);
    touchImpostazioni(state);
  }
  /** Nome canonico di un fornitore già noto ("ROSSI SRL" → "Rossi Srl"), oppure null. */
  function trovaFornitore(state, nome) {
    const n = normNome(nome).replace(/ /g, '');
    if (!n) return null;
    for (const f of state.impostazioni.fornitori) {
      const fn = normNome(f).replace(/ /g, '');
      if (fn === n || somiglianza(fn, n) >= 0.85) return f;
    }
    return null;
  }

  // ---------- Articoli ----------
  function addArticolo(state, a) {
    const art = touch({
      id: a.id || newId(), nome: capitalizzaSeVuoto(a.nome), categoria: a.categoria || indovinaCategoria(a.nome) || 'Altro',
      unita: normUnit(a.unita), giacenza: num(a.giacenza), scortaMinima: num(a.scortaMinima),
      fornitore: a.fornitore || '', note: a.note || '', sotto: a.sotto || '', pezzo: pulisciPezzo(a.pezzo), confezione: pulisciPezzo(a.confezione), alias: (a.alias || []).map(normNome).filter(Boolean),
    });
    if (!art.nome) throw new Error('Nome articolo obbligatorio');
    state.articoli.push(art);
    if (art.categoria && !state.impostazioni.categorie.includes(art.categoria)) aggiungiVoce(state, 'categorie', art.categoria);
    if (art.fornitore) aggiungiVoce(state, 'fornitori', art.fornitore);
    state.updatedAt = now();
    return art;
  }
  function capitalizzaSeVuoto(n) { return String(n ?? '').replace(/\s+/g, ' ').trim(); }
  function pulisciPezzo(p) { return p && num(p.qta) > 0 && parseUnit(p.unita) ? { qta: num(p.qta), unita: normUnit(p.unita) } : null; }
  function updateArticolo(state, id, patch) {
    const art = byId(state.articoli, id);
    if (!art) throw new Error('Articolo non trovato');
    if (patch.unita) patch.unita = normUnit(patch.unita);
    if ('giacenza' in patch) patch.giacenza = num(patch.giacenza);
    if ('scortaMinima' in patch) patch.scortaMinima = num(patch.scortaMinima);
    if ('pezzo' in patch) patch.pezzo = pulisciPezzo(patch.pezzo);
    if ('confezione' in patch) patch.confezione = pulisciPezzo(patch.confezione);
    if ('nome' in patch) patch.nome = capitalizzaSeVuoto(patch.nome);
    Object.assign(art, patch); touch(art); state.updatedAt = now();
    if (art.fornitore) aggiungiVoce(state, 'fornitori', art.fornitore);
    return art;
  }
  function deleteArticolo(state, id) {
    const art = byId(state.articoli, id);
    if (!art) return;
    art.del = true; touch(art); state.updatedAt = now();
  }
  function aggiungiAlias(state, id, testo) {
    const art = byId(state.articoli, id), n = normNome(testo);
    if (!art || !n || n === normNome(art.nome) || art.alias.includes(n)) return;
    art.alias.push(n); touch(art); state.updatedAt = now();
  }
  function num(v) { const n = parseFloat(String(v ?? '').replace(',', '.')); return isNaN(n) ? 0 : n; }

  /**
   * Cerca l'articolo corrispondente a un testo (nome scritto in un piano o in un file).
   * Ritorna {art, score, come:'nome'|'alias'|'simile'} oppure {art:null, simili:[{art, score}]}.
   */
  function trovaArticolo(state, testo) {
    const n = normNome(testo);
    const arts = live(state.articoli);
    if (!n) return { art: null, simili: [] };
    let a = arts.find(x => normNome(x.nome) === n);
    if (a) return { art: a, score: 1, come: 'nome' };
    a = arts.find(x => x.alias && x.alias.includes(n));
    if (a) return { art: a, score: 1, come: 'alias' };
    // abbinamento automatico solo per i refusi ("Sala fino" → "Sale fino"), non per le varianti ("Marsala semisecco" ≠ "Marsala secco")
    a = arts.find(x => [x.nome, ...(x.alias || [])].some(al => refuso(normNome(al), n)));
    if (a) return { art: a, score: 0.9, come: 'simile', simili: [] };
    const sc = arts.map(x => ({ art: x, score: Math.max(somiglianza(x.nome, n), ...(x.alias || []).map(al => somiglianza(al, n))) }))
      .filter(x => x.score >= 0.55).sort((p, q) => q.score - p.score);
    return { art: null, simili: sc.slice(0, 4) };
  }
  /** Stesse parole, al più una lettera diversa in una sola parola lunga almeno 4 lettere. */
  function refuso(a, b) {
    const A = a.split(' '), B = b.split(' ');
    if (A.length !== B.length) return false;
    let diff = 0;
    for (let i = 0; i < A.length; i++) {
      if (A[i] === B[i]) continue;
      if (A[i].length < 4 || B[i].length < 4 || distanza(A[i], B[i]) > 1) return false;
      diff++;
    }
    return diff === 1;
  }
  function distanza(a, b) {
    const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
    for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[a.length][b.length];
  }

  /** Registra un movimento e aggiorna la giacenza. delta è nell'unità dell'articolo. */
  function movimento(state, articoloId, delta, tipo, nota, rifId) {
    const art = byId(state.articoli, articoloId);
    if (!art) throw new Error('Articolo non trovato');
    delta = num(delta);
    if (tipo === 'rettifica') { // delta = nuova giacenza assoluta
      const diff = round3(delta - art.giacenza);
      art.giacenza = delta;
      delta = diff;
    } else {
      art.giacenza = round3(art.giacenza + delta);
    }
    touch(art);
    const m = touch({ id: newId(), data: now(), articoloId, delta, tipo, nota: nota || '', rifId: rifId || null });
    state.movimenti.push(m);
    state.updatedAt = now();
    return m;
  }

  function sottoScorta(state) {
    return live(state.articoli).filter(a => a.scortaMinima > 0 && a.giacenza < a.scortaMinima);
  }

  // ---------- Piani di lavoro ----------
  function addPiano(state, p) {
    const piano = touch({ id: p.id || newId(), nome: (p.nome || '').trim(), descrizione: p.descrizione || '',
      classe: p.classe || '', materia: p.materia || '', lezione: p.lezione || '', file: p.file || '',
      righe: (p.righe || []).map(cleanRiga).filter(r => r.articoloId && r.qta > 0), qb: pulisciQb(p.qb) });
    if (!piano.nome) throw new Error('Nome piano obbligatorio');
    state.piani.push(piano); state.updatedAt = now();
    return piano;
  }
  function updatePiano(state, id, patch) {
    const piano = byId(state.piani, id);
    if (!piano) throw new Error('Piano non trovato');
    if (patch.righe) patch.righe = patch.righe.map(cleanRiga).filter(r => r.articoloId && r.qta > 0);
    if (patch.qb) patch.qb = pulisciQb(patch.qb);
    Object.assign(piano, patch); touch(piano); state.updatedAt = now();
    return piano;
  }
  function deletePiano(state, id) {
    const p = byId(state.piani, id); if (!p) return;
    p.del = true; touch(p); state.updatedAt = now();
  }
  function cleanRiga(r) { const o = { articoloId: r.articoloId, qta: num(r.qta), unita: normUnit(r.unita) }; if (r.testo) o.testo = String(r.testo); return o; }
  function pulisciQb(qb) { return [...new Set((qb || []).map(x => String(x).trim()).filter(Boolean))]; }

  const isPezzi = art => fam(art.unita) === 'pezzi';
  const ceilPezzi = q => Math.ceil(q - 1e-9) || 0; // || 0: niente "-0"

  /**
   * Fabbisogno per articolo dato un elenco di voci {pianoId, classi, sede}.
   * Per gli articoli a pezzi (bottiglie, confezioni…) arrotonda per eccesso sede per sede:
   * una bottiglia non si divide tra due sedi.
   * Ritorna Map articoloId → { qta, perSede:{sede: qta}, dettaglio:[{pianoId, nome, classi, sede, qta}], errori:[] }
   */
  function fabbisogno(state, voci) {
    const res = new Map();
    for (const v of voci) {
      const piano = byId(state.piani, v.pianoId);
      const classi = num(v.classi);
      if (!piano || classi <= 0) continue;
      const sede = v.sede || '';
      for (const r of piano.righe) {
        const art = byId(state.articoli, r.articoloId);
        if (!art) continue;
        const q = convert(r.qta * classi, r.unita, art.unita, art.pezzo);
        const e = res.get(art.id) || { qta: 0, perSede: {}, dettaglio: [], errori: [] };
        if (q == null) e.errori.push(`"${piano.nome}": ${fmtQty(r.qta, r.unita)} non convertibile in ${UNITS[art.unita].label} (manca la conversione dell'articolo)`);
        else { e.perSede[sede] = (e.perSede[sede] || 0) + q; e.dettaglio.push({ pianoId: piano.id, nome: piano.nome, classi, sede, qta: q }); }
        res.set(art.id, e);
      }
    }
    for (const [id, e] of res) {
      const art = byId(state.articoli, id);
      for (const s of Object.keys(e.perSede)) e.perSede[s] = isPezzi(art) ? ceilPezzi(e.perSede[s]) : round3(e.perSede[s]);
      e.qta = round3(Object.values(e.perSede).reduce((a, b) => a + b, 0));
    }
    return res;
  }

  /** Scarica dal magazzino gli ingredienti di un piano eseguito con N classi. */
  function scaricaPiano(state, pianoId, classi, nota) {
    const fb = fabbisogno(state, [{ pianoId, classi }]);
    const piano = byId(state.piani, pianoId);
    const out = [];
    for (const [artId, e] of fb) {
      if (e.qta > 0) out.push(movimento(state, artId, -e.qta, 'scarico', nota || `Esercitazione: ${piano.nome} × ${classi}`, pianoId));
    }
    return out;
  }

  // ---------- Ordini ----------
  /** Costruisce (o ricostruisce) le righe di un ordine a partire dalle voci piano×classi×sede. */
  function righeOrdine(state, voci, prev) {
    const fb = fabbisogno(state, voci);
    const prevBy = new Map((prev || []).map(r => [r.articoloId, r]));
    const righe = [];
    for (const [artId, e] of fb) {
      const art = byId(state.articoli, artId);
      const giac = art.giacenza;
      // Tutto arriva al magazzino centrale, che poi smista alle altre sedi. La giacenza copre solo la sede centrale
      // (e le voci senza sede); il resto si ordina per intero. Le confezioni si arrotondano sede per sede:
      // ogni sede riceve confezioni intere (invio), la centrale arrotonda solo quello che manca in magazzino.
      const { centrale, perAltre } = quoteSedi(state, e.perSede);
      const invio = {};
      for (const [s, q] of Object.entries(perAltre)) invio[s] = arrotondaConfezione(art, q);
      let perMag = Math.max(0, round3(centrale - Math.max(0, giac)));
      if (isPezzi(art)) perMag = ceilPezzi(perMag);
      const altre = round3(Object.values(invio).reduce((x, y) => x + y, 0));
      const netto = round3(Object.values(perAltre).reduce((x, y) => x + y, 0) + perMag); // quanto serve davvero
      const suggerito = round3(altre + arrotondaConfezione(art, perMag));
      const p = prevBy.get(artId);
      const manuale = !!(p && p.manuale && p.daOrdinare !== suggerito);
      righe.push({
        articoloId: artId, nome: art.nome, unita: art.unita, fornitore: art.fornitore, categoria: art.categoria,
        fabbisogno: e.qta, perSede: e.perSede, centrale, altre, invio, giacenza: giac, netto, suggerito,
        daOrdinare: manuale ? p.daOrdinare : suggerito, manuale,
        dettaglio: e.dettaglio, errori: e.errori,
      });
    }
    // righe aggiunte a mano (senza piano) sopravvivono alla ricostruzione
    for (const r of prev || []) if (r.extra && !fb.has(r.articoloId)) righe.push(r);
    righe.sort((a, b) => (a.fornitore || '￿').localeCompare(b.fornitore || '￿') || a.nome.localeCompare(b.nome));
    return righe;
  }
  function round3(x) { return Math.round(x * 1000) / 1000; }
  /** Divide il fabbisogno tra sede centrale (servita dal magazzino; comprese le voci senza sede) e altre sedi.
   *  Senza sede centrale impostata tutto passa dal magazzino. */
  function quoteSedi(state, perSede) {
    const sc = state.impostazioni.sedeCentrale;
    let centrale = 0; const perAltre = {};
    for (const [s, q] of Object.entries(perSede || {})) { if (!sc || !s || s === sc) centrale += q; else perAltre[s] = round3((perAltre[s] || 0) + q); }
    return { centrale: round3(centrale), altre: round3(Object.values(perAltre).reduce((x, y) => x + y, 0)), perAltre };
  }

  /** Unità minima d'acquisto espressa nell'unità di magazzino (0 se non indicata o non convertibile). */
  function multiploAcquisto(art) {
    const c = art && art.confezione;
    if (!c) return 0;
    const m = convert(num(c.qta), c.unita, art.unita, art.pezzo);
    return m > 0 ? round3(m) : 0;
  }
  /** Arrotonda per eccesso al multiplo dell'unità minima d'acquisto. */
  function arrotondaConfezione(art, q) {
    const m = multiploAcquisto(art);
    return m && q > 0 ? round3(Math.ceil(q / m - 1e-9) * m) : q;
  }
  /** «2 × 5 kg» se la quantità è un multiplo esatto della confezione, altrimenti ''. */
  function confezioniDi(art, q) {
    const m = multiploAcquisto(art);
    if (!m || !(q > 0)) return '';
    const n = q / m;
    return Math.abs(n - Math.round(n)) < 1e-6 ? `${Math.round(n)} × ${fmtQty(art.confezione.qta, art.confezione.unita)}` : '';
  }
  /** Quanto di una riga d'ordine arriva in magazzino: tutto tranne la parte destinata alle altre sedi. */
  function quotaMagazzino(r) { return Math.max(0, round3(num(r.daOrdinare) - num(r.altre))); }
  const pulisciVoci = voci => (voci || []).map(v => ({ pianoId: v.pianoId, classi: num(v.classi), sede: v.sede || '' }));

  /** Ingredienti "q.b." dei piani dell'ordine: non si calcolano, vanno solo controllati. */
  function qbOrdine(state, ord) {
    const m = new Map();
    for (const v of ord.voci) {
      const p = byId(state.piani, v.pianoId); if (!p) continue;
      for (const q of p.qb || []) { const k = normNome(q); if (!m.has(k)) m.set(k, { nome: capitalizza(q), piani: [] }); m.get(k).piani.push(p.nome); }
    }
    return [...m.values()].sort((a, b) => a.nome.localeCompare(b.nome));
  }

  function addOrdine(state, o) {
    const ord = touch({ id: o.id || newId(), nome: o.nome || '', settimana: o.settimana || lunediProssimo(), data: today(),
      stato: 'bozza', voci: pulisciVoci(o.voci), righe: [], note: o.note || '' });
    ord.righe = righeOrdine(state, ord.voci);
    state.ordini.push(ord); state.updatedAt = now();
    return ord;
  }
  function updateOrdine(state, id, patch) {
    const ord = byId(state.ordini, id);
    if (!ord) throw new Error('Ordine non trovato');
    if (ord.stato === 'ricevuto') throw new Error('Ordine già ricevuto: non modificabile');
    if (patch.voci) { patch.voci = pulisciVoci(patch.voci); patch.righe = righeOrdine(state, patch.voci, ord.righe); }
    Object.assign(ord, patch); touch(ord); state.updatedAt = now();
    return ord;
  }
  /** Ricalcola le righe (es. dopo aver cambiato giacenze o piani), mantenendo le correzioni manuali. */
  function ricalcolaOrdine(state, id) {
    const ord = byId(state.ordini, id);
    if (!ord || ord.stato === 'ricevuto') return ord;
    ord.righe = righeOrdine(state, ord.voci, ord.righe); touch(ord); state.updatedAt = now();
    return ord;
  }
  /** Imposta la quantità da ordinare a mano per una riga. */
  function setDaOrdinare(state, ordineId, articoloId, qta) {
    const ord = byId(state.ordini, ordineId);
    const r = ord.righe.find(r => r.articoloId === articoloId);
    if (!r) throw new Error('Riga non trovata');
    r.daOrdinare = num(qta); r.manuale = r.daOrdinare !== r.suggerito;
    touch(ord); state.updatedAt = now();
  }
  /** Aggiunge all'ordine un articolo non previsto dai piani. */
  function addRigaExtra(state, ordineId, articoloId, qta) {
    const ord = byId(state.ordini, ordineId);
    const art = byId(state.articoli, articoloId);
    if (!ord || !art) throw new Error('Ordine o articolo non trovato');
    let r = ord.righe.find(r => r.articoloId === articoloId);
    if (r) { r.daOrdinare = num(qta); r.manuale = true; }
    else ord.righe.push({ articoloId, nome: art.nome, unita: art.unita, fornitore: art.fornitore, categoria: art.categoria,
      fabbisogno: 0, perSede: {}, centrale: 0, altre: 0, giacenza: art.giacenza, suggerito: 0, daOrdinare: num(qta), manuale: true, extra: true, dettaglio: [], errori: [] });
    touch(ord); state.updatedAt = now();
  }
  function deleteOrdine(state, id) {
    const o = byId(state.ordini, id); if (!o) return;
    o.del = true; touch(o); state.updatedAt = now();
  }
  /** Segna l'ordine come ricevuto e carica le quantità in magazzino (qtaRicevute opzionale: {articoloId: qta}). */
  function riceviOrdine(state, id, qtaRicevute) {
    const ord = byId(state.ordini, id);
    if (!ord) throw new Error('Ordine non trovato');
    if (ord.stato === 'ricevuto') throw new Error('Ordine già ricevuto');
    const nome = `Ordine ${ord.nome || fmtData(ord.settimana)}`;
    for (const r of ord.righe) {
      // tutto entra in dispensa al magazzino centrale, poi si scarica quello che parte per le altre sedi
      const q = qtaRicevute && articoloIn(qtaRicevute, r.articoloId) ? num(qtaRicevute[r.articoloId]) : num(r.daOrdinare);
      r.ricevuto = q; r.inviato = {};
      if (!(q > 0) || !byId(state.articoli, r.articoloId)) continue;
      movimento(state, r.articoloId, q, 'carico', nome, ord.id);
      const invio = r.invio || (r.altre > 0 ? { 'altre sedi': r.altre } : {});
      let resto = q;
      for (const [s, qs] of Object.entries(invio)) {
        const x = round3(Math.min(num(qs), resto));
        if (x > 0) { movimento(state, r.articoloId, -x, 'scarico', `${nome}: inviato a ${s}`, ord.id); r.inviato[s] = x; resto = round3(resto - x); }
      }
    }
    ord.stato = 'ricevuto'; ord.dataRicezione = today();
    touch(ord); state.updatedAt = now();
    return ord;
  }
  function articoloIn(obj, id) { return Object.prototype.hasOwnProperty.call(obj, id); }

  /** Sedi presenti in un ordine, nell'ordine delle impostazioni ('' = sede non indicata). */
  function sediOrdine(state, ord) {
    const s = new Set(ord.voci.map(v => v.sede || ''));
    const ordine = [...state.impostazioni.sedi, ''];
    return [...s].sort((a, b) => (ordine.indexOf(a) + 1 || 99) - (ordine.indexOf(b) + 1 || 99));
  }

  /** Testo dell'ordine da inviare al fornitore (o a tutti). */
  function testoOrdine(state, ordineId, fornitore) {
    const ord = byId(state.ordini, ordineId);
    const righe = ord.righe.filter(r => r.daOrdinare > 0 && (fornitore == null || (r.fornitore || '') === fornitore));
    const lines = [];
    lines.push(`ORDINE ${ord.nome ? ord.nome + ' – ' : ''}settimana del ${fmtData(ord.settimana)}`);
    if (fornitore) lines.push(`Fornitore: ${fornitore}`);
    lines.push('');
    let last = null;
    for (const r of righe) {
      if (fornitore == null && (r.fornitore || '') !== last) { last = r.fornitore || ''; lines.push(`[${last || 'Senza fornitore'}]`); }
      const cf = confezioniDi(byId(state.articoli, r.articoloId), r.daOrdinare);
      lines.push(`- ${r.nome}: ${fmtQty(r.daOrdinare, r.unita)}${cf ? ` (${cf})` : ''}`);
    }
    if (ord.note) { lines.push(''); lines.push(ord.note); }
    return lines.join('\n');
  }
  function csvOrdine(state, ordineId) {
    const ord = byId(state.ordini, ordineId);
    const sedi = sediOrdine(state, ord);
    const rows = [['Fornitore', 'Categoria', 'Articolo', 'Unità', 'Fabbisogno', ...sedi.map(s => 'Fabbisogno ' + (s || 'sede non indicata')), 'In magazzino', 'Da ordinare', 'Confezioni']];
    for (const r of ord.righe) rows.push([r.fornitore || '', r.categoria || '', r.nome, UNITS[normUnit(r.unita)].label, dec(r.fabbisogno),
      ...sedi.map(s => dec((r.perSede || {})[s] || 0)), dec(r.giacenza), dec(r.daOrdinare), confezioniDi(byId(state.articoli, r.articoloId), r.daOrdinare)]);
    return toCSV(rows);
  }
  const dec = n => String(round3(num(n))).replace('.', ',');

  // ---------- Date ----------
  function isoLocale(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
  function lunediProssimo(d) {
    d = d ? new Date(d) : new Date();
    const day = (d.getDay() + 6) % 7; // 0 = lunedì
    d.setDate(d.getDate() - day + 7);
    return isoLocale(d);
  }
  function lunediDi(d) {
    d = new Date(d + (String(d).length === 10 ? 'T12:00:00' : '')); const day = (d.getDay() + 6) % 7; d.setDate(d.getDate() - day);
    return isoLocale(d);
  }
  function fmtData(iso) {
    if (!iso) return '';
    const [y, m, d] = iso.slice(0, 10).split('-');
    return `${d}/${m}/${y}`;
  }
  /** Anno scolastico corrente, es. "2026/27". */
  function annoScolastico(d) {
    d = d ? new Date(d) : new Date();
    const y = d.getMonth() >= 8 ? d.getFullYear() : d.getFullYear() - 1;
    return `${y}/${String(y + 1).slice(2)}`;
  }

  // ---------- CSV ----------
  function toCSV(rows) {
    return rows.map(r => r.map(v => { v = String(v ?? ''); return /[";\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(';')).join('\n');
  }
  function parseCSV(text) {
    text = text.replace(/^﻿/, '');
    const sep = (text.match(/;/g) || []).length >= (text.match(/,/g) || []).length ? ';' : ',';
    const rows = []; let row = [], cell = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
      else if (c === '"') q = true;
      else if (c === sep) { row.push(cell); cell = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
      else cell += c;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    return rows.filter(r => r.some(c => c.trim()));
  }
  function esportaArticoliCSV(state) {
    const rows = [['Nome', 'Categoria', 'Unità', 'Giacenza', 'Scorta minima', 'Confezione', 'Fornitore', 'Note']];
    for (const a of live(state.articoli)) rows.push([a.nome, a.categoria, a.unita, dec(a.giacenza), dec(a.scortaMinima), a.confezione ? dec(a.confezione.qta) + ' ' + a.confezione.unita : '', a.fornitore, a.note]);
    return toCSV(rows);
  }

  // ---------- Sync / merge ----------
  /**
   * Unisce lo stato locale con quello remoto.
   * Con `base` (lo stato dell'ultima sincronizzazione riuscita di questo dispositivo) l'unione è campo per campo:
   * un campo cambiato da una parte sola prende quel valore; cambiato da entrambe in modo diverso è un conflitto:
   * si tiene per ora la versione più recente e si aggiunge a `conflitti`, perché l'utente scelga.
   * Le giacenze si sommano (sono fatte di movimenti), i nomi riconosciuti e gli elenchi di Impostazioni si uniscono.
   * Senza base (prima sincronizzazione) vince per ogni record la modifica più recente.
   */
  function merge(local, remote, base) {
    // copie: l'unione non deve modificare lo stato in uso (altrimenti un tentativo fallito lascia giacenze già corrette)
    const copia = x => JSON.parse(JSON.stringify(x));
    local = migrate(copia(local)); remote = migrate(copia(remote)); base = base ? migrate(copia(base)) : null;
    const out = emptyState(), nuovi = [];
    const locM = new Set(local.movimenti.map(m => m.id)), remM = new Set(remote.movimenti.map(m => m.id));
    for (const k of ['articoli', 'piani', 'ordini']) {
      const L = perId(local[k]), R = perId(remote[k]), B = base ? perId(base[k]) : null;
      out[k] = [];
      for (const id of new Set([...R.keys(), ...L.keys()])) {
        const l = L.get(id), r = R.get(id);
        if (!l || !r) { out[k].push(l || r); continue; }
        const b = B && B.get(id);
        if (b) { out[k].push(unisciRecord(k, l, r, b, nuovi)); continue; }
        // senza base: vince il più recente; la giacenza recupera i movimenti che il vincitore non aveva visto
        const win = (l.u || '') >= (r.u || '') ? l : r;
        if (k === 'articoli') {
          const vistiDaWin = win === l ? locM : remM;
          const mancanti = [...remote.movimenti, ...local.movimenti].filter((m, i, a) => m.articoloId === id && !vistiDaWin.has(m.id) && a.findIndex(x => x.id === m.id) === i);
          out[k].push({ ...win, giacenza: round3(num(win.giacenza) + mancanti.reduce((x, m) => x + num(m.delta), 0)) });
        } else out[k].push(win);
      }
    }
    const mm = new Map();
    for (const x of [...remote.movimenti, ...local.movimenti]) mm.set(x.id, x);
    out.movimenti = [...mm.values()].sort((a, b) => a.data.localeCompare(b.data));
    // giacenza = quella della base + tutti i movimenti che la base non aveva (da qualunque dispositivo vengano)
    if (base) {
      const BA = perId(base.articoli), baseM = new Set(base.movimenti.map(m => m.id)), delta = new Map();
      for (const m of out.movimenti) if (!baseM.has(m.id)) delta.set(m.articoloId, (delta.get(m.articoloId) || 0) + num(m.delta));
      out.articoli = out.articoli.map(a => { const b = BA.get(a.id); return b && !a.del && inEntrambi(local, remote, a.id) ? { ...a, giacenza: round3(num(b.giacenza) + (delta.get(a.id) || 0)) } : a; });
    }
    // senza base (prima sincronizzazione di un dispositivo) gli elenchi si uniscono senza togliere nulla
    out.impostazioni = unisciImpostazioni(local.impostazioni, remote.impostazioni,
      base ? base.impostazioni : { categorie: [], fornitori: [], sedi: [], sezioni: {}, sedeCentrale: '' }, nuovi);
    // conflitti: quelli già noti (da entrambe le parti, vince l'aggiornamento più recente) + i nuovi
    const cm = new Map();
    for (const c of [...remote.conflitti, ...local.conflitti, ...nuovi]) { const cur = cm.get(c.id); if (!cur || (c.u || '') > (cur.u || '')) cm.set(c.id, c); }
    out.conflitti = [...cm.values()];
    out.updatedAt = now();
    return out;
  }
  const perId = arr => new Map(arr.map(x => [x.id, x]));
  const inEntrambi = (l, r, id) => l.articoli.some(x => x.id === id) && r.articoli.some(x => x.id === id);
  /** JSON con le chiavi in ordine, per confrontare oggetti costruiti in modi diversi. */
  function stabile(v) {
    if (Array.isArray(v)) return '[' + v.map(stabile).join(',') + ']';
    if (v && typeof v === 'object') return '{' + Object.keys(v).filter(k => v[k] !== undefined).sort().map(k => JSON.stringify(k) + ':' + stabile(v[k])).join(',') + '}';
    return JSON.stringify(v ?? null);
  }
  const uguale = (a, b) => stabile(a) === stabile(b);
  const NON_DATI = new Set(['u', 'd']);
  const senza = (o, ...k) => { const c = { ...o }; for (const x of [...NON_DATI, ...k]) delete c[x]; return c; };
  /** Valore unito di un campo: 3 vie; null = conflitto. */
  function treVie(lv, rv, bv) {
    if (uguale(lv, rv)) return { v: lv };
    if (uguale(lv, bv)) return { v: rv };
    if (uguale(rv, bv)) return { v: lv };
    return null;
  }
  /** Unione a 3 vie di elenchi di testi (aggiunte e tolte da entrambe le parti). */
  function unisciElenco(l = [], r = [], b = []) {
    const tolti = new Set([...b.filter(x => !l.includes(x)), ...b.filter(x => !r.includes(x))]);
    return [...new Set([...l, ...r])].filter(x => !tolti.has(x));
  }
  function conflitto(nuovi, tipo, l, r, campo, lv, rv, scelto, extra) {
    const c = { id: [tipo, l.id, campo, stabile(lv), stabile(rv)].join('|'), tipo, recId: l.id, nome: r.nome || l.nome || '', campo,
      a: { v: lv, d: l.d || '', u: l.u || '' }, b: { v: rv, d: r.d || '', u: r.u || '' }, scelto, risolto: false, data: now(), u: now(), ...extra };
    nuovi.push(c);
    return c;
  }
  function unisciRecord(k, l, r, b, nuovi) {
    if (uguale(senza(l), senza(r))) return (l.u || '') >= (r.u || '') ? l : r;
    const recente = (l.u || '') >= (r.u || '') ? 'a' : 'b';
    // eliminato da una parte e modificato dall'altra: per sicurezza resta, e l'utente decide
    if (!!l.del !== !!r.del) {
      const [cancellato, altro] = l.del ? [l, r] : [r, l];
      if (uguale(senza(altro, 'del'), senza(b, 'del'))) return cancellato;
      conflitto(nuovi, k, l, r, 'del', !!l.del, !!r.del, l.del ? 'b' : 'a');
      return { ...altro, u: now() };
    }
    const res = {};
    for (const key of new Set([...Object.keys(b), ...Object.keys(l), ...Object.keys(r)])) {
      if (NON_DATI.has(key)) continue;
      const lv = l[key], rv = r[key], bv = b[key];
      if (k === 'articoli' && key === 'giacenza') { res.giacenza = lv; continue; } // ricalcolata dai movimenti in merge
      if (k === 'articoli' && key === 'alias') { res.alias = unisciElenco(lv, rv, bv); continue; }
      if (k === 'ordini' && key === 'righe') { res.righe = unisciRighe(l, r, b, recente, nuovi); continue; }
      const t = treVie(lv, rv, bv);
      if (t) { if (t.v !== undefined) res[key] = t.v; continue; }
      conflitto(nuovi, k, l, r, key, lv, rv, recente);
      if ((recente === 'a' ? lv : rv) !== undefined) res[key] = recente === 'a' ? lv : rv;
    }
    res.u = now(); res.d = (recente === 'a' ? l : r).d || '';
    if (!res.d) delete res.d;
    return res;
  }
  /** Righe d'ordine: si ricalcolano da sole; contano solo le quantità cambiate a mano e le righe aggiunte a mano. */
  function unisciRighe(l, r, b, recente, nuovi) {
    const base = perId((b.righe || []).map(x => ({ ...x, id: x.articoloId })));
    const altre = perId(((recente === 'a' ? r : l).righe || []).map(x => ({ ...x, id: x.articoloId })));
    const righe = ((recente === 'a' ? l : r).righe || []).map(x => ({ ...x }));
    for (const x of righe) {
      const y = altre.get(x.articoloId), z = base.get(x.articoloId);
      if (!y) continue;
      const q = rr => ({ daOrdinare: rr.daOrdinare, manuale: !!rr.manuale });
      const [rx, ry] = recente === 'a' ? [x, y] : [y, x];
      const t = treVie(q(rx), q(ry), z ? q(z) : undefined);
      if (t) Object.assign(x, t.v);
      else if (rx.manuale && ry.manuale) conflitto(nuovi, 'ordini', l, r, 'riga:' + x.articoloId, rx.daOrdinare, ry.daOrdinare, recente, { riga: x.nome });
    }
    // righe aggiunte a mano solo dall'altra parte
    for (const y of altre.values()) if (y.extra && !righe.some(x => x.articoloId === y.articoloId) && !base.has(y.articoloId)) { const c = { ...y }; delete c.id; righe.push(c); }
    return righe;
  }
  function unisciImpostazioni(l, r, b, nuovi) {
    const res = { ...((l.u || '') >= (r.u || '') ? l : r) };
    for (const k of ['categorie', 'fornitori', 'sedi']) res[k] = unisciElenco(l[k], r[k], b[k]);
    res.sezioni = { ...b.sezioni };
    for (const k of new Set([...Object.keys(l.sezioni || {}), ...Object.keys(r.sezioni || {}), ...Object.keys(b.sezioni || {})])) {
      const t = treVie((l.sezioni || {})[k], (r.sezioni || {})[k], (b.sezioni || {})[k]);
      const v = t ? t.v : ((l.u || '') >= (r.u || '') ? l.sezioni : r.sezioni)[k];
      if (v === undefined) delete res.sezioni[k]; else res.sezioni[k] = v;
    }
    const t = treVie(l.sedeCentrale, r.sedeCentrale, b.sedeCentrale);
    if (t) res.sedeCentrale = t.v;
    else conflitto(nuovi, 'impostazioni', { ...l, id: 'impostazioni' }, { ...r, id: 'impostazioni', nome: 'Impostazioni' }, 'sedeCentrale', l.sedeCentrale, r.sedeCentrale, (l.u || '') >= (r.u || '') ? 'a' : 'b');
    if (!uguale(senza(res), senza(l)) && !uguale(senza(res), senza(r))) res.u = now();
    return res;
  }
  /** Applica la scelta dell'utente per un conflitto ('a' o 'b'). */
  function risolviConflitto(state, id, scelta) {
    const c = state.conflitti.find(x => x.id === id);
    if (!c) return;
    if (scelta !== c.scelto) {
      const v = (scelta === 'a' ? c.a : c.b).v;
      if (c.tipo === 'impostazioni') { state.impostazioni[c.campo] = v; touchImpostazioni(state); }
      else {
        const rec = state[c.tipo].find(x => x.id === c.recId);
        if (rec) {
          if (c.campo === 'del') { if (v) rec.del = true; else delete rec.del; }
          else if (c.campo.startsWith('riga:')) { const rg = (rec.righe || []).find(x => x.articoloId === c.campo.slice(5)); if (rg) { rg.daOrdinare = v; rg.manuale = true; } }
          else if (v === undefined) delete rec[c.campo]; else rec[c.campo] = v;
          touch(rec);
        }
      }
    }
    c.scelto = scelta; c.risolto = true; c.u = now(); state.updatedAt = now();
  }
  const conflittiAperti = state => (state.conflitti || []).filter(c => !c.risolto);

  /** Pulizia: svuota i record cancellati da più di `giorni` e toglie i conflitti già risolti. */
  function compatta(state, giorni = 60) {
    const lim = new Date(Date.now() - giorni * 864e5).toISOString();
    // i record cancellati restano come segnaposto vuoto: tolti del tutto, un dispositivo rimasto offline li farebbe rivivere
    for (const k of ['articoli', 'piani', 'ordini']) state[k] = state[k].map(x => x.del && (x.u || '') <= lim ? { id: x.id, del: true, u: x.u } : x);
    state.conflitti = (state.conflitti || []).filter(c => !c.risolto || (c.u || '') > lim);
    return state;
  }

  // ---------- Statistiche / riepiloghi ----------
  function riepilogo(state) {
    const arts = live(state.articoli);
    return { articoli: arts.length, sottoScorta: sottoScorta(state).length, piani: live(state.piani).length,
      ordiniAperti: live(state.ordini).filter(o => o.stato !== 'ricevuto').length };
  }

  return { VERSION, UNITS, UNIT_LIST, CLASSI, CATEGORIE_DEFAULT, parseUnit, normUnit, convert, fmtQty, unitLabel, parseQta,
    normNome, somiglianza, capitalizza, indovinaCategoria, sottogruppo, gruppoCategoria, ordinaPerCategoria, pezzoTipico, siPesa, unitaMagazzino,
    newId, emptyState, migrate, byId, live, num, round3, aggiungiVoce, rimuoviVoce, trovaFornitore,
    addArticolo, updateArticolo, deleteArticolo, aggiungiAlias, trovaArticolo, movimento, sottoScorta,
    addPiano, updatePiano, deletePiano, fabbisogno, scaricaPiano,
    righeOrdine, quoteSedi, quotaMagazzino, multiploAcquisto, arrotondaConfezione, confezioniDi, qbOrdine, addOrdine, updateOrdine, ricalcolaOrdine, setDaOrdinare, addRigaExtra, deleteOrdine, riceviOrdine,
    sediOrdine, testoOrdine, csvOrdine,
    lunediProssimo, lunediDi, fmtData, annoScolastico, toCSV, parseCSV, esportaArticoliCSV, merge, compatta, riepilogo,
    setDispositivo, risolviConflitto, conflittiAperti };
});
