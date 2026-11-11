#!/usr/bin/env python3
# al-upload.py URLS_FILE FILE...
# POSTs the files in order to the submitUrl values from upload_assets, one file per URL, and prints which node each file was placed on.
# URLS_FILE has one submitUrl per line, in the same order as FILE. For each screen, list the images first and the data SVG last (al-pack.py lists the files).
# Upload one at a time: parallel uploads sometimes import the data SVG as empty text. The file name becomes the Figma layer name and __alBuild uses it to match images, so don't rename files.
import json, mimetypes, os, subprocess, sys

if len(sys.argv) < 3:
    sys.exit('Usage: al-upload.py URLS_FILE FILE...')
urls = [u.strip() for u in open(sys.argv[1]) if u.strip()]
files = sys.argv[2:]
if len(urls) != len(files):
    sys.exit(f'{len(urls)} URLs and {len(files)} files; the counts must match')
svg_at = [i for i, f in enumerate(files) if f.endswith('.svg')]
if svg_at and svg_at[-1] != len(files) - 1:
    sys.exit('The data SVG must come last: images must arrive first so the build can find them')
failed = 0
for url, path in zip(urls, files):
    name = os.path.basename(path)
    typ = 'image/svg+xml' if path.endswith('.svg') else (mimetypes.guess_type(path)[0] or 'application/octet-stream')
    out = subprocess.run(['curl', '-s', '-X', 'POST', '-F', f'file=@{path};type={typ};filename={name}', url], capture_output=True, text=True).stdout
    try:
        res = json.loads(out)
    except ValueError:
        res = {}
    if res.get('success'):
        print(name, res.get('placedOnNodeId') or res.get('targetNodeId') or '')
    else:
        failed += 1
        print(name, 'failed', out[:200], file=sys.stderr)
print(f'{len(files) - failed}/{len(files)} succeeded')
sys.exit(1 if failed else 0)
