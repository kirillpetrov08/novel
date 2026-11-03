/* ============================================================
   ВАЛИДАТОР ИСТОРИИ (браузерная версия; та же логика, что tools/validate.mjs).
   Битый файл никогда не уронит приложение: он просто не попадёт
   в библиотеку, а причина покажется в «Диагностике».
   ============================================================ */
function validateStory(story) {
  const errors = [], warnings = [];
  const err = m => errors.push(m), warn = m => warnings.push(m);
  const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
  if (!isObj(story)) return { errors: ['Не объект истории'], warnings };
  for (const f of ['id', 'title', 'description', 'start', 'scenes'])
    if (!story[f]) err(`Нет обязательного поля "${f}"`);
  for (const f of ['id', 'title', 'description', 'start'])
    if (story[f] !== undefined && typeof story[f] !== 'string') err(`Поле "${f}" должно быть строкой`);
  if (story.id && !/^[a-z0-9-]+$/.test(story.id))
    err(`id "${story.id}" — только латиница, цифры и дефис`);
  if (story.format !== undefined && !['short', 'long'].includes(story.format))
    err(`format "${story.format}" — допустимы только "short" или "long"`);
  if (story.estimatedMinutes !== undefined && (!Number.isFinite(story.estimatedMinutes) || story.estimatedMinutes < 0))
    err('estimatedMinutes должно быть неотрицательным числом');
  if (story.format === 'long' && (story.estimatedMinutes || 0) < 45)
    warn('format "long", а estimatedMinutes < 45 — проверь длительность');
  if (story.cover !== undefined && typeof story.cover !== 'string') err('cover должно быть строкой-путем');

  if (story.scenes !== undefined && !isObj(story.scenes)) err('scenes должно быть объектом сцен');
  if (story.stats !== undefined && !isObj(story.stats)) err('stats должно быть объектом характеристик');
  if (story.characters !== undefined && !isObj(story.characters)) err('characters должно быть объектом персонажей');
  const scenes = isObj(story.scenes) ? story.scenes : {};
  const stats = isObj(story.stats) ? story.stats : {};
  const chars = isObj(story.characters) ? story.characters : {};
  Object.entries(stats).forEach(([id, meta]) => {
    if (!isObj(meta) || typeof meta.label !== 'string') warn(`Характеристика "${id}": нет объекта {label, icon}`);
  });
  Object.entries(chars).forEach(([id, ch]) => {
    if (!isObj(ch)) { err(`Персонаж "${id}": не объект`); return; }
    if (!ch.name || typeof ch.name !== 'string') warn(`Персонаж "${id}": нет строкового name`);
    if (ch.image !== undefined && typeof ch.image !== 'string') err(`Персонаж "${id}": image должно быть строкой-путем`);
  });
  if (story.start && !scenes[story.start]) err(`Стартовой сцены "${story.start}" нет в scenes`);

  const checkStatMap = (sceneId, label, map, choiceNo) => {
    if (map === undefined) return;
    if (!isObj(map)) { err(`Сцена "${sceneId}", выбор ${choiceNo}: ${label} должно быть объектом`); return; }
    Object.entries(map).forEach(([stat, value]) => {
      if (!stats[stat]) err(`Сцена "${sceneId}", выбор ${choiceNo}: ${label} ссылается на необъявленную характеристику "${stat}"`);
      if (!Number.isFinite(value)) err(`Сцена "${sceneId}", выбор ${choiceNo}: ${label}.${stat} должно быть конечным числом`);
    });
  };

  const refs = new Set(); let endings = 0, choices = 0, paid = 0;
  for (const [id, sc] of Object.entries(scenes)) {
    if (!isObj(sc)) { err(`Сцена "${id}": не объект`); continue; }
    if (sc.bg !== undefined && typeof sc.bg !== 'string') err(`Сцена "${id}": bg должно быть строкой-путем`);
    if (sc.cg !== undefined && typeof sc.cg !== 'string') err(`Сцена "${id}": cg должно быть строкой-путем`);

    const lines = Array.isArray(sc.lines) ? sc.lines : [];
    if (!lines.length) err(`Сцена "${id}": нет lines`);
    lines.forEach((ln, i) => {
      if (!isObj(ln)) { err(`Сцена "${id}", строка ${i + 1}: не объект`); return; }
      if (!ln.text || typeof ln.text !== 'string') err(`Сцена "${id}", строка ${i + 1}: нет строкового text`);
      else if (ln.text.length > 240) warn(`Сцена "${id}", строка ${i + 1}: ${ln.text.length} симв. (>240 — риск переполнения)`);
      if (!['narration', 'dialogue', 'thought', 'system'].includes(ln.type))
        err(`Сцена "${id}", строка ${i + 1}: неизвестный type "${ln.type}"`);
      if (ln.who !== undefined && !chars[ln.who]) err(`Сцена "${id}", строка ${i + 1}: персонаж "${ln.who}" не объявлен в characters`);
      if (ln.type === 'dialogue' && !ln.who) err(`Сцена "${id}", строка ${i + 1}: dialogue без who`);
    });

    if (sc.show !== undefined && !Array.isArray(sc.show)) err(`Сцена "${id}": show должно быть массивом`);
    (Array.isArray(sc.show) ? sc.show : []).forEach(c => {
      if (typeof c !== 'string' || !chars[c]) err(`Сцена "${id}": в show неизвестный персонаж "${c}"`);
    });

    const targets = [];
    const sceneChoices = Array.isArray(sc.choices) ? sc.choices : [];
    if (sc.choices !== undefined && !Array.isArray(sc.choices)) err(`Сцена "${id}": choices должно быть массивом`);
    sceneChoices.forEach((ch, i) => {
      choices++;
      if (!isObj(ch)) { err(`Сцена "${id}", выбор ${i + 1}: не объект`); return; }
      if (!ch.text || typeof ch.text !== 'string') err(`Сцена "${id}", выбор ${i + 1}: нет строкового text`);
      else if (ch.text.length > 70) warn(`Сцена "${id}", выбор ${i + 1}: текст длиннее 70 симв.`);
      if (!ch.next || typeof ch.next !== 'string') err(`Сцена "${id}", выбор ${i + 1}: нет строкового next`);
      else if (!scenes[ch.next]) err(`Сцена "${id}", выбор ${i + 1}: ведёт в несуществующую "${ch.next}"`);
      else targets.push(ch.next);
      if (ch.crystals !== undefined) {
        if (!Number.isInteger(ch.crystals) || ![0, 5].includes(ch.crystals))
          err(`Сцена "${id}", выбор ${i + 1}: платный выбор должен стоить ровно 5 ◆`);
        else if (ch.crystals === 5) paid++;
      }
      checkStatMap(id, 'effect', ch.effect, i + 1);
      checkStatMap(id, 'requires', ch.requires, i + 1);
    });

    if (sc.next !== undefined) {
      if (typeof sc.next !== 'string' || !sc.next) err(`Сцена "${id}": next должно быть строкой`);
      else if (!scenes[sc.next]) err(`Сцена "${id}": next → несуществующая "${sc.next}"`);
      else targets.push(sc.next);
    }

    const branches = Array.isArray(sc.branch) ? sc.branch : [];
    if (sc.branch !== undefined && !Array.isArray(sc.branch)) err(`Сцена "${id}": branch должно быть массивом`);
    branches.forEach((b, i) => {
      if (!isObj(b)) { err(`Сцена "${id}", branch ${i + 1}: не объект`); return; }
      if (!b.to || typeof b.to !== 'string') err(`Сцена "${id}", branch ${i + 1}: нет строкового to`);
      else if (!scenes[b.to]) err(`Сцена "${id}", branch ${i + 1}: → несуществующая "${b.to}"`);
      else targets.push(b.to);
      if (!isObj(b.if)) { err(`Сцена "${id}", branch ${i + 1}: нет объекта if`); return; }
      if (!b.if.stat || !stats[b.if.stat]) err(`Сцена "${id}", branch ${i + 1}: if.stat ссылается на необъявленную характеристику "${b.if.stat}"`);
      const thresholds = ['gte', 'lte', 'eq'].filter(k => b.if[k] !== undefined);
      if (!thresholds.length) err(`Сцена "${id}", branch ${i + 1}: в if нет порога gte/lte/eq`);
      thresholds.forEach(k => {
        if (!Number.isFinite(b.if[k])) err(`Сцена "${id}", branch ${i + 1}: if.${k} должно быть конечным числом`);
      });
    });
    if (branches.length && !sceneChoices.length && !sc.ending && !sc.next)
      err(`Сцена "${id}": у branch нет запасного next, если ни одно условие не сработает`);

    targets.forEach(t => refs.add(t));
    if (sc.ending !== undefined) {
      endings++;
      if (!isObj(sc.ending)) err(`Сцена "${id}": ending должно быть объектом`);
      else {
        if (!sc.ending.title || typeof sc.ending.title !== 'string') err(`Сцена "${id}": у ending нет строкового title`);
        if (typeof sc.ending.text !== 'string') err(`Сцена "${id}": у ending.text должна быть строка`);
        else if (!sc.ending.text.trim()) warn(`Сцена "${id}": ending.text пуст (финальный текст останется только в репликах)`);
        if (typeof sc.ending.badge !== 'string') err(`Сцена "${id}": у ending.badge должна быть строка`);
        else if (!sc.ending.badge.trim()) warn(`Сцена "${id}": ending.badge пуст`);
      }
      if (sceneChoices.length) warn(`Сцена "${id}": choices рядом с ending недостижимы`);
    }
    if (sceneChoices.length && branches.length) warn(`Сцена "${id}": branch рядом с choices движком не используется`);
    if (!sceneChoices.length && !sc.next && !branches.length && !sc.ending)
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
