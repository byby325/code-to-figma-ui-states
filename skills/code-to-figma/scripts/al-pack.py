#!/usr/bin/env python3
# al-pack.py NAME JSON_DIR OUT_DIR [PRESET]
# Packs JSON_DIR/NAME.json (al-extract.js output), al-bind.js and al-build.js into OUT_DIR/ALDATA-NAME.svg.
# Raster images are saved separately as OUT_DIR/ALIMG-NAME-<ref>.png|jpg and sent as native images with upload_assets, not put in the data SVG:
# every character of base64 text in a data SVG gets laid out on import, and a few MB makes Figma's memory usage spike instantly (scale-guard.md "Incident").
# PRESET is a file name in figma-library-binding/presets/ (e.g. my-ds). When given, its libs go into the data and __alBuild binds automatically.
# The <text> elements in the SVG hold base64; after upload_assets imports it into Figma, use_figma reads it back and evals it (see web-capture.md "4. Send to Figma").
import base64, glob, json, os, re, sys
MAX_SVG_BYTES = 2 * 1024 * 1024  # Conservative: an 8.6MB import at once crashed, a single 3.7MB file never did; the exact threshold was not measured
MAX_IMAGE_BYTES = 10 * 1024 * 1024  # upload_assets per-file limit
here = os.path.dirname(os.path.abspath(__file__))
name, json_dir, out_dir = sys.argv[1], sys.argv[2], sys.argv[3]
presets = os.path.join(here, '..', '..', 'figma-library-binding')
sources = [os.path.join(presets, 'scripts', 'al-bind.js'), os.path.join(here, 'al-build.js')]
js = '\n'.join(open(f, encoding='utf-8').read() for f in sources).encode('ascii', 'backslashreplace')  # atob only accepts Latin-1, so convert non-ASCII to \uXXXX first
parsed = json.load(open(os.path.join(json_dir, name + '.json'), encoding='utf-8'))
if len(sys.argv) > 4:
    parsed['libs'] = json.load(open(os.path.join(presets, 'presets', sys.argv[4] + '.json'), encoding='utf-8'))['libs']
os.makedirs(out_dir, exist_ok=True)
# Delete same-name images left by the previous pack first, so old files don't get uploaded
for old in glob.glob(os.path.join(out_dir, f'ALIMG-{name}-img*')):
    os.remove(old)
images, uploads = parsed.get('images') or {}, []
for ref, v in images.items():
    m = re.match(r'data:image/(png|jpeg);base64,', v or '')
    if not m:
        continue  # SVG image files (svg:) and images that could not be extracted (null) stay in the data
    raw = base64.b64decode(v[m.end():])
    fn = f'ALIMG-{name}-{ref}.' + ('png' if m.group(1) == 'png' else 'jpg')
    if len(raw) > MAX_IMAGE_BYTES:
        print(f'{name}: image {ref} is {len(raw) / 1048576:.1f}MB, over the 10MB upload_assets limit; downscale it first', file=sys.stderr)
        sys.exit(1)
    open(os.path.join(out_dir, fn), 'wb').write(raw)
    images[ref] = 'upload:' + fn
    uploads.append((fn, len(raw)))
data = json.dumps(parsed, ensure_ascii=True).encode('ascii')
def chunks(prefix, raw, n=20000):
    b = base64.b64encode(raw).decode()
    return ''.join(f'<text id="{prefix}{i:03d}" x="0" y="{i+1}" font-size="1">{b[j:j+n]}</text>' for i, j in enumerate(range(0, len(b), n)))
svg = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10">' + chunks('c', js) + chunks('d', data) + '</svg>'
if len(svg) > MAX_SVG_BYTES:
    inline = sorted(((ref, len(v)) for ref, v in images.items() if v and not v.startswith('upload:')), key=lambda kv: kv[1], reverse=True)[:5]
    print(f'{name}: data SVG is {len(svg) / 1048576:.1f}MB, over {MAX_SVG_BYTES // 1048576}MB. The layout is too large: split it into several viewport-height screens and capture again', file=sys.stderr)
    for ref, size in inline:
        print(f'  inline SVG image {ref}: {size} characters', file=sys.stderr)
    sys.exit(1)
out = os.path.join(out_dir, 'ALDATA-' + name + '.svg')
open(out, 'w').write(svg)
print(out, len(svg))
if uploads:
    print(f'{len(uploads)} images, {sum(s for _, s in uploads) / 1048576:.1f}MB. Upload these images with upload_assets first, then the data SVG, and do only this one screen at a time:')
    for fn, _ in uploads:
        print('  ' + os.path.join(out_dir, fn))
