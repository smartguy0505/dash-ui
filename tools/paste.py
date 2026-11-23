#!/usr/bin/env python3
"""Paste dash.css and dash.js into a page that has to be one file (a server that sends only the page, say).

Put two empty tags in the page's <head>, once:

    <style id="dash-ui-css"></style>
    <script id="dash-ui-js"></script>

and a third after the first for the utility classes, if the page uses them (dash-utils.css):

    <style id="dash-ui-utils"></style>

then run this whenever the kit changes:

    python3 /path/to/dash-ui/tools/paste.py page.html            fill (or refresh) the two tags
    python3 /path/to/dash-ui/tools/paste.py page.html --check    exit 1 if the page's copy is out of date
    python3 /path/to/dash-ui/tools/paste.py page.html --out x.html   write the result elsewhere

A comment line starting with <!-- dash-ui is rewritten to say which version and commit went in. The page is
replaced in one rename, so a server reading it never sees half a file. Never edit the pasted part by hand.
"""
import argparse
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

KIT = Path(__file__).resolve().parent.parent
STAMP = re.compile(r'<!-- dash-ui[^\n]*?-->')
BLOCKS = (('dash.css', re.compile(r'(<style id="dash-ui-css">)(.*?)(</style>)', re.S)),
          ('dash.js', re.compile(r'(<script id="dash-ui-js">)(.*?)(</script>)', re.S)))
# filled only when the page has the tag
OPTIONAL = (('dash-utils.css', re.compile(r'(<style id="dash-ui-utils">)(.*?)(</style>)', re.S)),)


def kit_files():
    files = {name: (KIT / name).read_text(encoding='utf-8') for name, _ in BLOCKS + OPTIONAL}
    if '</style' in files['dash.css'].lower() or '</style' in files['dash-utils.css'].lower() or '</script' in files['dash.js'].lower():
        sys.exit('the kit contains </style> or </script>, which would end the pasted block early')
    m = re.match(r'/\* dash-ui (\d+\.\d+\.\d+)', files['dash.css'])
    if not m:
        sys.exit(f'no version on the first line of {KIT / "dash.css"}')
    return files, m.group(1)


def commit():
    git = ['git', '-C', str(KIT)]
    try:
        sha = subprocess.run(git + ['rev-parse', '--short', 'HEAD'], capture_output=True, text=True, check=True).stdout.strip()
        dirty = subprocess.run(git + ['status', '--porcelain', '--', 'dash.css', 'dash.js', 'dash-utils.css'], capture_output=True, text=True, check=True).stdout.strip()
    except (OSError, subprocess.CalledProcessError):
        return None
    return sha + (' + uncommitted changes' if dirty else '')


def main():
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument('page')
    p.add_argument('--out', help='where to write (default: the page itself)')
    p.add_argument('--check', action='store_true', help="only compare; exit 1 if the page's copy is out of date")
    args = p.parse_args()

    files, version = kit_files()
    page = Path(args.page).read_text(encoding='utf-8')
    for name, rx in BLOCKS:
        n = len(rx.findall(page))
        if n != 1:
            tag = '<style id="dash-ui-css"></style>' if name == 'dash.css' else '<script id="dash-ui-js"></script>'
            sys.exit(f'{args.page}: needs exactly one {tag} (found {n})')
    blocks = list(BLOCKS)
    for name, rx in OPTIONAL:
        n = len(rx.findall(page))
        if n > 1:
            sys.exit(f'{args.page}: has {n} <style id="dash-ui-utils"> tags; keep one')
        if n == 1:
            blocks.append((name, rx))

    if args.check:
        stale = [name for name, rx in blocks if rx.search(page).group(2) != files[name]]
        if stale:
            print(f'{args.page}: out of date ({", ".join(stale)}); run {Path(__file__).name} {args.page}')
            return 1
        print(f'{args.page}: has dash-ui {version}, the same as {KIT}')
        return 0

    sha = commit()
    if sha and 'uncommitted' in sha:
        print(f'warning: {KIT} has uncommitted changes to the kit files', file=sys.stderr)
    out = page
    for name, rx in blocks:
        out = rx.sub(lambda m, body=files[name]: m.group(1) + body + m.group(3), out, count=1)
    stamp = f'<!-- dash-ui {version}{f" @ {sha}" if sha else ""}, pasted by tools/paste.py: change the kit, then paste again -->'
    out = STAMP.sub(lambda m: stamp, out, count=1)

    dest = Path(args.out or args.page)
    fd, tmp = tempfile.mkstemp(dir=dest.parent, prefix='.' + dest.name + '.')
    with os.fdopen(fd, 'w', encoding='utf-8') as f:
        f.write(out)
    os.chmod(tmp, 0o644)
    os.replace(tmp, dest)
    print(f'{dest}: dash-ui {version}{f" @ {sha}" if sha else ""}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
