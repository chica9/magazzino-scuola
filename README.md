# Magazzino Scuola

App web installabile (PWA) per il magazzino di una scuola alberghiera: dispensa, piani di lavoro importati dai file Word/PDF dei docenti, e ordini settimanali con **fabbisogno**, **giacenza** e **quantità da ordinare**, divisi per fornitore e per sede.

Nessun server: solo file statici (HTML/JS) pubblicati su GitHub Pages. I dati stanno in un file JSON in un **repo GitHub privato** separato; l'app funziona anche offline e sincronizza quando torna la rete.

## Struttura

| File | Cosa fa |
|---|---|
| `index.html` | pagina e stile |
| `app.js` | interfaccia |
| `core.js` | logica pura: unità e conversioni, giacenze, fabbisogno per sede, ordini, merge |
| `importa.js` | interpreta piani di lavoro ed elenchi prodotti, propone le correzioni |
| `leggi.js` | legge Word (.docx), PDF (pdf.js), Excel (SheetJS) e CSV |
| `github.js` | lettura/scrittura del file dati su GitHub (Contents API), merge e retry sui conflitti |
| `sw.js`, `manifest.json`, `icons/` | installazione e cache offline (alzare `CACHE` in `sw.js` a ogni release) |

Test: `node test/core.test.js`.

## Come si usa

**Dispensa** — prodotti con categoria, unità, giacenza, scorta minima, **unità minima d'acquisto** (es. sacco da 5 kg, cassa da 6 bottiglie), fornitore. Filtri per categoria, fornitore e sotto scorta; elenco **per categoria** (in ordine alfabetico dentro ogni categoria) o **dalla A alla Z**. «Frutta e verdura» è mostrata divisa in **Frutta** e **Verdura** (riconosciute dal nome; si correggono nella scheda del prodotto). Il tasto **±** registra carichi, scarichi e inventario. **Importa da file** accetta Excel, CSV, Word o PDF: se il file è diviso in sezioni (es. l'ordine settimanale con «DAC», «VERDURE»…) ogni sezione può essere assegnata a un fornitore. Prima di importare si vede un'anteprima con categoria, unità e fornitore modificabili.

**Piani di lavoro** — **Importa piani** accetta uno o più file Word (.docx) o PDF. Per ogni file l'app mostra una revisione:
- classe, materia e lezione lette dal documento; se la classe nel nome del file è diversa da quella scritta dentro, chiede quale è giusta; segnala anche gli anni scolastici vecchi;
- ogni ingrediente viene abbinato a un prodotto della dispensa (o proposto come nuovo); i nomi del file vengono ricordati per le volte successive; i refusi evidenti («Sala fino» → «Sale fino») sono abbinati ma evidenziati;
- quantità sospette con una proposta già inserita e modificabile: «KG 500» → 500 g, «LT 500» → 500 ml, «CL 180» → 180 ml;
- righe scritte due volte (errore, o manca una specifica tipo «di canna» / «semolato»);
- «q.b.»: non entrano nell'ordine, ma vengono elencati come da controllare;
- conversioni pezzi → peso/volume quando servono (1 testa d'aglio ≈ 50 g, 1 limone ≈ 120 g, 1 bottiglia di liquore = 70 cl…): stime modificabili, salvate sul prodotto.

I file `.doc` (Word vecchio) vanno prima salvati come `.docx`. Le quantità dei piani sono **per una classe**.

**Ordini** — settimana + piani × numero di classi × sede. Per ogni prodotto: **Fabbisogno** (con il dettaglio per sede), **In magazzino**, **Da ordinare** = fabbisogno − giacenza (modificabile). I prodotti a pezzi (bottiglie, confezioni, mazzi) sono arrotondati per eccesso sede per sede; se il prodotto ha un'unità minima d'acquisto, «Da ordinare» è arrotondato al multiplo superiore (si vede quante confezioni e quanto serviva davvero) e l'eccedenza resta al magazzino centrale. Filtri per fornitore, categoria e sede; righe raggruppate per fornitore, per categoria (con Frutta e Verdura separate) o dalla A alla Z. Testo da copiare/condividere (per tutti o per un fornitore), CSV, **Stampa ordine** (per fornitore) e **Stampa per sede** (cosa va a ciascuna sede). **Merce ricevuta** carica in dispensa le quantità effettive.

**Impostazioni** — sincronizzazione, import/export, sedi, fornitori, categorie, movimenti recenti.

Il bollino in alto indica lo stato della sincronizzazione: verde sincronizzato, arancione modifiche non ancora inviate, blu in corso, rosso errore o offline, grigio non collegato.

## Dati: nessun dato della scuola nel repo pubblico

- **Repo dell'app** (questi file), pubblico per GitHub Pages: contiene solo codice. `.gitignore` esclude la cartella `privato/` e i documenti (`.docx`, `.pdf`, `.xlsx`).
- **Repo dei dati**, **privato** (es. `magazzino-dati`): l'app ci scrive `magazzino.json` e un backup al giorno in `backup/`. Repo e token si inseriscono in Impostazioni e restano solo nel browser del dispositivo.

Per partire con sedi e fornitori già impostati: Impostazioni → **Ripristina / unisci da file** → `privato/dati-iniziali.json` (file locale, non pubblicato). Basta farlo su un dispositivo collegato: gli altri lo ricevono con la sincronizzazione.

## Pubblicazione (GitHub Pages)

1. Crea un repo pubblico (es. `magazzino-scuola`) e carica questi file nella radice.
2. Settings → Pages → *Deploy from a branch* → `main` / root. L'app sarà su `https://<utente>.github.io/magazzino-scuola/`.
3. Da telefono: apri l'indirizzo in Chrome → menu → **Installa app**. Da PC: icona «installa» nella barra degli indirizzi.

## Creare il token (una tantum, 5 minuti)

1. Su GitHub crea il repo **privato** dei dati (es. `magazzino-dati`), anche vuoto.
2. **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token.**
3. Nome: «Magazzino Scuola». Scadenza: la più lunga disponibile (segnati la data: alla scadenza l'app dirà «Token non valido o scaduto» e basterà incollarne uno nuovo).
4. **Repository access → Only select repositories → `magazzino-dati`** (solo quello).
5. **Permissions → Repository permissions → Contents: Read and write.** Nient'altro.
6. Genera e copia il token (`github_pat_…`): si vede una sola volta.
7. Nell'app: **Impostazioni → Collega GitHub**, scrivi `utente/magazzino-dati`, incolla il token, premi *Verifica* (deve dire «privato») e poi *Salva e sincronizza*. Ripeti sull'altro dispositivo con lo stesso token.

Il token dà accesso soltanto a quel repo privato: in caso di furto del telefono revocalo da GitHub e creane uno nuovo.

## Prova in locale

```
cd magazzino-scuola
python3 -m http.server 8080     # poi apri http://localhost:8080
node test/core.test.js          # test della logica
```

## Idee per dopo

Storico consumi per prodotto e per piano, prezzi e costo per classe, notifiche di scorta minima, giacenze separate per sede (se ogni sede ha il suo magazzino).
