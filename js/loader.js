/* ============================================================
   ЗАГРУЗЧИК ИСТОРИЙ ИЗ ПАПКИ stores/

   Как добавить историю (для владельца репозитория):
     1. Положи файл stores/N.json, где N — следующий номер: 1, 2, 3, …
        Номера идут подряд, без пропусков.
     2. Закоммить. Приложение само найдёт файл при загрузке.

   Как это работает технически:
     • Сначала пробуем stores/index.json (необязательный манифест):
         [1,2,3]  |  ["1.json","2.json"]  |  {"count":3}  |  {"stories":[...]}
     • Если манифеста нет — перебираем 1.json, 2.json, 3.json, …
       и останавливаемся на первом отсутствующем номере.
     • Каждый файл может содержать одну историю, массив историй
       или {"stories":[...]}.
     • Битый файл пропускается, причина пишется в Loader.diagnostics
       и показывается в библиотеке — приложение не падает.

   ВАЖНО: fetch работает только через http(s). Если открыть
   index.html двойным кликом (file://), браузер запретит чтение
   файлов — запусти локальный сервер (см. README) или используй
   кнопку «Импорт» в приложении.
   ============================================================ */

const Loader = {
  stories: new Map(),     // id -> { story, source: 'stores/1.json' | 'import' }
  diagnostics: [],        // { file, message, kind: 'error'|'warning' }
  fileProtocol: location.protocol === 'file:',

  diag(file, message, kind = 'error') { this.diagnostics.push({ file, message, kind }); },

  register(story, source) {
    const { errors, warnings } = validateStory(story);
    warnings.forEach(w => this.diag(source, `«${story.title || story.id || '?'}»: ${w}`, 'warning'));
    if (errors.length) {
      errors.slice(0, 6).forEach(e => this.diag(source, `«${story.title || story.id || '?'}»: ${e}`));
      if (errors.length > 6) this.diag(source, `…и ещё ${errors.length - 6} ошибок (полный список: node tools/validate.mjs)`);
      return false;
    }
    if (this.stories.has(story.id)) {
      this.diag(source, `Дублирующийся id "${story.id}" — история пропущена`, 'warning');
      return false;
    }
    this.stories.set(story.id, { story, source });
    return true;
  },

  registerBundle(data, source) {
    const list = normalizeBundle(data);
    if (!list.length) { this.diag(source, 'Файл пуст или не содержит историй'); return 0; }
    let ok = 0;
    list.forEach(s => { if (this.register(s, source)) ok++; });
    return ok;
  },

  async fetchJson(path) {
    const r = await fetch(path, { cache: 'no-cache' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json(); // бросит ошибку при битом JSON — ловим снаружи
  },

  /* Список файлов из манифеста, или null если манифеста нет. */
  async manifestFiles(folder) {
    try {
      const m = await this.fetchJson(`${folder}/index.json`);
      if (Array.isArray(m)) return m.map(x => (typeof x === 'number' ? `${x}.json` : String(x)));
      if (m && Number.isInteger(m.count)) return Array.from({ length: m.count }, (_, i) => `${i + 1}.json`);
      if (m && Array.isArray(m.files)) return m.files.map(String);
      if (m && Array.isArray(m.stories) && m.stories.length && typeof m.stories[0] === 'string') return m.stories;
      if (m && Array.isArray(m.stories)) { this.registerBundle(m, `${folder}/index.json`); return []; }
      return [];
    } catch (e) { return null; }
  },

  async loadFromStores(onProgress) {
    if (this.fileProtocol) return; // fetch запрещён браузером — покажем подсказку в UI
    const folder = CONFIG.stores.folder;
    const files = await this.manifestFiles(folder);

    if (files) {
      for (const f of files) {
        const name = f.includes('/') ? f : `${folder}/${f}`;
        try { this.registerBundle(await this.fetchJson(name), name); }
        catch (e) { this.diag(name, 'Не удалось загрузить или JSON битый: ' + e.message); }
        onProgress && onProgress();
      }
      return;
    }
    // Без манифеста: 1.json, 2.json, … до первого отсутствующего номера.
    // Битый JSON в одном файле не останавливает загрузку: он пропускается
    // с записью в диагностику (страховка — 3 сбоя подряд = стоп).
    let failStreak = 0;
    for (let n = 1; n <= CONFIG.stores.maxProbe; n++) {
      const name = `${folder}/${n}.json`;
      let data;
      try { data = await this.fetchJson(name); }
      catch (e) {
        if (String(e.message).includes('404')) break;         // номеров дальше нет — нормальная остановка
        this.diag(name, 'Не удалось загрузить или JSON битый: ' + e.message);
        if (++failStreak >= 3) break;
        continue;
      }
      failStreak = 0;
      this.registerBundle(data, name);
      onProgress && onProgress();
    }
  },

  loadImported() {
    (Store.data.imported || []).forEach(s => this.register(s, 'import'));
  },

  /* Импорт из UI: текст JSON (файл или вставка). Возвращает {ok, added, errors[]}. */
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
