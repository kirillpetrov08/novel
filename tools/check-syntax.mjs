// Проверка синтаксиса всего JS/MJS, который попадает в приложение или сборку.
// Gradle собирает APK даже с синтаксически битым js/app.js — такая ошибка
// иначе проявилась бы только на телефоне. CI запускает этот шаг до Android.
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const files = [
  ...readdirSync('js').filter(name => name.endsWith('.js')).map(name => join('js', name)),
  ...readdirSync('tools').filter(name => name.endsWith('.mjs')).map(name => join('tools', name)),
].sort();

for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
}

console.log(`✓ Синтаксис JS/MJS проверен: ${files.length} файлов`);
