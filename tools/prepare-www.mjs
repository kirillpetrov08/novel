// Сборка веб-части для Android (Capacitor): папка www/.
//   npm run build:www
// Что делает:
//   1. Сканирует stores/ — папки историй 1/, 2/, … (сюжет + фото вместе).
//   2. Валидирует каждую историю. Ошибка = сборка падает (лучше, чем битый релиз).
//   3. Вшивает сюжеты в www/js/stories-bundle.js — в приложении они работают офлайн.
//   4. Копирует index/css/js/stores(картинки)/assets в www/.
import { rmSync, mkdirSync, cpSync, writeFileSync, readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { validateStory, normalizeBundle, scanStoresDir, storyImagePaths } from './validate.mjs';

const ROOT = process.cwd();
const WWW = join(ROOT, 'www');

// --- 1+2. Истории и валидация ---
const items = scanStoresDir('stores');
const bundle = [];
const problems = [];
const ids = new Set();
const numbers = [...new Set(items.map(i => i.n))];
if (numbers.some((n, idx) => n !== idx + 1)) {
  problems.push(`stores/: пропуск в нумерации (${numbers.join(', ')}) — папки должны идти подряд 1, 2, 3…`);
}
for (const it of items) {
  if (!it.exists) { problems.push(`stores/${it.n}/: нет story.json`); continue; }
  let data;
  try { data = JSON.parse(readFileSync(it.jsonPath, 'utf8')); }
  catch (e) { problems.push(`${it.jsonPath}: JSON не читается (${e.message})`); continue; }
  const stories = normalizeBundle(data);
  if (!stories.length) { problems.push(`${it.jsonPath}: внутри нет историй`); continue; }
  for (const story of stories) {
    const storyLabel = (story && (story.title || story.id)) || '?';
    const { errors, warnings } = validateStory(story);
    warnings.forEach(w => console.log(`⚠ ${it.jsonPath} «${storyLabel}»: ${w}`));
    if (story && story.id && ids.has(story.id)) errors.push(`Дублирующийся id "${story.id}"`);
    if (story && story.id) ids.add(story.id);
    const imageBase = it.kind === 'folder' ? dirname(it.jsonPath) : '.';
    if (story && typeof story === 'object' && !Array.isArray(story)) storyImagePaths(story).forEach(p => {
      if (/^(https?:|data:)/.test(p)) return;
      if (!existsSync(join(imageBase, p))) errors.push(`Картинка не найдена: ${p}`);
    });
    if (errors.length) { errors.forEach(e => problems.push(`${it.jsonPath} «${storyLabel}»: ${e}`)); continue; }
    bundle.push({ base: it.base, story });
  }
}
if (problems.length) {
  console.error('\n✗ Сборка остановлена — исправь истории и попробуй снова:');
  problems.forEach(p => console.error('  ✗ ' + p));
  process.exit(1);
}

// предупреждение о тяжёлых картинках (RuStore-качество и скорость приложения)
(function warnBig(dir) {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) warnBig(p);
    else if (/\.(png|jpe?g|webp)$/i.test(name) && statSync(p).size > 1_500_000)
      console.log(`⚠ Тяжёлая картинка (${(statSync(p).size / 1e6).toFixed(1)} МБ): ${p} — сожми до ~300–500 КБ`);
  }
})('stores');

// --- 3+4. Собираем www/ ---
rmSync(WWW, { recursive: true, force: true });
mkdirSync(WWW, { recursive: true });
cpSync(join(ROOT, 'index.html'), join(WWW, 'index.html'));
cpSync(join(ROOT, 'css'), join(WWW, 'css'), { recursive: true });
cpSync(join(ROOT, 'js'), join(WWW, 'js'), { recursive: true });
if (existsSync(join(ROOT, 'stores'))) {
  cpSync(join(ROOT, 'stores'), join(WWW, 'stores'), {
    recursive: true,
    // art-prompts.json — внутренний манифест генерации; приложению он не нужен.
    filter: src => !src.includes('_template') && !src.endsWith('.md') && !src.endsWith('art-prompts.json'),
  });
}
if (existsSync(join(ROOT, 'assets'))) cpSync(join(ROOT, 'assets'), join(WWW, 'assets'), { recursive: true });

writeFileSync(join(WWW, 'js/stories-bundle.js'),
  `/* СГЕНЕРИРОВАНО tools/prepare-www.mjs — истории, вшитые в приложение. Не редактируй вручную. */\n` +
  `window.BUNDLED_BUILD = true;\nwindow.BUNDLED_STORIES = ${JSON.stringify(bundle)};\n`);

console.log(`\n✓ www/ готова: историй вшито ${bundle.length}` +
  (bundle.length ? ` (${bundle.map(b => '«' + (b.story.title || b.story.id) + '»').join(', ')})` : ' — библиотека будет пустой, добавь папки в stores/'));
