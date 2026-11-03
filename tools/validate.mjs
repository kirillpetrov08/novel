// Проверка историй перед коммитом и перед сборкой Android.
//   node tools/validate.mjs stores/1/story.json  — один файл
//   node tools/validate.mjs stores               — все папки историй (1/, 2/, …)
//   npm run validate                             — то же самое
// Проверяет: битые ссылки на сцены, недостижимые сцены, тупики без финала,
// дубли id, слишком длинные строки, наличие картинок рядом с story.json.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';

export function validateStory(story) {
  const errors = [], warnings = [];
  const err = m => errors.push(m), warn = m => warnings.push(m);
  const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
  if (!isObj(story)) return { errors: ['Не объект истории'], warnings, info: {} };
  for (const f of ['id', 'title', 'description', 'start', 'scenes'])
    if (!story[f]) err(`Нет обязательного поля "${f}"`);
  for (const f of ['id', 'title', 'description', 'start'])
    if (story[f] !== undefined && typeof story[f] !== 'string') err(`Поле "${f}" должно быть строкой`);
  if (story.id && !/^[a-z0-9-]+$/.test(story.id)) err(`id "${story.id}" — только латиница, цифры и дефис`);
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
    if (sc.fx !== undefined && !['snow', 'rain'].includes(sc.fx)) err(`Сцена "${id}": fx допустим только "snow" или "rain"`);

    const lines = Array.isArray(sc.lines) ? sc.lines : [];
    if (!lines.length) err(`Сцена "${id}": нет lines`);
    lines.forEach((ln, i) => {
      if (!isObj(ln)) { err(`Сцена "${id}", строка ${i + 1}: не объект`); return; }
      if (!ln.text || typeof ln.text !== 'string') err(`Сцена "${id}", строка ${i + 1}: нет строкового text`);
      else if (ln.text.length > 240) warn(`Сцена "${id}", строка ${i + 1}: ${ln.text.length} симв. (>240 — риск переполнения экрана)`);
      if (!['narration', 'dialogue', 'thought', 'system'].includes(ln.type))
        err(`Сцена "${id}", строка ${i + 1}: неизвестный type "${ln.type}"`);
      if (ln.who !== undefined && !chars[ln.who]) err(`Сцена "${id}", строка ${i + 1}: персонаж "${ln.who}" не объявлен в characters`);
      if (ln.type === 'dialogue' && !ln.who) err(`Сцена "${id}", строка ${i + 1}: dialogue без who`);
    });

    if (sc.show !== undefined && !Array.isArray(sc.show)) err(`Сцена "${id}": show должно быть массивом`);
    (Array.isArray(sc.show) ? sc.show : []).forEach(c => {
      if (typeof c !== 'string' || !chars[c]) err(`Сцена "${id}": в show неизвестный персонаж "${c}"`);
    });
    if (!sc.cg) {
      const shownNames = new Set((Array.isArray(sc.show) ? sc.show : []).map(c => chars[c] && chars[c].name).filter(Boolean));
      const warnedSpeakers = new Set();
      lines.forEach(ln => {
        if (!isObj(ln) || !chars[ln.who] || shownNames.has(chars[ln.who].name) || warnedSpeakers.has(ln.who)) return;
        warnedSpeakers.add(ln.who);
        warn(`Сцена "${id}": говорящий "${ln.who}" отсутствует в show (допустимо только для голоса за кадром)`);
      });
    }

    const targets = [];
    const sceneChoices = Array.isArray(sc.choices) ? sc.choices : [];
    if (sc.choices !== undefined && !Array.isArray(sc.choices)) err(`Сцена "${id}": choices должно быть массивом`);
    sceneChoices.forEach((ch, i) => {
      choices++;
      if (!isObj(ch)) { err(`Сцена "${id}", выбор ${i + 1}: не объект`); return; }
      if (!ch.text || typeof ch.text !== 'string') err(`Сцена "${id}", выбор ${i + 1}: нет строкового text`);
      else if (ch.text.length > 70) warn(`Сцена "${id}", выбор ${i + 1}: текст ${ch.text.length} симв. (>70 — длинноват для кнопки)`);
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
    .forEach(id => warn(`Сцена "${id}" недостижима (на неё никто не ведёт)`));
  if (!endings) err('Нет ни одного финала (ending)');
  if (endings && endings < 2) warn(`Финалов: ${endings}. Рекомендуется 2–4 разных финала`);
  return { errors, warnings, info: { scenes: Object.keys(scenes).length, endings, choices, paid } };
}

export function normalizeBundle(data) {
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.stories)) return data.stories;
  if (data && typeof data === 'object') return [data];
  return [];
}

/* Все картинки, на которые ссылается история (относительные пути). */
export function storyImagePaths(story) {
  const out = new Set();
  const add = p => { if (p && typeof p === 'string') out.add(p); };
  add(story.cover);
  Object.values(story.characters || {}).forEach(c => add(c.image));
  Object.values(story.scenes || {}).forEach(sc => { add(sc.bg); add(sc.cg); });
  return [...out];
}

function checkFile(path, seenIds) {
  let data;
  try { data = JSON.parse(readFileSync(path, 'utf8')); }
  catch (e) { console.log(`✗ ${path}: JSON не читается — ${e.message}`); return 1; }
  const list = normalizeBundle(data);
  if (!list.length) { console.log(`✗ ${path}: историй внутри нет`); return 1; }
  const imgBase = basename(path) === 'story.json' ? dirname(path) : '.'; // картинки лежат рядом с story.json
  let bad = 0;
  for (const story of list) {
    const { errors, warnings, info } = validateStory(story);
    if (story.id && seenIds.has(story.id)) errors.push(`Дублирующийся id "${story.id}" (уже встречался в другой истории)`);
    if (story.id) seenIds.add(story.id);
    const isTemplate = path.split(/[\\/]/).includes('_template');
    storyImagePaths(story).forEach(p => {
      if (/^(https?:|data:)/.test(p)) return;
      if (!existsSync(join(imgBase, p))) {
        // В _template пути — примеры-заглушки; в настоящей истории отсутствующий файл — ошибка сборки.
        (isTemplate ? warnings : errors).push(`Картинка не найдена: ${p}`);
      }
    });
    console.log(`\n${path} → «${story.title || story.id || '?'}»: сцен ${info.scenes}, выборов ${info.choices} (платных ${info.paid}), финалов ${info.endings}`);
    warnings.forEach(w => console.log('  ⚠ ' + w));
    errors.forEach(e => console.log('  ✗ ' + e));
    console.log(errors.length ? `  ИТОГ: ${errors.length} ошибок — коммитить/собирать нельзя` : '  ИТОГ: ошибок нет ✓');
    if (errors.length) bad++;
  }
  return bad;
}

/* Список номерных историй в папке stores/: папки N/story.json и (legacy) файлы N.json. */
export function scanStoresDir(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (/^\d+$/.test(name) && statSync(full).isDirectory()) {
      const jf = join(full, 'story.json');
      out.push({ n: parseInt(name, 10), kind: 'folder', jsonPath: jf, exists: existsSync(jf), base: `${dir}/${name}/` });
    } else if (/^\d+\.json$/.test(name)) {
      out.push({ n: parseInt(name, 10), kind: 'file', jsonPath: full, exists: true, base: '' });
    }
  }
  return out.sort((a, b) => a.n - b.n || (a.kind === 'folder' ? -1 : 1));
}

function main() {
  const target = process.argv[2];
  if (!target) { console.error('Использование: node tools/validate.mjs stores/1/story.json | stores'); process.exit(1); }
  const seen = new Set(); let badTotal = 0;
  if (statSync(target).isDirectory()) {
    const items = scanStoresDir(target);
    if (!items.length) console.log(`В ${target}/ пока нет папок историй (1/story.json, 2/story.json, …) — проверять нечего.`);
    const numbers = [...new Set(items.map(i => i.n))];
    if (numbers.some((n, idx) => n !== idx + 1)) {
      console.log(`✗ Пропуск в нумерации: есть ${numbers.join(', ')} — должны идти подряд 1, 2, 3…`);
      badTotal++;
    }
    for (const it of items) {
      if (!it.exists) { console.log(`✗ ${target}/${it.n}/: папка есть, но нет story.json`); badTotal++; continue; }
      badTotal += checkFile(it.jsonPath, seen);
    }
  } else {
    badTotal += checkFile(target, seen);
  }
  process.exit(badTotal ? 1 : 0);
}

if (process.argv[1]?.endsWith('validate.mjs')) main();
