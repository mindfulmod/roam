"""Tandem Roads logo, "Ampersand Way": one two-lane road that ties itself into an "&".

Every curve is a circle arc or a straight tangent, and each lane is an exact offset of
one centre line, so the gaps stay one width everywhere. Needs Python 3 with shapely and numpy:
    pip install shapely numpy && python3 scripts/brand/ampersand.py
It writes the SVGs to images/brand/. Then run `node scripts/brand/make-icons.mjs` for the PNGs.
"""
import math, os
import numpy as np
from shapely.geometry import Point, LineString, Polygon
from shapely.ops import unary_union, substring
from shapely import affinity

TEAL, ORANGE, PAPER, MONO = '#2a2724', '#e7764b', '#f7f4ee', '#111111'  # TEAL is the asphalt charcoal (name kept)
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'images', 'brand')
Q = 64
# Construction: top loop circle (c1, r1), bowl circle (c2, r2), tail end point T, arm angle and length.
P = dict(c1=(268, 114), r1=90, c2=(205, 360), r2=118, T=(455, 468), arm_a=-25, arm_len=30)

def arc(cx, cy, r, a0, a1, n=120):
    a = np.radians(np.linspace(a0, a1, n)); return [(cx + r * math.cos(t), cy + r * math.sin(t)) for t in a]
def ang(c, p): return math.degrees(math.atan2(p[1] - c[1], p[0] - c[0]))
def internal_tangent(c1, r1, c2, r2):
    c1, c2 = np.array(c1), np.array(c2); v = c1 - c2; L = np.linalg.norm(v)
    th = math.atan2(v[1], v[0]) - math.acos((r1 + r2) / L); n = np.array([math.cos(th), math.sin(th)])
    return c1 - n * r1, c2 + n * r2
def ext_tangent_pt(c, r, T, pick):
    c, T = np.array(c), np.array(T); v = T - c; a = math.acos(r / np.linalg.norm(v))
    th = math.atan2(v[1], v[0]) + (a if pick == 0 else -a); return c + r * np.array([math.cos(th), math.sin(th)])
def centre_lines():
    c1, r1, c2, r2, T = P['c1'], P['r1'], P['c2'], P['r2'], P['T']
    p2, q2 = internal_tangent(c1, r1, c2, r2)
    best = None
    for pk in (0, 1):  # tail leaves the top loop on the tangent that keeps it smooth
        q = ext_tangent_pt(c1, r1, T, pk); th = math.atan2(q[1] - c1[1], q[0] - c1[0])
        tdir = np.array([-math.sin(th), math.cos(th)]); u = (q - np.array(T)) / np.linalg.norm(q - np.array(T))
        if best is None or u @ tdir > best[0]: best = (u @ tdir, q)
    p1 = best[1]; a1, a2 = ang(c1, p1), ang(c1, p2)
    while a2 < a1: a2 += 360
    body = arc(c1[0], c1[1], r1, a1, a2, 240) + [tuple(x) for x in np.linspace(p2, q2, 60)[1:]]
    b1, b2 = ang(c2, q2), P['arm_a']
    while b2 > b1: b2 -= 360
    body += arc(c2[0], c2[1], r2, b1, b2, 360)[1:]
    e = np.array(body[-1]); tdir = np.array([math.sin(math.radians(b2)), -math.cos(math.radians(b2))])
    body += [tuple(x) for x in np.linspace(e, e + tdir * P['arm_len'], 20)[1:]]
    return LineString([tuple(T), tuple(p1)]), LineString(body)
def resample(line, step=1.0):
    n = max(2, int(line.length / step)); return np.array([line.interpolate(i / (n - 1), normalized=True).coords[0] for i in range(n)])
def strip(line, d0, d1):
    p = resample(line); t = np.gradient(p, axis=0); t /= np.linalg.norm(t, axis=1)[:, None]
    n = np.stack([-t[:, 1], t[:, 0]], 1); return Polygon(np.vstack([p + n * d0, (p + n * d1)[::-1]])).buffer(0)
def polys(g):
    if g.is_empty: return []
    return [g] if isinstance(g, Polygon) else [p for p in g.geoms if isinstance(p, Polygon)]
def keep_big(g, min_area=400): return unary_union([p for p in polys(g) if p.area > min_area])
def round_outer(g, r): return g.buffer(-r, quad_segs=Q).buffer(r, quad_segs=Q)
def round_inner(g, r): return g.buffer(r, quad_segs=Q).buffer(-r, quad_segs=Q)

def render(W, G, gap, cr=6):
    """W: road width, G: channel between the lanes (0 = one solid lane), gap: where the road passes under."""
    tail, body = centre_lines(); S = W * 1.2
    head = LineString(list(tail.coords)[:-1] + list(substring(body, 0, S + 2).coords)); rest = substring(body, S, body.length)
    cut = head.buffer(W / 2 + gap, cap_style=2)
    if G <= 0:
        m = keep_big(unary_union([strip(head, -W / 2, W / 2), strip(rest, -W / 2, W / 2).difference(cut)]))
        return [round_outer(round_inner(m, 3), cr)]
    lanes = lambda l: (strip(l, G / 2, W / 2), strip(l, -W / 2, -G / 2))
    (hl, hr), (rl, rr) = lanes(head), lanes(rest)
    L = keep_big(unary_union([hl, rl.difference(cut)])); R = keep_big(unary_union([hr, rr.difference(cut)]))
    return [round_outer(round_inner(L, 3), cr), round_outer(round_inner(R, 3), cr)]
def place(geoms, size, blend=0.3):
    """Scale so the longest side is `size` and centre on 256,256, nudged toward the visual mass."""
    m = unary_union(geoms); x0, y0, x1, y1 = m.bounds; s = size / max(x1 - x0, y1 - y0)
    mx = (1 - blend) * (x0 + x1) / 2 + blend * m.centroid.x; xo = 256 - mx * s; yo = 256 - (y0 + y1) / 2 * s
    return [affinity.affine_transform(g, [s, 0, 0, s, xo, yo]) for g in geoms]
def d(g):
    out = []
    for p in polys(g):
        p = p.simplify(0.15)
        for ring in [p.exterior, *p.interiors]: out.append('M' + ' L'.join(f'{x:.1f} {y:.1f}' for x, y in list(ring.coords)[:-1]) + 'Z')
    return ''.join(out)
def paths(geoms, fills): return ''.join(f'<path fill="{f}" d="{d(g)}"/>' for g, f in zip(geoms, fills))
def svg(body): return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">{body}</svg>\n'

def main():
    os.makedirs(OUT, exist_ok=True)
    big, small, tiny = render(112, 26, 26), render(124, 36, 36), render(84, 0, 40)
    files = {
        'logo.svg': paths(place(big, 430), [TEAL, ORANGE]),
        'logo-dark.svg': paths(place(big, 430), [PAPER, ORANGE]),
        'logo-mono.svg': paths([unary_union(place(big, 430))], [MONO]),
        'mark-small.svg': paths(place(small, 470), [TEAL, ORANGE]),  # 24-48px, wider channel
        'icon.svg': f'<rect width="512" height="512" fill="{TEAL}"/>' + paths(place(big, 330), [PAPER, ORANGE]),
        'icon-maskable.svg': f'<rect width="512" height="512" fill="{TEAL}"/>' + paths(place(big, 290), [PAPER, ORANGE]),
        'icon-small.svg': f'<rect width="512" height="512" rx="112" fill="{TEAL}"/>' + paths(place(small, 360), [PAPER, ORANGE]),
        'favicon.svg': f'<rect width="512" height="512" rx="112" fill="{TEAL}"/>' + paths(place(tiny, 360), [PAPER]),  # 16px: one solid &
    }
    for name, body in files.items():
        with open(os.path.join(OUT, name), 'w') as f: f.write(svg(body))
    print('wrote', ', '.join(files))

if __name__ == '__main__':
    main()
