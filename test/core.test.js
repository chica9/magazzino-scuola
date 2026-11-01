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
  assert.ok(s.articoli[0].u > '2026-01-01');                                     // toccati: il cambio si sincronizza
  assert.strictEqual(C.indovinaCategoria('Cipolla rossa'), 'Frutta e verdura');  // «rossa» non è «ossa»
});

run();
