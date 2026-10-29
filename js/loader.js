/* ============================================================
   ЗАГРУЗЧИК ИСТОРИЙ

   ОДНА ИСТОРИЯ = ОДНА ПАПКА в stores/, сюжет и фото вместе:

     stores/1/
       story.json        ← сюжет (пути к картинкам — ОТНОСИТЕЛЬНЫЕ)
       cover.jpg         ← обложка
       images/
         bg-01.jpg       ← фоны сцен
         hero.png        ← персонажи
     stores/2/
       ...

   В story.json картинки указываются относительно папки истории:
   "cover": "cover.jpg", "bg": "images/bg-01.jpg" — загрузчик сам
   подставит префикс "stores/1/". Номера папок идут подряд: 1, 2, 3…

   Откуда истории берутся в разных сборках:
   • ANDROID (RuStore): истории ВШИТЫ в приложение при сборке —
     tools/prepare-www.mjs собирает их в js/stories-bundle.js
     (BUNDLED_BUILD). Сеть и fetch не нужны, приложение офлайн.
   • ВЕБ-РАЗРАБОТКА: перебираем stores/1/story.json, 2/story.json…
     до первого отсутствующего номера (совместимость: старый
     stores/1.json тоже поддерживается).
   • Вкладка «Импорт»: истории из localStorage, добавленные вручную.

   Битый файл никогда не роняет приложение: он пропускается,
   а причина пишется в Loader.diagnostics и видна в библиотеке.
   ============================================================ */

const Loader = {
  stories: new Map(),     // id -> { story, source }
  diagnostics: [],        // { file, message, kind }
  fileProtocol: location.protocol === 'file:',

  diag(file, message, kind = 'error') { this.diagnostics.push({ file, message, kind }); },

  /* Относительные пути картинок превращаем в полные: stores/1/ + cover.jpg.
     Работаем с копией объекта, чтобы не испортить оригинал в хранилище. */
  resolveAssets(story, base) {
    const s = JSON.parse(JSON.stringify(story));
    if (!base) return s;
    const fix = p => {
      if (!p || typeof p !== 'string') return p;
      if (/^(https?:|data:|\/)/.test(p)) return p;
      return base + p.replace(/^\.\//, '');
    };
    s.cover = fix(s.cover);
    Object.values(s.characters || {}).forEach(c => { c.image = fix(c.image); });
    Object.values(s.scenes || {}).forEach(sc => { sc.bg = fix(sc.bg); });
    return s;
  },

  register(story, source, base = '') {
    if (!story || typeof story !== 'object' || Array.isArray(story)) {
      this.diag(source, 'Не объект истории'); return false;
    }
    const { errors, warnings } = validateStory(story);
    warnings.forEach(w => this.diag(source, `«${story.title || story.id || '?'}»: ${w}`, 'warning'));
    if (errors.length) {
      errors.slice(0, 6).forEach(e => this.diag(source, `«${story.title || story.id || '?'}»: ${e}`));
      if (errors.length > 6) this.diag(source, `…и ещё ${errors.length - 6} ошибок (полный список: npm run validate)`);
      return false;
    }
    if (this.stories.has(story.id)) {
      this.diag(source, `Дублирующийся id "${story.id}" — история пропущена`, 'warning');
      return false;
    }
    this.stories.set(story.id, { story: this.resolveAssets(story, base), source });
    return true;
  },

  registerBundle(data, source, base = '') {
    const list = normalizeBundle(data);
    if (!list.length) { this.diag(source, 'Файл пуст или не содержит историй'); return 0; }
    let ok = 0;
    list.forEach(s => { if (this.register(s, source, base)) ok++; });
    return ok;
  },

  /* Android-сборка: истории уже вшиты, сеть не нужна. */
  loadBundled() {
    (window.BUNDLED_STORIES || []).forEach(e => this.register(e.story, e.base || 'встроена', e.base || ''));
    return !!window.BUNDLED_BUILD;
  },

  async fetchJson(path) {
    const r = await fetch(path, { cache: 'no-cache' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  },

  /* Одна попытка загрузить историю номер n: сначала папка n/story.json,
     затем (совместимость) файл n.json. Возвращает: 'ok' | 'missing' | 'broken'. */
  async tryNumber(folder, n) {
    const inFolder = `${folder}/${n}/story.json`;
    try {
      this.registerBundle(await this.fetchJson(inFolder), inFolder, `${folder}/${n}/`);
      return 'ok';
    } catch (e) {
      if (!String(e.message).includes('404')) { this.diag(inFolder, 'JSON битый: ' + e.message); return 'broken'; }
    }
    const flat = `${folder}/${n}.json`;
    try {
      this.registerBundle(await this.fetchJson(flat), flat, '');
      return 'ok';
    } catch (e) {
      if (!String(e.message).includes('404')) { this.diag(flat, 'JSON битый: ' + e.message); return 'broken'; }
    }
    return 'missing';
  },

  async manifestFiles(folder) {
    try {
      const m = await this.fetchJson(`${folder}/index.json`);
      if (Array.isArray(m)) return m;
      if (m && Number.isInteger(m.count)) return Array.from({ length: m.count }, (_, i) => i + 1);
      if (m && Array.isArray(m.files)) return m.files;
      if (m && Array.isArray(m.stories) && m.stories.length && typeof m.stories[0] === 'object') {
        this.registerBundle(m, `${folder}/index.json`); return [];
      }
      return [];
    } catch (e) { return null; }
  },

  async loadFromStores(onProgress) {
    if (this.fileProtocol) return; // браузер запрещает fetch с file:// — UI покажет подсказку
    const folder = CONFIG.stores.folder;
    const manifest = await this.manifestFiles(folder);

    if (manifest) {
      for (const entry of manifest) {
        if (typeof entry === 'number') { await this.tryNumber(folder, entry); }
        else {
          const name = String(entry).includes('/') ? String(entry) : `${folder}/${entry}`;
          const base = name.endsWith('/story.json') ? name.slice(0, -'story.json'.length) : '';
          try { this.registerBundle(await this.fetchJson(name), name, base); }
          catch (e) { this.diag(name, 'Не удалось загрузить или JSON битый: ' + e.message); }
        }
        onProgress && onProgress();
      }
      return;
    }
    let failStreak = 0;
    for (let n = 1; n <= CONFIG.stores.maxProbe; n++) {
      const res = await this.tryNumber(folder, n);
      if (res === 'missing') break;                 // номеров дальше нет
      if (res === 'broken' && ++failStreak >= 3) break;
      if (res === 'ok') { failStreak = 0; onProgress && onProgress(); }
    }
  },

  loadImported() {
    (Store.data.imported || []).forEach(s => this.register(s, 'import'));
  },

  importFromText(text) {
    let data;
    try { data = JSON.parse(text); }
    catch (e) { return { ok: false, added: 0, errors: ['JSON не читается: ' + e.message] }; }
    const before = this.diagnostics.length;
    const list = normalizeBundle(data);
    if (!list.length) return { ok: false, added: 0, errors: ['В данных нет историй'] };
    let added = 0;
    for (const s of list) {
      if (this.register(s, 'import')) { added++; Store.data.imported.push(s); }
    }
    Store.save();
    const errors = this.diagnostics.slice(before).filter(d => d.kind === 'error').map(d => d.message);
    return { ok: added > 0, added, errors };
  },

  removeImported(storyId) {
    Store.data.imported = (Store.data.imported || []).filter(s => s.id !== storyId);
    Store.save();
    this.stories.delete(storyId);
    Store.clearProgress(storyId);
  },

  list() { return [...this.stories.values()]; },
  get(id) { const e = this.stories.get(id); return e ? e.story : null; },
  source(id) { const e = this.stories.get(id); return e ? e.source : ''; },
};
