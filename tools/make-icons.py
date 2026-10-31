# Генератор иконки и сплеша «Новеллы» (строгая бежевая палитра приложения).
#   pip install pillow && python3 tools/make-icons.py
# Результаты: mipmap-иконки Android (все плотности, адаптивные и legacy),
# splash.png на месте шаблонных, rustore/icon-512.png для карточки RuStore.
from PIL import Image, ImageDraw
import os

RES = "android/app/src/main/res"
CREAM_TOP = (247, 242, 231)     # #F7F2E7
CREAM_BOT = (227, 211, 180)     # #E3D3B4
BRONZE = (138, 109, 75)         # #8A6D4B
BRONZE_D = (107, 84, 57)        # #6B5439
INK = (43, 38, 32)              # #2B2620


def gradient(size):
    img = Image.new("RGB", (size, size), CREAM_TOP)
    px = img.load()
    for y in range(size):
        t = y / max(size - 1, 1)
        row = tuple(round(CREAM_TOP[i] + (CREAM_BOT[i] - CREAM_TOP[i]) * t) for i in range(3))
        for x in range(size):
            px[x, y] = row
    return img


def draw_emblem(draw, cx, cy, r, ring_w, inner_scale=0.46):
    """Ромб-кристалл ◆: внешний контур + залитая сердцевина + тонкая «строка» под ним."""
    pts = [(cx, cy - r), (cx + r * 0.72, cy), (cx, cy + r), (cx - r * 0.72, cy)]
    draw.polygon(pts, outline=BRONZE_D, width=ring_w)
    ri = r * inner_scale
    draw.polygon([(cx, cy - ri), (cx + ri * 0.72, cy), (cx, cy + ri), (cx - ri * 0.72, cy)], fill=BRONZE)
    ly = cy + r * 1.28
    draw.line([(cx - r * 0.52, ly), (cx + r * 0.52, ly)], fill=INK, width=max(2, ring_w // 2))


def full_icon(size, round_mask=False):
    img = gradient(size).convert("RGBA")
    d = ImageDraw.Draw(img)
    draw_emblem(d, size / 2, size * 0.46, size * 0.25, max(2, size // 36))
    if round_mask:
        mask = Image.new("L", (size, size), 0)
        ImageDraw.Draw(mask).ellipse([0, 0, size, size], fill=255)
        out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        out.paste(img, (0, 0), mask)
        return out
    return img


def foreground(size):
    """Адаптивная иконка: прозрачный фон, эмблема в безопасной зоне (~60% кадра)."""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    draw_emblem(d, size / 2, size * 0.46, size * 0.19, max(2, size // 34))
    return img


def splash(w, h):
    img = Image.new("RGB", (w, h), CREAM_TOP)
    px = img.load()
    for y in range(h):
        t = y / max(h - 1, 1)
        row = tuple(round(CREAM_TOP[i] + (CREAM_BOT[i] - CREAM_TOP[i]) * t) for i in range(3))
        for x in range(w):
            px[x, y] = row
    d = ImageDraw.Draw(img)
    draw_emblem(d, w / 2, h * 0.44, min(w, h) * 0.13, max(3, min(w, h) // 60))
    return img


LEGACY = {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}
ADAPTIVE = {"mdpi": 108, "hdpi": 162, "xhdpi": 216, "xxhdpi": 324, "xxxhdpi": 432}

for density, px in LEGACY.items():
    folder = os.path.join(RES, f"mipmap-{density}")
    full_icon(px).save(os.path.join(folder, "ic_launcher.png"))
    full_icon(px, round_mask=True).save(os.path.join(folder, "ic_launcher_round.png"))
for density, px in ADAPTIVE.items():
    foreground(px).save(os.path.join(RES, f"mipmap-{density}", "ic_launcher_foreground.png"))

# сплеши: заменяем шаблонные, сохраняя их размеры
import glob
for path in glob.glob(os.path.join(RES, "**/splash.png"), recursive=True):
    w, h = Image.open(path).size
    splash(w, h).save(path)

# иконка для карточки RuStore (требуется 512×512)
os.makedirs("rustore", exist_ok=True)
full_icon(512).convert("RGB").save("rustore/icon-512.png")
print("✓ Иконки (mipmap + adaptive), сплеши и rustore/icon-512.png сгенерированы")
