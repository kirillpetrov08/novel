// Проверка историй перед коммитом.
//   node tools/validate.mjs stores/1.json   — один файл
//   node tools/validate.mjs stores          — все номерные файлы папки (1.json, 2.json, …)
// Проверяет: битые ссылки на сцены, недостижимые сцены, тупики без финала,
// дубли id, слишком длинные строки (риск «вылезшего» текста в приложении).
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

export function validateStory(story) {
  const errors = [], warnings = [];
  const err = m => errors.push(m), warn = m => warnings.push(m);
  if (!story || typeof story !== 'object' || Array.isArray(story))
    return { errors: ['Не объект истории'], warnings, info: {} };
  for (const f of ['id', 'title', 'description', 'start', 'scenes'])
    if (!story[f]) err(`Нет обязательного поля "${f}"`);
  if (story.id && !/^[a-z0-9-]+$/.test(story.id)) err(`id "${story.id}" — только латиница, цифры и дефис`);

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

function normalize(data) {
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.stories)) return data.stories;
  if (data && typeof data === 'object') return [data];
  return [];
}

function checkFile(path, seenIds) {
  let data;
  try { data = JSON.parse(readFileSync(path, 'utf8')); }
  catch (e) { console.log(`✗ ${path}: JSON не читается — ${e.message}`); return 1; }
  const list = normalize(data);
  if (!list.length) { console.log(`✗ ${path}: историй внутри нет`); return 1; }
  let bad = 0;
  for (const story of list) {
    const { errors, warnings, info } = validateStory(story);
    if (story.id && seenIds.has(story.id)) errors.push(`Дублирующийся id "${story.id}" (уже встречался в другом файле)`);
    if (story.id) seenIds.add(story.id);
    console.log(`\n${path} → «${story.title || story.id || '?'}»: сцен ${info.scenes}, выборов ${info.choices} (платных ${info.paid}), финалов ${info.endings}`);
    warnings.forEach(w => console.log('  ⚠ ' + w));
    errors.forEach(e => console.log('  ✗ ' + e));
    console.log(errors.length ? `  ИТОГ: ${errors.length} ошибок — коммитить нельзя` : '  ИТОГ: ошибок нет ✓');
    if (errors.length) bad++;
  }
  return bad;
}

const target = process.argv[2];
if (!target) { console.error('Использование: node tools/validate.mjs stores/1.json | stores'); process.exit(1); }
const seen = new Set(); let badTotal = 0;
if (statSync(target).isDirectory()) {
  const files = readdirSync(target).filter(f => /^\d+\.json$/.test(f)).sort((a, b) => parseInt(a) - parseInt(b));
  if (!files.length) console.log(`В ${target}/ пока нет номерных файлов (1.json, 2.json, …) — проверять нечего.`);
  // проверка непрерывности нумерации
  files.forEach((f, i) => { if (parseInt(f) !== i + 1) console.log(`⚠ Пропуск в нумерации: ожидался ${i + 1}.json, найден ${f} — приложение остановится на пропуске`); });
  files.forEach(f => { badTotal += checkFile(join(target, f), seen); });
} else {
  badTotal += checkFile(target, seen);
}
process.exit(badTotal ? 1 : 0);
