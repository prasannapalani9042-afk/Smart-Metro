"""Tiny QR code generator (byte mode, error correction L, versions 1-6, up to 134 bytes). No dependencies."""
EXP, LOG = [0] * 512, [0] * 256
_x = 1
for _i in range(255):
    EXP[_i] = _x; LOG[_x] = _i
    _x <<= 1
    if _x & 0x100:
        _x ^= 0x11D
for _i in range(255, 512):
    EXP[_i] = EXP[_i - 255]

CODEWORDS = {1: 19, 2: 34, 3: 55, 4: 80, 5: 108, 6: 136}   # data codewords, level L
EC_PER_BLOCK = {1: 7, 2: 10, 3: 15, 4: 20, 5: 26, 6: 18}
BLOCKS = {1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 2}


def _mul(a, b):
    return 0 if a == 0 or b == 0 else EXP[LOG[a] + LOG[b]]


def _rs(data, n):
    gen = [1]
    for i in range(n):
        nxt = [0] * (len(gen) + 1)
        for j, g in enumerate(gen):
            nxt[j] ^= g
            nxt[j + 1] ^= _mul(g, EXP[i])
        gen = nxt
    rem = [0] * n
    for b in data:
        f = b ^ rem[0]
        rem = rem[1:] + [0]
        for i in range(n):
            rem[i] ^= _mul(gen[i + 1], f)
    return rem


def _codewords(data, v):
    cap = CODEWORDS[v]
    bits = '0100' + format(len(data), '08b') + ''.join(format(b, '08b') for b in data)
    bits += '0' * min(4, cap * 8 - len(bits))
    bits += '0' * (-len(bits) % 8)
    cw = [int(bits[i:i + 8], 2) for i in range(0, len(bits), 8)]
    pad = [0xEC, 0x11]
    while len(cw) < cap:
        cw.append(pad[(len(cw) - len(bits) // 8) % 2])
    nb = BLOCKS[v]; per = cap // nb
    blocks = [cw[i * per:(i + 1) * per] for i in range(nb)]
    ecs = [_rs(b, EC_PER_BLOCK[v]) for b in blocks]
    out = []
    for i in range(per):
        for b in blocks:
            out.append(b[i])
    for i in range(EC_PER_BLOCK[v]):
        for e in ecs:
            out.append(e[i])
    return out


MASKS = [lambda r, c: (r + c) % 2 == 0, lambda r, c: r % 2 == 0, lambda r, c: c % 3 == 0, lambda r, c: (r + c) % 3 == 0,
         lambda r, c: (r // 2 + c // 3) % 2 == 0, lambda r, c: (r * c) % 2 + (r * c) % 3 == 0,
         lambda r, c: ((r * c) % 2 + (r * c) % 3) % 2 == 0, lambda r, c: ((r + c) % 2 + (r * c) % 3) % 2 == 0]


def _build(v, cws, mask):
    n = 17 + 4 * v
    val = [[False] * n for _ in range(n)]; fn = [[False] * n for _ in range(n)]

    def put(x, y, dark):                      # x = column, y = row
        val[y][x] = dark; fn[y][x] = True
    for ox, oy in ((0, 0), (n - 7, 0), (0, n - 7)):          # finder patterns with separators
        for dy in range(-1, 8):
            for dx in range(-1, 8):
                x, y = ox + dx, oy + dy
                if 0 <= x < n and 0 <= y < n:
                    inside = 0 <= dx <= 6 and 0 <= dy <= 6
                    put(x, y, inside and (dx in (0, 6) or dy in (0, 6) or (2 <= dx <= 4 and 2 <= dy <= 4)))
    for i in range(8, n - 8):                                 # timing patterns
        put(i, 6, i % 2 == 0); put(6, i, i % 2 == 0)
    if v >= 2:                                                # one alignment pattern
        c = n - 7
        for dy in range(-2, 3):
            for dx in range(-2, 3):
                put(c + dx, c + dy, max(abs(dx), abs(dy)) != 1)
    for i in range(9):                                        # reserve format areas
        fn[8][i] = fn[i][8] = True
    for i in range(8):
        fn[8][n - 1 - i] = fn[n - 1 - i][8] = True
    bits = ''.join(format(b, '08b') for b in cws)
    i = 0; x = n - 1; up = True
    while x > 0:
        if x == 6:
            x -= 1
        for k in range(n):
            y = n - 1 - k if up else k
            for xx in (x, x - 1):
                if not fn[y][xx]:
                    val[y][xx] = (i < len(bits) and bits[i] == '1') ^ MASKS[mask](y, xx)
                    i += 1
        up = not up; x -= 2
    data = (1 << 3) | mask                                    # level L = 01
    rem = data
    for _ in range(10):
        rem = (rem << 1) ^ ((rem >> 9) * 0x537)
    f = ((data << 10) | rem) ^ 0x5412
    g = lambda k: (f >> k) & 1 == 1
    for k in range(6): put(8, k, g(k))
    put(8, 7, g(6)); put(8, 8, g(7)); put(7, 8, g(8))
    for k in range(9, 15): put(14 - k, 8, g(k))
    for k in range(8): put(n - 1 - k, 8, g(k))
    for k in range(8, 15): put(8, n - 15 + k, g(k))
    put(8, n - 8, True)
    return val


def _penalty(m):
    n = len(m); p = 0
    for grid in (m, [list(r) for r in zip(*m)]):
        for row in grid:
            run = 1
            for i in range(1, n):
                if row[i] == row[i - 1]:
                    run += 1
                    if run == 5: p += 3
                    elif run > 5: p += 1
                else:
                    run = 1
            s = ''.join('1' if c else '0' for c in row)
            p += 40 * (s.count('10111010000') + s.count('00001011101'))
    for y in range(n - 1):
        for x in range(n - 1):
            if m[y][x] == m[y][x + 1] == m[y + 1][x] == m[y + 1][x + 1]:
                p += 3
    dark = sum(c for r in m for c in r)
    return p + 10 * (abs(dark * 20 - n * n * 10) // (n * n))


def matrix(text):
    data = text.encode('utf-8')
    for v in range(1, 7):
        if len(data) <= CODEWORDS[v] - 2:
            cws = _codewords(data, v)
            return min((_build(v, cws, m) for m in range(8)), key=_penalty)
    raise ValueError('Text is too long for the QR code (134 bytes maximum).')


def svg(text, scale=8, border=4):
    m = matrix(text); n = len(m); size = (n + 2 * border)
    path = []
    for y, row in enumerate(m):
        x = 0
        while x < n:
            if row[x]:
                s = x
                while x < n and row[x]: x += 1
                path.append(f'M{s + border},{y + border}h{x - s}v1h-{x - s}z')
            else:
                x += 1
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {size} {size}" width="{size * scale}" height="{size * scale}" shape-rendering="crispEdges">'
            f'<rect width="{size}" height="{size}" fill="#fff"/><path d="{"".join(path)}" fill="#000"/></svg>')
