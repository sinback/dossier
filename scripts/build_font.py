#!/usr/bin/env python3
"""
build_font.py — Draft .otf font from Matlack glyph geometry.

Usage:
  1. In the Matlack canvas, click "export json" to download matlack-glyphs.json.
  2. Run: python3 scripts/build_font.py matlack-glyphs.json matlack-draft.otf

Requires: fonttools  (pip install fonttools)

Coordinate system
-----------------
The JSON was exported with cx=0, cy=0, size=200.
In that system:
  - SVG Y increases downward (standard SVG)
  - The glyph's REF_CENTER (x-height midline) is at the origin
  - Typical lowercase body spans roughly ±50 units around the origin

We convert to font coordinates:
  - Flip Y: font_y = -svg_y
  - Shift to place x-height at X_HEIGHT and baseline at 0:
      font_y += X_HEIGHT / 2   (since REF_CENTER is the midline, not the baseline)

All coordinates are then scaled to fit the UPM em square.

Font metrics (draft — tune in FontForge):
  UPM       = 1000
  ascender  = 800
  x-height  = 500   (x-height midline = 250 from baseline in font coords)
  descender = -200
  baseline  = 0
"""

import json
import re
import sys
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.t2Pen import T2Pen
from fontTools.ttLib import TTFont

# ── Font metrics ──────────────────────────────────────────────────────────────
UPM        = 1000
ASCENDER   = 800
X_HEIGHT   = 500
DESCENDER  = -200
CAP_HEIGHT = 700

# Export size (must match exportGlyphsForFont's `size` param, default 200)
EXPORT_SIZE = 200

# Scale from export coords to font units.
# At size=200, the letter body is ~100 units tall in export coords (±50).
# We want x-height = 500 UPM → scale = 500 / 100 = 5.
SCALE = UPM / EXPORT_SIZE  # 5.0

# Y shift: REF_CENTER is at x-height midline (Y=0 in export, Y=X_HEIGHT/2 in font).
Y_SHIFT = X_HEIGHT // 2   # 250

# Left side bearing (CSS pixels → font units, applied after scale)
LSB = 50


# ── SVG path parser ───────────────────────────────────────────────────────────
def parse_path_d(d):
    """Parse SVG path `d` string into a list of (cmd, [args]) tuples.
    Handles M, L, Z commands (our export only emits these three).
    """
    tokens = re.findall(r'[MLZmlz]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?', d)
    ops = []
    i = 0
    while i < len(tokens):
        t = tokens[i]
        if t in 'MLZmlz':
            cmd = t.upper()
            i += 1
            if cmd == 'Z':
                ops.append((cmd, []))
            elif cmd in ('M', 'L'):
                args = [float(tokens[i]), float(tokens[i + 1])]
                i += 2
                ops.append((cmd, args))
        else:
            # Implicit repeat of previous command
            prev_cmd = ops[-1][0] if ops else 'M'
            args = [float(tokens[i]), float(tokens[i + 1])]
            i += 2
            ops.append((prev_cmd, args))
    return ops


def svg_to_font_coords(x, y):
    """Convert export (SVG, Y-down) coords to font (Y-up) coords."""
    fx = x * SCALE + LSB
    fy = (-y) * SCALE + Y_SHIFT
    return round(fx), round(fy)


# ── Draw path into fonttools pen ──────────────────────────────────────────────
def draw_path(pen, d, evenodd=False):
    """Draw one SVG path d-string into a fonttools pen."""
    ops = parse_path_d(d)
    started = False
    for cmd, args in ops:
        if cmd == 'M':
            if started:
                pen.endPath()
            x, y = svg_to_font_coords(args[0], args[1])
            pen.beginPath()
            pen.addPoint((x, y), segmentType='line')
            started = True
        elif cmd == 'L':
            x, y = svg_to_font_coords(args[0], args[1])
            pen.addPoint((x, y), segmentType='line')
        elif cmd == 'Z':
            if started:
                pen.endPath()
                started = False
    if started:
        pen.endPath()


# ── Estimate advance width from glyph bounding box ───────────────────────────
def estimate_advance(paths, scale=SCALE, lsb=LSB, rsb=50):
    """Estimate advance width from the rightmost x coordinate + RSB."""
    max_x = 0
    for p in paths:
        nums = re.findall(r'[-+]?\d+\.?\d*', p['d'])
        coords = list(map(float, nums))
        xs = coords[0::2]
        if xs:
            max_x = max(max_x, max(xs))
    return round(max_x * scale + lsb + rsb)


# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)

    json_path = sys.argv[1]
    out_path  = sys.argv[2]

    with open(json_path) as f:
        data = json.load(f)

    glyphs = data['glyphs']

    # Build glyph order: .notdef + space + a-z
    glyph_order = ['.notdef', 'space'] + [f'uni{ord(c):04X}' for c in 'abcdefghijklmnopqrstuvwxyz']
    char_map = {ord(c): f'uni{ord(c):04X}' for c in 'abcdefghijklmnopqrstuvwxyz'}
    char_map[0x0020] = 'space'

    fb = FontBuilder(UPM, isTTF=False)  # CFF (OTF)
    fb.setupGlyphOrder(glyph_order)
    fb.setupCharacterMap(char_map)

    # Metrics
    fb.setupHorizontalHeader(ascent=ASCENDER, descent=DESCENDER)
    fb.setupNameTable({
        'familyName': 'Matlack Draft',
        'styleName': 'Regular',
    })
    fb.setupOs2(
        sTypoAscender=ASCENDER,
        sTypoDescender=DESCENDER,
        sTypoLineGap=0,
        usWinAscent=ASCENDER,
        usWinDescent=-DESCENDER,
        sxHeight=X_HEIGHT,
        sCapHeight=CAP_HEIGHT,
        fsType=0,
        panose=(2, 0, 0, 0, 0, 0, 0, 0, 0, 0),
        ulUnicodeRange1=0x00000003,  # Basic Latin + Latin-1 Supplement
    )
    fb.setupPost()
    fb.setupHorizontalMetrics({g: (500, LSB) for g in glyph_order})  # placeholder, overwritten below

    # Draw glyphs
    glyph_metrics = {}
    glyph_metrics['.notdef'] = (500, 0)
    glyph_metrics['space']   = (250, 0)

    pen_store = {}
    from fontTools.pens.recordingPen import RecordingPen
    pens = {}

    print(f"Building {len(glyphs)} glyphs...")
    for letter, paths in glyphs.items():
        gname = f'uni{ord(letter):04X}'
        adv = estimate_advance(paths)
        glyph_metrics[gname] = (adv, LSB)
        pens[gname] = paths

    fb.setupHorizontalMetrics(glyph_metrics)

    # CFF outline drawing
    from fontTools.pens.t2Pen import T2Pen
    from io import StringIO

    # Use PointToSegmentPen + T2CharString approach via fontTools
    # We'll build the font, then fill in outlines
    fb.setupDefaultNotifier()

    # Build using CFF glyphset
    from fontTools.pens.pointPen import SegmentToPointPen
    from fontTools.cffLib import CFFFontDict, Index, TopDict

    # Simpler: use fontBuilder's addOpenTypeFeatures + setupGlyph
    # Actually, the cleanest way with fontTools is:
    from fontTools.pens.t2Pen import T2Pen
    from fontTools.ttLib import TTFont

    # Build a minimal CFF font by hand
    from fontTools import ttLib
    from fontTools.misc.psCharStrings import T2CharString
    from fontTools.pens.t2Pen import T2Pen

    # Use the PointPen interface via RecordingPointPen + replay into T2Pen
    from fontTools.pens.recordingPen import RecordingPen, RecordingPointPen

    def build_glyph_outlines(paths):
        """Return a RecordingPen replay function for a set of path dicts."""
        rec = RecordingPen()
        for p in paths:
            d_str = p['d']
            evenodd = p.get('evenodd', False)
            # Parse into sub-paths (split on 'Z')
            sub_paths = []
            current = []
            ops = parse_path_d(d_str)
            for cmd, args in ops:
                if cmd == 'Z':
                    if current:
                        sub_paths.append(current)
                        current = []
                elif cmd == 'M':
                    if current:
                        sub_paths.append(current)
                    current = [('M', args)]
                else:
                    current.append((cmd, args))
            if current:
                sub_paths.append(current)

            for sub in sub_paths:
                if not sub:
                    continue
                first_cmd, first_args = sub[0]
                x0, y0 = svg_to_font_coords(first_args[0], first_args[1])
                rec.moveTo((x0, y0))
                for cmd, args in sub[1:]:
                    x, y = svg_to_font_coords(args[0], args[1])
                    rec.lineTo((x, y))
                rec.closePath()
        return rec

    # Rebuild font with actual outlines using a simpler approach:
    # Write each glyph as a UFO and compile
    import os
    import tempfile

    ufo_dir = tempfile.mkdtemp(suffix='.ufo')
    print(f"Writing UFO to {ufo_dir}")

    # Write UFO structure manually (minimal)
    os.makedirs(os.path.join(ufo_dir, 'glyphs'), exist_ok=True)

    # metainfo.plist
    with open(os.path.join(ufo_dir, 'metainfo.plist'), 'w') as f:
        f.write('''<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>creator</key>
    <string>build_font.py</string>
    <key>formatVersion</key>
    <integer>3</integer>
</dict>
</plist>
''')

    # lib.plist
    glyph_order_xml = '\n'.join(f'        <string>{g}</string>' for g in glyph_order)
    with open(os.path.join(ufo_dir, 'lib.plist'), 'w') as f:
        f.write(f'''<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>public.glyphOrder</key>
    <array>
{glyph_order_xml}
    </array>
</dict>
</plist>
''')

    # fontinfo.plist
    with open(os.path.join(ufo_dir, 'fontinfo.plist'), 'w') as f:
        f.write(f'''<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>familyName</key>
    <string>Matlack Draft</string>
    <key>unitsPerEm</key>
    <integer>{UPM}</integer>
    <key>ascender</key>
    <integer>{ASCENDER}</integer>
    <key>descender</key>
    <integer>{DESCENDER}</integer>
    <key>xHeight</key>
    <integer>{X_HEIGHT}</integer>
    <key>capHeight</key>
    <integer>{CAP_HEIGHT}</integer>
</dict>
</plist>
''')

    def pts_to_glif_contour(pts):
        """Convert list of (x,y) font-coord points to a GLIF contour XML."""
        lines = ['    <contour>']
        for x, y in pts:
            lines.append(f'      <point x="{x}" y="{y}" type="line"/>')
        lines.append('    </contour>')
        return '\n'.join(lines)

    def paths_to_glif(gname, unicode_val, adv, paths):
        """Generate a .glif XML string for a glyph."""
        uni_attr = f' unicode="{unicode_val:04X}"' if unicode_val is not None else ''
        contours = []
        for p in paths:
            d_str = p['d']
            ops = parse_path_d(d_str)
            current = []
            for cmd, args in ops:
                if cmd == 'M':
                    if current:
                        contours.append(pts_to_glif_contour(current))
                    current = [svg_to_font_coords(args[0], args[1])]
                elif cmd == 'L':
                    current.append(svg_to_font_coords(args[0], args[1]))
                elif cmd == 'Z':
                    if current:
                        contours.append(pts_to_glif_contour(current))
                        current = []
            if current:
                contours.append(pts_to_glif_contour(current))

        contours_xml = '\n'.join(contours)
        return f'''<?xml version="1.0" encoding="UTF-8"?>
<glyph name="{gname}" format="2">
  <advance width="{adv}"/>
  {"<unicode hex=\"" + f"{unicode_val:04X}" + "\"/>" if unicode_val is not None else ""}
  <outline>
{contours_xml}
  </outline>
</glyph>
'''

    # Write glyphs
    glyph_files = {}

    # .notdef
    notdef_glif = f'''<?xml version="1.0" encoding="UTF-8"?>
<glyph name=".notdef" format="2">
  <advance width="500"/>
  <outline>
    <contour>
      <point x="50" y="-200" type="line"/>
      <point x="450" y="-200" type="line"/>
      <point x="450" y="800" type="line"/>
      <point x="50" y="800" type="line"/>
    </contour>
    <contour>
      <point x="100" y="-150" type="line"/>
      <point x="100" y="750" type="line"/>
      <point x="400" y="750" type="line"/>
      <point x="400" y="-150" type="line"/>
    </contour>
  </outline>
</glyph>
'''
    fname = '_notdef.glif'
    with open(os.path.join(ufo_dir, 'glyphs', fname), 'w') as f:
        f.write(notdef_glif)
    glyph_files['.notdef'] = fname

    # space
    space_glif = '''<?xml version="1.0" encoding="UTF-8"?>
<glyph name="space" format="2">
  <advance width="250"/>
  <unicode hex="0020"/>
  <outline/>
</glyph>
'''
    with open(os.path.join(ufo_dir, 'glyphs', 'space.glif'), 'w') as f:
        f.write(space_glif)
    glyph_files['space'] = 'space.glif'

    for letter, paths in glyphs.items():
        gname = f'uni{ord(letter):04X}'
        adv = glyph_metrics[gname][0]
        glif_str = paths_to_glif(gname, ord(letter), adv, paths)
        fname = f'{gname}.glif'
        with open(os.path.join(ufo_dir, 'glyphs', fname), 'w') as f:
            f.write(glif_str)
        glyph_files[gname] = fname

    # contents.plist
    contents_entries = '\n'.join(
        f'    <key>{g}</key>\n    <string>{fn}</string>'
        for g, fn in glyph_files.items()
    )
    with open(os.path.join(ufo_dir, 'glyphs', 'contents.plist'), 'w') as f:
        f.write(f'''<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
{contents_entries}
</dict>
</plist>
''')

    print(f"UFO written. Compiling to {out_path}...")

    # Compile UFO → OTF using ufo2ft
    try:
        import ufo2ft
        import defcon
        ufo = defcon.Font(ufo_dir)
        otf = ufo2ft.compileOTF(ufo, removeOverlaps=False)
        otf.save(out_path)
        print(f"Done: {out_path}")
        print(f"UFO source kept at: {ufo_dir}")
    except ImportError:
        print("ufo2ft or defcon not found. Install with: pip install ufo2ft defcon")
        print(f"UFO source written to: {ufo_dir}")
        print("You can open it directly in FontForge or RoboFont.")


if __name__ == '__main__':
    main()
