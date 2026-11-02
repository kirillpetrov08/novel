# Особые карточки (scene.cg) — прогресс ретрофита по историям

Механика: плеер показывает `scene.cg` в фирменной рамке вместо спрайтов.
Новые истории получают карточки сразу по контрактам (PROMPT_LONG: 7–9,
PROMPT_FOR_AI: 3–5). Этот файл — план доделки уже вышедших историй.
Генерация: по одной, ≤10 за ход, промпты — в `art-prompts.json` каждой
истории (type:"card", поле scene). После генерации: сжать до ширины 1200
q84, прошить `scenes[scene].cg`, validate, build, commit.

## Единый стиль карточек (обязательно)
В конец каждого промпта — канонический блок: «wide cinematic composition,
characters large in frame and shown from the waist up, soft oil painting
illustration with gentle visible brushstrokes, warm beige muted earthy
palette of cream, sand, bronze, sage green and slate grey, soft diffused
natural light, semi-realistic painted faces with calm tender expressions,
romantic visual novel key visual, painterly detailed background, not
photorealistic, not anime, not 3D render, no text, no lettering, no words,
no logos, no watermark». Даже если в старом манифесте истории своя строка
стиля (как у №2), карточки делать этим блоком — он совпадает с живописью
спрайтов (проверено: свой стиль №2 дал «акварельный» дрейф, переделано).
Не класть в кадр читаемые бумаги/вывески (модель пишет псевдотекст;
на cg-market №12 пришлось стирать инпеинтингом).

## Готово
- №13 «Зимний сад» — 9 карточек (изначально).
- №1 «Соль и свет» — 6 карточек: cg-arrival s1, cg-storm s11, cg-lamp s15,
  cg-ending-light/truth/ashore. Манифест восстановлен полностью (45 поз.).
- №12 «До конечной» — 8/8: cg-meet a03, cg-night-kitchen a08, cg-market c03,
  cg-warm d03, cg-snow d04, cg-ending-noch/kon/perron.
- №2 «Берег без спешки» — 6/6: cg-return s1, cg-clock s3, cg-gear s13,
  cg-ending-together, cg-ending-tower, cg-ending-departure.
- №3 «Тепло обжига» — 6/6: cg-return s1, cg-kiln-first s6, cg-rain s10,
  cg-ending-ogon, cg-ending-sveta, cg-ending-cherepok.
- №4 «Красная лампа» — 6/6: cg-arrival s1, cg-red-lamp s3,
  cg-storm-dome s6, cg-ending-lampa, cg-ending-yasno,
  cg-ending-prodolzhenie.
- №5 «Ночная смена» — 6/6: cg-night-entrance s1, cg-monitor s6,
  cg-operation s13, cg-ending-obshchaya, cg-ending-pulse,
  cg-ending-posle.
- №6 «Второе брожение» — 6/6: cg-first-frost s1, cg-cellar-night s6,
  cg-crush s13, cg-ending-brozhenie, cg-ending-pogreb,
  cg-ending-dozhdi.
- №7 «Антракт» — 6/6: cg-service-entrance s1, cg-light-booth s6,
  cg-premiere s13, cg-ending-svet, cg-ending-prosvet, cg-ending-zal.
- №8 «На связи» — 6/6: cg-first-contact s1, cg-snowstorm-tower s6,
  cg-last-flight s13, cg-ending-vysota, cg-ending-pogoda,
  cg-ending-reys.
- №9 «Семь морей» — 6/6: cg-pier-ice s1, cg-engine-night s6,
  cg-last-voyage s13, cg-ending-shtil, cg-ending-kurs,
  cg-ending-voda.
- №10 «В полёте» — 6/6: cg-descent s1, cg-rope-night s6,
  cg-last-show s13, cg-ending-vyshe, cg-ending-polyot,
  cg-ending-posle.
- №11 «Эфир» — 6/6: cg-night-studio s1, cg-console-night s6,
  cg-last-broadcast s13, cg-ending-efir, cg-ending-golos,
  cg-ending-posle.

## Очередь (порядок и объём)
Ретрофит завершён: карточки подключены во всех 13 историях.
Внешность героев для будущих историй брать дословно из портретов в их
art-prompts.json; сцены выбирать по карте story.json (проходные
CHOICE-сцены и финалы).
