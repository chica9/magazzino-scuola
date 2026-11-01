/* leggi.js — legge i file importati e li riduce a {nomeFile, testo:[righe], tabelle:[[[celle]]]}.
 * Word (.docx) senza librerie esterne; PDF con pdf.js ed Excel con SheetJS, caricati da CDN solo quando servono. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./core.js'));
  else root.Leggi = factory(root.Core);
})(typeof self !== 'undefined' ? self : this, function (Core) {
  'use strict';

  const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';
  const SHEETJS = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';

  async function file(f) {
    const nome = f.name || 'file';
    const ext = (nome.match(/\.([a-z0-9]+)$/i) || [])[1]?.toLowerCase() || '';
    const buf = new Uint8Array(await f.arrayBuffer());
    if (ext === 'doc' || (buf[0] === 0xd0 && buf[1] === 0xcf)) throw new Error(`"${nome}" è un documento Word vecchio (.doc): aprilo in Word e salvalo come .docx (File → Salva con nome → Documento Word)`);
    if (ext === 'docx' || (buf[0] === 0x50 && buf[1] === 0x4b && ext !== 'xlsx' && ext !== 'ods')) return { nomeFile: nome, ...(await docx(buf)) };
    if (ext === 'pdf' || (buf[0] === 0x25 && buf[1] === 0x50)) return { nomeFile: nome, ...(await pdf(buf)) };
    if (ext === 'xlsx' || ext === 'xls' || ext === 'ods') return { nomeFile: nome, ...(await foglio(buf)) };
    if (ext === 'csv' || ext === 'txt') return { nomeFile: nome, testo: [], tabelle: [Core.parseCSV(new TextDecoder().decode(buf))] };
    throw new Error(`Formato di "${nome}" non supportato: usa Word (.docx), PDF, Excel o CSV`);
  }

  // ---------- ZIP (per .docx) ----------
  async function inflateRaw(u8) {
    const s = new Blob([u8]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(s).arrayBuffer());
  }
  async function unzip(buf, filtro) {
    const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    let eocd = -1;
    for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Error('File danneggiato o non è un documento Word');
    const n = dv.getUint16(eocd + 10, true);
    let p = dv.getUint32(eocd + 16, true);
    const out = {};
    for (let k = 0; k < n; k++) {
      if (dv.getUint32(p, true) !== 0x02014b50) break;
      const metodo = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true);
      const ln = dv.getUint16(p + 28, true), le = dv.getUint16(p + 30, true), lc = dv.getUint16(p + 32, true);
      const off = dv.getUint32(p + 42, true);
      const name = new TextDecoder().decode(buf.subarray(p + 46, p + 46 + ln));
      p += 46 + ln + le + lc;
      if (!filtro(name)) continue;
      const start = off + 30 + dv.getUint16(off + 26, true) + dv.getUint16(off + 28, true);
      const data = buf.subarray(start, start + csize);
      out[name] = new TextDecoder().decode(metodo === 0 ? data : await inflateRaw(data));
    }
    return out;
  }

  // ---------- Word ----------
  const ent = s => s.replace(/&(lt|gt|amp|quot|apos|#\d+|#x[0-9a-f]+);/gi, (m, e) =>
    ({ lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" }[e.toLowerCase()] ?? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : +e.slice(1))));

  /** Estrae paragrafi e tabelle da un document.xml (senza DOMParser, funziona anche in node). */
  function parseDocXml(xml) {
    const testo = [], tabelle = [];
    const stack = []; // tabelle aperte: {rows, row, cell}
    let para = null, inT = false;
    const re = /<(\/?)w:(tbl|tr|tc|p|t|tab|br|cr)\b[^>]*?(\/?)>|([^<]+)|<[^>]*>/g;
    let m;
    while ((m = re.exec(xml))) {
      const [, chiude, tag, auto, txt] = m;
      if (txt != null) { if (inT && para != null) para += ent(txt); continue; }
      if (!tag) continue;
      const tb = stack[stack.length - 1];
      if (tag === 't') { inT = !chiude && !auto; continue; }
      if ((tag === 'tab' || tag === 'br' || tag === 'cr') && para != null) { para += ' '; continue; }
      if (tag === 'p') {
        if (!chiude && !auto) para = '';
        else if (chiude) {
          const s = (para || '').replace(/\s+/g, ' ').trim();
          if (tb && tb.cell) { if (s) tb.cell.push(s); } else if (s) testo.push(s);
          para = null;
        }
        continue;
      }
      if (tag === 'tbl') {
        if (!chiude) stack.push({ rows: [], row: null, cell: null });
        else { const done = stack.pop(); const outer = stack[stack.length - 1];
          if (outer && outer.cell) outer.cell.push(...done.rows.map(r => r.filter(Boolean).join(' '))); // tabella annidata: la appiattiamo nella cella
          else tabelle.push(done.rows); }
        continue;
      }
      if (!tb) continue;
      if (tag === 'tr') { if (!chiude) { tb.row = []; } else { tb.rows.push(tb.row); tb.row = null; } continue; }
      if (tag === 'tc') { if (!chiude) tb.cell = []; else { if (tb.row) tb.row.push(tb.cell.join(' / ')); tb.cell = null; } continue; }
    }
    return { testo, tabelle };
  }
  async function docx(buf) {
    const files = await unzip(buf, n => /^word\/(document|header\d*)\.xml$/.test(n));
    if (!files['word/document.xml']) throw new Error('Documento Word non valido');
    const doc = parseDocXml(files['word/document.xml']);
    const intest = Object.keys(files).filter(n => n.includes('header')).sort().flatMap(n => parseDocXml(files[n]).testo);
    return { testo: [...intest, ...doc.testo], tabelle: doc.tabelle };
  }

  // ---------- caricamento librerie ----------
  function script(src) {
    return new Promise((ok, ko) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => ko(new Error('Per leggere questo file serve la connessione internet')); document.head.appendChild(s); });
  }

  // ---------- PDF ----------
  async function pdfLib() {
    if (typeof window === 'undefined') return require('pdfjs-dist/legacy/build/pdf.js');
    if (!window.pdfjsLib) { await script(PDFJS + 'pdf.min.js'); window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS + 'pdf.worker.min.js'; }
    return window.pdfjsLib;
  }
  /** Raggruppa i frammenti di testo del PDF in righe (stessa altezza) ordinate da sinistra a destra. */
  function righePdf(items) {
    const its = items.filter(i => i.str && i.str.trim()).map(i => ({ s: i.str, x: i.transform[4], y: i.transform[5], w: i.width || 0 }));
    its.sort((a, b) => b.y - a.y || a.x - b.x);
    const righe = [];
    for (const it of its) {
      const r = righe.find(r => Math.abs(r.y - it.y) <= 3);
      if (r) r.items.push(it); else righe.push({ y: it.y, items: [it] });
    }
    for (const r of righe) r.items.sort((a, b) => a.x - b.x);
    return righe;
  }
  const unisci = items => items.reduce((s, it, i) => { const prev = items[i - 1]; return s + (prev && it.x - (prev.x + prev.w) > 1.5 && !s.endsWith(' ') ? ' ' : '') + it.s; }, '').replace(/\s+/g, ' ').trim();

  /** Ricostruisce la tabella del PDF usando le posizioni delle intestazioni (DESCRIZIONE, U.M., QUANTITÀ, TOTALE) come colonne. */
  async function pdf(buf) {
    const lib = await pdfLib();
    const doc = await lib.getDocument({ data: buf, isEvalSupported: false }).promise;
    const testo = [], tabella = [];
    let colonne = null, finita = false;
    for (let pg = 1; pg <= doc.numPages; pg++) {
      const page = await doc.getPage(pg);
      const righe = righePdf((await page.getTextContent()).items.filter(i => i.transform[5] > 30)); // salta il piè di pagina (firme, numeri)
      let prev = null; const salti = [];
      for (const r of righe) {
        const linea = unisci(r.items);
        if (/^[●•▪◦■□\s]+$/.test(linea)) continue; // puntini degli elenchi
        const intest = /DESCRIZIONE/i.test(linea) && /U\.?\s*M|QUANTIT/i.test(linea);
        if (intest && !finita) {
          colonne = [];
          for (const it of r.items) {
            const s = it.s.trim();
            if (!s) continue;
            const last = colonne[colonne.length - 1];
            if (last && it.x - last.fine < 6) { last.nome += ' ' + s; last.fine = it.x + it.w; } else colonne.push({ nome: s, x: it.x, fine: it.x + it.w });
          }
          if (!tabella.length) {
            // titolo: le righe subito sopra l'intestazione che non sono dati di classe/sede/anno
            const titolo = [];
            for (let i = testo.length - 1; i >= 0 && titolo.length < 10; i--) { if (/CLASSE|PIANO DI LAVORO|SEDE|A\.\s*S\.|LEZ|PERIODO|^DAL/i.test(testo[i])) break; titolo.unshift(testo[i]); }
            testo.splice(testo.length - titolo.length, titolo.length);
            if (titolo.length) tabella.push([titolo.join(' / ')]);
            tabella.push(colonne.map(c => c.nome));
          }
          prev = { y: r.y, celle: null };
          continue;
        }
        if (!colonne || finita) { testo.push(linea.replace(/^[●•▪◦■]\s*/, '')); continue; }
        const celle = colonne.map(() => []);
        for (const it of r.items) {
          let ci = 0;
          for (let k = 0; k < colonne.length; k++) if (it.x >= colonne[k].x - 8) ci = k;
          celle[ci].push(it);
        }
        const gap = prev.y - r.y;
        const media = salti.length ? salti.reduce((a, b) => a + b, 0) / salti.length : null;
        if (media && gap > media * 2.5) { finita = true; testo.push(linea); continue; } // testo staccato sotto la tabella
        const ultima = prev.celle;
        // celle della stessa riga leggermente sfalsate in altezza, o descrizione che va a capo: unisco alla riga precedente
        if (ultima && gap < 10 && celle.every((c, k) => !c.length || !ultima[k].length || (k === 0 && celle.slice(1).every(x => !x.length)))) {
          celle.forEach((c, k) => { if (c.length) ultima[k] = ultima[k].concat(c); });
          tabella[tabella.length - 1] = ultima.map(unisci);
          continue;
        }
        if (prev.celle) salti.push(gap);
        tabella.push(celle.map(unisci));
        prev = { y: r.y, celle };
      }
    }
    return { testo, tabelle: tabella.length ? [tabella] : [] };
  }

  // ---------- Excel ----------
  async function foglio(buf) {
    if (typeof window !== 'undefined' && !window.XLSX) await script(SHEETJS);
    const X = typeof window !== 'undefined' ? window.XLSX : require('xlsx');
    const wb = X.read(buf, { type: 'array' });
    const tabelle = wb.SheetNames.map(n => X.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: false, defval: '' }).map(r => r.map(c => String(c ?? ''))).filter(r => r.some(c => c.trim())));
    return { testo: [], tabelle: tabelle.filter(t => t.length) };
  }

  return { file, docx, pdf, parseDocXml, righePdf };
});
