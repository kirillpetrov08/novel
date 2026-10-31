# Art-план — stores/5 «Ночная смена»

## Стиль (общий для всех картинок)

semi-realistic painterly digital illustration, soft visible brushstrokes, muted watercolor-like shading, warm beige and earthy palette, gentle diffused light, elegant minimalist composition, cinematic, no photorealism, no anime, no manga, no 3D render, no text, no watermark

- Портреты: 896×1200 (3:4), фигура по пояс, вся голова и плечи в кадре, руки внутри кадра, фон — ровно сплошной светло-бежевый #EADFCB без градиента, теней и предметов.
- Фоны: 768×1376 (9:16), вертикальные, пустые (без людей и силуэтов), нижняя треть спокойная.
- Обложка: 2:3, без надписей, пара в полный рост по пояс, обе в одежде, деликатный романтический тон.

## Библии персонажей

### Марина (29) — анестезиолог-реаниматолог
Adult woman, 29 years old, oval face with a small beauty mark above the right brow, dark blond hair in a tight low bun with a few strands framing the face, gray-green eyes, fair skin, slim build, wearing a light gray scrub top with a V-neck and an open white medical coat.

### Дмитрий (34) — кардиохирург «из столицы»
Adult man, 34 years old, angular face with a two-day stubble, dark brown hair short on the sides, gray-blue eyes, warm tanned skin, tall athletic build, wearing a dark teal scrub shirt with sleeves rolled to the elbows and an open charcoal work jacket.

### Зоя (31) — старшая медсестра
Adult woman, 31 years old, round face with prominent cheekbones, dark hair in a loose ponytail held by a band, brown eyes, warm olive skin, medium build, wearing a mustard yellow knit sweater and an open white medical coat.

### Леонид Петрович (56) — главный врач
Adult man, 56 years old, long thin face, thinning gray hair, wire-frame glasses, pale blue eyes, cool pale skin, lean build, wearing a dark gray suit jacket over white shirt, collar open.

## Методика генерации

1. **Базовые портреты** (heroine, hero, friend, director) — генерируются первыми: шаблон «Single person centered waist-up…» + библия + выражение + сплошной фон #EADFCB.
2. **Состояния** — по референсу базового портрета того же персонажа: «Use reference portrait for same person и outfit.» + библия + конкретное выражение + тот же фон. Одежда и внешность не меняются, меняется только мимика/поза.
3. **Фоны** — без персонажей: «Vertical 9:16 empty … No people, no characters, no silhouettes.» + стиль.
4. **Обложка** — по двум референсам (heroine.png, hero.png): «Use the two reference portraits for character identity and clothing», пара в одежде, без надписей.
5. Чувственные состояния (heroine_desire, heroine_blush, hero_close) — только мимика и близость взгляда; персонажи полностью в одежде, без оголений.

## Таблица использования (файл → сцены)

| Файл | Сцены |
|---|---|
| images/heroine.png | s1, s2b, s3, s4a, s5, s6b, s8b, s9, s10b, s12b, s13, s15b, ending_posle |
| images/heroine_smile.png | s7, s11, s14, s16, s17, ending_pulse |
| images/heroine_doubt.png | s2, s4, s8, s12 |
| images/heroine_brave.png | s2a, s12a |
| images/heroine_blush.png | s6, s6a, s10, s15 |
| images/heroine_desire.png | s10a |
| images/heroine_vulnerable.png | s8a |
| images/heroine_tender.png | s15a, s16a, ending_obshchaya |
| images/hero.png | s1, s3, s6, s6b, s7, s8a, s10, s10b, s11, s12a, s13, s16, s17, ending_pulse |
| images/hero_smile.png | s14 |
| images/hero_doubt.png | s4, s8b, ending_posle |
| images/hero_close.png | s4a, s6a, s10a, s15 |
| images/hero_tender.png | s15a, s15b, s16a, ending_obshchaya |
| images/friend.png | s2, s2a, s5, s9, s13 |
| images/friend_smile.png | s2b |
| images/friend_doubt.png | s8 |
| images/director.png | s4, s11, s12, s12b |
| images/bg-hall.jpg | s3, s4a, s5, s8, s8b, s10, s10a, s12, s16, ending_pulse, ending_posle |
| images/bg-resus.jpg | s2, s2a, s2b, s6, s6a, s6b, s10b |
| images/bg-op.jpg | s8a, s11, s13 |
| images/bg-office.jpg | s4, s7, s12a, s12b |
| images/bg-city.jpg | s1, s16a, s17, ending_obshchaya |
| images/bg-balcony.jpg | s9, s14, s15, s15a, s15b |
| cover.jpg | обложка истории |

Итого: 24 файла — 17 состояний персонажей, 6 фонов, 1 обложка. Каждое состояние и каждый фон используются минимум в одной сцене.
