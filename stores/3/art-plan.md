# План иллюстраций: «Тепло обжига»

## Способ

Единый стиль и модель: встроенный генератор изображений (painterly-модель). Базовые портреты сгенерированы первыми, эмоциональные состояния — с базовым портретом того же человека в качестве референса (`images`-параметр). Обложка создаётся с двумя референсами (Дарья + Илья). Фон портретов — строго однотонный светло-бежевый #EADFCB (чистый силуэт для вырезания спрайта конвейером `make-character-sprites.py`).

Размеры: портреты 896×1200 (3:4), фоны 768×1376 (9:16), обложка 848×1264 (2:3). Визуальный стиль сохранён во всех файлах.

Стиль каждого промпта (дословно в конце):
"semi-realistic painterly digital illustration, soft visible brushstrokes, muted watercolor-like shading, warm beige and earthy palette, gentle diffused light, elegant minimalist composition, cinematic, no photorealism, no anime, no manga, no 3D render, no text, no watermark"

## Библии внешности

### Дарья (`heroine`)

Adult woman, 27 years old, heart-shaped face with a soft jawline, long dark auburn hair in a loose low bun with loose strands framing her face, deep amber-brown eyes, fair warm skin, slender build, wearing a warm terracotta knit dress with one bare shoulder and an oatmeal knit cardigan draped over her shoulders.

### Илья (`hero`)

Adult man, 31 years old, angular face with a strong jaw, short dark blond hair combed back with a few loose strands, gray-blue eyes, light stubble, tanned fair skin, lean athletic build, wearing a dark olive flannel shirt with the top buttons open and the sleeves rolled up to the elbows.

### Нина (`friend`)

Adult woman, 33 years old, round friendly face with a warm smile line, shoulder-length black wavy hair, dark brown eyes, warm olive skin, medium build, wearing a mustard-yellow blouse under an open denim jacket.

### Марк (`mark`)

Adult man, 47 years old, thin face with sharp cheekbones, slicked-back gray hair, short trimmed gray beard, pale blue eyes, cool pale skin, broad build, wearing a charcoal suit jacket over a burgundy turtleneck.

Все возраста — 25+, нагота и прозрачная одежда отсутствуют: чувственность передаётся открытым плечом, расстёгнутым воротом, взглядом и близостью лиц.

## Файлы

| Файл | Тип | Где используется | Короткий смысл промпта |
|---|---|---|---|
| `cover.jpg` | cover | обложка | Дарья и Илья очень близко, одеты, взгляд обещает поцелуй, свечение печи за спиной |
| `images/bg-atelier.jpg` | background | s1, s2, s2a, s2b, s4, s4a, s8b, s10b, s14, s16a, ending_sveta | пустая керамическая мастерская, верстак, глина, утреннее окно |
| `images/bg-kiln.jpg` | background | s3, s6, s6a, s6b, s7, s8a, s13, s15, s15a, ending_ogon | пустая печь-обжиг 1870-х, тёплое оранжевое свечение, вечер |
| `images/bg-cafe.jpg` | background | s5, s8, s9, s12 | пустое уютное кафе, деревянная стойка, тёплые лампы |
| `images/bg-street.jpg` | background | s12a, s17 | пустая улица исторического центра в сумерках, фонари |
| `images/bg-street-rain.jpg` | background | s10, s10a, ending_cherepok | пустая улица в тёплом вечернем дожде, мокрая брусчатка |
| `images/bg-museum.jpg` | background | s11 | пустой зал музея, полки с керамикой «Заречье» |
| `images/heroine.png` | character | s1, s3, s4a, s5, s6b, s8b, s9, s11, s14, s17 | Дарья, нейтральное состояние |
| `images/heroine_smile.png` | character | s2b, s7, s10b, ending_sveta | Дарья, тёплая улыбка |
| `images/heroine_doubt.png` | character | s2, s4, s8, s12, ending_cherepok | Дарья, сомнение |
| `images/heroine_brave.png` | character | s2a, s12a, s13 | Дарья, решимость |
| `images/heroine_blush.png` | character | s6, s6a, s10, ending_ogon | Дарья, румянец, опущенный взгляд |
| `images/heroine_desire.png` | character | s10a, s15a | Дарья, чувственное напряжение |
| `images/heroine_vulnerable.png` | character | s8a, s15 | Дарья, уязвимость |
| `images/heroine_tender.png` | character | s16a | Дарья, нежное утреннее состояние |
| `images/hero.png` | character | s2, s2b, s3, s6, s6b, s7, s8a, s10, s11, s12a, s14, s17, ending_cherepok | Илья, нейтральное состояние |
| `images/hero_smile.png` | character | s10b, s13, ending_sveta | Илья, тёплая усталая улыбка |
| `images/hero_doubt.png` | character | s2a, s4, s8b | Илья, задержанный конфликт |
| `images/hero_close.png` | character | s4a, s6a, s10a, s15, s15a | Илья, близкий интимный наклон |
| `images/hero_tender.png` | character | s16a, ending_ogon | Илья, мягкое утреннее состояние |
| `images/friend.png` | character | s1, s5, s9, s12 | Нина, нейтральное состояние |
| `images/friend_smile.png` | character | s13 | Нина, открытая улыбка |
| `images/friend_doubt.png` | character | s8 | Нина, осторожная обеспокоенность |
| `images/mark.png` | character | s4, s12a | Марк, холодная уверенность |

## Отсутствующие файлы

Нет. Все 24 файла из манифеста присутствуют.
