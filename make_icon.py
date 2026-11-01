from PIL import Image, ImageDraw, ImageFilter
import os

S = 1024
img = Image.new("RGBA", (S, S), (0, 0, 0, 0))

# 圆角方形底
bg = Image.new("RGBA", (S, S), (0, 0, 0, 0))
bd = ImageDraw.Draw(bg)
for y in range(S):
    t = y / S
    r = int(12 + 10 * t)
    g = int(18 + 14 * t)
    b = int(32 + 26 * t)
    bd.line([(0, y), (S, y)], fill=(r, g, b, 255))
mask = Image.new("L", (S, S), 0)
md = ImageDraw.Draw(mask)
md.rounded_rectangle([40, 40, S - 40, S - 40], radius=220, fill=255)
img.paste(bg, (0, 0), mask)

# 月亮：亮圆 + 偏移圆镂空
cx, cy, R = 470, 512, 300
moon = Image.new("RGBA", (S, S), (0, 0, 0, 0))
md2 = ImageDraw.Draw(moon)
for i in range(R, 0, -1):
    t = i / R
    r = int(255 - 14 * t)
    g = int(240 - 52 * t)
    b = int(210 - 88 * t)
    md2.ellipse([cx - i, cy - i, cx + i, cy + i], fill=(r, g, b, 255))

cut = Image.new("L", (S, S), 0)
cd = ImageDraw.Draw(cut)
cd.ellipse([cx + 120, cy - 340, cx + 120 + 620, cy - 340 + 620], fill=255)
cut = cut.filter(ImageFilter.GaussianBlur(2))
alpha = Image.new("L", (S, S), 255)
alpha.paste(0, (0, 0), cut)
moon.putalpha(Image.composite(Image.new("L", (S, S), 0), moon.getchannel("A"), cut))

# 月亮外发光
halo = Image.new("RGBA", (S, S), (0, 0, 0, 0))
halo.paste((255, 220, 170, 90), (0, 0), moon.getchannel("A"))
halo = halo.filter(ImageFilter.GaussianBlur(34))
img.alpha_composite(halo)

# 星点
stars = Image.new("RGBA", (S, S), (0, 0, 0, 0))
sd = ImageDraw.Draw(stars)
for (x, y, rr, a) in [(754, 300, 7, 220), (690, 392, 3, 150), (822, 408, 3, 120), (300, 748, 3, 90)]:
    sd.ellipse([x - rr, y - rr, x + rr, y + rr], fill=(255, 244, 220, a))
stars = stars.filter(ImageFilter.GaussianBlur(1.6))
img.alpha_composite(stars)

img.alpha_composite(moon)

out = os.path.join(os.path.dirname(__file__), "assets")
os.makedirs(out, exist_ok=True)
img.save(os.path.join(out, "icon.png"))
img.save(
    os.path.join(out, "icon.ico"),
    sizes=[(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (16, 16)],
)
print("saved")
