# План иллюстраций: «Берег без спешки»

## Способ
Единый стиль и модель: Gemini 3.1 Flash Image. Базовые портреты сгенерированы первыми, состояния — с базовым портретом в качестве референса. Обложка создана с референсами героев. Обложка и причал затем исправлены генеративным редактированием этой же моделью; для портретов фон дополнительно выровнен до #EADFCB обработкой PNG без преобразования в WebP.

Размеры: портреты 896×1200, фоны 768×1376, обложка 848×1264. Визуальный стиль иллюстраций сохранён.

## Библии внешности

### Вера (`heroine`)

Adult woman, 25 years old, oval face with a small freckle beside her nose, chin-length wavy chestnut hair tucked behind one ear, gray-green eyes, fair skin, slender build, wearing a cream linen shirt under a moss-green cardigan.

### Егор (`hero`)

Adult man, 28 years old, long face with a straight nose, slightly tousled dark brown hair, amber-brown eyes, olive skin, lean build, wearing a sand-colored shirt and a dark brown vest.

### Лада (`friend`)

Adult woman, 27 years old, round face with high cheekbones, long black hair in a loose braid over one shoulder, dark brown eyes, warm brown skin, sturdy build, wearing a rust-colored linen shirt and a navy blue apron.

## Файлы

| Файл | Тип | Где используется | Короткий смысл промпта |
|---|---|---|---|
| `cover.jpg` | cover | обложка | Вера и Егор у приливных часов |
| `images/bg-workshop.jpg` | background | s1, s2, s2b, s6b, s11, s12, s12a, s12b | empty old clock workshop in a small coastal town, workbench, brass gears, a stopped tide clock and warm morning window light |
| `images/bg-pier.jpg` | background | s2a, s3, s4, s4a, s16, ending_together, ending_departure | empty wooden pier at a northern coastal town, quiet sea, moored boats and pale daylight |
| `images/bg-archive.jpg` | background | s4b, s5, s6, s6a, s9, s10, s10a, s10b | empty small harbor archive, shelves of boxes and a simple wooden desk with old papers, warm indirect daylight |
| `images/bg-square.jpg` | background | s7, s14, s14a, s14b, s15 | empty coastal town square beside an old clock tower, stone paving, closed shopfronts and overcast warm evening |
| `images/bg-roof.jpg` | background | s8, s8a, s8b, s13, ending_tower | empty rooftop of an old seaside clock tower at dusk, brass bell and view over quiet harbor, sky with muted sunset |
| `images/heroine.png` | character | s1, s2a, s3, s4, s4a, s5, s6b, s8, s8a, s8b, s9, s10, s10b, s11, s12, s12a, s12b, s14, s14a, s16, ending_departure | Вера, нейтральное состояние |
| `images/heroine_smile.png` | character | ending_together | Вера, smile |
| `images/heroine_doubt.png` | character | s2, s6 | Вера, doubt |
| `images/heroine_brave.png` | character | s2b, s4b, s6a, s10a, s14b, ending_tower | Вера, brave |
| `images/hero.png` | character | s2a, s3, s7, s8, s11, s13, s15, s16, ending_departure | Егор, нейтральное состояние |
| `images/hero_smile.png` | character | s4a, s8b, s12b, s14a | Егор, smile |
| `images/hero_doubt.png` | character | s4, s12 | Егор, doubt |
| `images/hero_close.png` | character | s8a, s12a, ending_together | Егор, close |
| `images/friend.png` | character | s1, s2, s2b, s4b, s5, s6, s6a, s7, s9, s10a, s13, s15 | Лада, нейтральное состояние |
| `images/friend_smile.png` | character | s10b, ending_tower | Лада, smile |
| `images/friend_doubt.png` | character | s6b, s10 | Лада, doubt |
| `images/friend_brave.png` | character | s14, s14b | Лада, brave |

## Отсутствующие файлы

Нет. Все 18 файлов из манифеста присутствуют.
