const assert = require('assert');
const C = require('../core.js');
const I = require('../importa.js');
const L = require('../leggi.js');

let passed = 0; const tests = [];
function test(name, fn) { tests.push([name, fn]); }
async function run() {
  for (const [name, fn] of tests) {
    try { await fn(); passed++; console.log('✔', name); } catch (e) { console.error('✘', name); console.error(e); process.exitCode = 1; }
  }
  console.log(`\n${passed}/${tests.length} test superati`);
}

test('conversione unità', () => {
  assert.strictEqual(C.convert(500, 'g', 'kg'), 0.5);
  assert.strictEqual(C.convert(2, 'l', 'ml'), 2000);
  assert.strictEqual(C.convert(1, 'kg', 'l'), null);
  assert.strictEqual(C.normUnit('Gr.'), 'g');
  assert.strictEqual(C.normUnit('LT'), 'l');
  assert.strictEqual(C.normUnit('boh'), 'pz');
  assert.strictEqual(C.fmtQty(0.25, 'kg'), '250 g');
  assert.strictEqual(C.fmtQty(1500, 'g'), '1,5 kg');
});

function setup() {
  const s = C.emptyState();
  const riso = C.addArticolo(s, { nome: 'Riso Carnaroli', categoria: 'Secco', unita: 'kg', giacenza: 5, scortaMinima: 3, fornitore: 'Metro' });
  const funghi = C.addArticolo(s, { nome: 'Funghi champignon', categoria: 'Fresco', unita: 'kg', giacenza: 0.5, fornitore: 'Ortofrutta Rossi' });
  const brodo = C.addArticolo(s, { nome: 'Brodo vegetale', unita: 'l', giacenza: 10, fornitore: 'Metro' });
  const uova = C.addArticolo(s, { nome: 'Uova', unita: 'pz', giacenza: 30, scortaMinima: 60 });
  const risotto = C.addPiano(s, { nome: 'Risotto ai funghi', righe: [
    { articoloId: riso.id, qta: 1500, unita: 'g' }, { articoloId: funghi.id, qta: 800, unita: 'g' }, { articoloId: brodo.id, qta: 4, unita: 'l' }] });
  const frittata = C.addPiano(s, { nome: 'Frittata', righe: [{ articoloId: uova.id, qta: 24, unita: 'pz' }, { articoloId: funghi.id, qta: 0.3, unita: 'kg' }] });
  return { s, riso, funghi, brodo, uova, risotto, frittata };
}

test('fabbisogno × classi con conversione', () => {
  const { s, riso, funghi, risotto, frittata } = setup();
  const fb = C.fabbisogno(s, [{ pianoId: risotto.id, classi: 4 }, { pianoId: frittata.id, classi: 2 }]);
  assert.strictEqual(fb.get(riso.id).qta, 6);           // 1,5 kg × 4
  assert.ok(Math.abs(fb.get(funghi.id).qta - 3.8) < 1e-9); // 0,8×4 + 0,3×2
  assert.strictEqual(fb.get(funghi.id).dettaglio.length, 2);
});

test('ordine: da ordinare = fabbisogno − giacenza, mai negativo', () => {
  const { s, riso, funghi, brodo, risotto } = setup();
  const o = C.addOrdine(s, { nome: 'Settimana 1', voci: [{ pianoId: risotto.id, classi: 4 }] });
  const r = id => o.righe.find(x => x.articoloId === id);
  assert.strictEqual(r(riso.id).daOrdinare, 1);        // 6 − 5
  assert.strictEqual(r(funghi.id).daOrdinare, 2.7);    // 3,2 − 0,5
  assert.strictEqual(r(brodo.id).daOrdinare, 6);       // 16 − 10
  assert.strictEqual(o.righe[0].fornitore, 'Metro');   // ordinate per fornitore
});

test('ordine: modifica manuale sopravvive al ricalcolo e righe extra', () => {
  const { s, riso, uova, risotto, frittata } = setup();
  const o = C.addOrdine(s, { voci: [{ pianoId: risotto.id, classi: 4 }] });
  C.setDaOrdinare(s, o.id, riso.id, 10);
  C.addRigaExtra(s, o.id, uova.id, 90);
  C.updateOrdine(s, o.id, { voci: [{ pianoId: risotto.id, classi: 5 }, { pianoId: frittata.id, classi: 1 }] });
  const r = id => o.righe.find(x => x.articoloId === id);
  assert.strictEqual(r(riso.id).daOrdinare, 10);
  assert.strictEqual(r(riso.id).fabbisogno, 7.5);
  assert.strictEqual(r(uova.id).daOrdinare, 90);        // extra manuale resta anche se ora c'è nel piano
  assert.strictEqual(r(uova.id).fabbisogno, 24);
});

test('ricezione ordine carica il magazzino e blocca modifiche', () => {
  const { s, riso, funghi, risotto } = setup();
  const o = C.addOrdine(s, { voci: [{ pianoId: risotto.id, classi: 4 }] });
  C.riceviOrdine(s, o.id, { [funghi.id]: 3 });
  assert.strictEqual(C.byId(s.articoli, riso.id).giacenza, 6);
  assert.strictEqual(C.byId(s.articoli, funghi.id).giacenza, 3.5);
  assert.strictEqual(o.stato, 'ricevuto');
  assert.throws(() => C.updateOrdine(s, o.id, { note: 'x' }));
  assert.strictEqual(s.movimenti.filter(m => m.tipo === 'carico').length, 3);
});

test('scarico piano eseguito e sotto scorta', () => {
  const { s, riso, uova, risotto, frittata } = setup();
  C.scaricaPiano(s, risotto.id, 2);
  assert.strictEqual(C.byId(s.articoli, riso.id).giacenza, 2);
  C.scaricaPiano(s, frittata.id, 1);
  assert.strictEqual(C.byId(s.articoli, uova.id).giacenza, 6);
  const ss = C.sottoScorta(s).map(a => a.nome).sort();
  assert.deepStrictEqual(ss, ['Riso Carnaroli', 'Uova']);
});

test('rettifica inventario', () => {
  const { s, riso } = setup();
  const m = C.movimento(s, riso.id, 4.2, 'rettifica', 'inventario');
  assert.strictEqual(m.delta, -0.8);
  assert.strictEqual(C.byId(s.articoli, riso.id).giacenza, 4.2);
});

test('testo ordine per fornitore', () => {
  const { s, risotto } = setup();
  const o = C.addOrdine(s, { nome: 'Prova', settimana: '2026-11-02', voci: [{ pianoId: risotto.id, classi: 4 }] });
  const t = C.testoOrdine(s, o.id, 'Metro');
  assert.ok(t.includes('02/11/2026'));
  assert.ok(t.includes('- Riso Carnaroli: 1 kg'));
  assert.ok(!t.includes('Funghi'));
  const tutto = C.testoOrdine(s, o.id);
  assert.ok(tutto.includes('[Ortofrutta Rossi]'));
});

test('import prodotti da tabella con intestazioni (CSV/Excel): inserisce e aggiorna per nome', () => {
  const { s } = setup();
  const csv = 'Articolo;Categoria;U.M.;Giacenza;Scorta minima;Fornitore\nFarina 00;Secco;kg;25;10;Metro\nriso carnaroli;;;8;;\n"Olio EVO; extra";Secco;l;"12,5";5;Oleificio';
  const an = I.analizzaArticoli(s, { nomeFile: 'a.csv', testo: [], tabelle: [C.parseCSV(csv)] });
  assert.deepStrictEqual(an.voci.map(v => v.azione), ['nuovo', 'aggiorna', 'nuovo']);
  const r = I.applicaArticoli(s, an);
  assert.deepStrictEqual(r, { inseriti: 2, aggiornati: 1 });
  const riso = C.live(s.articoli).find(a => a.nome === 'Riso Carnaroli');
  assert.strictEqual(riso.giacenza, 8);
  const olio = C.live(s.articoli).find(a => a.nome.startsWith('Olio'));
  assert.strictEqual(olio.giacenza, 12.5);
  assert.ok(s.impostazioni.fornitori.includes('Oleificio'));
  const back = C.parseCSV(C.esportaArticoliCSV(s));
  assert.strictEqual(back.length, 1 + 6);
});

test('import prodotti da elenco a sezioni (due colonne, sezione = fornitore)', () => {
  const s = C.emptyState();
  C.aggiungiVoce(s, 'fornitori', 'Ditta Uno'); C.aggiungiVoce(s, 'fornitori', 'Bevande Srl');
  const tab = [
    ['VERDURE', '', '', 'DITTA UNO', '', ''],
    ['CIPOLLE', 'KG', '7', 'FARINA 00', 'KG', '5'],
    ['DITTA UNO', '', '', 'BURRO', 'KG', '4'],
    ['CARTA FORNO', 'CONF', '1', '', '', ''],
    ['BEVANDE SRL', '', '', '', '', ''],
    ['COGNAC', 'BOTT', '1', 'PORTO', 'BOTT', '2'],
  ];
  const an = I.analizzaArticoli(s, { nomeFile: 'o.docx', testo: [], tabelle: [tab] });
  const forn = n => I.fornitoreVoce(an, an.voci.find(v => v.nome === n));
  assert.strictEqual(forn('Cipolle'), '');              // reparto, non fornitore: lo sceglie l'utente
  assert.strictEqual(forn('Farina 00'), 'Ditta Uno');
  assert.strictEqual(forn('Burro'), 'Ditta Uno');       // la colonna destra continua la sua sezione
  assert.strictEqual(forn('Carta forno'), 'Ditta Uno');
  assert.strictEqual(forn('Porto'), 'Bevande Srl');     // sezione a sinistra con colonna destra vuota: vale per entrambe
  assert.strictEqual(an.voci.find(v => v.nome === 'Cognac').unita, 'bott');
  assert.strictEqual(an.voci.find(v => v.nome === 'Cipolle').categoria, 'Frutta e verdura');
  an.sezioni.find(x => x.nome === 'VERDURE').fornitore = 'Ditta Uno';
  I.applicaArticoli(s, an);
  assert.strictEqual(C.live(s.articoli).find(a => a.nome === 'Cipolle').fornitore, 'Ditta Uno');
});

test('merge: vince il più recente, movimenti uniti, giacenza ricostruita', async () => {
  const { s, riso } = setup();
  const a = JSON.parse(JSON.stringify(s)), b = JSON.parse(JSON.stringify(s));
  await new Promise(r => setTimeout(r, 5));
  C.movimento(a, riso.id, -1, 'scarico', 'su telefono');     // a: 4
  await new Promise(r => setTimeout(r, 5));
  C.movimento(b, riso.id, 2, 'carico', 'su pc');             // b: 7
  const m = C.merge(a, b);
  const r = C.byId(m.articoli, riso.id);
  assert.strictEqual(r.giacenza, 6);                         // 5 − 1 + 2
  assert.strictEqual(m.movimenti.length, 2);
  // cancellazione vince se più recente
  await new Promise(r => setTimeout(r, 5));
  C.deleteArticolo(a, riso.id);
  const m2 = C.merge(b, a);
  assert.ok(!C.byId(m2.articoli, riso.id));
});

test('migrate stato vuoto/vecchio', () => {
  const s = C.migrate({ articoli: [{ id: 'x', nome: 'A' }] });
  assert.strictEqual(s.version, C.VERSION);
  assert.ok(Array.isArray(s.piani) && s.impostazioni.categorie.length > 0);
});

test('unità scritte a mano e conversioni con pezzo', () => {
  assert.strictEqual(C.parseUnit('GR.'), 'g');
  assert.strictEqual(C.parseUnit('N°'), 'pz');
  assert.strictEqual(C.parseUnit('Bott. '), 'bott');
  assert.strictEqual(C.parseUnit('MAZZ'), 'mazzo');
  assert.strictEqual(C.parseUnit('TEST'), 'testa');
  assert.strictEqual(C.parseUnit('Q.B.'), 'qb');
  assert.strictEqual(C.parseUnit('boh'), null);
  assert.strictEqual(C.convert(180, 'cl', 'l'), 1.8);
  assert.strictEqual(C.convert(1, 'testa', 'kg'), null);
  assert.strictEqual(C.convert(2, 'testa', 'kg', { qta: 50, unita: 'g' }), 0.1);
  assert.ok(Math.abs(C.convert(10, 'cl', 'bott', { qta: 70, unita: 'cl' }) - 1 / 7) < 1e-9);
  assert.strictEqual(C.convert(3, 'pz', 'bott'), 3);          // "N°" = pezzi dell'articolo
  assert.strictEqual(C.convert(1, 'conf', 'bott'), null);
  assert.deepStrictEqual(C.parseQta('1/2'), { qta: 0.5 });
  assert.deepStrictEqual(C.parseQta('3,5'), { qta: 3.5 });
  assert.deepStrictEqual(C.parseQta('q.b.'), { qta: null, qb: true });
  assert.deepStrictEqual(C.parseQta('1 CONF x tipo'), { qta: 1, dubbia: true });
  assert.strictEqual(C.fmtQty(2, 'mazzo'), '2 mazzi');
  assert.strictEqual(C.fmtQty(1, 'mazzo'), '1 mazzo');
});

test('abbinamento nomi: refusi sì, varianti no', () => {
  const s = C.emptyState();
  const sale = C.addArticolo(s, { nome: 'Sale fino', unita: 'kg' });
  C.addArticolo(s, { nome: 'Marsala secco', unita: 'bott' });
  assert.strictEqual(C.trovaArticolo(s, 'SALE FINO').art.id, sale.id);
  const r = C.trovaArticolo(s, 'SALA FINO');
  assert.strictEqual(r.art.id, sale.id); assert.strictEqual(r.come, 'simile');
  assert.strictEqual(C.trovaArticolo(s, 'Marsala semisecco').art, null);
  assert.strictEqual(C.indovinaCategoria('TOVAGLIOLI DI CARTA'), 'Materiale di consumo');
  assert.strictEqual(C.pezzoTipico('Tovaglioli'), null);
  assert.strictEqual(C.indovinaCategoria('Farina polesani arancio'), 'Farine, pasta e riso');
});

test('fabbisogno per sede: bottiglie arrotondate per eccesso sede per sede', () => {
  const s = C.emptyState();
  const brandy = C.addArticolo(s, { nome: 'Brandy', unita: 'bott', pezzo: { qta: 70, unita: 'cl' }, giacenza: 1 });
  const farina = C.addArticolo(s, { nome: 'Farina', unita: 'kg', giacenza: 0.5 });
  const p = C.addPiano(s, { nome: 'Flambé', righe: [{ articoloId: brandy.id, qta: 10, unita: 'cl' }, { articoloId: farina.id, qta: 300, unita: 'g' }] });
  const o = C.addOrdine(s, { voci: [{ pianoId: p.id, classi: 2, sede: 'Sede A' }, { pianoId: p.id, classi: 1, sede: 'Sede B' }] });
  const b = o.righe.find(r => r.articoloId === brandy.id), f = o.righe.find(r => r.articoloId === farina.id);
  assert.deepStrictEqual(b.perSede, { 'Sede A': 1, 'Sede B': 1 });   // 20 cl e 10 cl → 1 bottiglia per sede
  assert.strictEqual(b.fabbisogno, 2);
  assert.strictEqual(b.daOrdinare, 1);                                 // 2 − 1 in magazzino
  assert.deepStrictEqual(f.perSede, { 'Sede A': 0.6, 'Sede B': 0.3 });
  assert.strictEqual(f.daOrdinare, 0.4);
  assert.deepStrictEqual(C.sediOrdine(s, o), ['Sede A', 'Sede B']);
  const csv = C.csvOrdine(s, o.id);
  assert.ok(csv.split('\n')[0].includes('Fabbisogno Sede A'));
});

function docPiano(nomeFile, testo, righe) {
  return { nomeFile, testo, tabelle: [[['RICETTA UNO / RICETTA DUE'], ['DESCRIZIONE', 'U.M.', "QUANTITA'", 'TOTALE'], ...righe]] };
}

test('import piano: proposte di scala, q.b., doppioni, conversioni', () => {
  const s = C.emptyState();
  C.addArticolo(s, { nome: 'Sale fino', unita: 'kg' });
  const p = I.analizzaPiano(s, docPiano('IV_PROVA.docx', ['CLASSE IV Lez. 1 - 2', 'ENOGASTRONOMIA – A.S. ' + C.annoScolastico()], [
    ['POMODORO FRESCO', 'KG', '500', ''], ['OLIO EXTRAV.', 'LT', '500', ''], ['ACETO BIANCO', 'CL', '180', ''],
    ['SALA FINO', 'GR', '100', ''], ['ZUCCHERO', 'GR', '100', ''], ['ZUCCHERO', 'GR', '200', ''],
    ['PEPE NERO', 'Q.B.', '', ''], ['AGLIO', 'TEST', '1', ''], ['OSSA DI POLLO', 'KG', '1', 'PER FONDO'], ['', '', '', ''],
  ]));
  assert.strictEqual(p.nome, 'Ricetta uno / Ricetta due');
  assert.strictEqual(p.classe, 'IV'); assert.strictEqual(p.materia, 'Enogastronomia'); assert.strictEqual(p.lezione, '1-2');
  assert.strictEqual(p.avvisi.length, 0);
  const r = t => p.righe.find(x => x.testo === t);
  assert.deepStrictEqual([r('POMODORO FRESCO').qta, r('POMODORO FRESCO').unita], [500, 'g']);
  assert.deepStrictEqual([r('OLIO EXTRAV.').qta, r('OLIO EXTRAV.').unita], [500, 'ml']);
  assert.deepStrictEqual([r('ACETO BIANCO').qta, r('ACETO BIANCO').unita], [180, 'ml']);
  assert.ok(r('ACETO BIANCO').flags.some(f => f.tipo === 'scala'));
  assert.strictEqual(r('SALA FINO').nomeArticolo, 'Sale fino');
  assert.ok(r('SALA FINO').flags.some(f => f.tipo === 'simile'));
  assert.strictEqual(p.righe.filter(x => x.flags.some(f => f.tipo === 'doppio')).length, 2);
  assert.ok(r('PEPE NERO').qb);
  assert.ok(r('AGLIO').pezzoServe); assert.deepStrictEqual([r('AGLIO').pezzo.qta, r('AGLIO').pezzo.unita], [50, 'g']);
  assert.strictEqual(r('OSSA DI POLLO').nota, 'PER FONDO');
  // salvataggio
  r('ZUCCHERO').escludi = true;
  const piano = I.applicaPiano(s, p);
  assert.strictEqual(piano.classe, 'IV');
  assert.deepStrictEqual(piano.qb, ['Pepe nero']);
  assert.strictEqual(piano.righe.length, 7);
  const aglio = C.live(s.articoli).find(a => a.nome === 'Aglio');
  assert.deepStrictEqual([aglio.unita, aglio.pezzo], ['kg', { qta: 50, unita: 'g' }]);
  assert.strictEqual(C.fabbisogno(s, [{ pianoId: piano.id, classi: 2 }]).get(aglio.id).qta, 0.1);
  // la volta dopo il nome del file viene riconosciuto (alias)
  assert.strictEqual(C.trovaArticolo(s, 'OLIO EXTRAV.').come, 'nome');
  assert.strictEqual(C.trovaArticolo(s, 'SALA FINO').come, 'alias');
});

test('import piano: classe diversa tra nome del file e documento, anno vecchio', () => {
  const s = C.emptyState();
  const p = I.analizzaPiano(s, docPiano('IV_SALA.docx', ['CLASSE III SALA E VENDITA', 'A.S. 2019/20'], [['BRANDY', 'BOTT', '1', '']]));
  assert.ok(p.conflittoClasse);
  assert.strictEqual(p.classe, '');
  assert.deepStrictEqual([p.classeFile, p.classeTesto], ['IV', 'III']);
  assert.ok(p.avvisi.some(a => a.tipo === 'anno'));
  assert.strictEqual(I.classeDaFile('II_PER._SERALE.docx'), 'Serale – 2° periodo');
  assert.strictEqual(I.classeDaFile('III_PERIODO_SALA.docx'), 'Serale – 3° periodo');
  assert.strictEqual(I.classeDaTesto(['SECONDO PERIODO DIDATTICO']), 'Serale – 2° periodo');
  assert.throws(() => I.analizzaPiano(s, { nomeFile: 'x.docx', testo: ['ciao'], tabelle: [] }));
});

test('lettura Word: paragrafi, tabelle e celle su più righe', () => {
  const xml = '<w:document><w:body><w:p><w:r><w:t>CLASSE V</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>TITOLO A</w:t></w:r></w:p><w:p><w:r><w:t xml:space="preserve">TITOLO B </w:t></w:r></w:p></w:tc></w:tr>'
    + '<w:tr><w:tc><w:p><w:r><w:t>OLIO &amp; ACETO</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>L</w:t></w:r><w:r><w:t>T</w:t></w:r></w:p></w:tc><w:tc><w:p/></w:tc></w:tr></w:tbl></w:body></w:document>';
  const d = L.parseDocXml(xml);
  assert.deepStrictEqual(d.testo, ['CLASSE V']);
  assert.deepStrictEqual(d.tabelle, [[['TITOLO A / TITOLO B'], ['OLIO & ACETO', 'LT', '']]]);
});

test('magazzino centrale: la giacenza copre solo la sede centrale, alla ricezione si carica solo la sua parte', () => {
  const s = C.emptyState();
  C.aggiungiVoce(s, 'sedi', 'Centro'); C.aggiungiVoce(s, 'sedi', 'Nord');
  s.impostazioni.sedeCentrale = 'Centro';
  const farina = C.addArticolo(s, { nome: 'Farina', unita: 'kg', giacenza: 5 });
  const vino = C.addArticolo(s, { nome: 'Vino', unita: 'bott', giacenza: 3 });
  const p = C.addPiano(s, { nome: 'P', righe: [{ articoloId: farina.id, qta: 2, unita: 'kg' }, { articoloId: vino.id, qta: 1, unita: 'bott' }] });
  const o = C.addOrdine(s, { voci: [{ pianoId: p.id, classi: 2, sede: 'Centro' }, { pianoId: p.id, classi: 3, sede: 'Nord' }] });
  const f = o.righe.find(r => r.articoloId === farina.id), v = o.righe.find(r => r.articoloId === vino.id);
  assert.deepStrictEqual([f.fabbisogno, f.centrale, f.altre, f.daOrdinare], [10, 4, 6, 6]);   // 6 per Nord + max(0, 4 − 5)
  assert.deepStrictEqual([v.centrale, v.altre, v.daOrdinare], [2, 3, 3]);                     // 3 per Nord + max(0, 2 − 3)
  C.setDaOrdinare(s, o.id, farina.id, 8);                                                       // 2 kg in più per il magazzino
  C.riceviOrdine(s, o.id);
  assert.strictEqual(C.byId(s.articoli, farina.id).giacenza, 7);                               // 5 + (8 − 6 di Nord)
  assert.strictEqual(C.byId(s.articoli, vino.id).giacenza, 3);                                 // tutto a Nord
  // senza sede centrale tutto passa dal magazzino (comportamento precedente)
  s.impostazioni.sedeCentrale = '';
  const o2 = C.addOrdine(s, { voci: [{ pianoId: p.id, classi: 2, sede: 'Centro' }, { pianoId: p.id, classi: 3, sede: 'Nord' }] });
  assert.strictEqual(o2.righe.find(r => r.articoloId === farina.id).daOrdinare, 3);           // 10 − 7
});

test('import prodotti: ricorda la sezione abbinata a un fornitore', () => {
  const s = C.emptyState();
  C.aggiungiVoce(s, 'fornitori', 'Frutta Srl');
  const doc = { nomeFile: 'o.docx', testo: [], tabelle: [[['VERDURE', '', ''], ['CIPOLLE', 'KG', '7']]] };
  const an = I.analizzaArticoli(s, doc);
  assert.strictEqual(an.sezioni[0].fornitore, '');
  an.sezioni[0].fornitore = 'Frutta Srl';
  I.applicaArticoli(s, an);
  assert.strictEqual(I.analizzaArticoli(s, doc).sezioni[0].fornitore, 'Frutta Srl');
});

test('frutta e verdura divise e ordinamento per categoria', () => {
  const s = C.emptyState();
  const add = (nome, extra) => C.addArticolo(s, { nome, unita: 'kg', ...extra });
  add('Zucchine'); add('Limoni'); add('Farina 00'); add('Arance'); add('Carote'); add('Melanzane');
  const pom = add('Pomodorini', { sotto: 'Frutta' });                         // scelta a mano: vince sull'automatico
  assert.strictEqual(C.sottogruppo(C.live(s.articoli).find(a => a.nome === 'Melanzane')), 'Verdura');
  assert.strictEqual(C.sottogruppo(pom), 'Frutta');
  assert.strictEqual(C.gruppoCategoria(C.live(s.articoli).find(a => a.nome === 'Farina 00')), 'Farine, pasta e riso');
  const ord = C.ordinaPerCategoria(s, C.live(s.articoli)).map(x => x.gruppo + ':' + x.item.nome);
  const fr = ord.filter(x => x.startsWith('Frutta:')), ve = ord.filter(x => x.startsWith('Verdura:'));
  assert.deepStrictEqual(fr, ['Frutta:Arance', 'Frutta:Limoni', 'Frutta:Pomodorini']);
  assert.deepStrictEqual(ve, ['Verdura:Carote', 'Verdura:Melanzane', 'Verdura:Zucchine']);
  assert.ok(ord.indexOf(fr[2]) < ord.indexOf(ve[0]));                        // Frutta prima di Verdura, gruppi contigui
});

test('«Carne e pesce» diventa «Carne» e «Pesce»', () => {
  const vecchio = { impostazioni: { categorie: ['Frutta e verdura', 'Carne e pesce', 'Altro'] },
    articoli: [{ id: 'a', nome: 'Petto di pollo', categoria: 'Carne e pesce', u: '2026-01-01' }, { id: 'b', nome: 'Gamberi', categoria: 'Carne e pesce', u: '2026-01-01' }] };
  const s = C.migrate(vecchio);
  assert.deepStrictEqual(s.impostazioni.categorie, ['Frutta e verdura', 'Carne', 'Pesce', 'Altro']);
  assert.deepStrictEqual(s.articoli.map(a => a.categoria), ['Carne', 'Pesce']);
  assert.strictEqual(s.articoli[0].u, '2026-01-01');                             // non toccati: non scavalcano modifiche più recenti
  const recente = { ...vecchio.articoli[1], categoria: 'Pesce', fornitore: 'Santopadre', u: '2026-02-01' };
  const m = C.merge({ ...vecchio, articoli: [vecchio.articoli[1]] }, { impostazioni: vecchio.impostazioni, articoli: [recente] });
  assert.strictEqual(m.articoli[0].fornitore, 'Santopadre');
  assert.strictEqual(C.indovinaCategoria('Cipolla rossa'), 'Frutta e verdura');  // «rossa» non è «ossa»
});

test('unità minima d\'acquisto: l\'ordine arrotonda ai multipli', () => {
  const s = C.emptyState();
  s.impostazioni.sedi = ['Centro', 'Nord']; s.impostazioni.sedeCentrale = 'Centro';
  const farina = C.addArticolo(s, { nome: 'Farina 00', unita: 'kg', confezione: { qta: 5, unita: 'kg' } });
  const burro = C.addArticolo(s, { nome: 'Burro', unita: 'kg', confezione: { qta: 250, unita: 'g' }, giacenza: 0.1 });
  const limoni = C.addArticolo(s, { nome: 'Limoni', unita: 'kg', pezzo: { qta: 120, unita: 'g' }, confezione: { qta: 10, unita: 'pz' } });
  const acqua = C.addArticolo(s, { nome: 'Acqua naturale', unita: 'bott', confezione: { qta: 6, unita: 'pz' } });
  const p = C.addPiano(s, { nome: 'P', righe: [
    { articoloId: farina.id, qta: 3.6, unita: 'kg' }, { articoloId: burro.id, qta: 400, unita: 'g' },
    { articoloId: limoni.id, qta: 1, unita: 'kg' }, { articoloId: acqua.id, qta: 7, unita: 'bott' }] });
  const o = C.addOrdine(s, { voci: [{ pianoId: p.id, classi: 1, sede: 'Centro' }, { pianoId: p.id, classi: 1, sede: 'Nord' }] });
  const r = id => o.righe.find(x => x.articoloId === id);
  // arrotondamento sede per sede: ogni sede riceve confezioni intere
  assert.deepStrictEqual([r(farina.id).netto, r(farina.id).invio, r(farina.id).daOrdinare], [7.2, { Nord: 5 }, 10]); // 3,6 → 5 a Nord, 3,6 → 5 al centro
  assert.deepStrictEqual([r(burro.id).netto, r(burro.id).daOrdinare], [0.7, 1]);          // Nord 0,4 → 0,5; centro 0,4 − 0,1 → 0,5
  assert.strictEqual(r(limoni.id).daOrdinare, 2.4);                                       // 1 kg per sede → una retina da 1,2 kg ciascuna
  assert.strictEqual(r(acqua.id).daOrdinare, 24);                                         // 7 bottiglie per sede → 2 casse da 6 ciascuna
  assert.strictEqual(C.confezioniDi(farina, 10), '2 × 5 kg');
  assert.strictEqual(C.confezioniDi(farina, 8), '');                                      // cambiato a mano: non multiplo
  assert.match(C.testoOrdine(s, o.id, null), /Farina 00: 10 kg \(2 × 5 kg\)/);
  assert.strictEqual(C.quotaMagazzino(r(farina.id)), 5);                                  // 10 − 5 che partono per Nord
  // aceto: serve solo a Nord, il magazzino del centro non lo copre → si ordina una bottiglia per Nord
  const aceto = C.addArticolo(s, { nome: 'Aceto bianco', unita: 'l', giacenza: 1.2, confezione: { qta: 1, unita: 'l' } });
  const pa = C.addPiano(s, { nome: 'PA', righe: [{ articoloId: aceto.id, qta: 360, unita: 'ml' }] });
  const oa = C.addOrdine(s, { voci: [{ pianoId: pa.id, classi: 1, sede: 'Nord' }] });
  assert.deepStrictEqual([oa.righe[0].netto, oa.righe[0].invio, oa.righe[0].daOrdinare], [0.36, { Nord: 1 }, 1]);
  // ricezione: entra tutto, poi si scarica la parte per Nord
  C.riceviOrdine(s, oa.id);
  const mov = s.movimenti.filter(m => m.rifId === oa.id).map(m => [m.tipo, m.delta]);
  assert.deepStrictEqual(mov, [['carico', 1], ['scarico', -1]]);
  assert.strictEqual(C.byId(s.articoli, aceto.id).giacenza, 1.2);
  // import: colonna «Confezione»
  const doc = { nomeFile: 'p.xlsx', testo: [], tabelle: [[['Nome', 'U.M.', 'Confezione', 'Scorta minima'], ['Zucchero semolato', 'kg', '10 kg', '2'], ['Uova', 'pz', '30', '']]] };
  const an = I.analizzaArticoli(s, doc);
  assert.deepStrictEqual(an.voci.map(v => v.confezione), [{ qta: 10, unita: 'kg' }, { qta: 30, unita: 'pz' }]);
  assert.strictEqual(an.voci[0].scorta, '2');
});

test('sincronizzazione: unione campo per campo e conflitti da scegliere', () => {
  const clone = x => JSON.parse(JSON.stringify(x));
  const base = C.emptyState();
  base.impostazioni.fornitori = ['DAC', 'Rigaglia', 'LP']; base.impostazioni.u = '2026-01-01T00:00:00.000Z';
  const a0 = C.addArticolo(base, { nome: 'Acciughe', unita: 'kg', fornitore: 'Rigaglia', giacenza: 2 });
  const b0 = C.addArticolo(base, { nome: 'Burro', unita: 'kg', fornitore: 'DAC' });
  const tel = clone(base), tab = clone(base);
  C.setDispositivo('Telefono');
  C.updateArticolo(tel, a0.id, { fornitore: 'Santopadre', scortaMinima: 1 });   // telefono: fornitore + scorta
  C.movimento(tel, a0.id, 3, 'carico');                                          // +3
  C.aggiungiVoce(tel, 'fornitori', 'Santopadre');
  C.deleteArticolo(tel, b0.id);                                                  // telefono elimina il burro
  C.setDispositivo('Tablet');
  C.updateArticolo(tab, a0.id, { note: 'sott\'olio' });                         // tablet: note (campo diverso)
  C.movimento(tab, a0.id, -1, 'scarico');                                        // −1
  C.rimuoviVoce(tab, 'fornitori', 'LP');
  C.updateArticolo(tab, b0.id, { scortaMinima: 2 });                             // ...mentre il tablet lo modifica
  // il telefono sincronizza per primo (nessun conflitto), poi il tablet unisce con il remoto
  const remoto = C.merge(tel, base, base);
  assert.strictEqual(C.conflittiAperti(remoto).length, 0);
  let m = C.merge(tab, remoto, base);
  const a = m.articoli.find(x => x.id === a0.id);
  assert.deepStrictEqual([a.fornitore, a.scortaMinima, a.note, a.giacenza], ['Santopadre', 1, 'sott\'olio', 4]); // 2 + 3 − 1
  assert.deepStrictEqual(m.impostazioni.fornitori, ['DAC', 'Rigaglia', 'Santopadre']); // + dal telefono, − dal tablet
  const burro = m.articoli.find(x => x.id === b0.id);
  assert.ok(!burro.del && burro.scortaMinima === 2);                              // modificato altrove: resta, ma si chiede
  assert.deepStrictEqual(C.conflittiAperti(m).map(c => c.campo), ['del']);
  // stesso campo cambiato sui due dispositivi
  const tel2 = clone(m), tab2 = clone(m);
  C.setDispositivo('Telefono'); C.updateArticolo(tel2, a0.id, { fornitore: 'Rigaglia' });
  C.setDispositivo('Tablet'); C.updateArticolo(tab2, a0.id, { fornitore: 'DAC' });   // più recente
  const at = tab2.articoli.find(x => x.id === a0.id); at.u = new Date(Date.parse(at.u) + 1000).toISOString();
  const m2 = C.merge(tel2, tab2, m);
  const c = C.conflittiAperti(m2).find(x => x.campo === 'fornitore');
  assert.deepStrictEqual([c.a.v, c.a.d, c.b.v, c.b.d, c.scelto], ['Rigaglia', 'Telefono', 'DAC', 'Tablet', 'b']);
  assert.strictEqual(m2.articoli.find(x => x.id === a0.id).fornitore, 'DAC');     // per ora il più recente
  C.risolviConflitto(m2, c.id, 'a');                                              // l'utente sceglie il telefono
  assert.strictEqual(m2.articoli.find(x => x.id === a0.id).fornitore, 'Rigaglia');
  const cb = C.conflittiAperti(m2)[0];                                            // burro: tiene l'eliminazione del telefono
  C.risolviConflitto(m2, cb.id, cb.a.v ? 'a' : 'b');
  assert.ok(m2.articoli.find(x => x.id === b0.id).del);
  assert.strictEqual(C.conflittiAperti(m2).length, 0);
  // la scelta arriva al tablet (che aveva già inviato la sua versione: è la sua base) e il conflitto non ricompare
  const m3 = C.merge(tab2, m2, tab2);
  assert.strictEqual(C.conflittiAperti(m3).length, 0);
  assert.strictEqual(m3.articoli.find(x => x.id === a0.id).fornitore, 'Rigaglia');
  C.setDispositivo('');
});

test('sincronizzazione: «Da ordinare» cambiato a mano su due dispositivi', () => {
  const clone = x => JSON.parse(JSON.stringify(x));
  const s = C.emptyState();
  const f = C.addArticolo(s, { nome: 'Farina', unita: 'kg' }), z = C.addArticolo(s, { nome: 'Zucchero', unita: 'kg' });
  const p = C.addPiano(s, { nome: 'P', righe: [{ articoloId: f.id, qta: 2, unita: 'kg' }, { articoloId: z.id, qta: 1, unita: 'kg' }] });
  const o = C.addOrdine(s, { voci: [{ pianoId: p.id, classi: 1, sede: '' }] });
  const x = clone(s), y = clone(s);
  C.setDaOrdinare(x, o.id, f.id, 5); C.setDaOrdinare(x, o.id, z.id, 3);
  C.setDaOrdinare(y, o.id, f.id, 6);
  const m = C.merge(x, y, s);
  const righe = m.ordini[0].righe;
  assert.strictEqual(righe.find(r => r.articoloId === z.id).daOrdinare, 3);       // cambiato solo da una parte
  const c = C.conflittiAperti(m);
  assert.deepStrictEqual(c.map(k => [k.campo, k.a.v, k.b.v]), [['riga:' + f.id, 5, 6]]);
});

test('sincronizzazione: casi trovati dalla revisione', () => {
  const clone = x => JSON.parse(JSON.stringify(x));
  const base = C.emptyState();
  const f = C.addArticolo(base, { nome: 'Farina', unita: 'kg', giacenza: 10 });
  const a = clone(base), b = clone(base);
  C.movimento(a, f.id, 3, 'carico'); C.movimento(b, f.id, 3, 'carico');
  // 1. l'unione non modifica lo stato in ingresso
  const prima = JSON.stringify(a);
  C.merge(a, b);
  assert.strictEqual(JSON.stringify(a), prima);
  // 2. due carichi uguali su due dispositivi si sommano, con e senza base
  assert.strictEqual(C.merge(a, b).articoli[0].giacenza, 16);
  assert.strictEqual(C.merge(a, b, base).articoli[0].giacenza, 16);
  // 3. un record cancellato da tanto resta come segnaposto e non rivive
  const r = clone(base); C.deleteArticolo(r, f.id); r.articoli[0].u = '2020-01-01T00:00:00.000Z';
  C.compatta(r);
  assert.deepStrictEqual(Object.keys(r.articoli[0]).sort(), ['del', 'id', 'u']);
  const vecchio = clone(base); vecchio.articoli[0].u = '2019-01-01T00:00:00.000Z';
  assert.ok(C.merge(vecchio, r, vecchio).articoli[0].del);
  assert.ok(C.merge(vecchio, r).articoli[0].del);
  // 4. prima sincronizzazione di un dispositivo nuovo: non cancella gli elenchi remoti
  const remoto = C.emptyState(); remoto.impostazioni.fornitori = ['DAC', 'Santopadre']; remoto.impostazioni.sedi = ['Giarre']; remoto.impostazioni.sedeCentrale = 'Giarre';
  const nuovo = C.emptyState(); C.aggiungiVoce(nuovo, 'fornitori', 'Rigaglia');      // più recente
  const m = C.merge(nuovo, remoto);
  assert.deepStrictEqual([m.impostazioni.fornitori, m.impostazioni.sedi, m.impostazioni.sedeCentrale], [['Rigaglia', 'DAC', 'Santopadre'], ['Giarre'], 'Giarre']);
  // 6. orologio indietro: la nuova modifica risulta comunque più recente
  const x = { u: '2099-01-01T00:00:00.000Z' };
  C.updateArticolo({ articoli: [Object.assign(x, { id: 'q', nome: 'Q', unita: 'kg' })], impostazioni: { fornitori: [] } }, 'q', { note: 'n' });
  assert.ok(x.u > '2099-01-01T00:00:00.000Z');
});

run();
