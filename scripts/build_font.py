#!/usr/bin/env python3
"""
build_font.py — Draft .otf font from Matlack glyph geometry.

Usage:
  1. In the Matlack canvas, click "export json" to download matlack-glyphs.json.
  2. uv run python3 scripts/build_font.py matlack-glyphs.json matlack-draft.otf

Requires: ufo2ft, defcon  (uv sync handles this)

Coordinate conversion
---------------------
The JSON exports glyphs at size=200, cx=0, cy=0 (SVG Y-down).
We convert to font Y-up coords:
  font_x = svg_x * SCALE + LSB
  font_y = -svg_y * SCALE + Y_SHIFT

SCALE     = UPM / EXPORT_SIZE  (maps export units to font units)
Y_SHIFT   = X_HEIGHT // 2      (REF_CENTER is x-height midline, not baseline)
"""

import json
import os
import re
import sys
import tempfile

# ── Font metrics ──────────────────────────────────────────────────────────────
UPM         = 1000
ASCENDER    = 800
X_HEIGHT    = 500
DESCENDER   = -200
CAP_HEIGHT  = 700
EXPORT_SIZE = 200          # must match exportGlyphsForFont(size=) in JS
SCALE       = UPM / EXPORT_SIZE   # 5.0
Y_SHIFT     = X_HEIGHT // 2       # 250 — REF_CENTER is x-height midline
LSB         = 50                  # left side bearing (font units)
RSB         = 50                  # right side bearing (font units)


# ── SVG path parser ───────────────────────────────────────────────────────────
def parse_path_d(d):
    """Parse SVG path d-string (M/L/Z only) into (cmd, args) tuples."""
    tokens = re.findall(r'[MLZmlz]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?', d)
    ops = []
    i = 0
    while i < len(tokens):
        t = tokens[i]
        if t in 'MLZmlz':
            cmd = t.upper()
            i += 1
            if cmd == 'Z':
                ops.append(('Z', []))
            else:
                ops.append((cmd, [float(tokens[i]), float(tokens[i + 1])]))
                i += 2
        else:
            prev = ops[-1][0] if ops else 'M'
            ops.append((prev, [float(tokens[i]), float(tokens[i + 1])]))
            i += 2
    return ops


def svg_to_font(x, y):
    """Convert export SVG coords to font Y-up coords."""
    return round(x * SCALE + LSB), round(-y * SCALE + Y_SHIFT)


# ── Advance width estimation ──────────────────────────────────────────────────
def estimate_advance(paths):
    max_x = 0.0
    for p in paths:
        nums = re.findall(r'[-+]?\d+\.?\d*', p['d'])
        xs = [float(nums[i]) for i in range(0, len(nums) - 1, 2)]
        if xs:
            max_x = max(max_x, max(xs))
    return round(max_x * SCALE + LSB + RSB)


# ── GLIF builder ─────────────────────────────────────────────────────────────
def contour_xml(pts):
    lines = ['    <contour>']
    for x, y in pts:
        lines.append(f'      <point x="{x}" y="{y}" type="line"/>')
    lines.append('    </contour>')
    return '\n'.join(lines)


def paths_to_glif(gname, unicode_val, adv, paths):
    contours = []
    for p in paths:
        current = []
        for cmd, args in parse_path_d(p['d']):
            if cmd == 'M':
                if current:
                    contours.append(contour_xml(current))
                current = [svg_to_font(args[0], args[1])]
            elif cmd == 'L':
                current.append(svg_to_font(args[0], args[1]))
            elif cmd == 'Z':
                if current:
                    contours.append(contour_xml(current))
                    current = []
        if current:
            contours.append(contour_xml(current))

    uni_el = f'  <unicode hex="{unicode_val:04X}"/>\n' if unicode_val is not None else ''
    outline = '\n'.join(contours)
    return (
        f'<?xml version="1.0" encoding="UTF-8"?>\n'
        f'<glyph name="{gname}" format="2">\n'
        f'  <advance width="{adv}"/>\n'
        f'{uni_el}'
        f'  <outline>\n{outline}\n  </outline>\n'
        f'</glyph>\n'
    )


# ── UFO writer ────────────────────────────────────────────────────────────────
def write_ufo(ufo_dir, glyph_order, glyph_metrics, glyphs):
    os.makedirs(os.path.join(ufo_dir, 'glyphs'), exist_ok=True)

    # metainfo.plist
    with open(os.path.join(ufo_dir, 'metainfo.plist'), 'w') as f:
        f.write('<?xml version="1.0" encoding="UTF-8"?>\n'
                '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"'
                ' "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n'
                '<plist version="1.0"><dict>\n'
                '  <key>creator</key><string>build_font.py</string>\n'
                '  <key>formatVersion</key><integer>3</integer>\n'
                '</dict></plist>\n')

    # fontinfo.plist
    with open(os.path.join(ufo_dir, 'fontinfo.plist'), 'w') as f:
        f.write(f'<?xml version="1.0" encoding="UTF-8"?>\n'
                f'<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"'
                f' "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n'
                f'<plist version="1.0"><dict>\n'
                f'  <key>familyName</key><string>Matlack Draft</string>\n'
                f'  <key>unitsPerEm</key><integer>{UPM}</integer>\n'
                f'  <key>ascender</key><integer>{ASCENDER}</integer>\n'
                f'  <key>descender</key><integer>{DESCENDER}</integer>\n'
                f'  <key>xHeight</key><integer>{X_HEIGHT}</integer>\n'
                f'  <key>capHeight</key><integer>{CAP_HEIGHT}</integer>\n'
                f'</dict></plist>\n')

    # layercontents.plist (required by UFO3)
    with open(os.path.join(ufo_dir, 'layercontents.plist'), 'w') as f:
        f.write('<?xml version="1.0" encoding="UTF-8"?>\n'
                '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"'
                ' "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n'
                '<plist version="1.0"><array>\n'
                '  <array><string>public.default</string><string>glyphs</string></array>\n'
                '</array></plist>\n')

    # lib.plist (glyph order)
    order_items = '\n'.join(f'    <string>{g}</string>' for g in glyph_order)
    with open(os.path.join(ufo_dir, 'lib.plist'), 'w') as f:
        f.write(f'<?xml version="1.0" encoding="UTF-8"?>\n'
                f'<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"'
                f' "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n'
                f'<plist version="1.0"><dict>\n'
                f'  <key>public.glyphOrder</key><array>\n{order_items}\n  </array>\n'
                f'</dict></plist>\n')

    # Write glyph files
    glyph_files = {}

    notdef = ('<?xml version="1.0" encoding="UTF-8"?>\n'
              '<glyph name=".notdef" format="2">\n'
              '  <advance width="500"/>\n  <outline>\n'
              '    <contour>\n'
              '      <point x="50" y="-200" type="line"/>\n'
              '      <point x="450" y="-200" type="line"/>\n'
              '      <point x="450" y="800" type="line"/>\n'
              '      <point x="50" y="800" type="line"/>\n'
              '    </contour>\n'
              '    <contour>\n'
              '      <point x="100" y="-150" type="line"/>\n'
              '      <point x="100" y="750" type="line"/>\n'
              '      <point x="400" y="750" type="line"/>\n'
              '      <point x="400" y="-150" type="line"/>\n'
              '    </contour>\n'
              '  </outline>\n</glyph>\n')
    with open(os.path.join(ufo_dir, 'glyphs', '_notdef.glif'), 'w') as f:
        f.write(notdef)
    glyph_files['.notdef'] = '_notdef.glif'

    space = ('<?xml version="1.0" encoding="UTF-8"?>\n'
             '<glyph name="space" format="2">\n'
             '  <advance width="250"/>\n'
             '  <unicode hex="0020"/>\n'
             '  <outline/>\n</glyph>\n')
    with open(os.path.join(ufo_dir, 'glyphs', 'space.glif'), 'w') as f:
        f.write(space)
    glyph_files['space'] = 'space.glif'

    for letter, paths in glyphs.items():
        gname = f'uni{ord(letter):04X}'
        adv = glyph_metrics[gname]
        glif = paths_to_glif(gname, ord(letter), adv, paths)
        fname = f'{gname}.glif'
        with open(os.path.join(ufo_dir, 'glyphs', fname), 'w') as f:
            f.write(glif)
        glyph_files[gname] = fname

    # contents.plist
    entries = '\n'.join(f'  <key>{g}</key><string>{fn}</string>'
                        for g, fn in glyph_files.items())
    with open(os.path.join(ufo_dir, 'glyphs', 'contents.plist'), 'w') as f:
        f.write(f'<?xml version="1.0" encoding="UTF-8"?>\n'
                f'<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"'
                f' "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n'
                f'<plist version="1.0"><dict>\n{entries}\n</dict></plist>\n')


# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)

    with open(sys.argv[1]) as f:
        data = json.load(f)

    glyphs = data['glyphs']
    out_path = sys.argv[2]

    glyph_order = (['.notdef', 'space'] +
                   [f'uni{ord(c):04X}' for c in 'abcdefghijklmnopqrstuvwxyz'])

    glyph_metrics = {'.notdef': 500, 'space': 250}
    for letter, paths in glyphs.items():
        glyph_metrics[f'uni{ord(letter):04X}'] = estimate_advance(paths)

    ufo_dir = tempfile.mkdtemp(suffix='.ufo')
    print(f"Writing UFO to {ufo_dir}")
    write_ufo(ufo_dir, glyph_order, glyph_metrics, glyphs)

    print(f"Compiling to {out_path}...")
    import ufo2ft
    import defcon
    ufo = defcon.Font(ufo_dir)
    otf = ufo2ft.compileOTF(ufo, removeOverlaps=False)
    otf.save(out_path)
    print(f"Done: {out_path}")
    print(f"UFO source kept at: {ufo_dir}")


if __name__ == '__main__':
    main()
