# Арт-план — stores/6 «Второе брожение»

## Стиль (общий для всех картинок)

semi-realistic painterly digital illustration, soft visible brushstrokes, muted watercolor-like shading, warm beige and earthy palette, gentle diffused light, elegant minimalist composition, cinematic, no photorealism, no anime, no manga, no 3D render, no text, no watermark

- Портреты: 896×1200 (3:4), фигура по пояс, вся голова и плечи в кадре, руки внутри кадра, фон — ровно сплошной светло-бежевый #EADFCB без градиента, теней и предметов.
- Фоны: 768×1376 (9:16), вертикальные, пустые (без людей и силуэтов), нижняя треть спокойная.
- Обложка: 2:3, без надписей, пара по пояс, оба в одежде, деликатный романтический тон.

## Библии персонажей

### Вера (30) — хозяйка усадьбы
Adult woman, 30 years old, oval face with a faint beauty mark near the mouth, chestnut brown hair with copper highlights in a loose low braid, warm hazel eyes, sun-kissed skin with light freckles on the nose, sturdy build, wearing a cream linen shirt with rolled-up sleeves and an open rust-colored work apron.

### Аркадий (38) — винодел без обоняния
Adult man, 38 years old, angular face with dark stubble, black hair with silver at the temples, deep-set warm dark brown eyes, tanned weathered skin, tall sturdy build, wearing a dark olive shirt with rolled-up sleeves and an open gray flannel work jacket.

### Нина (29) — управляющая
Adult woman, 29 years old, round face with a small mole above the lip, dark hair in a practical bun with a few stray strands, bright brown eyes, warm olive skin, medium build, wearing a mustard yellow knit sweater under an open white work shirt.

### Илья (49) — брокер
Adult man, 49 years old, long elegant face, neatly trimmed auburn beard, light brown hair slicked back, greenish eyes, pale skin, lean build, wearing a camel overcoat over a dark shirt.

## Методика генерации

1. **Базовые портреты** (heroine, hero, friend, director) — генерируются первыми: шаблон «Vertical portrait… Single person centered waist-up…» + библия + выражение + сплошной фон #EADFCB.
2. **Состояния** — по референсу базового портрета того же персонажа: «Use reference portrait for same person and outfit.» + библия + конкретное выражение + тот же фон. Одежда и внешность не меняются, меняется только мимика/поза.
3. **Фоны** — без персонажей: «Vertical 9:16 empty … No people, no characters, no silhouettes.» + стиль.
4. **Обложка** — по двум референсам (heroine.png, hero.png): «Use the two reference portraits for character identity and clothing», пара в одежде, без надписей.
5. Чувственные состояния (heroine_desire, heroine_blush, hero_close) — только мимика и близость взгляда; персонажи полностью в одежде, без оголений.
6. Все портреты генерируются с явной вертикалью («Vertical portrait, portrait orientation, taller than wide, 3:4») — горизонтальные варианты отбраковываются и переснимаются.

## Таблица использования (файл → сцены)

| Файл | Сцены |
|---|---|
| images/heroine.png | s1, s2b, s3, s4a, s5, s6b, s8b, s9, s10b, s12b, s13, s15b, ending_dozhdi |
| images/heroine_smile.png | s7, s11, s14, s16, s17, ending_pogreb |
| images/heroine_doubt.png | s2, s4, s8, s12 |
| images/heroine_brave.png | s2a, s12a |
| images/heroine_blush.png | s6, s6a, s10, s15 |
| images/heroine_desire.png | s10a |
| images/heroine_vulnerable.png | s8a |
| images/heroine_tender.png | s15a, s16a, ending_brozhenie |
| images/hero.png | s1, s3, s6, s6b, s7, s8a, s10, s10b, s11, s12a, s12b, s13, s16, s17, ending_pogreb |
| images/hero_smile.png | s14 |
| images/hero_doubt.png | s4, s8b, ending_dozhdi |
| images/hero_close.png | s4a, s6a, s10a, s15 |
| images/hero_tender.png | s15a, s15b, s16a, ending_brozhenie |
| images/friend.png | s2, s2a, s5, s9, s13 |
| images/friend_smile.png | s2b |
| images/friend_doubt.png | s8 |
| images/director.png | s4, s11, s12 |
| images/bg-vineyard.jpg | s1, s3, s4a, s5, s16a, s17, ending_brozhenie, ending_dozhdi |
| images/bg-cellar.jpg | s6, s6a, s6b, s8a, s10a, s10b, s11, s13, ending_pogreb |
| images/bg-barn.jpg | s2, s2a, s2b, s8, s8b |
| images/bg-office.jpg | s4, s7, s12, s12a, s12b |
| images/bg-porch.jpg | s9, s14, s15, s15a, s15b, s16 |
| images/bg-rain.jpg | s10 |
| cover.jpg | обложка истории |

Итого: 24 файла — 17 состояний персонажей, 6 фонов, 1 обложка. Каждое состояние и каждый фон используются минимум в одной сцене.
