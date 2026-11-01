/* importa.js — interpreta i documenti importati (piani di lavoro, elenchi prodotti) e propone
 * le correzioni da controllare. Logica pura: riceve il documento già letto da leggi.js
 * ({nomeFile, testo:[righe fuori tabella], tabelle:[[[celle]]]}) e lo stato attuale. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./core.js'));
  else root.Importa = factory(root.Core);
})(typeof self !== 'undefined' ? self : this, function (Core) {
  'use strict';

  const ROMANI = { I: 'I', II: 'II', III: 'III', IV: 'IV', V: 'V' };
  const PERIODI = { PRIMO: 1, SECONDO: 2, TERZO: 3, I: 1, II: 2, III: 3 };
  const serale = n => `Serale – ${n}° periodo`;
  const t = s => String(s ?? '').replace(/\s+/g, ' ').trim();

  /** Classe dal nome del file: "IV_SALA.docx" → IV, "II_PER._SERALE" / "III_PERIODO_SALA" → periodo serale. */
  function classeDaFile(nome) {
    const b = String(nome || '').replace(/\.[a-z0-9]+$/i, '').toUpperCase();
    const m = b.match(/(?:^|[^A-Z])(III|II|IV|V|I)(?=[^A-Z]|$)/);
    if (!m) return '';
    if (/(^|[^A-Z])PER(IODO)?([^A-Z]|$)|SERALE/.test(b)) return serale(PERIODI[m[1]] || 1);
    return ROMANI[m[1]];
  }
  /** Classe scritta nel documento: "CLASSE III", "SECONDO PERIODO DIDATTICO". */
  function classeDaTesto(righe) {
    const s = righe.join('\n').toUpperCase();
    let m = s.match(/(PRIMO|SECONDO|TERZO)\s+PERIODO/);
    if (m) return serale(PERIODI[m[1]]);
    m = s.match(/CLASS[EI]\s*:?\s*(III|II|IV|V|I)\b/);
    if (m) return ROMANI[m[1]];
    m = s.match(/\b(III|II|IV|V|I)\s*(?:°|ª)?\s*PERIODO/);
    if (m) return serale(PERIODI[m[1]]);
    return '';
  }
  const MATERIE = [[/SALA\s+E\s+VENDITA|\bSALA\b/, 'Sala e vendita'], [/OPZIONE\s+DOLCIARIA|\bO\.\s*D\./, 'Opzione dolciaria'],
    [/PASTICCERIA/, 'Pasticceria'], [/ENOGASTRONOMIA|CUCINA/, 'Enogastronomia'], [/ACCOGLIENZA/, 'Accoglienza turistica']];
  function materia(righe, nomeFile) {
    const s = righe.join('\n').toUpperCase();
    for (const [re, m] of MATERIE) if (re.test(s)) return m;
    const f = String(nomeFile || '').toUpperCase().replace(/\.[A-Z0-9]+$/, '');
    if (/(^|_)SALA(_|$)/.test(f)) return 'Sala e vendita';
    if (/(^|_)O\.?_?D\.?(_|$)/.test(f)) return 'Opzione dolciaria';
    if (/(^|_)P\.(_|$)/.test(f)) return 'Pasticceria';
    return '';
  }
  function lezione(righe) {
    const s = righe.join('\n');
    let m = s.match(/Lez(?:ione)?\.?\s*(?:N\.?\s*)?(\d+(?:\s*[-–,e]\s*\d+)*)/i);
    if (m) return m[1].replace(/\s+/g, ' ').replace(/\s*-\s*/g, '-');
    m = s.match(/ESERCITAZIONE\s*N\.?\s*(\d+)/i);
    return m ? 'Esercitazione ' + m[1] : '';
  }
  function annoDocumento(righe) {
    const m = righe.join(' ').match(/A\.?\s*S\.?\s*(\d{4})\s*[/-]\s*(\d{2,4})/i);
    return m ? `${m[1]}/${m[2].slice(-2)}` : '';
  }

  const isIntestazione = row => {
    const j = row.map(c => t(c).toUpperCase()).join('|');
    return /DESCRIZIONE|PRODOTTO|ARTICOLO|INGREDIENT/.test(j) && /U\.?\s*M\.?|UNIT|QUANTIT|Q\.TA|QTA/.test(j);
  };
  const isMetadato = s => /CLASSE|PIANO DI LAVORO|SEDE DI|A\.\s*S\.|\bLEZ|PERIODO DIDATTICO|^\s*DAL\b|SALA E VENDITA\s*$|ENOGASTRONOMIA|PASTICCERIA\s*[–-]|OPZIONE DOLCIARIA/i.test(s);

  /** Trova nel documento la tabella del piano: titolo (ricette), intestazione e righe. */
  function trovaTabellaPiano(doc) {
    for (const tab of doc.tabelle || []) {
      const h = tab.findIndex(isIntestazione);
      if (h < 0) continue;
      const head = tab[h].map(c => t(c).toUpperCase());
      const col = re => head.findIndex(c => re.test(c));
      const ci = { desc: Math.max(0, col(/DESCRIZIONE|PRODOTTO|ARTICOLO|INGREDIENT/)), um: col(/U\.?\s*M\.?|UNIT/), qta: col(/QUANTIT|Q\.TA|QTA/), tot: col(/TOTALE/) };
      const titolo = tab.slice(0, h).map(r => r.map(t).filter(Boolean).join(' / ')).filter(Boolean);
      return { titolo, ci, righe: tab.slice(h + 1) };
    }
    return null;
  }

  /** Correzioni di scala tipiche: "KG 500" quasi certamente sono 500 g, "LT 500" 500 ml, "CL 180" 180 ml. */
  function propostaScala(qta, unita) {
    if (qta == null) return null;
    if (unita === 'kg' && qta >= 50) return { qta, unita: 'g' };
    if (unita === 'l' && qta >= 50) return { qta, unita: 'ml' };
    if (unita === 'cl' && qta >= 100) return { qta, unita: 'ml' };
    if (unita === 'dl' && qta >= 20) return { qta, unita: 'ml' };
    if ((unita === 'g' || unita === 'ml') && qta > 0 && qta < 1) return { qta, unita: unita === 'g' ? 'kg' : 'l' };
    return null;
  }

  /**
   * Analizza un piano di lavoro. Ritorna la proposta da mostrare all'utente:
   * { nomeFile, nome, classe, classeFile, classeTesto, conflittoClasse, materia, lezione, anno, avvisi:[],
   *   righe:[{testo, nota, qtaOrig, umOrig, qta, unita, qb, nomeArticolo, articoloId, come, simili, pezzo, flags:[{tipo,msg}]}] }
   */
  function analizzaPiano(state, doc) {
    const tab = trovaTabellaPiano(doc);
    if (!tab) throw new Error('Non trovo la tabella del piano (colonne DESCRIZIONE / U.M. / QUANTITÀ)');
    const testoTutto = [...(doc.testo || []), ...tab.titolo];
    const classeFile = classeDaFile(doc.nomeFile), classeTesto = classeDaTesto(testoTutto);
    const conflittoClasse = !!(classeFile && classeTesto && classeFile !== classeTesto);
    let titolo = tab.titolo.join(' / ').split(' / ').map(t).filter(s => s && !/^ESERCITAZIONE\s*N/i.test(s) && !isMetadato(s));
    if (!titolo.length) titolo = (doc.testo || []).map(t).filter(s => s && !isMetadato(s)).slice(-1);
    const nome = Core.capitalizza(titolo.join(' / ')) || String(doc.nomeFile || 'Piano').replace(/\.[a-z0-9]+$/i, '').replace(/[_]+/g, ' ');
    const anno = annoDocumento(testoTutto);
    const p = { nomeFile: doc.nomeFile || '', nome, classeFile, classeTesto, conflittoClasse,
      classe: conflittoClasse ? '' : (classeTesto || classeFile), materia: materia(testoTutto, doc.nomeFile), lezione: lezione(testoTutto),
      anno, avvisi: [], righe: [] };
    if (conflittoClasse) p.avvisi.push({ tipo: 'classe', msg: `Il nome del file indica la classe ${classeFile}, ma nel documento c'è scritto ${classeTesto}. Quale è giusta?` });
    if (anno && anno !== Core.annoScolastico()) p.avvisi.push({ tipo: 'anno', msg: `Il documento riporta l'anno scolastico ${anno} (quello in corso è ${Core.annoScolastico()}): forse è un file vecchio.` });

    const { ci } = tab;
    for (const row of tab.righe) {
      const testo = t(row[ci.desc]);
      const um = ci.um >= 0 ? t(row[ci.um]) : '', qs = ci.qta >= 0 ? t(row[ci.qta]) : '';
      const tot = ci.tot >= 0 ? t(row[ci.tot]) : '';
      if (!testo && !qs) continue;
      if (!testo) continue;
      const r = { testo, nota: tot && !/^\d+([.,]\d+)?$/.test(tot) ? tot : '', qtaOrig: qs, umOrig: um, flags: [] };
      const pu = Core.parseUnit(um), pq = Core.parseQta(qs);
      r.qb = pu === 'qb' || !!pq.qb;
      r.qta = pq.qta; r.unita = pu && pu !== 'qb' ? pu : '';
      if (!r.qb) {
        if (!qs) r.flags.push({ tipo: 'qta', msg: 'Quantità mancante: inseriscila tu, oppure escludi la riga' });
        else if (pq.qta == null) r.flags.push({ tipo: 'qta', msg: `Quantità non leggibile ("${qs}"): inseriscila tu` });
        else if (pq.dubbia) r.flags.push({ tipo: 'qta', msg: `Quantità scritta come "${qs}": ho letto ${String(pq.qta).replace('.', ',')}, controlla` });
        if (!pu) r.flags.push({ tipo: 'unita', msg: um ? `Unità "${um}" non riconosciuta: sceglila tu` : 'Unità mancante: sceglila tu' });
        const sc = propostaScala(r.qta, r.unita);
        if (sc) {
          r.flags.push({ tipo: 'scala', msg: `Nel file: ${qs} ${um}. Probabilmente sono ${Core.fmtQty(sc.qta, sc.unita)}: ho messo questa proposta, modificala se serve` });
          r.qta = sc.qta; r.unita = sc.unita;
        }
      }
      abbina(state, r);
      p.righe.push(r);
    }
    segnaDoppi(p.righe);
    return p;
  }

  /** Collega la riga a un articolo della dispensa (o ne propone uno nuovo) e verifica le unità. */
  function abbina(state, r) {
    const f = Core.trovaArticolo(state, r.nomeArticolo || r.testo);
    r.flags = r.flags.filter(x => x.tipo !== 'simile' && x.tipo !== 'conversione' && x.tipo !== 'nuovo');
    if (f.art) {
      r.articoloId = f.art.id; r.nomeArticolo = f.art.nome; r.come = f.come;
      if (f.come === 'simile') r.flags.push({ tipo: 'simile', msg: `Nel file c'è "${r.testo}": l'ho abbinato a "${f.art.nome}" perché si somigliano. Controlla` });
    } else {
      r.articoloId = null; r.come = 'nuovo';
      r.nomeArticolo = r.nomeArticolo || Core.capitalizza(r.testo);
      r.simili = f.simili.map(s => ({ id: s.art.id, nome: s.art.nome }));
    }
    controllaUnita(state, r);
    return r;
  }
  /** Se l'unità della riga non si converte in quella dell'articolo serve la conversione (es. 1 testa d'aglio ≈ 50 g). */
  function controllaUnita(state, r) {
    r.flags = r.flags.filter(x => x.tipo !== 'conversione');
    r.pezzo = null; r.pezzoServe = false;
    if (r.qb || !r.unita) return;
    const art = r.articoloId ? Core.byId(state.articoli, r.articoloId) : null;
    const nome = art ? art.nome : r.nomeArticolo;
    const unitaArt = art ? art.unita : Core.unitaMagazzino(r.unita, nome);
    if (Core.convert(1, r.unita, unitaArt, art && art.pezzo) != null) return;
    if (Core.convert(1, r.unita, unitaArt) != null) return;
    r.pezzoServe = true;
    const contaRiga = Core.UNITS[r.unita].fam === 'pezzi';
    const unitaPezzo = contaRiga ? r.unita : unitaArt;
    const tip = Core.pezzoTipico(nome);
    r.pezzo = { unitaPezzo, qta: tip ? tip.qta : '', unita: tip ? tip.unita : (contaRiga ? (unitaArt === 'l' ? 'ml' : 'g') : r.unita) };
    r.flags.push({ tipo: 'conversione', msg: tip ? `Serve una conversione: ho stimato 1 ${Core.unitLabel(unitaPezzo, 1)} ≈ ${Core.fmtQty(tip.qta, tip.unita)}. Correggi se serve`
      : `Serve una conversione: quanto vale 1 ${Core.unitLabel(unitaPezzo, 1)}?` });
  }
  /** Lo stesso prodotto scritto due volte: può essere un errore o mancare una specifica (es. zucchero di canna / semolato). */
  function segnaDoppi(righe) {
    for (const r of righe) r.flags = r.flags.filter(x => x.tipo !== 'doppio');
    const per = new Map();
    for (const r of righe) {
      if (r.escludi || (r.qb && !(Core.num(r.qta) > 0))) continue;
      const k = r.articoloId ? 'id:' + r.articoloId : 'n:' + Core.normNome(r.nomeArticolo || r.testo);
      if (!per.has(k)) per.set(k, []);
      per.get(k).push(r);
    }
    for (const g of per.values()) if (g.length > 1) for (const r of g)
      r.flags.push({ tipo: 'doppio', msg: `"${g[0].nomeArticolo || g[0].testo}" compare ${g.length} volte: è un errore o manca una specifica (es. "di canna" / "semolato")?` });
  }

  /**
   * Salva il piano importato: crea gli articoli nuovi, ricorda i nomi usati nel file (alias),
   * registra le conversioni e crea il piano.
   */
  function applicaPiano(state, p) {
    const righe = [], qb = [];
    for (const r of p.righe) {
      if (r.escludi) continue;
      if (r.qb && !(Core.num(r.qta) > 0)) { qb.push(r.nomeArticolo || Core.capitalizza(r.testo)); continue; }
      let art = r.articoloId ? Core.byId(state.articoli, r.articoloId) : null;
      if (!art) {
        const esistente = Core.trovaArticolo(state, r.nomeArticolo);
        art = esistente.art && esistente.come !== 'simile' ? esistente.art
          : Core.addArticolo(state, { nome: r.nomeArticolo || Core.capitalizza(r.testo), unita: r.unitaNuovo || Core.unitaMagazzino(r.unita, r.nomeArticolo), categoria: r.categoriaNuovo || '' });
      }
      Core.aggiungiAlias(state, art.id, r.testo);
      if (r.pezzoServe && r.pezzo && Core.num(r.pezzo.qta) > 0 && !art.pezzo) Core.updateArticolo(state, art.id, { pezzo: { qta: r.pezzo.qta, unita: r.pezzo.unita } });
      righe.push({ articoloId: art.id, qta: r.qta, unita: r.unita || art.unita, testo: r.testo + (r.nota ? ' (' + r.nota + ')' : '') });
    }
    return Core.addPiano(state, { nome: p.nome, classe: p.classe, materia: p.materia, lezione: p.lezione, file: p.nomeFile, righe, qb,
      descrizione: p.descrizione || '' });
  }

  // ---------- Elenchi di prodotti (Excel/CSV/Word/PDF) ----------
  const COLONNE = {
    nome: /^(nome|descrizione|prodotto|articolo|denominazione|voce)/, categoria: /^(categoria|reparto|tipolog|famiglia|gruppo)/,
    unita: /^(u\.?\s*m|unit(?!.*(minim|acquist))|misura)/, giacenza: /^(giacenz|esistenz|disponib|scorta attuale|in magazzino)/,
    scorta: /^(scorta min|minimo(?!.*acquist)|min\b(?!.*acquist)|sottoscorta)/,
    confezione: /^(conf|formato|pezzatura|multipl|lotto|unit.*(minim|acquist)|minim.*acquist|q\.?\s*t[aà] minima)/, fornitore: /^(fornitor|ditta|azienda|grossista)/, note: /^(note|osserv)/,
  };
  function intestazioneArticoli(row) {
    const h = row.map(c => t(c).toLowerCase());
    const ci = {};
    for (const [k, re] of Object.entries(COLONNE)) ci[k] = h.findIndex(c => re.test(c));
    return ci.nome >= 0 && (ci.unita >= 0 || ci.fornitore >= 0 || ci.categoria >= 0 || ci.giacenza >= 0) ? ci : null;
  }

  /**
   * Analizza un elenco di prodotti. Supporta:
   *  - tabelle con intestazione (Nome / U.M. / Fornitore / Categoria / Giacenza…), es. da Excel;
   *  - elenchi a gruppi di tre colonne (descrizione | U.M. | quantità) divisi in sezioni, come l'ordine
   *    settimanale, dove una riga con solo il nome è un fornitore ("DITTA ROSSI") o un reparto ("VERDURE").
   * Ritorna { sezioni:[{nome, fornitore}], voci:[{nome, unita, categoria, fornitore, sezione, giacenza, scorta, note, articoloId, azione}] }.
   */
  function analizzaArticoli(state, doc) {
    const voci = [], sezioni = new Map();
    const sez = nome => { if (!nome) return null; if (!sezioni.has(nome)) sezioni.set(nome, { nome, fornitore: Core.trovaFornitore(state, nome) || Core.trovaFornitore(state, (state.impostazioni.sezioni || {})[Core.normNome(nome)]) || '' }); return nome; };
    for (const tab of doc.tabelle || []) {
      const h = tab.findIndex(r => intestazioneArticoli(r));
      if (h >= 0) {
        const ci = intestazioneArticoli(tab[h]);
        const g = (r, i) => (i >= 0 ? t(r[i]) : '');
        for (const r of tab.slice(h + 1)) {
          const nome = g(r, ci.nome); if (!nome) continue;
          voci.push({ nome, umOrig: g(r, ci.unita), categoria: g(r, ci.categoria), fornitore: g(r, ci.fornitore),
            giacenza: g(r, ci.giacenza), scorta: g(r, ci.scorta), note: g(r, ci.note), confOrig: g(r, ci.confezione), sezione: null });
        }
        continue;
      }
      // elenco a gruppi di tre colonne
      const larg = Math.max(...tab.map(r => r.length));
      const gruppi = Math.max(1, Math.floor(larg / 3));
      const corrente = new Array(gruppi).fill(null);
      for (const r of tab) {
        const celle = [];
        for (let gI = 0; gI < gruppi; gI++) celle.push([t(r[gI * 3]), t(r[gI * 3 + 1]), t(r[gI * 3 + 2])]);
        celle.forEach(([d, u, q], gI) => {
          if (!d) return;
          if (isIntestazione([d, u, q])) return;
          if (!u && !q) { // riga di sezione
            corrente[gI] = sez(d);
            // una sezione scritta nella prima colonna vale anche per le colonne a destra rimaste vuote
            if (gI === 0) for (let k = 1; k < gruppi; k++) if (!celle[k][0]) corrente[k] = corrente[0];
            return;
          }
          voci.push({ nome: d, umOrig: u, qtaOrig: q, sezione: corrente[gI] });
        });
      }
    }
    for (const v of voci) {
      v.nomeOrig = v.nome;
      v.nome = Core.capitalizza(v.nome);
      const pu = Core.parseUnit(v.umOrig);
      v.unita = Core.unitaMagazzino(pu, v.nome);
      if (v.umOrig && !pu) v.avviso = `Unità "${v.umOrig}" non riconosciuta`;
      v.confezione = leggiConfezione(v.confOrig, v.unita);
      const sezione = v.sezione ? sezioni.get(v.sezione) : null;
      v.fornitore = v.fornitore ? (Core.trovaFornitore(state, v.fornitore) || t(v.fornitore)) : '';
      v.categoria = v.categoria || Core.indovinaCategoria(v.nome) || (sezione ? Core.indovinaCategoria(sezione.nome) : '') || 'Altro';
      const f = Core.trovaArticolo(state, v.nomeOrig);
      v.articoloId = f.art && f.come !== 'simile' ? f.art.id : null;
      v.simile = f.art && f.come === 'simile' ? f.art.nome : '';
      v.azione = v.articoloId ? 'aggiorna' : 'nuovo';
    }
    // doppioni nell'elenco stesso
    const visti = new Map();
    for (const v of voci) { const k = Core.normNome(v.nome); if (visti.has(k)) { v.avviso = (v.avviso ? v.avviso + ' · ' : '') + 'Compare più volte nell\'elenco'; v.azione = 'salta'; } else visti.set(k, v); }
    return { nomeFile: doc.nomeFile || '', sezioni: [...sezioni.values()], voci };
  }
  /** «5 kg», «500g», «6» (nell'unità del prodotto) → { qta, unita } oppure null. */
  function leggiConfezione(testo, unita) {
    const m = t(testo).match(/^(\d+(?:[.,]\d+)?)\s*(.*)$/);
    if (!m || !(Core.num(m[1]) > 0)) return null;
    const u = m[2] ? Core.parseUnit(m[2]) : unita;
    return u && u !== 'qb' ? { qta: Core.num(m[1]), unita: Core.normUnit(u) } : null;
  }
  /** Fornitore effettivo di una voce: quello della riga oppure quello assegnato alla sua sezione. */
  function fornitoreVoce(an, v) {
    if (v.fornitore) return v.fornitore;
    const s = v.sezione && an.sezioni.find(x => x.nome === v.sezione);
    return s ? s.fornitore : '';
  }
  function applicaArticoli(state, an) {
    let inseriti = 0, aggiornati = 0;
    for (const s of an.sezioni) if (s.fornitore) {
      Core.aggiungiVoce(state, 'fornitori', s.fornitore);
      // ricorda l'abbinamento sezione → fornitore (es. "VERDURE" → il fornitore di frutta e verdura) per i prossimi import
      if (Core.normNome(s.nome) !== Core.normNome(s.fornitore)) { state.impostazioni.sezioni[Core.normNome(s.nome)] = s.fornitore; state.impostazioni.u = new Date().toISOString(); }
    }
    for (const v of an.voci) {
      if (v.azione === 'salta') continue;
      const fornitore = fornitoreVoce(an, v);
      if (v.azione === 'aggiorna' && v.articoloId && Core.byId(state.articoli, v.articoloId)) {
        const patch = {};
        if (fornitore) patch.fornitore = fornitore;
        if (v.categoria && v.categoria !== 'Altro') patch.categoria = v.categoria;
        if (v.scorta !== '' && v.scorta != null) patch.scortaMinima = v.scorta;
        if (v.note) patch.note = v.note;
        if (v.confezione) patch.confezione = v.confezione;
        Core.updateArticolo(state, v.articoloId, patch);
        if (v.giacenza !== '' && v.giacenza != null) Core.movimento(state, v.articoloId, Core.num(v.giacenza), 'rettifica', 'Importato da ' + an.nomeFile);
        aggiornati++;
      } else {
        Core.addArticolo(state, { nome: v.nome, unita: v.unita, categoria: v.categoria, fornitore, giacenza: v.giacenza, scortaMinima: v.scorta, note: v.note, confezione: v.confezione,
          alias: v.nomeOrig !== v.nome ? [v.nomeOrig] : [] });
        inseriti++;
      }
      if (v.categoria && !state.impostazioni.categorie.includes(v.categoria)) Core.aggiungiVoce(state, 'categorie', v.categoria);
    }
    return { inseriti, aggiornati };
  }

  return { classeDaFile, classeDaTesto, trovaTabellaPiano, propostaScala, analizzaPiano, abbina, controllaUnita, segnaDoppi, applicaPiano,
    analizzaArticoli, leggiConfezione, fornitoreVoce, applicaArticoli };
});
