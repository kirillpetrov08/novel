# ЧЕК-ЛИСТ: stores/7–11 (5 историй)

Правило формата финала: `"ending": { "title", "text", "badge" }` — только объектом (движок: `emit('ending', {ending: sc.ending})` → UI читает title/badge/text).
Цена платных: ровно 5. Тег «18+» — нет. Поле author — нет. Genre — «Романтика · Чувственная драма».
Структура (проверенная в stores/5–6): 34 сцены = s1–s17 + 14 веток + 3 финала; 21 выбор (5 платных: s6a/s8a/s10a/s12a/s15a); s17: branch desire≥4→hot, trust≥3→trust, desire≥3→нейтр, next→trust.
Портреты 896×1200 на #EADFCB (явная вертикаль в промпте), фоны 768×1376, обложка 2:3 по 2 референсам. Стиль: painterly, warm beige earthy.

## stores/7 «Антракт» (id: antrakt) — провинциальный драмтеатр, осень
- Герои: Рита (31) — светотехник; Григорий (36) — актёр-режиссёр из столицы; Саша (29) — механик сцены; Виктор Егорович (54) — директор-продюсер.
- Конфликт: gala-окно; директор тянет деньги премьеры на коммерческий мюзикл.
- Финалы: desire «Свет не гаснет» (Желание) / trust «Правильный свет» (Доверие) / neutral «Пустой зал» (Антракт).
- Фоны: bg-stage, bg-backstage, bg-hall, bg-office, bg-light, bg-garden.
- [x] план
- [x] story.json (34 сцены, 21 выбор, 5 платных по 5, ending-объекты)
- [x] art-prompts.json (24 файла + 34 sceneBackgrounds)
- [x] картинки 10/24 (пачка 1: 4 базы + 6 состояний Риты; 11-й вызов упёрся в лимит 10/ход, как и в stores/5-6)
- [ ] пачка 2 (11–20): heroine_tender, hero×4, friend×2, bg-stage, bg-backstage
- [ ] пачка 3 (21–24): bg-hall, bg-office, bg-light, bg-garden, cover
- [ ] самопроверка
- [ ] коммит

## stores/8 «На связи» (id: na-svyazi) — региональный аэродром, зима/мороз
- Герои: Софья (32) — диспетчер; Михаил (37) — пилот; Толя (29) — радиотехник; Пётр Аркадьевич (58) — директор аэродрома.
- Конфликт: закрытие аэродрома; последний рейс в большой город в окно погоды.
- Финалы: desire «Высота» (Желание) / trust «Погода подходит» (Доверие) / neutral «Последний рейс» (Рейс).
- Фоны: bg-tower, bg-runway, bg-hangar, bg-office, bg-taxiway, bg-snow.
- [x] план
- [x] story.json (34 сцены, 21 выбор, 5 платных по 5, ending-объекты, все проверки пройдены)
- [x] art-prompts.json (24 файла + 34 sceneBackgrounds)
- [ ] картинки 0/24
- [ ] пачка 1 (1–10): 4 базы + 6 состояний Софьи
- [ ] пачка 2 (11–20): heroine_tender, hero×4, friend×2, bg-tower, bg-runway
- [ ] пачка 3 (21–24): bg-hangar, bg-office, bg-taxiway, bg-snow, cover
- [ ] самопроверка
- [ ] коммит

## stores/9 «Семь морей» (id: sem-morey) — глубокоморский траулер, весна/льды
- Герои: Мира (30) — судовый инженер; Николай (43) — капитан; Вася (27) — матрос; Геннадий (52) — представитель флота (продажа/списание).
- Конфликт: траулер пишут на списание; последний рейс за улов, чтобы закрыть долг; шторм.
- Финалы: desire «Штиль» (Желание) / trust «Держим курс» (Доверие) / neutral «Открытая вода» (Море).
- Фоны: bg-deck, bg-bridge, bg-engine, bg-cabin, bg-ice, bg-night.
- [x] план
- [x] story.json (34 сцены, 21 выбор, 5 платных по 5, ending-объекты, все проверки пройдены)
- [x] art-prompts.json (24 файла + 34 sceneBackgrounds)
- [ ] картинки 0/24
- [ ] пачка 1 (1–10): 4 базы + 6 состояний Миры
- [ ] пачка 2 (11–20): heroine_tender, hero×4, friend×2, bg-deck, bg-bridge
- [ ] пачка 3 (21–24): bg-engine, bg-cabin, bg-ice, bg-night, cover
- [ ] самопроверка
- [ ] коммит

## stores/10 «В полёте» (id: v-polyote) — гастролирующий цирк, конец лета/степь
- Герои: Лида (29) — воздушница; Юрий (42) — директор цирка; Оксана (31) — риггер; Артур (55) — владелец (группа отелей).
- Конфликт: владелец продаёт цирк отелю, труппу упраздняют; шоу в пути; предательство.
- Финалы: desire «Выше всех» (Желание) / trust «Свой полёт» (Доверие) / neutral «После представления» (Полёт).
- Фоны: bg-bigtop, bg-ring, bg-tentback, bg-train, bg-steppe, bg-night.
- [x] план
- [x] story.json (34 сцены, 21 выбор, 5 платных по 5, ending-объекты, все проверки пройдены)
- [x] art-prompts.json (24 файла + 34 sceneBackgrounds)
- [ ] картинки 0/24
- [ ] пачка 1 (1–10): 4 базы + 6 состояний Лиды
- [ ] пачка 2 (11–20): heroine_tender, hero×4, friend×2, bg-tent, bg-rope
- [ ] пачка 3 (21–24): bg-office, bg-makeup, bg-garden, bg-night, cover
- [ ] самопроверка
- [ ] коммит

## stores/11 «Эфир» (id: efir) — городская радиостанция, лето/жара
- Герои: Даша (28) — ведущая дневного шоу/звукоинженер; Виктор (40) — продюсер; Миша (26) — монтажёр; Лена Сергеевна (57) — директор станции.
- Конфликт: старую студию закрывают, архив продают; последний прямой эфир; голос наставницы в архиве — правда через 15 лет.
- Финалы: desire «Прямой эфир» (Желание) / trust «Голос остаётся» (Доверие) / neutral «После эфира» (Эфир).
- Фоны: bg-studio, bg-control, bg-archive, bg-city, bg-rooftop, bg-street.
- [x] план
- [x] story.json (34 сцены, 21 выбор, 5 платных по 5, ending-объекты, все проверки пройдены)
- [x] art-prompts.json (24 файла + 34 sceneBackgrounds)
- [ ] картинки 0/24
- [ ] пачка 1 (1–10): 4 базы + 6 состояний Даши
- [ ] пачка 2 (11–20): heroine_tender, hero×4, friend×2, bg-studio, bg-street
- [ ] пачка 3 (21–24): bg-city, bg-rooftop, bg-hall, bg-morning, cover
- [ ] самопроверка
- [ ] коммит

## ИТОГ (финальное состояние)

- stores/7: текст готов (коммит dbee59a + 9f66eea), картинки 10/24 (пачка 1 портретов).
- stores/8/9/10/11: текст готов (коммиты d0d0b15, e598bb3, 10b595e, 9f66eea... см. git log), картинки 0/24.
- generate_image: жёсткий лимит 10 сгенерированных изображений исчерпан на всю сессию; все последующие вызовы возвращают «limit of 10 reached». Фолбэк по ТЗ: доставляем ТЕКСТ + ПРОМПТЫ, КАРТИНОК НЕТ (кроме 10 уже сгенерированных в stores/7).
- Для дособора картинок (новый сеанс): брать промпты из stores/N/art-prompts.json; оставшиеся файлы:
  - stores/7: bg-office, bg-light, bg-garden, cover + (пачка 2: heroine_tender, hero_smile, hero_doubt, hero_close, hero_tender, friend_smile, friend_doubt, bg-stage, bg-backstage, bg-hall)
  - stores/8/9/10/11: все 24 файла.

## Журнал хода
- ход 1: формат ending-объекта подтверждён по движку (js/engine.js finish → emit('ending', {ending: sc.ending}); js/app.js renderEnding читает title/badge/text). Чек-лист создан.
- ход 2: stores/7: story.json + art-prompts.json готовы, пачка картинок 1/24 (10 шт).
- ход 3: stores/7 коммит (story+art-prompts+10 картинок). Лимит 10/ход подтверждён (ошибка на 11-м вызове). Продолжаю текстом: stores/8.
- ход 4: stores/8 story.json + art-prompts.json готовы (ALL CHECKS PASSED, validate ✓). stores/7: ждёт пачка 2 (heroine_tender упёрлась в лимит).
- ход 5: stores/9 story.json + art-prompts.json готовы (ALL CHECKS PASSED, validate ✓). Пишу stores/10.
- ход 6: stores/10 story.json + art-prompts.json готовы (ALL CHECKS PASSED, validate ✓). Пишу stores/11.
- ход 7: stores/11 story.json + art-prompts.json готовы (ALL CHECKS PASSED, validate ✓). ВСЕ 5 ТЕКСТОВ ГОТОВЫ. Дальше только картинки: stores/7 (14 ост.), 8, 9, 10, 11 (по 24).
