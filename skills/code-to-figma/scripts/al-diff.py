#!/usr/bin/env python3
# al-diff.py SHOT_DIR FIGMA_DIR [REPORT_DIR]
# Compares browser screenshots SHOT_DIR/<ID>.jpg with Figma screenshots FIGMA_DIR/<ID>.png and lists the difference ratios from high to low,
# saves the screens with the largest differences side by side as REPORT_DIR/worst.png, and saves the bands with the largest difference in each as <ID>-diff<n>.png. Needs Pillow.
# Text covers few pixels, so the ratio is insensitive to shifted text: check audit-screens.js drift for text offsets; use this script to find which screens to zoom in on.
#
# When you only have group screenshots, put crops.json in FIGMA_DIR: {"M01": ["group.png", x, y]}. Each screen is cropped out before comparing,
# and the closest position within 14px up or down is searched (card positions in a group screenshot are not always whole numbers).
# A Figma screenshot at another scale (e.g. a 2x export) is scaled to the browser width. If its height then differs, the two are compared
# top-aligned and the missing or extra part counts as difference; the report lists these screens under "Size mismatch".
import json, os, sys
from PIL import Image, ImageChops, ImageFilter

NOISE_THRESHOLD = 48  # 0-255; differences below this are treated as font anti-aliasing and not counted
BLUR_RADIUS = 1.2  # Blur first so edge differences within 1px are not counted
CROP_SEARCH = 14
SIZE_TOLERANCE = 2  # px of height difference, after scaling to the browser width, that still counts as the same size
WORST_N = 4
BANDS_N = 3  # How many of the largest-difference bands to list and crop per screen
BAND_PAD = 60
BAND_MAX_W = 1400

blur = ImageFilter.GaussianBlur(BLUR_RADIUS)


def mask(a, b):
    r, g, bl = ImageChops.difference(a, b).split()
    return ImageChops.lighter(ImageChops.lighter(r, g), bl).point(lambda v: 255 if v > NOISE_THRESHOLD else 0)


def score(figma, ref):
    m = mask(figma.filter(blur), ref.filter(blur))
    return m.histogram()[255] / (ref.width * ref.height), m


def bands(m):
    # Which bands of the screen the difference concentrates in, sorted by amount from largest to smallest: a tool problem in one row usually concentrates in the largest band, so start reading there
    profile = m.resize((1, m.height), Image.BOX).tobytes()
    segs = []
    for y, v in enumerate(profile):
        if v <= 10:
            continue
        if segs and y - segs[-1][1] <= 6:
            segs[-1][1] = y
            segs[-1][2] += v
        else:
            segs.append([y, y, v])
    segs.sort(key=lambda s: -s[2])
    return [[a, b] for a, b, _ in segs[:BANDS_N]]


def save_bands(card, b, figma, ref, report_dir):
    # Each band has the browser on top and Figma below, with some extra range above and below so you can tell which section it is
    out = []
    for i, (a, z) in enumerate(b):
        top, bottom = max(0, a - BAND_PAD), min(ref.height, z + BAND_PAD)
        h = bottom - top
        pair = Image.new('RGB', (ref.width, h * 2 + 6), 'red')
        pair.paste(ref.crop((0, top, ref.width, bottom)), (0, 0))
        pair.paste(figma.crop((0, top, ref.width, bottom)), (0, h + 6))
        if pair.width > BAND_MAX_W:
            pair = pair.resize((BAND_MAX_W, round(pair.height * BAND_MAX_W / pair.width)))
        path = os.path.join(report_dir, f'{card}-diff{i + 1}.png')
        pair.save(path)
        out.append(path)
    return out


def load_figma(figma_dir, crops, card, ref, mismatched):
    if card in crops:
        name, x, y = crops[card]
        group = Image.open(os.path.join(figma_dir, name)).convert('RGB')
        return min((group.crop((x, y + dy, x + ref.width, y + dy + ref.height)) for dy in range(-CROP_SEARCH, CROP_SEARCH + 1)), key=lambda c: score(c, ref)[0])
    path = os.path.join(figma_dir, card + '.png')
    if not os.path.exists(path):
        return None
    return fit(Image.open(path).convert('RGB'), ref, card, mismatched)


def fit(img, ref, card, mismatched):
    if img.size == ref.size:
        return img
    height = round(img.height * ref.width / img.width)
    if abs(height - ref.height) <= SIZE_TOLERANCE:
        return img.resize(ref.size)
    # Different proportions: stretching would smear the whole screen into small offsets and hide that the height is wrong
    mismatched.append(f'{card}: Figma {img.width}x{img.height}, browser {ref.width}x{ref.height}')
    canvas = Image.new('RGB', ref.size, 'magenta')
    canvas.paste(img.resize((ref.width, height)), (0, 0))
    return canvas


def main():
    if len(sys.argv) < 3:
        sys.exit('Usage: al-diff.py SHOT_DIR FIGMA_DIR [REPORT_DIR]')
    shot_dir, figma_dir = sys.argv[1], sys.argv[2]
    report_dir = sys.argv[3] if len(sys.argv) > 3 else figma_dir
    crops_path = os.path.join(figma_dir, 'crops.json')
    crops = json.load(open(crops_path)) if os.path.exists(crops_path) else {}
    results, missing, mismatched = [], [], []
    for f in sorted(os.listdir(shot_dir)):
        card, ext = os.path.splitext(f)
        if ext != '.jpg':
            continue
        ref = Image.open(os.path.join(shot_dir, f)).convert('RGB')
        figma = load_figma(figma_dir, crops, card, ref, mismatched)
        if figma is None:
            missing.append(card)
            continue
        pct, m = score(figma, ref)
        results.append((round(pct * 100, 2), card, bands(m), figma, ref))
    if not results:
        sys.exit('No screens to compare: check that FIGMA_DIR has <ID>.png or crops.json')
    results.sort(key=lambda r: -r[0])
    os.makedirs(report_dir, exist_ok=True)
    for pct, card, b, figma, ref in results:
        print(f'{pct:5.2f}%  {card}  bands with the largest difference (y ranges, largest first) {b}')
    print('Median', sorted(r[0] for r in results)[len(results) // 2], '%')
    if missing:
        print('No Figma screenshot:', ' '.join(missing))
    if mismatched:
        print('Size mismatch (compared top-aligned at the browser width; fix the screen height first, the ratio above is not comparable):')
        for line in mismatched:
            print('  ' + line)
    # For high-difference screens, look at these crops first, then check the source code for the cause; don't guess from the whole thumbnail
    for pct, card, b, figma, ref in results[:WORST_N]:
        print(f'{card} band crops (top: browser, bottom: Figma):', ' '.join(save_bands(card, b, figma, ref, report_dir)))
    worst = results[:WORST_N]
    gap = 16
    width = sum(r[4].width * 2 + gap * 2 for r in worst)
    sheet = Image.new('RGB', (width, max(r[4].height for r in worst)), 'white')
    x = 0
    for _, _, _, figma, ref in worst:
        sheet.paste(figma, (x, 0))
        sheet.paste(ref, (x + ref.width + gap, 0))
        x += ref.width * 2 + gap * 2
    sheet.save(os.path.join(report_dir, 'worst.png'))
    print('Side-by-side image:', os.path.join(report_dir, 'worst.png'), '(each pair: Figma on the left, browser on the right)')


main()
