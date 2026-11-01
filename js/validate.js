/* ============================================================
   ВАЛИДАТОР ИСТОРИИ (браузерная версия; та же логика, что tools/validate.mjs).
   Битый файл никогда не уронит приложение: он просто не попадёт
   в библиотеку, а причина покажется в «Диагностике».
   ============================================================ */
function validateStory(story) {
  const errors = [], warnings = [];
  const err = m => errors.push(m), warn = m => warnings.push(m);
  if (!story || typeof story !== 'object' || Array.isArray(story))
    return { errors: ['Не объект истории'], warnings };
  for (const f of ['id', 'title', 'description', 'start', 'scenes'])
    if (!story[f]) err(`Нет обязательного поля "${f}"`);
  if (story.id && !/^[a-z0-9-]+$/.test(story.id))
    err(`id "${story.id}" — только латиница, цифры и дефис`);
  if (story.format !== undefined && !['short', 'long'].includes(story.format))
    err(`format "${story.format}" — допустимы только "short" или "long"`);
  if (story.format === 'long' && (story.estimatedMinutes || 0) < 45)
    warn('format "long", а estimatedMinutes < 45 — проверь длительность');

  const scenes = (story.scenes && typeof story.scenes === 'object') ? story.scenes : {};
  const stats = story.stats || {}, chars = story.characters || {};
  if (story.start && !scenes[story.start]) err(`Стартовой сцены "${story.start}" нет в scenes`);

  const refs = new Set(); let endings = 0, choices = 0, paid = 0;
  for (const [id, sc] of Object.entries(scenes)) {
    if (!Array.isArray(sc.lines) || !sc.lines.length) err(`Сцена "${id}": нет lines`);
    (sc.lines || []).forEach((ln, i) => {
      if (!ln || !ln.text) err(`Сцена "${id}", строка ${i + 1}: нет text`);
      else if (String(ln.text).length > 240) warn(`Сцена "${id}", строка ${i + 1}: ${String(ln.text).length} симв. (>240 — риск переполнения)`);
      if (ln && ln.who && !chars[ln.who]) err(`Сцена "${id}", строка ${i + 1}: персонаж "${ln.who}" не объявлен в characters`);
    });
    (sc.show || []).forEach(c => { if (!chars[c]) err(`Сцена "${id}": в show неизвестный персонаж "${c}"`); });
    const targets = [];
    (sc.choices || []).forEach((ch, i) => {
      choices++; if (ch.crystals) paid++;
      if (!ch.text) err(`Сцена "${id}", выбор ${i + 1}: нет text`);
      else if (String(ch.text).length > 70) warn(`Сцена "${id}", выбор ${i + 1}: текст длиннее 70 симв.`);
      if (!ch.next) err(`Сцена "${id}", выбор ${i + 1}: нет next`);
      else if (!scenes[ch.next]) err(`Сцена "${id}", выбор ${i + 1}: ведёт в несуществующую "${ch.next}"`);
      else targets.push(ch.next);
      for (const s of Object.keys(ch.effect || {})) if (!stats[s]) warn(`Сцена "${id}": effect меняет необъявленную характеристику "${s}"`);
      for (const s of Object.keys(ch.requires || {})) if (!stats[s]) warn(`Сцена "${id}": requires ссылается на необъявленную "${s}"`);
    });
    if (sc.next) { if (!scenes[sc.next]) err(`Сцена "${id}": next → несуществующая "${sc.next}"`); else targets.push(sc.next); }
    (sc.branch || []).forEach(b => { if (!scenes[b.to]) err(`Сцена "${id}": branch → несуществующая "${b.to}"`); else targets.push(b.to); });
    targets.forEach(t => refs.add(t));
    if (sc.ending) endings++;
    if (!(sc.choices || []).length && !sc.next && !(sc.branch || []).length && !sc.ending)
      err(`Сцена "${id}": тупик — нет choices, next, branch и ending`);
  }
  Object.keys(scenes).filter(id => id !== story.start && !refs.has(id))
    .forEach(id => warn(`Сцена "${id}" недостижима`));
  if (!endings) err('Нет ни одного финала (ending)');
  if (endings && endings < 2) warn(`Финалов: ${endings}. Рекомендуется 2–4`);
  return { errors, warnings, info: { scenes: Object.keys(scenes).length, endings, choices, paid } };
}

/* Файл из stores может быть: одна история | массив историй | {stories:[...]}.
   Нормализуем всё к массиву историй. */
function normalizeBundle(data) {
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.stories)) return data.stories;
  if (data && typeof data === 'object') return [data];
  return [];
}
