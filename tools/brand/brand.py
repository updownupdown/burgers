"""Outlined Bun Voyage wordmark and mark, as SVG snippets in font units (1000 upm).

Shapes text with HarfBuzz (font kerning) plus optional pair tweaks, then draws glyph outlines with
fontTools so the lockup needs no web font (splash, share card, icons).
"""
import uharfbuzz as hb
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.boundsPen import BoundsPen
import os

HERE = os.path.dirname(os.path.abspath(__file__))
FONT = os.path.join(HERE, 'font', 'YoungSerif.ttf')
_tt = TTFont(FONT)
_gs = _tt.getGlyphSet()
_order = _tt.getGlyphOrder()
_blob = hb.Blob.from_file_path(FONT)
_font = hb.Font(hb.Face(_blob))

CREAM = '#f1ece2'
BUTTER = '#d9a93f'
SLATE = '#2a3340'
INK = '#232a33'


def shape(text, tweaks=None, track=0):
    """Return [(glyphname, x)] and total advance. tweaks: {(a,b): delta} on chars, track in units."""
    buf = hb.Buffer(); buf.add_str(text); buf.guess_segment_properties(); hb.shape(_font, buf, {'kern': True})
    out, x = [], 0
    infos, pos = buf.glyph_infos, buf.glyph_positions
    for i, (gi, gp) in enumerate(zip(infos, pos)):
        out.append((_order[gi.codepoint], x + gp.x_offset))
        adv = gp.x_advance + track
        if tweaks and i + 1 < len(text):
            adv += tweaks.get((text[i], text[i + 1]), 0)
        x += adv
    return out, x - track


def text_path(text, x0=0, y0=0, tweaks=None, track=0):
    """SVG path d for text with baseline at y0 (SVG coords, y down), in font units."""
    glyphs, adv = shape(text, tweaks, track)
    pen = SVGPathPen(_gs)
    for name, x in glyphs:
        tp = TransformPen(pen, (1, 0, 0, -1, x0 + x, y0))
        _gs[name].draw(tp)
    return pen.getCommands(), adv


def ink_bounds(text, tweaks=None, track=0):
    glyphs, adv = shape(text, tweaks, track)
    xs, ys = [], []
    for name, x in glyphs:
        bp = BoundsPen(_gs); _gs[name].draw(bp)
        if bp.bounds:
            xs += [x + bp.bounds[0], x + bp.bounds[2]]; ys += [bp.bounds[1], bp.bounds[3]]
    return min(xs), min(ys), max(xs), max(ys), adv


def mark_g(sw=1.75, knob_r=1.4, knob_cy=3.6, plate_y=18, dome_top=6, rim=15, plate_x=(4, 20),
           color=CREAM, knob='#ffffff', dome_fill='none'):
    """The cloche on the 24 grid with tunable optical parameters. Dome is a half disc of radius
    (rim-2-dome_top) centred on x=12, sitting on a 2-unit straight rim that ends at y=rim."""
    r = rim - 2 - dome_top
    d = (f'M12 {dome_top}a{r} {r} 0 0 1 {r} {r}v2H{12 - r}v-2a{r} {r} 0 0 1 {r}-{r}z'
         f'M{plate_x[0]} {plate_y}H{plate_x[1]}')
    return (f'<path d="{d}" fill="{dome_fill}" stroke="{color}" stroke-width="{sw}" stroke-linecap="round" stroke-linejoin="round"/>'
            f'<circle cx="12" cy="{knob_cy}" r="{knob_r}" fill="{knob}"/>')


def mark_ink(sw=1.75, knob_r=1.4, knob_cy=3.6, plate_y=18, plate_x=(4, 20), **_):
    """Ink box (x0, y0, x1, y1) of mark_g on the 24 grid."""
    return (plate_x[0] - sw / 2, knob_cy - knob_r, plate_x[1] + sw / 2, plate_y + sw / 2)


STEM = 140          # Young Serif vertical stem, font units
PITCH = 920         # Bun/Voyage line pitch, font units (the game's line-height .92)
VOY_TWEAKS = {('a', 'g'): -20, ('V', 'o'): -10}
VOY_TRACK = -5


def lockup_stack(c_bun=CREAM, c_voy=BUTTER, c_mark=CREAM, c_knob='#ffffff', gap=300, mark_scale=1.0,
                 tweaks=VOY_TWEAKS, track=VOY_TRACK, mark_opts=None, pad=0):
    """Mark beside the Bun / Voyage stack. Plate sits on Voyage's baseline, knob top on Bun's cap
    height (mark_scale<1 shrinks it about the baseline), stroke weight = the serif's stem."""
    mo = dict(sw=1.4, knob_r=1.4, knob_cy=3.6, plate_y=18)
    mo.update(mark_opts or {})
    x0, y0, x1, y1 = mark_ink(**mo)
    base2 = 750 + PITCH
    s = base2 / (y1 - y0) * mark_scale
    tx, ty = -x0 * s, base2 - y1 * s
    mw = (x1 - x0) * s
    d1, a1 = text_path('Bun', 0, 750, tweaks, track)
    d2, a2 = text_path('Voyage', 0, base2, tweaks, track)
    tx_text = mw + gap
    W = tx_text + max(a1, a2)
    top = min(0, ty + y0 * s)
    H = base2 + 215
    svg = (f'<g transform="translate({tx:.1f} {ty:.1f}) scale({s:.3f})">{mark_g(color=c_mark, knob=c_knob, **mo)}</g>'
           f'<g transform="translate({tx_text:.1f} 0)"><path d="{d1}" fill="{c_bun}"/><path d="{d2}" fill="{c_voy}"/></g>')
    vb = (-pad, top - pad, W + 2 * pad, H - top + 2 * pad)
    return svg, vb, dict(s=s, sw_fu=mo['sw'] * s, mark_w=mw, W=W)


def lockup_line(c_bun=CREAM, c_voy=BUTTER, c_mark=CREAM, c_knob='#ffffff', gap=260, ink_h=930,
                tweaks=VOY_TWEAKS, track=VOY_TRACK, mark_opts=None, pad=0):
    """Mark + 'Bun Voyage' on one line. Plate on the baseline, mark ink ink_h tall (knob rises above
    cap height). Uses the compact drawing: heavier stroke, plate dropped a unit so gaps stay open."""
    mo = dict(sw=2.2, knob_r=1.55, knob_cy=3.2, plate_y=19)
    mo.update(mark_opts or {})
    x0, y0, x1, y1 = mark_ink(**mo)
    s = ink_h / (y1 - y0)
    tx, ty = -x0 * s, 750 - y1 * s
    mw = (x1 - x0) * s
    dB, aB = text_path('Bun', 0, 750, tweaks, track)
    dV, aV = text_path('Voyage', 0, 750, tweaks, track)
    sp = 250 + track
    tx_text = mw + gap
    W = tx_text + aB + sp + aV
    top = 750 - ink_h
    svg = (f'<g transform="translate({tx:.1f} {ty:.1f}) scale({s:.3f})">{mark_g(color=c_mark, knob=c_knob, **mo)}</g>'
           f'<g transform="translate({tx_text:.1f} 0)"><path d="{dB}" fill="{c_bun}"/>'
           f'<path d="{dV}" transform="translate({aB + sp:.1f} 0)" fill="{c_voy}"/></g>')
    vb = (-pad, top - pad, W + 2 * pad, 750 + 215 - top + 2 * pad)
    return svg, vb, dict(s=s, sw_fu=mo['sw'] * s, W=W)


def lockup_center(c_bun=CREAM, c_voy=BUTTER, c_mark=CREAM, c_knob='#ffffff', mark_h=1500, gap=420,
                  tweaks=VOY_TWEAKS, track=VOY_TRACK, mark_opts=None, one_line=True, pad=0, ids=False):
    """Splash / share stack: the mark centred above the wordmark (one line or two)."""
    mo = dict(sw=1.5, knob_r=1.4, knob_cy=3.6, plate_y=18)
    mo.update(mark_opts or {})
    x0, y0, x1, y1 = mark_ink(**mo)
    s = mark_h / (y1 - y0)
    mw = (x1 - x0) * s
    dB, aB = text_path('Bun', 0, 0, tweaks, track)
    dV, aV = text_path('Voyage', 0, 0, tweaks, track)
    if one_line:
        sp = 250 + track
        W = aB + sp + aV
        text = (f'<path {"id=w1 " if ids else ""}d="{dB}" fill="{c_bun}"/>'
                f'<path {"id=w2 " if ids else ""}d="{dV}" transform="translate({aB + sp:.1f} 0)" fill="{c_voy}"/>')
    else:
        W = max(aB, aV)
        text = (f'<path d="{dB}" transform="translate({(W - aB) / 2:.1f} 0)" fill="{c_bun}"/>'
                f'<path d="{dV}" transform="translate({(W - aV) / 2:.1f} {PITCH})" fill="{c_voy}"/>')
    base = mark_h + gap + 750
    Wt = max(W, mw)
    mtx = (Wt - mw) / 2 - x0 * s
    svg = (f'<g {"id=mk " if ids else ""}transform="translate({mtx:.1f} {-y0 * s:.1f}) scale({s:.3f})">{mark_g(color=c_mark, knob=c_knob, **mo)}</g>'
           f'<g {"id=wm " if ids else ""}transform="translate({(Wt - W) / 2:.1f} {base:.1f})">{text}</g>')
    H = base + (PITCH if not one_line else 0) + 215
    vb = (-pad, -pad, Wt + 2 * pad, H + 2 * pad)
    return svg, vb, dict(s=s, W=Wt, H=H)


def svg_doc(inner, vb, w=None, h=None, extra=''):
    vbs = ' '.join(f'{v:.1f}' for v in vb)
    size = (f' width="{w}"' if w else '') + (f' height="{h}"' if h else '')
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vbs}"{size}{extra}>{inner}</svg>'


if __name__ == '__main__':
    print(lockup_stack()[1:], lockup_line()[1:])
    for t in ['Bun', 'Voyage', 'Bun Voyage']:
        print(t, ink_bounds(t))
