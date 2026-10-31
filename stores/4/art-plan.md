# План иллюстраций: «Красная лампа»

## Способ

Единый стиль и модель: встроенный генератор изображений (painterly-модель). Базовые портреты сгенерированы первыми, эмоциональные состояния — с базовым портретом того же человека в качестве референса (`images`-параметр). Обложка создана с двумя референсами (Татьяна + Андрей). Фон портретов — строго однотонный светло-бежевый #EADFCB (чистый силуэт для вырезания спрайта конвейером `make-character-sprites.py`).

Размеры: портреты 896×1200 (3:4), фоны 768×1376 (9:16), обложка — вертикаль 2:3. Визуальный стиль сохранён во всех файлах.

Стиль каждого промпта (дословно в конце):
"semi-realistic painterly digital illustration, soft visible brushstrokes, muted watercolor-like shading, warm beige and earthy palette, gentle diffused light, elegant minimalist composition, cinematic, no photorealism, no anime, no manga, no 3D render, no text, no watermark"

## Библии внешности

### Татьяна (`heroine`)

Adult woman, 27 years old, oval face with a small mole under the left eye, dark brown hair in a high loose ponytail with loose strands framing her face, gray-green eyes, fair cool-toned skin, slender build, wearing a dark navy wool turtleneck sweater with a rust-red wool scarf wrapped around her neck.

### Андрей (`hero`)

Adult man, 35 years old, square jaw with a short two-day beard, short dark blond hair, gray-blue eyes, warm tanned skin, tall athletic build, wearing a charcoal-gray work jacket with a high collar over a dark green flannel shirt, top button open.

### Лена (`friend`)

Adult woman, 30 years old, round face with prominent cheekbones, light chestnut hair in a short uneven bob, hazel eyes, warm olive skin, medium build, wearing a mustard knit sweater over a white t-shirt.

### Пётр Аркадьевич, директор (`director`)

Adult man, 58 years old, long thin face, thinning white hair combed to the side, round wire-frame glasses, pale blue eyes, cool pale skin, lean build, wearing a gray suit jacket over a dark shirt.

Все участники романтических и интимных линий — взрослые 20+ (27 и 35; весь каст — 27/30/35/58). Нагота и прозрачная одежда отсутствуют: чувственность передаётся открытым воротом, шарфом, взглядом и близостью лиц; все персонажи на всех картинках полностью одеты.

## Файлы

| Файл | Тип | Где используется | Короткий смысл промпта |
|---|---|---|---|
| `cover.jpg` | cover | обложка | Татьяна и Андрей в зале купола очень близко, одеты, красная лампа и звёзды за ними, взгляд обещает поцелуй |
| `images/bg-dome.jpg` | background | s3, s4a, s6, s6a, s6b, s8a, s13, s14, s15, s15a, s16a, ending_krasnaya_lampa | пустой зал купола ночью, телескоп-1964, красная лампа, звёзды в щели |
| `images/bg-dorm.jpg` | background | s2, s2a, s2b, s5, s8, s8b, s10b, ending_yasno | пустая кухня барака, деревянный стол, термос, снежная ночь в окне |
| `images/bg-village.jpg` | background | s1, s10, s10a, s17, ending_prodolzhenie | пустой горный посёлок ночью, бревенчатые дома, купол на гребне |
| `images/bg-control.jpg` | background | s7, s11 | пустая комната пультов, пульт с лампами, регистратор |
| `images/bg-office.jpg` | background | s4, s12, s12a | пустой кабинет директора, карты, телефон, настольная лампа |
| `images/bg-ridge.jpg` | background | s9 | пустой горный гребень под звёздами, метеостанция |
| `images/heroine.png` | character | s1, s2b, s3, s4a, s5, s6b, s8b, s9, s11, s14, s17 | Татьяна, нейтральное состояние |
| `images/heroine_smile.png` | character | s7, s10b, ending_yasno | Татьяна, тёплая улыбка |
| `images/heroine_doubt.png` | character | s2, s4, s8, s12, ending_prodolzhenie | Татьяна, сомнение |
| `images/heroine_brave.png` | character | s2a, s12a, s13 | Татьяна, решимость |
| `images/heroine_blush.png` | character | s6, s6a, s10, ending_krasnaya_lampa | Татьяна, румянец в красном свете |
| `images/heroine_desire.png` | character | s10a, s15a | Татьяна, чувственное напряжение |
| `images/heroine_vulnerable.png` | character | s8a, s15 | Татьяна, уязвимость |
| `images/heroine_tender.png` | character | s16a | Татьяна, нежное утреннее состояние |
| `images/hero.png` | character | s1, s3, s6, s6b, s7, s8a, s10, s11, s12a, s14, s17, ending_prodolzhenie | Андрей, нейтральное состояние |
| `images/hero_smile.png` | character | s10b, s13, ending_yasno | Андрей, тёплая усталая улыбка |
| `images/hero_doubt.png` | character | s4, s8b | Андрей, задержанный конфликт |
| `images/hero_close.png` | character | s4a, s6a, s10a, s15, s15a | Андрей, близкий интимный наклон |
| `images/hero_tender.png` | character | s16a, ending_krasnaya_lampa | Андрей, мягкое утреннее состояние |
| `images/friend.png` | character | s2, s2a, s5, s9, s12 | Лена, нейтральное состояние |
| `images/friend_smile.png` | character | s2b, s13 | Лена, открытая улыбка |
| `images/friend_doubt.png` | character | s8 | Лена, осторожная обеспокоенность |
| `images/director.png` | character | s4, s12a | Пётр Аркадьевич, деловая строгость |

## Отсутствующие файлы

Нет. Все 24 файла из манифеста присутствуют.
