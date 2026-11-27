import numpy as np, math, subprocess, sys
from PIL import Image, ImageDraw, ImageFont, ImageFilter

W, H, FPS, DUR = 1080, 1920, 30, 15
N = FPS * DUR
HOR = int(H * 0.66)
OUT = sys.argv[1]
JP = "/usr/share/fonts/opentype/ipafont-gothic/ipagp.ttf"
LOGO = "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf"

def ease(t): t = min(max(t, 0), 1); return t * t * (3 - 2 * t)
def seg(t, a, b): return ease((t - a) / (b - a))
def lerp(a, b, t): return a + (b - a) * t
def mix(c1, c2, t): return np.array(c1) * (1 - t) + np.array(c2) * t

# sky palettes (top, mid, horizon)
NIGHT = [(8, 12, 40), (25, 30, 80), (70, 50, 100)]
DAWN = [(40, 50, 120), (200, 90, 90), (255, 160, 70)]
DAY = [(70, 140, 220), (150, 200, 240), (255, 225, 170)]

ys = np.linspace(0, 1, HOR)[:, None]
def sky(t):
    a = seg(t, 0.0, 0.45); b = seg(t, 0.40, 0.85)
    cols = [mix(mix(NIGHT[i], DAWN[i], a), DAY[i], b) for i in range(3)]
    top, mid, hz = cols
    g = np.where(ys < 0.6, mix(top, mid, 0)[None] * 0 + (top * (1 - ys / 0.6) + mid * (ys / 0.6)),
                 mid * (1 - (ys - 0.6) / 0.4) + hz * ((ys - 0.6) / 0.4))
    return np.repeat(g[:, None, :], W, axis=1).reshape(HOR, W, 3)

rng = np.random.default_rng(3)
stars = [(rng.integers(0, W), rng.integers(0, int(HOR * 0.7)), rng.uniform(1, 3)) for _ in range(120)]
f_big = ImageFont.truetype(JP, 96)
f_mid = ImageFont.truetype(JP, 68)
f_brand = ImageFont.truetype(LOGO, 120)
f_small = ImageFont.truetype(JP, 40)

R = 215
import os
_LOGO_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "assets", "JOELNA_logo_round_official.png")
def _load_logo():
    im = Image.open(_LOGO_PATH).convert("RGBA")
    cx0, cy0, r0 = 620, 622, 607          # measured outer edge of the brown ring
    im = im.crop((cx0 - r0, cy0 - r0, cx0 + r0, cy0 + r0)).resize((2 * R, 2 * R), Image.LANCZOS)
    m = Image.new("L", (8 * R, 8 * R), 0); ImageDraw.Draw(m).ellipse([0, 0, 8 * R - 1, 8 * R - 1], fill=255)
    im.putalpha(m.resize((2 * R, 2 * R), Image.LANCZOS))
    return im
LOGO_IMG = _load_logo()

# bright glow (radial, precomputed) and long light beams
GS = 1500
yy, xx = np.mgrid[0:GS, 0:GS]; rr = np.hypot(xx - GS / 2, yy - GS / 2)
GLOW = np.zeros((GS, GS, 4), np.uint8)
inten = np.clip(np.exp(-((rr - R) .clip(0)) / 120) * 0.95 + np.exp(-rr / 420) * 0.55, 0, 1)
inten = inten * np.clip(1 - rr / 745, 0, 1) ** 1.2
GLOW[..., 0] = 255; GLOW[..., 1] = (215 + 35 * np.exp(-rr / 300)).astype(np.uint8); GLOW[..., 2] = (120 + 120 * np.exp(-rr / 260)).astype(np.uint8)
GLOW[..., 3] = (255 * inten).astype(np.uint8)
GLOW_IMG = Image.fromarray(GLOW, "RGBA")
BEAM = Image.new("RGBA", (GS, GS), (0, 0, 0, 0)); bd_ = ImageDraw.Draw(BEAM)
for k in range(12):
    ang = k * math.pi / 6; wd = 0.10 if k % 2 else 0.06
    pts = [(GS / 2, GS / 2), (GS / 2 + 760 * math.cos(ang - wd), GS / 2 + 760 * math.sin(ang - wd)),
           (GS / 2 + 760 * math.cos(ang + wd), GS / 2 + 760 * math.sin(ang + wd))]
    bd_.polygon(pts, fill=(255, 240, 190, 70))
BEAM = BEAM.filter(ImageFilter.GaussianBlur(18))
bm = np.asarray(BEAM).copy(); bm[..., 3] = (bm[..., 3] * np.clip(1 - rr / 750, 0, 1)).astype(np.uint8)
BEAM = Image.fromarray(bm, "RGBA")

def sun_layer(cx, cy, rot, glow, sec=0):
    L = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    pulse = 0.9 + 0.1 * math.sin(sec * 2.2)
    g = GLOW_IMG.copy(); g.putalpha(g.getchannel("A").point(lambda v: int(v * min(1, glow * pulse))))
    L = _place(g, cx, cy)
    b = BEAM.rotate(math.degrees(rot) * 0.5, resample=Image.BILINEAR)
    b.putalpha(b.getchannel("A").point(lambda v: int(v * glow)))
    L = Image.alpha_composite(L, _place(b, cx, cy))
    d = ImageDraw.Draw(L)
    # sharp rays, bright yellow-white
    for k in range(16):
        ang = rot + k * math.pi / 8
        r1, r2, wd = R + 22, R + 105 + (30 if k % 2 else 0) + 10 * math.sin(sec * 3 + k), 0.075
        pts = [(cx + r1 * math.cos(ang - wd), cy + r1 * math.sin(ang - wd)),
               (cx + r2 * math.cos(ang), cy + r2 * math.sin(ang)),
               (cx + r1 * math.cos(ang + wd), cy + r1 * math.sin(ang + wd))]
        d.polygon(pts, fill=(255, 225, 90, 255))
    # gold ring
    for i, c in enumerate([(255, 170, 30), (255, 200, 60), (255, 235, 140), (255, 250, 220)]):
        rr_ = R + 18 - i * 4
        d.ellipse([cx - rr_, cy - rr_, cx + rr_, cy + rr_], fill=c + (255,))
    L.alpha_composite(LOGO_IMG, (int(cx - R), int(cy - R)))
    # soft warm shine over the logo
    sh = Image.new("RGBA", (2 * R, 2 * R), (0, 0, 0, 0)); sd = ImageDraw.Draw(sh)
    sd.ellipse([0, 0, 2 * R - 1, 2 * R - 1], fill=(255, 230, 150, int(35 * glow)))
    sd.ellipse([R * 0.35, R * 0.2, R * 0.95, R * 0.6], fill=(255, 255, 255, int(70 * glow)))
    sh = sh.filter(ImageFilter.GaussianBlur(25)); sh.putalpha(Image.composite(sh.getchannel("A"), Image.new("L", sh.size, 0), LOGO_IMG.getchannel("A")))
    L.alpha_composite(sh, (int(cx - R), int(cy - R)))
    return L

def _place(layer, cx, cy):
    C = Image.new("RGBA", (W, H), (0, 0, 0, 0)); C.paste(layer, (int(cx - GS / 2), int(cy - GS / 2))); return C

def swallow(d, x, y, s, flap, col):
    w = s * (0.6 + 0.4 * flap)
    d.polygon([(x - s, y - w * 0.5), (x - s * 0.2, y), (x, y + s * 0.15), (x + s * 0.2, y),
               (x + s, y - w * 0.5), (x + s * 0.15, y + s * 0.3), (x, y + s * 0.6),
               (x - s * 0.15, y + s * 0.3)], fill=col)

def text_fx(base, txt, font, y, alpha, rise, fill, stroke):
    if alpha <= 0: return base
    T = Image.new("RGBA", (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(T)
    yy = y + (1 - rise) * 40
    d.text((W // 2 + 4, yy + 5), txt, font=font, anchor="mm", fill=(0, 0, 0, int(110 * alpha)))
    d.text((W // 2, yy), txt, font=font, anchor="mm", fill=fill + (int(255 * alpha),),
           stroke_width=3, stroke_fill=stroke + (int(255 * alpha),))
    return Image.alpha_composite(base, T)

ff = subprocess.Popen(["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24",
    "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-", "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo",
    "-shortest", "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-movflags", "+faststart", OUT], stdin=subprocess.PIPE)

for f in range(N):
    t = f / N; sec = f / FPS
    img = np.zeros((H, W, 3))
    img[:HOR] = sky(t)
    # sea
    sea_top = mix(mix((20, 25, 60), (150, 80, 70), seg(t, 0, .45)), (60, 120, 180), seg(t, .4, .85))
    sea_bot = sea_top * 0.45
    sy = np.linspace(0, 1, H - HOR)[:, None, None]
    img[HOR:] = sea_top * (1 - sy) + sea_bot * sy
    fr = Image.fromarray(img.clip(0, 255).astype(np.uint8)).convert("RGBA")
    d = ImageDraw.Draw(fr)
    # stars fade out
    sa = 1 - seg(t, 0.05, 0.35)
    if sa > 0:
        for (x, y, r) in stars:
            tw = 0.6 + 0.4 * math.sin(sec * 3 + x)
            d.ellipse([x - r, y - r, x + r, y + r], fill=(255, 255, 240, int(255 * sa * tw)))
    # sun rises 0.5s -> 8s
    p = seg(sec, 0.5, 8.0)
    cy = lerp(HOR + R + 120, HOR * 0.36, p)
    cx = W // 2
    sun = sun_layer(cx, int(cy), sec * 0.35, 0.5 + 0.5 * p, sec)
    # clip sun at horizon
    mask = Image.new("L", (W, H), 0); ImageDraw.Draw(mask).rectangle([0, 0, W, HOR], fill=255)
    sun.putalpha(Image.composite(sun.getchannel("A"), Image.new("L", (W, H), 0), mask))
    fr = Image.alpha_composite(fr, sun)
    # water reflection
    if cy < HOR + R:
        Rf = Image.new("RGBA", (W, H), (0, 0, 0, 0)); rd = ImageDraw.Draw(Rf)
        strength = min(1, (HOR + R - cy) / (2 * R))
        for i in range(26):
            yy = HOR + 12 + i * 22
            ww = (170 - i * 5) * (0.8 + 0.2 * math.sin(sec * 4 + i * 1.3))
            off = 12 * math.sin(sec * 2.5 + i)
            rd.rounded_rectangle([cx - ww + off, yy, cx + ww + off, yy + 8], 4,
                                 fill=(255, 230, 150, int(220 * strength * (1 - i / 28))))
        fr = Image.alpha_composite(fr, Rf.filter(ImageFilter.GaussianBlur(2)))
    # horizon line shine
    d = ImageDraw.Draw(fr)
    d.line([(0, HOR), (W, HOR)], fill=(255, 220, 160, int(120 * seg(sec, 1, 4))), width=2)
    # swallows fly across 8s ->15s
    if sec > 7.5:
        B = Image.new("RGBA", (W, H), (0, 0, 0, 0)); bd = ImageDraw.Draw(B)
        for j, (dl, y0, s) in enumerate([(7.5, 300, 34), (8.0, 380, 26), (8.6, 250, 22)]):
            u = (sec - dl) / 6.5
            if 0 <= u <= 1.1:
                x = lerp(-80, W + 80, u); y = y0 - 60 * math.sin(u * math.pi) + 10 * math.sin(sec * 6 + j)
                swallow(bd, x, y, s, abs(math.sin(sec * 9 + j)), (30, 30, 50, 230))
        fr = Image.alpha_composite(fr, B)
    # texts
    fr = text_fx(fr, "おはようございます。", f_big, 1360, seg(sec, 6.5, 8.0), seg(sec, 6.5, 8.0),
                 (255, 255, 255), (200, 90, 20))
    fr = text_fx(fr, "今日も1日頑張って下さい", f_mid, 1500, seg(sec, 9.0, 10.5), seg(sec, 9.0, 10.5),
                 (255, 255, 255), (40, 90, 160))
    fr = text_fx(fr, "JOELNA", f_brand, 1700, seg(sec, 11.5, 13.0), seg(sec, 11.5, 13.0),
                 (255, 240, 200), (150, 70, 0))
    # fade in/out
    fade = min(seg(sec, 0, 0.8), 1 - seg(sec, 14.3, 15.0))
    out = (np.asarray(fr.convert("RGB")).astype(np.float32) * fade).astype(np.uint8)
    ff.stdin.write(out.tobytes())
ff.stdin.close(); ff.wait()
print("done", ff.returncode)
