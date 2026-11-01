/* github.js — sincronizzazione del file JSON in un repo GitHub privato (Contents API).
 * Configurazione: repo "utente/nome-repo", token fine-grained con permesso Contents (lettura e scrittura)
 * limitato a quel solo repo. Nessun server: il browser parla direttamente con api.github.com. */
(function (root) {
  'use strict';
  const API = 'https://api.github.com';
  const KEY = 'mag.gh';

  function config() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } }
  function setConfig(c) {
    const cur = config();
    const next = { repo: (c.repo ?? cur.repo ?? '').trim().replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '').replace(/\/+$/, ''),
      token: (c.token ?? cur.token ?? '').trim(), path: (c.path ?? cur.path ?? 'magazzino.json').trim().replace(/^\/+/, ''), branch: (c.branch ?? cur.branch ?? '').trim() };
    localStorage.setItem(KEY, JSON.stringify(next));
    localStorage.removeItem('mag.sha');
    return next;
  }
  function configured() { const c = config(); return !!(c.repo && c.token && c.path); }
  function loggedIn() { return configured(); }
  function logout() { localStorage.removeItem(KEY); localStorage.removeItem('mag.sha'); localStorage.removeItem('mag.lastSync'); localStorage.removeItem('mag.lastBackup'); }

  // ---- utilità base64 UTF-8 ----
  function enc(str) { const b = new TextEncoder().encode(str); let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(s); }
  function dec(b64) { const s = atob(b64.replace(/\n/g, '')); const b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i); return new TextDecoder().decode(b); }

  async function api(path, opt = {}) {
    const c = config();
    const r = await fetch(API + path, Object.assign({}, opt, { headers: Object.assign({
      Authorization: 'Bearer ' + c.token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }, opt.headers || {}) }));
    if (r.status === 401) throw new Error('Token GitHub non valido o scaduto: inseriscine uno nuovo in Impostazioni');
    if (r.status === 403 && /rate limit/i.test(await r.clone().text())) throw new Error('Troppe richieste a GitHub, riprova tra qualche minuto');
    if (r.status === 403) throw new Error('Il token non ha il permesso "Contents: lettura e scrittura" su questo repo');
    return r;
  }
  function fileUrl(p) { const c = config(); return `/repos/${c.repo}/contents/${p.split('/').map(encodeURIComponent).join('/')}` + (c.branch ? `?ref=${encodeURIComponent(c.branch)}` : ''); }

  /** Legge il file remoto. Ritorna {data, sha} oppure null se non esiste ancora. */
  async function download() {
    const c = config();
    const r = await api(fileUrl(c.path));
    if (r.status === 404) {
      // repo inesistente o file assente? distinguiamo per dare un messaggio utile
      const rr = await api(`/repos/${c.repo}`);
      if (rr.status === 404) throw new Error(`Repo "${c.repo}" non trovato (controlla il nome e che il token lo includa)`);
      return null;
    }
    if (!r.ok) throw new Error('GitHub: ' + r.status + ' ' + (await r.text()).slice(0, 200));
    const j = await r.json();
    let text;
    if (j.content) text = dec(j.content);
    else { // file > 1 MB: scarica il contenuto grezzo
      const raw = await api(fileUrl(c.path), { headers: { Accept: 'application/vnd.github.raw+json' } });
      text = await raw.text();
    }
    let data = null; try { data = JSON.parse(text); } catch (e) { throw new Error('Il file su GitHub non è un JSON valido'); }
    return { data, sha: j.sha };
  }

  async function upload(path, content, sha, message) {
    const c = config();
    const body = { message, content: enc(content) };
    if (sha) body.sha = sha;
    if (c.branch) body.branch = c.branch;
    const r = await api(`/repos/${c.repo}/contents/${path.split('/').map(encodeURIComponent).join('/')}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (r.status === 409 || r.status === 422) { const e = new Error('conflitto'); e.conflict = true; throw e; }
    if (!r.ok) throw new Error('GitHub: ' + r.status + ' ' + (await r.text()).slice(0, 200));
    return (await r.json()).content.sha;
  }

  /** Backup datato (al massimo uno al giorno) nella cartella backup/ del repo. */
  async function backup(state) {
    const day = new Date().toISOString().slice(0, 10);
    if (localStorage.getItem('mag.lastBackup') === day) return;
    const p = 'backup/magazzino-' + day + '.json';
    let sha = null;
    const r = await api(fileUrl(p)); if (r.ok) sha = (await r.json()).sha;
    await upload(p, JSON.stringify(state), sha, 'Backup ' + day);
    localStorage.setItem('mag.lastBackup', day);
  }

  /**
   * Sincronizza: scarica il remoto, unisce con il locale (Core.merge), ricarica il risultato.
   * Se nel frattempo il file è cambiato (conflitto di sha) riprova fino a 3 volte.
   */
  async function sync(localState) {
    if (!configured()) throw new Error('GitHub non configurato (Impostazioni → Sincronizzazione)');
    let merged = null;
    for (let tent = 0; tent < 3; tent++) {
      const remote = await download();
      merged = remote && remote.data ? root.Core.merge(localState, remote.data) : root.Core.migrate(localState);
      root.Core.compatta(merged);
      const content = JSON.stringify(merged, null, 1);
      try {
        await upload(config().path, content, remote ? remote.sha : null, 'Aggiornamento magazzino ' + new Date().toLocaleString('it-IT'));
        break;
      } catch (e) { if (!e.conflict || tent === 2) throw e; }
    }
    try { await backup(merged); } catch (e) { console.warn('backup fallito', e); }
    localStorage.setItem('mag.lastSync', new Date().toISOString());
    return merged;
  }

  /** Verifica rapida della configurazione: ritorna il nome del repo se tutto ok. */
  async function test() {
    const c = config();
    const r = await api(`/repos/${c.repo}`);
    if (r.status === 404) throw new Error(`Repo "${c.repo}" non trovato: controlla il nome e che il token includa questo repo`);
    if (!r.ok) throw new Error('GitHub: ' + r.status);
    const j = await r.json();
    if (!j.permissions || !j.permissions.push) throw new Error('Il token può leggere ma non scrivere su questo repo');
    return j.full_name + (j.private ? ' (privato)' : ' (PUBBLICO!)');
  }

  function lastSync() { return localStorage.getItem('mag.lastSync'); }
  function fileLink() { const c = config(); return c.repo ? `https://github.com/${c.repo}/blob/${c.branch || 'main'}/${c.path}` : null; }

  root.Sync = { config, setConfig, configured, loggedIn, logout, sync, test, lastSync, fileLink };
})(window);
