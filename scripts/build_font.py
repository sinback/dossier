#!/usr/bin/env python3
"""
build_font.py — Draft .otf font from Matlack glyph geometry.

Usage:
  1. Run `node scripts/export_glyphs.mjs` (or the "export json" button
     in MatlackCanvas) to regenerate matlack-glyphs.json.
  2. uv run python3 scripts/build_font.py matlack-glyphs.json matlack-draft.otf

Requires: ufo2ft, defcon  (uv sync handles this)

Coordinate conversion
---------------------
For each letter the JSON contains:
  { paths: [{d, evenodd}, ...],
    rule: {yTop, yCenter, yBottom} in glyph-local-ref units, or null
    refCenter: {x, y} in glyph-local-ref units, or null }

Path points from `buildGlyph(letter, 0, 0, size, 1)` are in an *output
frame* where REF_CENTER sits at origin and coords are scaled by
(size / 100).

When rule + refCenter are present, we place each letter so that rule.yBottom
maps to the font baseline (y=0) and rule.yCenter maps to xHeight. This
gives consistent sizing across letters regardless of each glyph's own
REF_CENTER or rule-line spread. Without the metadata, fall back to the
uniform scaling the pipeline used originally.
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
LSB         = 50                  # left side bearing (font units)
RSB         = 50                  # right side bearing (font units)

# Uniform fallback (only used for letters without rule/refCenter metadata).
EXPORT_SIZE      = 200            # must match exportGlyphsForFont(size=) in JS
FALLBACK_SCALE   = UPM / EXPORT_SIZE   # 5.0
FALLBACK_YSHIFT  = X_HEIGHT // 2       # 250


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


def glyph_transform(rule, ref_center, export_size):
    """Return (transform, x_min, x_max) where `transform(x, y)` maps an
    output-frame path point to font-y-up coords with baseline at y=0.

    When `rule` and `ref_center` are present, the transform makes
    rule.yBottom land at font y=0 and rule.yCenter at y=xHeight. The
    global scale is per-letter, driven by (rule.yBottom - rule.yCenter).

    Bounding box is computed in font units so the caller can shift x to
    LSB and set the advance.
    """
    size_scale = export_size / 100  # buildGlyph internal scale at dpr=1

    if rule is not None and ref_center is not None:
        # Paths are in output-frame; REF_CENTER is at (0, 0) there.
        # rule.yBottom in output frame:
        out_y_bottom = size_scale * (rule["yBottom"] - ref_center["y"])
        # Scale so (out_y_bottom - out_y_center) → X_HEIGHT font units.
        out_y_center = size_scale * (rule["yCenter"] - ref_center["y"])
        font_scale   = X_HEIGHT / (out_y_bottom - out_y_center)

        def tx(x, y):
            return (x * font_scale,
                    (out_y_bottom - y) * font_scale)
        return tx

    # Fallback: uniform transform used before rule metadata existed.
    def tx_fallback(x, y):
        return (x * FALLBACK_SCALE,
                -y * FALLBACK_SCALE + FALLBACK_YSHIFT)
    return tx_fallback


def path_points(paths):
    """Yield (x, y) floats for every M/L point in a list of {d, ...} paths."""
    for p in paths:
        for cmd, args in parse_path_d(p["d"]):
            if args:
                yield args[0], args[1]


# ── GLIF builder ─────────────────────────────────────────────────────────────
def contour_xml(pts):
    lines = ['    <contour>']
    for x, y in pts:
        lines.append(f'      <point x="{x}" y="{y}" type="line"/>')
    lines.append('    </contour>')
    return '\n'.join(lines)


def paths_to_glif(gname, unicode_val, adv, paths, transform, x_shift,
                  join_anchors=None):
    contours = []
    for p in paths:
        current = []
        for cmd, args in parse_path_d(p['d']):
            if cmd == 'M':
                if current:
                    contours.append(contour_xml(current))
                fx, fy = transform(args[0], args[1])
                current = [(round(fx + x_shift), round(fy))]
            elif cmd == 'L':
                fx, fy = transform(args[0], args[1])
                current.append((round(fx + x_shift), round(fy)))
            elif cmd == 'Z':
                if current:
                    contours.append(contour_xml(current))
                    current = []
        if current:
            contours.append(contour_xml(current))

    uni_el = f'  <unicode hex="{unicode_val:04X}"/>\n' if unicode_val is not None else ''
    outline = '\n'.join(contours)

    # Cursive-attachment anchors. entry/exit live in the 'output frame'
    # from the JS side; transform them the same way as path points.
    anchor_xml = ''
    if join_anchors:
        for name in ('entry', 'exit'):
            pt = join_anchors.get(name)
            if pt is None:
                continue
            fx, fy = transform(pt['x'], pt['y'])
            anchor_xml += (f'  <anchor name="{name}" '
                           f'x="{round(fx + x_shift)}" y="{round(fy)}"/>\n')

    return (
        f'<?xml version="1.0" encoding="UTF-8"?>\n'
        f'<glyph name="{gname}" format="2">\n'
        f'  <advance width="{adv}"/>\n'
        f'{uni_el}'
        f'{anchor_xml}'
        f'  <outline>\n{outline}\n  </outline>\n'
        f'</glyph>\n'
    )


def curs_rule(gname, entry_font, exit_font):
    """One `pos cursive` rule for the curs feature. `entry_font` / `exit_font`
    are (x, y) tuples in font coords, or None."""
    def anchor_str(pt):
        return f'<anchor {round(pt[0])} {round(pt[1])}>' if pt else '<anchor NULL>'
    return f'  pos cursive {gname} {anchor_str(entry_font)} {anchor_str(exit_font)};'


# ── UFO writer ────────────────────────────────────────────────────────────────
def write_ufo(ufo_dir, glyph_order, glyphs_data, export_size, features_fea=None):
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

    curs_rules = []
    for glyph_name, entry in glyphs_data.items():
        paths     = entry['paths']
        rule      = entry.get('rule')
        ref_center = entry.get('refCenter')
        source_letter = entry.get('letter', glyph_name)
        is_default    = entry.get('isDefault', True)
        join_anchors  = entry.get('joinAnchors')  # in output-frame coords

        transform = glyph_transform(rule, ref_center, export_size)

        xs = [transform(x, y)[0] for x, y in path_points(paths)]
        if xs:
            x_min, x_max = min(xs), max(xs)
            x_shift = LSB - x_min
            advance = round(x_max - x_min + LSB + RSB)
        else:
            x_shift = 0
            advance = 500

        gname = glyph_name
        if is_default and len(source_letter) == 1:
            unicode_val = ord(source_letter)
        else:
            unicode_val = None

        glif = paths_to_glif(gname, unicode_val, advance, paths, transform,
                             x_shift, join_anchors)
        safe_fname = gname.replace('.', '_') + '.glif'
        with open(os.path.join(ufo_dir, 'glyphs', safe_fname), 'w') as f:
            f.write(glif)
        glyph_files[gname] = safe_fname

        # Collect a pos cursive rule for the curs feature. Transform the
        # join anchors to font coords and include LSB shift.
        if join_anchors:
            entry_pt = join_anchors.get('entry')
            exit_pt  = join_anchors.get('exit')
            def to_font(pt):
                if pt is None: return None
                fx, fy = transform(pt['x'], pt['y'])
                return (fx + x_shift, fy)
            curs_rules.append(
                curs_rule(gname, to_font(entry_pt), to_font(exit_pt))
            )

    # contents.plist
    entries = '\n'.join(f'  <key>{g}</key><string>{fn}</string>'
                        for g, fn in glyph_files.items())
    with open(os.path.join(ufo_dir, 'glyphs', 'contents.plist'), 'w') as f:
        f.write(f'<?xml version="1.0" encoding="UTF-8"?>\n'
                f'<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"'
                f' "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n'
                f'<plist version="1.0"><dict>\n{entries}\n</dict></plist>\n')

    # features.fea (OpenType calt + curs)
    fea_text = features_fea or ''
    if curs_rules:
        fea_text += (
            '\nfeature curs {\n'
            '  lookupflag IgnoreMarks;\n'
            + '\n'.join(curs_rules) + '\n'
            '} curs;\n'
        )
    if fea_text:
        with open(os.path.join(ufo_dir, 'features.fea'), 'w') as f:
            f.write(fea_text)


# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)

    with open(sys.argv[1]) as f:
        data = json.load(f)

    glyphs_data = data['glyphs']
    export_size = data.get('size', EXPORT_SIZE)
    features_fea = data.get('features', None)
    out_path = sys.argv[2]

    # Glyph order: notdef, space, defaults, then variants.
    base_order = list('abcdefghijklmnopqrstuvwxyz')
    variant_order = [name for name in glyphs_data.keys() if '.' in name]
    glyph_order = ['.notdef', 'space'] + base_order + variant_order

    ufo_dir = tempfile.mkdtemp(suffix='.ufo')
    print(f"Writing UFO to {ufo_dir}")
    write_ufo(ufo_dir, glyph_order, glyphs_data, export_size, features_fea)

    print(f"Compiling to {out_path}...")
    import ufo2ft
    import defcon
    ufo = defcon.Font(ufo_dir)
    otf = ufo2ft.compileOTF(ufo, removeOverlaps=False)
    otf.save(out_path)
    print(f"Done: {out_path}")
    print(f"UFO source kept at: {ufo_dir}")

    # Auto-copy into the dev server's public dir so the browser preview
    # (public/matlack-preview.html) always sees the latest build.
    project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    public_fonts = os.path.join(project_root, 'public', 'fonts')
    if os.path.isdir(public_fonts):
        import shutil
        dest = os.path.join(public_fonts, os.path.basename(out_path))
        shutil.copy(out_path, dest)
        print(f"Copied to {dest}")


if __name__ == '__main__':
    main()
