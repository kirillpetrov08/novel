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
  if (!story || typeof story !== 'object' || Array.isArray(story))
    return { errors: ['Не объект истории'], warnings, info: {} };
  for (const f of ['id', 'title', 'description', 'start', 'scenes'])
    if (!story[f]) err(`Нет обязательного поля "${f}"`);
  if (story.id && !/^[a-z0-9-]+$/.test(story.id)) err(`id "${story.id}" — только латиница, цифры и дефис`);
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
      else if (String(ln.text).length > 240) warn(`Сцена "${id}", строка ${i + 1}: ${String(ln.text).length} симв. (>240 — риск переполнения экрана)`);
      if (ln && ln.who && !chars[ln.who]) err(`Сцена "${id}", строка ${i + 1}: персонаж "${ln.who}" не объявлен в characters`);
      if (ln && !['narration', 'dialogue', 'thought', 'system'].includes(ln.type)) warn(`Сцена "${id}", строка ${i + 1}: неизвестный type "${ln.type}"`);
    });
    (sc.show || []).forEach(c => { if (!chars[c]) err(`Сцена "${id}": в show неизвестный персонаж "${c}"`); });
    const targets = [];
    (sc.choices || []).forEach((ch, i) => {
      choices++; if (ch.crystals) paid++;
      if (!ch.text) err(`Сцена "${id}", выбор ${i + 1}: нет text`);
      else if (String(ch.text).length > 70) warn(`Сцена "${id}", выбор ${i + 1}: текст ${String(ch.text).length} симв. (>70 — длинноват для кнопки)`);
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
  Object.values(story.scenes || {}).forEach(sc => add(sc.bg));
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
    storyImagePaths(story).forEach(p => {
      if (/^(https?:|data:)/.test(p)) return;
      if (!existsSync(join(imgBase, p))) warnings.push(`Картинка не найдена: ${p} (в приложении вместо неё будет градиент/монограмма)`);
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
    numbers.forEach((n, idx) => { if (n !== idx + 1) console.log(`⚠ Пропуск в нумерации: есть ${numbers.join(', ')} — должны идти подряд 1, 2, 3…`); });
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
