/*
 * The Craft: one tank, dent to show finish.
 *
 * A real-time render, not a slideshow. The tank's silhouette is turned into
 * a height field and normal map once at startup, and a WebGL shader lights
 * it like a car under booth lights: every coat is its own material (brushed
 * steel, rust, filler, epoxy primer, metallic base, candy with true depth,
 * metal flake, clearcoat), and the booth's ceiling softboxes reflect in it
 * and bend over its curves the way they do in real paint photography.
 *
 * Coats are sprayed for real: the gun lays droplets into coverage maps that
 * the shader reads every frame, fresh paint is wet and glossy and flashes
 * off, candy darkens with every pass, the buffer polishes orange peel out
 * where it travels. Bloom, a glossy floor reflection, a little lens
 * aberration and film grain finish the frame. Tools, sparks, spray and
 * dust are drawn on a 2D layer above, in the same camera.
 *
 * The candy color is the site's current Finish (--paint), live: change it
 * and the tank repaints. Reduced motion shows the finished tank paused.
 */
(() => {
    'use strict';

    const VW = 1280, VH = 720, FLOOR = 600;
    const COV = 0.5;                    // coverage maps at half scene resolution
    const STAGES = [
        { key: 'damage',     label: 'Damage',        caption: 'Bare steel and one ugly dent.',               dur: 2800 },
        { key: 'straighten', label: 'Straighten',    caption: 'Hammer and dolly, back to true.',             dur: 3600 },
        { key: 'fill',       label: 'Fill & block',  caption: 'A skim of filler, blocked flat by hand.',     dur: 4400 },
        { key: 'prime',      label: 'Prime',         caption: 'Epoxy primer seals the metal.',               dur: 3000 },
        { key: 'base',       label: 'Base',          caption: 'Metallic base for the candy to glow through.', dur: 2800 },
        { key: 'candy',      label: 'Candy & flake', caption: 'Candy in even passes, deeper every coat.',    dur: 4200 },
        { key: 'stripe',     label: 'Pinstripe',     caption: 'Gold line, pulled by hand.',                  dur: 3600 },
        { key: 'clear',      label: 'Clear & buff',  caption: 'Clear, cut and buffed to glass.',             dur: 4600 },
        { key: 'reveal',     label: 'Showroom',      caption: 'Showroom ready.',                             dur: 5600 },
    ];
    const STARTS = STAGES.reduce((a, s, i) => (a.push(i ? a[i - 1] + STAGES[i - 1].dur : 0), a), []);
    const TOTAL = STARTS[STARTS.length - 1] + STAGES[STAGES.length - 1].dur;
    const IDX = Object.fromEntries(STAGES.map((s, i) => [s.key, i]));

    // ---- Math --------------------------------------------------------------
    const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
    const lerp = (a, b, t) => a + (b - a) * t;
    const span = (p, a, b) => clamp((p - a) / (b - a));
    const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
    const inOutSine = (t) => -(Math.cos(Math.PI * clamp(t)) - 1) / 2;
    const outCubic = (t) => 1 - Math.pow(1 - clamp(t), 3);
    const inCubic = (t) => Math.pow(clamp(t), 3);
    const outBack = (t) => { const c = 1.7; t = clamp(t) - 1; return 1 + (c + 1) * t * t * t + c * t * t; };
    function gauss() {
        let u = 0, v = 0;
        while (!u) u = Math.random();
        while (!v) v = Math.random();
        return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    }
    // Cheap smooth 1D noise for handheld camera drift.
    const drift = (t, seed) => Math.sin(t * 0.37 + seed) * 0.6 + Math.sin(t * 0.91 + seed * 2.1) * 0.3 + Math.sin(t * 2.3 + seed * 3.7) * 0.1;

    // ---- Geometry (scene px, y down) ---------------------------------------
    function tankPath() {
        const p = new Path2D();
        p.moveTo(300, 522);
        p.bezierCurveTo(238, 478, 236, 334, 362, 292);
        p.bezierCurveTo(520, 240, 800, 250, 962, 300);
        p.bezierCurveTo(1042, 325, 1084, 382, 1062, 430);
        p.bezierCurveTo(1046, 466, 984, 480, 900, 476);
        p.bezierCurveTo(808, 471, 724, 498, 640, 520);
        p.bezierCurveTo(556, 542, 404, 548, 300, 522);
        p.closePath();
        return p;
    }
    const BOX = { x: 236, y: 246, w: 846, h: 300 };
    const DENT = { x: 800, y: 384 };
    const CAP = { x: 561, y: 256 };
    const STRIPES = [
        [[318, 452], [450, 384], [650, 336], [850, 334], [930, 336], [1000, 360], [1010, 392], [1016, 420], [985, 432], [965, 412]],
        [[318, 452], [460, 462], [650, 466], [850, 450], [930, 446], [985, 435], [995, 415], [1000, 400], [988, 392], [976, 400]],
    ];
    function sample(pts, per = 60) {
        const out = [];
        for (let i = 0; i + 3 < pts.length; i += 3) {
            const [a, b, c, d] = [pts[i], pts[i + 1], pts[i + 2], pts[i + 3]];
            for (let k = i ? 1 : 0; k <= per; k++) {
                const t = k / per, m = 1 - t;
                out.push([
                    m * m * m * a[0] + 3 * m * m * t * b[0] + 3 * m * t * t * c[0] + t * t * t * d[0],
                    m * m * m * a[1] + 3 * m * m * t * b[1] + 3 * m * t * t * c[1] + t * t * t * d[1],
                ]);
            }
        }
        return out;
    }
    const STRIPE_PTS = STRIPES.map((s) => sample(s));

    // Spray path: horizontal passes with a soft arc at each turnaround, the
    // way a painter's wrist actually moves. Returns position and trigger.
    function gunPath(p, passes) {
        const q = clamp(p) * passes;
        const pass = Math.min(passes - 1, Math.floor(q));
        const f = q - pass;
        const dir = pass % 2 ? -1 : 1;
        const x0 = BOX.x - 90, x1 = BOX.x + BOX.w + 90;
        const k = inOutSine(f);
        const x = dir > 0 ? lerp(x0, x1, k) : lerp(x1, x0, k);
        const yA = BOX.y + 14 + (pass / (passes - 1)) * (BOX.h - 34);
        const yB = BOX.y + 14 + (Math.min(pass + 1, passes - 1) / (passes - 1)) * (BOX.h - 34);
        // Drop to the next pass only near the end of a stroke, in an arc.
        const y = lerp(yA, yB, sstep(0.86, 1, f)) + Math.sin(f * Math.PI) * -6;
        const on = x > BOX.x - 40 && x < BOX.x + BOX.w + 40;
        return { x, y, on, dir };
    }

    function cssPaint() {
        const v = getComputedStyle(document.documentElement).getPropertyValue('--paint').trim();
        const m = v.match(/^#([0-9a-f]{6})$/i);
        if (!m) return [0.78, 0.06, 0.18];
        const n = parseInt(m[1], 16);
        return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
    }

    // ---- The tank's surface: silhouette -> height field -> normal map -------
    function buildSurface(path) {
        const W = VW, H = VH;
        const c = document.createElement('canvas');
        c.width = W; c.height = H;
        const g = c.getContext('2d');
        g.fillStyle = '#fff';
        g.fill(path);
        const img = g.getImageData(0, 0, W, H).data;
        const mask = new Float32Array(W * H);
        for (let i = 0; i < W * H; i++) mask[i] = img[i * 4 + 3] / 255;

        // Inflate the silhouette like a soap film (a membrane solved coarse to
        // fine), then round it over. No medial creases, just smooth sheet metal.
        const solve = (lw, lh, init, iters) => {
            const m = new Uint8Array(lw * lh);
            const sx = W / lw, sy = H / lh;
            for (let y = 0; y < lh; y++) for (let x = 0; x < lw; x++) {
                m[y * lw + x] = mask[Math.floor((y + 0.5) * sy) * W + Math.floor((x + 0.5) * sx)] > 0.5 ? 1 : 0;
            }
            let h = init || new Float32Array(lw * lh);
            let n = new Float32Array(lw * lh);
            const k = (sx / 4) * (sx / 4);
            for (let it = 0; it < iters; it++) {
                for (let y = 1; y < lh - 1; y++) for (let x = 1; x < lw - 1; x++) {
                    const i = y * lw + x;
                    n[i] = m[i] ? (h[i - 1] + h[i + 1] + h[i - lw] + h[i + lw]) * 0.25 + k : 0;
                }
                [h, n] = [n, h];
            }
            return h;
        };
        const up = (src, lw, lh, W2, H2) => {
            const out = new Float32Array(W2 * H2);
            for (let y = 0; y < H2; y++) for (let x = 0; x < W2; x++) {
                const fx = Math.min(lw - 1.001, Math.max(0, (x + 0.5) * lw / W2 - 0.5)), fy = Math.min(lh - 1.001, Math.max(0, (y + 0.5) * lh / H2 - 0.5));
                const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
                const i = y0 * lw + x0;
                out[y * W2 + x] = (src[i] * (1 - tx) + src[i + 1] * tx) * (1 - ty) + (src[i + lw] * (1 - tx) + src[i + lw + 1] * tx) * ty;
            }
            return out;
        };
        let lo = solve(80, 45, null, 260);
        lo = solve(160, 90, up(lo, 80, 45, 160, 90), 160);
        lo = solve(320, 180, up(lo, 160, 90, 320, 180), 120);
        let peak = 0;
        for (const v of lo) peak = Math.max(peak, v);
        // Body from the membrane (smooth, broad), rim from a full-resolution
        // edge distance (crisp, round): sheet metal rolled over at the edges.
        for (let i = 0; i < lo.length; i++) lo[i] = Math.pow(lo[i] / peak, 0.8) * 105;
        const body = up(lo, 320, 180, W, H);
        const d = new Float32Array(W * H);
        for (let i = 0; i < W * H; i++) d[i] = mask[i] > 0.5 ? 1e9 : 0;
        for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
            const i = y * W + x;
            if (d[i]) d[i] = Math.min(d[i], d[i - 1] + 1, d[i - W] + 1, d[i - W - 1] + 1.414, d[i - W + 1] + 1.414);
        }
        for (let y = H - 2; y > 0; y--) for (let x = W - 2; x > 0; x--) {
            const i = y * W + x;
            if (d[i]) d[i] = Math.min(d[i], d[i + 1] + 1, d[i + W] + 1, d[i + W + 1] + 1.414, d[i + W - 1] + 1.414);
        }
        const RIM = 38;
        const h = new Float32Array(W * H);
        for (let i = 0; i < W * H; i++) {
            if (mask[i] <= 0) continue;
            const t = Math.min((d[i] + mask[i] - 0.5) / RIM, 1);
            const rim = Math.sqrt(Math.max(0, 1 - (1 - Math.max(t, 0)) * (1 - Math.max(t, 0))));
            h[i] = rim * (45 + body[i]);
        }
        // A light blur melts the last stair steps out of the rim.
        const tmp = new Float32Array(W * H);
        for (let pass = 0; pass < 2; pass++) {
            for (let y = 0; y < H; y++) for (let x = 2; x < W - 2; x++) { const i = y * W + x; tmp[i] = (h[i - 2] + h[i - 1] + h[i] + h[i + 1] + h[i + 2]) / 5; }
            for (let y = 2; y < H - 2; y++) for (let x = 0; x < W; x++) { const i = y * W + x; h[i] = (tmp[i - 2 * W] + tmp[i - W] + tmp[i] + tmp[i + W] + tmp[i + 2 * W]) / 5; }
        }

        let maxH = 1;
        for (let i = 0; i < W * H; i++) if (h[i] > maxH) maxH = h[i];
        const out = new Uint8Array(W * H * 4);
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
            const i = y * W + x;
            const hx = (h[y * W + Math.min(W - 1, x + 1)] - h[y * W + Math.max(0, x - 1)]) / 2;
            const hy = (h[Math.min(H - 1, y + 1) * W + x] - h[Math.max(0, y - 1) * W + x]) / 2;
            let nx = -hx, ny = -hy, nz = 1;
            const l = Math.hypot(nx, ny, nz);
            nx /= l; ny /= l;
            out[i * 4] = Math.round(nx * 127.5 + 127.5);
            out[i * 4 + 1] = Math.round(ny * 127.5 + 127.5);
            out[i * 4 + 2] = Math.round((h[i] / maxH) * 255);
            out[i * 4 + 3] = Math.round(mask[i] * 255);
        }
        return out;
    }

    // ---- Shaders -------------------------------------------------------------
    const VERT = 'attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}';

    const COMMON = `
        precision highp float;
        float hash(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
        float noise(vec2 p){vec2 i=floor(p),f=fract(p);vec2 u=f*f*(3.-2.*f);
            return mix(mix(hash(i),hash(i+vec2(1,0)),u.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),u.x),u.y);}
        float fbm(vec2 p){float s=0.,a=.5;for(int i=0;i<4;i++){s+=a*noise(p);p*=2.03;a*=.5;}return s;}
    `;

    const SCENE_FRAG = COMMON + `
        uniform vec2 uRes; uniform vec3 uView; uniform float uTime;
        uniform sampler2D uTank, uPrime, uBase, uCandy, uWet, uStripe, uPolish;
        uniform vec3 uDent;          // x, y, amount
        uniform vec4 uImpact;        // x, y, age (s), strength
        uniform vec4 uFiller;        // spread, feather, wetness, presence
        uniform vec3 uCandyCol;
        uniform float uClear, uClearRough, uPeel, uEnvShift, uRust;
        uniform vec3 uBars;          // ceiling tube intensities
        uniform float uExposure;
        const vec2 SCENE = vec2(1280., 720.);
        const float FLOOR = 600.;

        // What the booth looks like in a reflection direction R (y down).
        vec3 env(vec3 R, float rough) {
            float w = 0.012 + rough * 0.55;
            float peak = 1.0 / (1.0 + rough * 16.0);
            float up = -R.y;
            vec3 c = vec3(0.016, 0.015, 0.018) + vec3(0.045, 0.043, 0.047) * smoothstep(-0.25, 0.7, up);
            for (int i = 0; i < 3; i++) {
                float fi = float(i);
                float cx = -0.52 + fi * 0.52 + uEnvShift;
                float k = i == 0 ? uBars.x : (i == 1 ? uBars.y : uBars.z);
                float bx = smoothstep(cx - 0.17 - w, cx - 0.17 + w, R.x) * (1.0 - smoothstep(cx + 0.17 - w, cx + 0.17 + w, R.x));
                float by = smoothstep(0.40 - w, 0.40 + w, up) * (1.0 - smoothstep(0.80 - w, 0.80 + w, up));
                // Tubes inside each softbox: faint banding like a real fixture.
                float tubes = 0.85 + 0.15 * sin((R.x - cx) * 60.0);
                c += vec3(1.0, 0.975, 0.93) * 10.0 * peak * bx * by * k * tubes;
            }
            float sx = R.x + uEnvShift * 0.35;
            c += vec3(0.82, 0.88, 1.0) * 3.2 * peak * smoothstep(0.80 - w, 0.80 + w, sx) * (1.0 - smoothstep(0.92 - w, 0.92 + w, sx)) * smoothstep(-0.5, 0.25, up);
            c += vec3(1.0, 0.88, 0.76) * 1.1 * peak * smoothstep(-0.95 - w, -0.95 + w, R.x) * (1.0 - smoothstep(-0.87 - w, -0.87 + w, R.x)) * smoothstep(-0.3, 0.4, up);
            c = mix(c, vec3(0.006), smoothstep(-0.02, -0.3, up) * 0.85);
            return c;
        }

        vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }

        vec3 booth(vec2 p) {
            float lit = (uBars.x + uBars.y + uBars.z) / 3.0;
            vec3 c;
            if (p.y < FLOOR) {
                c = mix(vec3(0.030, 0.028, 0.034), vec3(0.010, 0.009, 0.012), smoothstep(40.0, FLOOR, p.y));
                c *= 0.35 + 0.65 * lit;
                // Wall panels and their seams
                float seam = smoothstep(1.4, 0.0, abs(mod(p.x + 80.0, 160.0) - 80.0) - 78.6);
                c += vec3(0.012) * seam * lit;
                // Light pools below each fixture
                for (int i = 0; i < 3; i++) {
                    float fi = float(i);
                    float k = i == 0 ? uBars.x : (i == 1 ? uBars.y : uBars.z);
                    float x0 = 300.0 + fi * 340.0;
                    vec2 q = (p - vec2(x0, 70.0)) / vec2(260.0, 300.0);
                    c += vec3(0.06, 0.058, 0.055) * k * exp(-dot(q, q) * 1.6);
                    // The fixture itself
                    float fx = step(abs(p.x - x0), 120.0) * step(abs(p.y - 52.0), 5.0);
                    c += vec3(1.6, 1.56, 1.48) * fx * k;
                    float hous = step(abs(p.x - x0), 128.0) * step(abs(p.y - 52.0), 9.0) * (1.0 - fx);
                    c = mix(c, vec3(0.05), hous * 0.8);
                }
            } else {
                float z = (p.y - FLOOR) / 160.0;
                c = vec3(0.016, 0.015, 0.018) * (1.0 - z * 0.5) * (0.4 + 0.6 * lit);
                // Downdraft grates in perspective
                float gx = abs(fract((p.x - 640.0) / (60.0 + z * 160.0)) - 0.5);
                float gy = abs(fract(pow(max(z, 0.0), 0.62) * 9.0) - 0.5);
                c += vec3(0.010) * (smoothstep(0.47, 0.5, gx) + smoothstep(0.45, 0.5, gy)) * lit;
                c += vec3(0.05) * smoothstep(2.0, 0.0, p.y - FLOOR) * lit;
            }
            // Paint stand
            vec2 s = p;
            float post = step(abs(s.x - 580.0), 8.0) * step(530.0, s.y) * step(s.y, FLOOR);
            float foot = step(abs(s.x - 580.0), 82.0) * step(FLOOR - 9.0, s.y) * step(s.y, FLOOR);
            float sad = step(abs(s.x - 580.0), 42.0) * step(522.0, s.y) * step(s.y, 534.0);
            float st = max(post, max(foot, sad));
            vec3 stc = vec3(0.07, 0.068, 0.075) + vec3(0.10) * smoothstep(8.0, -8.0, s.x - 580.0) * post;
            c = mix(c, stc * (0.4 + 0.6 * lit), st);
            // Contact shadow on the floor under the stand
            vec2 sh = (p - vec2(580.0, FLOOR + 2.0)) / vec2(150.0, 10.0);
            c *= 1.0 - 0.7 * exp(-dot(sh, sh)) * step(FLOOR, p.y);
            return c;
        }

        float filler(vec2 p) {
            if (uFiller.w <= 0.0) return 0.0;
            vec2 c = vec2(800.0, 384.0);
            vec2 q = (p - c) / vec2(124.0, 80.0);
            q = mat2(0.99, 0.15, -0.15, 0.99) * q;
            float r = length(q) + (noise(p * 0.05) - 0.5) * 0.18;
            float edge = mix(0.72, 0.30, uFiller.y);
            float a = 1.0 - smoothstep(edge, 1.0, r);
            float front = c.x - 132.0 + 264.0 * uFiller.x;
            a *= smoothstep(front + 6.0, front - 6.0, p.x);
            return a * uFiller.w;
        }

        void main() {
            vec2 dev = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
            vec2 p = (dev - uView.yz) / uView.x;
            vec3 col = booth(p);
            vec2 uv = p / SCENE;
            vec4 T = vec4(0.5, 0.5, 0.0, 0.0);
            if (uv.x > 0.0 && uv.x < 1.0 && uv.y > 0.0 && uv.y < 1.0) T = texture2D(uTank, uv);

            if (T.a > 0.003) {
                vec2 nxy = T.rg * 2.0 - 1.0;
                vec3 N = vec3(nxy, sqrt(max(0.0, 1.0 - dot(nxy, nxy))));

                // The dent: a gaussian bowl with crumpled creases.
                vec2 dd = (p - uDent.xy) / vec2(54.0, 40.0);
                float g = exp(-dot(dd, dd));
                vec2 grad = 2.0 * dd / vec2(54.0, 40.0) * g;
                float crease = (fbm(p * 0.09) - 0.5);
                N.xy += uDent.z * (grad * 30.0 + vec2(crease, -crease) * g * 1.6);

                // Each hammer blow sends a ripple through the panel.
                if (uImpact.z >= 0.0 && uImpact.z < 1.4) {
                    vec2 rp = p - uImpact.xy;
                    float r = length(rp);
                    float front = uImpact.z * 380.0;
                    float wv = sin((r - front) * 0.16) * exp(-uImpact.z * 3.4) * exp(-abs(r - front) * 0.018);
                    N.xy += rp / (r + 1.0) * wv * 0.35 * uImpact.w;
                }

                float fil = filler(p);
                // Orange peel in fresh paint; sanding scratches in the filler.
                float polish = texture2D(uPolish, uv).a;
                float peel = uPeel * (1.0 - polish);
                N.xy += (vec2(noise(p * 0.75), noise(p * 0.75 + 7.3)) - 0.5) * peel;
                float scratch = noise(vec2((p.x + p.y) * 0.9, (p.x - p.y) * 0.04)) - 0.5;
                N.xy += vec2(scratch) * 0.25 * fil * uFiller.y;
                N = normalize(N);

                // ---- Materials, bottom up ----
                float brushed = noise(vec2(p.x * 0.012, p.y * 1.6)) * 0.55 + noise(vec2(p.x * 0.05, p.y * 3.7)) * 0.45;
                vec3 alb = vec3(0.56, 0.58, 0.61) * (0.82 + 0.3 * brushed);
                float metal = 1.0, rough = 0.52, aniso = 1.0;

                float rust = smoothstep(0.58, 0.72, fbm(p * 0.045) * 0.7 + fbm(p * 0.012) * 0.5 + (p.y - 470.0) / 300.0) * uRust;
                alb = mix(alb, vec3(0.34, 0.17, 0.08) * (0.6 + 0.8 * noise(p * 0.6)), rust);
                metal = mix(metal, 0.0, rust); rough = mix(rough, 0.85, rust); aniso *= 1.0 - rust;

                alb = mix(alb, vec3(0.80, 0.72, 0.64) * (0.92 + 0.12 * noise(p * 0.9)), fil);
                metal = mix(metal, 0.0, fil); rough = mix(rough, mix(0.82, 0.22, uFiller.z), fil); aniso *= 1.0 - fil;

                float wet = texture2D(uWet, uv).a;
                float cp = texture2D(uPrime, uv).a;
                alb = mix(alb, vec3(0.29, 0.30, 0.32) * (0.95 + 0.1 * noise(p * 1.3)), cp);
                metal = mix(metal, 0.0, cp); rough = mix(rough, mix(0.72, 0.16, wet), cp); aniso *= 1.0 - cp;

                float cb = texture2D(uBase, uv).a;
                alb = mix(alb, vec3(0.74, 0.75, 0.77), cb);
                metal = mix(metal, 0.92, cb); rough = mix(rough, mix(0.30, 0.14, wet), cb);

                float cc = texture2D(uCandy, uv).a;
                float thick = -log(max(1.0 - cc * 0.99, 0.01)) * 0.85;
                vec3 trans = pow(max(uCandyCol, vec3(0.003)), vec3(thick));
                alb *= trans;
                rough = mix(rough, 0.10, smoothstep(0.0, 0.3, cc));

                vec4 sp = texture2D(uStripe, uv);
                alb = mix(alb, sp.rgb, sp.a); metal = mix(metal, 0.55, sp.a); rough = mix(rough, 0.3, sp.a);

                // ---- Lighting ----
                vec3 R = vec3(2.0 * N.z * N.x, 2.0 * N.z * N.y, 2.0 * N.z * N.z - 1.0);
                vec3 Ra = vec3(R.x * mix(1.0, 0.22, aniso), R.y, R.z);
                float NdV = max(N.z, 0.0);
                vec3 F0 = mix(vec3(0.04), alb, metal);
                vec3 F = F0 + (1.0 - F0) * pow(1.0 - NdV, 5.0);
                float lit = (uBars.x + uBars.y + uBars.z) / 3.0;
                float key = clamp(-N.y * 0.75 + N.z * 0.45, 0.0, 1.0);
                vec3 c = alb * (1.0 - metal) * (0.035 + 1.05 * key * lit) + env(Ra, rough) * F;
                // Rough metal also picks up the whole lit room, not just the lights.
                c += alb * metal * rough * (0.1 + 0.32 * key) * lit;

                // Metal flake: tiny tilted mirrors in the base, tinted by the candy above.
                vec2 fc = floor(p / 1.35);
                float h1 = hash(fc), h2 = hash(fc + 3.1), h3 = hash(fc + 9.7);
                vec3 fN = normalize(N + vec3(h1 - 0.5, h2 - 0.5, 0.0) * 1.3);
                vec3 fR = vec3(2.0 * fN.z * fN.x, 2.0 * fN.z * fN.y, 2.0 * fN.z * fN.z - 1.0);
                float fmask = step(0.55, h3) * cb;
                c += env(fR, 0.02) * 0.10 * fmask * mix(vec3(1.0), trans * 1.6 + 0.08, smoothstep(0.0, 0.4, cc));

                // Clearcoat
                float Fc = 0.04 + 0.96 * pow(1.0 - NdV, 5.0);
                float cr = mix(uClearRough, 0.012, polish);
                c = c * (1.0 - Fc * uClear) + env(R, cr) * Fc * uClear;

                // Occlusion toward the underside
                c *= mix(1.0, 0.45, smoothstep(420.0, 560.0, p.y) * (1.0 - smoothstep(0.0, 0.5, T.b)));

                col = mix(col, c, T.a);
            }

            col = aces(col * uExposure);
            col = pow(col, vec3(1.0 / 2.2));
            gl_FragColor = vec4(col, 1.0);
        }
    `;

    const BRIGHT_FRAG = `
        precision mediump float;
        uniform sampler2D uTex; uniform vec2 uTexel;
        void main() {
            vec2 uv = gl_FragCoord.xy * uTexel * 4.0;
            vec3 c = vec3(0.0);
            for (int x = -1; x <= 2; x++) for (int y = -1; y <= 2; y++) c += texture2D(uTex, uv + vec2(x, y) * uTexel).rgb;
            c /= 16.0;
            float l = max(c.r, max(c.g, c.b));
            gl_FragColor = vec4(c * smoothstep(0.62, 1.0, l), 1.0);
        }
    `;

    const BLUR_FRAG = `
        precision mediump float;
        uniform sampler2D uTex; uniform vec2 uDir; uniform vec2 uRes;
        void main() {
            vec2 uv = gl_FragCoord.xy / uRes;
            vec3 c = texture2D(uTex, uv).rgb * 0.227;
            c += (texture2D(uTex, uv + uDir * 1.38).rgb + texture2D(uTex, uv - uDir * 1.38).rgb) * 0.316;
            c += (texture2D(uTex, uv + uDir * 3.23).rgb + texture2D(uTex, uv - uDir * 3.23).rgb) * 0.070;
            gl_FragColor = vec4(c, 1.0);
        }
    `;

    const COMPOSITE_FRAG = COMMON + `
        uniform sampler2D uScene, uBloom; uniform vec2 uRes; uniform float uFloorY, uGap, uTime, uFade;
        void main() {
            vec2 uv = gl_FragCoord.xy / uRes;
            float devY = uRes.y - gl_FragCoord.y;
            vec2 cd = uv - 0.5;
            float ca = 0.0016 * dot(cd, cd) * 4.0;
            vec3 c = vec3(texture2D(uScene, uv - cd * ca).r, texture2D(uScene, uv).g, texture2D(uScene, uv + cd * ca).b);
            if (devY > uFloorY) {
                float dy = devY - uFloorY;
                float my = uFloorY - dy - uGap;
                vec2 ruv = vec2(uv.x, 1.0 - my / uRes.y);
                vec3 r = texture2D(uScene, ruv).rgb * 0.6 + texture2D(uBloom, ruv).rgb * 0.8;
                c += r * 0.26 * exp(-dy / (uRes.y * 0.10));
            }
            c += texture2D(uBloom, uv).rgb * 0.85;
            c *= mix(0.5, 1.0, smoothstep(0.95, 0.3, length(cd * vec2(1.0, 1.2))));
            c += (hash(gl_FragCoord.xy + fract(uTime * 7.31)) - 0.5) * 0.03;
            c *= 1.0 - uFade;
            gl_FragColor = vec4(c, 1.0);
        }
    `;

    function init() {
        const root = document.querySelector('[data-craft]');
        if (!root) return;
        const glCanvas = root.querySelector('[data-craft-gl]');
        const fx = root.querySelector('[data-craft-fx]');
        const f2 = fx.getContext('2d');
        const hudNo = root.querySelector('[data-craft-no]');
        const hudName = root.querySelector('[data-craft-name]');
        const hudCaption = root.querySelector('[data-craft-caption]');
        const hudTime = root.querySelector('[data-craft-time]');
        const playBtn = root.querySelector('[data-craft-play]');
        const chips = [...document.querySelectorAll('[data-craft-step]')];
        const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        const gl = glCanvas.getContext('webgl', { antialias: false, alpha: false, preserveDrawingBuffer: false });
        if (!gl) { root.classList.add('no-gl'); return; }

        // ---- GL plumbing ----
        const compile = (type, src) => {
            const s = gl.createShader(type);
            gl.shaderSource(s, src);
            gl.compileShader(s);
            if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
            return s;
        };
        const program = (frag, names) => {
            const p = gl.createProgram();
            gl.attachShader(p, compile(gl.VERTEX_SHADER, VERT));
            gl.attachShader(p, compile(gl.FRAGMENT_SHADER, frag));
            gl.bindAttribLocation(p, 0, 'a');
            gl.linkProgram(p);
            if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
            const u = {};
            names.forEach((n) => { u[n] = gl.getUniformLocation(p, n); });
            return { p, u };
        };
        let P;
        try {
            P = {
                scene: program(SCENE_FRAG, ['uRes', 'uView', 'uTime', 'uTank', 'uPrime', 'uBase', 'uCandy', 'uWet', 'uStripe', 'uPolish', 'uDent', 'uImpact', 'uFiller', 'uCandyCol', 'uClear', 'uClearRough', 'uPeel', 'uEnvShift', 'uRust', 'uBars', 'uExposure']),
                bright: program(BRIGHT_FRAG, ['uTex', 'uTexel']),
                blur: program(BLUR_FRAG, ['uTex', 'uDir', 'uRes']),
                comp: program(COMPOSITE_FRAG, ['uScene', 'uBloom', 'uRes', 'uFloorY', 'uGap', 'uTime', 'uFade']),
            };
        } catch (err) {
            console.warn('[craft] WebGL unavailable:', err);
            root.classList.add('no-gl');
            return;
        }
        const vbo = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

        const makeTex = () => {
            const t = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, t);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            return t;
        };
        const target = (w, h) => {
            const tex = makeTex();
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
            const fb = gl.createFramebuffer();
            gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            return { tex, fb, w, h };
        };

        // Tank surface texture
        const tankTex = makeTex();
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, VW, VH, 0, gl.RGBA, gl.UNSIGNED_BYTE, buildSurface(tankPath()));

        // Paint maps live in 2D canvases and are uploaded as they change.
        const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
        const CW = VW * COV, CH = VH * COV;
        const maps = {};
        ['prime', 'base', 'candy', 'wet', 'polish'].forEach((k) => {
            const c = mk(CW, CH);
            const g = c.getContext('2d');
            g.setTransform(COV, 0, 0, COV, 0, 0);
            maps[k] = { c, g, tex: makeTex(), dirty: true };
        });
        const stripe = { c: mk(VW, VH), tex: makeTex(), dirty: true, p: -1 };
        stripe.g = stripe.c.getContext('2d');
        const upload = (m) => {
            gl.bindTexture(gl.TEXTURE_2D, m.tex);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, m.c);
            m.dirty = false;
        };

        let RT = null;
        const st = {
            t: 0, last: 0, playing: !reduceMotion, visible: false, raf: 0, stage: -1,
            cam: { x: VW / 2, y: VH / 2, z: 1, vx: 0, vy: 0, vz: 0 }, shake: 0,
            view: { base: 1, s: 1, ox: 0, oy: 0 }, dpr: 1,
            particles: [], mist: [],
            strikes: 0, impact: { x: 0, y: 0, t: -10, k: 0 },
            candy: cssPaint(), sprayCarry: 0,
        };

        function resize() {
            const r = glCanvas.getBoundingClientRect();
            if (!r.width) return;
            st.dpr = Math.min(window.devicePixelRatio || 1, 1.75);
            let W = Math.round(r.width * st.dpr), H = Math.round(r.height * st.dpr);
            // Keep the GPU budget sane on huge screens.
            const cap = 2.2e6;
            if (W * H > cap) { const k = Math.sqrt(cap / (W * H)); W = Math.round(W * k); H = Math.round(H * k); }
            glCanvas.width = W; glCanvas.height = H;
            fx.width = W; fx.height = H;
            const narrow = W / H < 1.5;
            st.view.base = narrow ? Math.min(W / (VW * 0.74), H / (VH * 0.6)) : Math.min(W / VW, H / (VH * 0.8));
            RT = {
                scene: target(W, H),
                a: target(Math.ceil(W / 4), Math.ceil(H / 4)),
                b: target(Math.ceil(W / 4), Math.ceil(H / 4)),
            };
            render();
        }

        // ---- Painting into the maps ----
        function droplets(m, x, y, radius, n, alpha) {
            const g = m.g;
            for (let i = 0; i < n; i++) {
                const px = x + gauss() * radius * 0.42, py = y + gauss() * radius * 0.42;
                g.fillStyle = `rgba(255,255,255,${alpha[0] + Math.random() * (alpha[1] - alpha[0])})`;
                g.beginPath();
                g.arc(px, py, 1.6 + Math.random() * 3.6, 0, Math.PI * 2);
                g.fill();
            }
            m.dirty = true;
        }
        const COATS = {
            prime: { passes: 6, alpha: [0.22, 0.42], rgb: () => [150, 152, 158] },
            base:  { passes: 6, alpha: [0.22, 0.42], rgb: () => [215, 218, 224] },
            candy: { passes: 9, alpha: [0.06, 0.13], rgb: () => st.candy.map((v) => v * 255) },
        };
        const SPRAY_END = 0.9;

        function sprayInterval(key, p0, p1, live) {
            const coat = COATS[key];
            const steps = Math.max(1, Math.ceil((p1 - p0) * 500));
            for (let i = 1; i <= steps; i++) {
                const p = lerp(p0, p1, i / steps);
                if (p > SPRAY_END) break;
                const g = gunPath(p / SPRAY_END, coat.passes);
                if (!g.on) continue;
                const n = Math.max(1, Math.round(26000 * (p1 - p0) / steps));
                droplets(maps[key], g.x, g.y, 64, n, coat.alpha);
                droplets(maps.wet, g.x, g.y, 64, Math.ceil(n / 3), [0.3, 0.6]);
                if (live && i === steps) emitSpray(g, coat.rgb());
            }
        }
        function clearMap(m) { m.g.save(); m.g.setTransform(1, 0, 0, 1, 0, 0); m.g.clearRect(0, 0, m.c.width, m.c.height); m.g.restore(); m.dirty = true; }
        function fillMap(m, a = 1) { m.g.save(); m.g.setTransform(1, 0, 0, 1, 0, 0); m.g.fillStyle = `rgba(255,255,255,${a})`; m.g.fillRect(0, 0, m.c.width, m.c.height); m.g.restore(); m.dirty = true; }

        function drawStripe(p) {
            const g = stripe.g;
            g.clearRect(0, 0, VW, VH);
            if (p <= 0) { stripe.dirty = true; stripe.p = p; return; }
            const pass = (style, widthK, dy) => {
                STRIPE_PTS.forEach((pts, si) => {
                    const n = Math.max(2, Math.floor(pts.length * p));
                    for (let k = 1; k < n; k++) {
                        const t = k / pts.length;
                        // A striping brush loads up, swells, and lifts off.
                        const w = (si ? 4.2 : 5.4) * (0.3 + Math.sin(Math.min(1, t * 1.04) * Math.PI) * 0.8) * widthK;
                        const wob = Math.sin(k * 0.31 + si) * 0.25;
                        g.lineWidth = w;
                        g.strokeStyle = style;
                        g.lineCap = 'round';
                        g.beginPath();
                        g.moveTo(pts[k - 1][0], pts[k - 1][1] + dy + wob);
                        g.lineTo(pts[k][0], pts[k][1] + dy + wob);
                        g.stroke();
                    }
                });
            };
            pass('rgba(12,8,4,0.85)', 2.0, 1.2);
            pass('rgb(236,186,82)', 1.0, 0);
            pass('rgba(255,236,170,0.9)', 0.35, -0.6);
            stripe.dirty = true;
            stripe.p = p;
        }

        // ---- Particles (2D layer, scene coords) ----
        function sparks(x, y, k) {
            for (let i = 0; i < 70 * k; i++) {
                const a = -Math.PI / 2 + gauss() * 1.0, v = 3 + Math.random() * 11;
                st.particles.push({ kind: 'spark', x, y, vx: Math.cos(a) * v + 1.5, vy: Math.sin(a) * v, life: 0, max: 300 + Math.random() * 600, w: 0.8 + Math.random() * 1.4 });
            }
            st.particles.push({ kind: 'flash', x, y, life: 0, max: 140 });
            st.shake = 10 * k;
        }
        function dust(x, y, n) {
            for (let i = 0; i < n; i++) st.particles.push({ kind: 'dust', x: x + gauss() * 40, y: y + gauss() * 8, vx: gauss() * 0.5, vy: -0.15 + Math.random() * 0.5, life: 0, max: 1400 + Math.random() * 1600, r: 0.8 + Math.random() * 2.2 });
        }
        function emitSpray(g, rgb) {
            const nx = g.x + 70 * (g.dir > 0 ? -0.35 : 0.35) + 60, ny = g.y - 150;
            for (let i = 0; i < 18; i++) {
                const tx = g.x + gauss() * 22, ty = g.y + gauss() * 12;
                const T = 120 + Math.random() * 80;
                st.particles.push({ kind: 'drop', x: nx + gauss() * 2, y: ny + gauss() * 2, vx: (tx - nx) / (T / 16.7), vy: (ty - ny) / (T / 16.7), life: 0, max: T, rgb });
            }
            if (Math.random() < 0.7) st.mist.push({ x: g.x + gauss() * 30, y: g.y + gauss() * 20, vx: gauss() * 0.25 - g.dir * 0.2, vy: -0.2 - Math.random() * 0.3, r: 30 + Math.random() * 50, life: 0, max: 2200 + Math.random() * 1800, rgb });
        }
        function stepParticles(dt) {
            const k = dt / 16.7;
            st.particles = st.particles.filter((p) => {
                p.life += dt;
                if (p.kind === 'spark') {
                    p.vy += 0.38 * k; p.vx *= Math.pow(0.99, k);
                    p.x += p.vx * k; p.y += p.vy * k;
                    if (p.y > FLOOR) { p.y = FLOOR; p.vy *= -0.3; p.vx *= 0.7; }
                } else if (p.kind === 'dust' || p.kind === 'drop') { p.x += p.vx * k; p.y += p.vy * k; }
                return p.life < p.max;
            });
            st.mist = st.mist.filter((m) => { m.life += dt; m.x += m.vx * k; m.y += m.vy * k; m.r += 0.12 * k; return m.life < m.max; });
            if (st.mist.length > 90) st.mist.splice(0, st.mist.length - 90);
            if (st.particles.length > 1400) st.particles.splice(0, st.particles.length - 1400);
        }

        // ---- Timeline ----
        const stageAt = (t) => { let i = 0; while (i < STAGES.length - 1 && t >= STARTS[i + 1]) i++; return i; };
        const local = (t) => { const i = stageAt(t); return { i, key: STAGES[i].key, p: clamp((t - STARTS[i]) / STAGES[i].dur) }; };
        const STRIKES = [0.22, 0.5, 0.76];

        // Rebuild every map for an arbitrary time (jump, loop, first frame).
        function settle(t) {
            Object.values(maps).forEach(clearMap);
            st.particles.length = 0;
            st.mist.length = 0;
            const { i, p } = local(t);
            ['prime', 'base', 'candy'].forEach((key) => {
                if (i > IDX[key]) fillMap(maps[key], key === 'candy' ? 0.93 : 1);
                else if (i === IDX[key]) sprayInterval(key, 0, p, false);
            });
            if (i > IDX.clear) fillMap(maps.polish);
            else if (i === IDX.clear) polishTo(p);
            drawStripe(i > IDX.stripe ? 1 : i === IDX.stripe ? stripeProgress(p) : 0);
            st.strikes = i > IDX.straighten ? 3 : i === IDX.straighten ? STRIKES.filter((s) => p > s).length : 0;
        }

        const stripeProgress = (p) => inOutSine(span(p, 0.06, 0.9));
        const buffer = (p) => {
            const q = span(p, 0.5, 0.97);
            return { q, x: lerp(BOX.x + 110, BOX.x + BOX.w - 90, inOutSine(q)), y: 330 + Math.sin(q * Math.PI * 5) * 46 + q * 40 };
        };
        function polishTo(p) {
            const steps = 40;
            for (let k = 0; k <= steps; k++) {
                const b = buffer(p * k / steps);
                if (b.q <= 0) continue;
                const g = maps.polish.g;
                const rg = g.createRadialGradient(b.x, b.y, 0, b.x, b.y, 90);
                rg.addColorStop(0, 'rgba(255,255,255,0.5)');
                rg.addColorStop(1, 'rgba(255,255,255,0)');
                g.fillStyle = rg;
                g.beginPath(); g.arc(b.x, b.y, 90, 0, Math.PI * 2); g.fill();
            }
            maps.polish.dirty = true;
        }

        function advance(t0, t1, dt) {
            const { i, key, p } = local(t1);
            const p0 = clamp((t0 - STARTS[i]) / STAGES[i].dur);
            if (i !== st.stage) {
                if (i === 0 || st.stage === -1 || i < st.stage) settle(t1);
                st.stage = i;
                onStage(i);
            }
            if (key === 'straighten') {
                STRIKES.forEach((at, n) => {
                    if (p0 < at && p >= at) {
                        const k = n === 2 ? 0.7 : 1;
                        st.strikes = n + 1;
                        st.impact = { x: DENT.x - 6, y: DENT.y + 6, t: t1, k };
                        sparks(DENT.x - 10, DENT.y + 6, k);
                    }
                });
            }
            if (key === 'fill' && p > 0.38 && p < 0.97) {
                const b = sander(p);
                if (Math.random() < 0.9) dust(b.x, b.y + 20, 2);
            }
            if (COATS[key]) sprayInterval(key, p0, p, true);
            if (key === 'clear') {
                if (p < 0.45) {
                    const g = gunPath(p / 0.45, 5);
                    if (g.on) { droplets(maps.wet, g.x, g.y, 64, 40, [0.3, 0.6]); emitSpray(g, [235, 240, 248]); }
                } else if (p < 0.97) {
                    const b = buffer(p);
                    const g = maps.polish.g;
                    const rg = g.createRadialGradient(b.x, b.y, 0, b.x, b.y, 90);
                    rg.addColorStop(0, `rgba(255,255,255,${0.25 * dt / 16.7})`);
                    rg.addColorStop(1, 'rgba(255,255,255,0)');
                    g.fillStyle = rg;
                    g.beginPath(); g.arc(b.x, b.y, 90, 0, Math.PI * 2); g.fill();
                    maps.polish.dirty = true;
                    if (Math.random() < 0.3) dust(b.x, b.y + 10, 1);
                }
            }
            if (key === 'stripe') {
                const sp = stripeProgress(p);
                if (Math.abs(sp - stripe.p) > 0.002) drawStripe(sp);
            }
            // Fresh paint flashes off: wetness fades over a few seconds.
            const w = maps.wet.g;
            w.save();
            w.setTransform(1, 0, 0, 1, 0, 0);
            w.globalCompositeOperation = 'destination-out';
            w.fillStyle = `rgba(0,0,0,${Math.min(0.2, dt / 16.7 * 0.012)})`;
            w.fillRect(0, 0, maps.wet.c.width, maps.wet.c.height);
            w.restore();
            maps.wet.dirty = true;
        }

        function onStage(i) {
            if (hudNo) hudNo.textContent = String(i + 1).padStart(2, '0');
            if (hudName) hudName.textContent = STAGES[i].label;
            if (hudCaption) hudCaption.textContent = STAGES[i].caption;
            root.dataset.stage = STAGES[i].key;
            chips.forEach((c, n) => {
                c.classList.toggle('is-done', n < i);
                if (n === i) c.setAttribute('aria-current', 'step');
                else c.removeAttribute('aria-current');
            });
        }

        // Sanding: long crisscross strokes, the way you actually block a repair.
        const sander = (p) => {
            const q = span(p, 0.38, 0.97);
            const strokes = 7;
            const s = Math.min(strokes - 1, Math.floor(q * strokes));
            const f = inOutSine((q * strokes - s) * 2 % 1);
            const back = ((q * strokes - s) * 2) >= 1;
            const ang = s % 2 ? 0.5 : -0.5;
            const len = 120 * (back ? 1 - f : f) - 60;
            return { x: DENT.x - 10 + Math.cos(ang) * len, y: DENT.y - 6 + Math.sin(ang) * len * 0.6, ang };
        };

        // ---- Per-frame uniforms from the timeline ----
        function look(t) {
            const { i, key, p } = local(t);
            const u = {};
            const intro = t;
            // Fluorescent tubes strike one at a time.
            const tube = (k) => {
                const on = 260 + k * 380;
                if (intro < on) return 0.02;
                const a = intro - on;
                if (a < 420) return (Math.sin(a * 0.11 + k * 3) > 0.15 ? 1 : 0.15) * (0.4 + a / 700);
                return 1;
            };
            u.bars = i === 0 ? [tube(0), tube(1), tube(2)] : [1, 1, 1];
            if (key === 'reveal') {
                const dim = 1 - 0.3 * sstep(0, 0.15, p) + 0.3 * sstep(0.8, 1, p);
                u.bars = [dim, 1.1, dim];
            }
            const dentLeft = 1 - st.strikes / 3 * 0.96;
            u.dent = i === 0 ? 1 : i === 1 ? dentLeft : 0;
            u.rust = i <= IDX.fill ? 1 : 1;
            u.filler = [0, 0, 0, 0];
            if (key === 'fill') u.filler = [outCubic(span(p, 0.04, 0.34)), span(p, 0.38, 0.97), 1 - span(p, 0.3, 0.45), 1];
            else if (i > IDX.fill) u.filler = [1, 1, 0, 1];
            u.peel = [0, 0, 0, 0.05, 0.06, 0.07, 0.07, 0.08, 0][i];
            u.clear = key === 'clear' ? sstep(0, 0.45, p) : i > IDX.clear ? 1 : 0;
            u.clearRough = key === 'clear' ? lerp(0.06, 0.035, span(p, 0, 0.45)) : 0.012;
            u.envShift = key === 'reveal' ? lerp(-0.7, 0.55, inOutSine(span(p, 0.05, 0.85))) : Math.sin(t / 5200) * 0.05;
            u.exposure = key === 'reveal' ? 1.05 : 1.0;
            const age = (t - st.impact.t) / 1000;
            u.impact = [st.impact.x, st.impact.y, key === 'straighten' && age >= 0 ? age : -1, st.impact.k];
            return u;
        }

        function cameraTarget(t) {
            const { key, p } = local(t);
            const C = { x: VW / 2, y: VH / 2 - 10, z: 1 };
            switch (key) {
                case 'damage': {
                    const k = inOutSine(span(p, 0.35, 1));
                    return { x: lerp(C.x, DENT.x - 50, k), y: lerp(C.y, DENT.y - 10, k), z: lerp(1.0, 1.42, k) };
                }
                case 'straighten': return { x: DENT.x - 30, y: DENT.y - 20, z: 1.5 };
                case 'fill': return { x: DENT.x - 40, y: DENT.y - 10, z: lerp(1.5, 1.38, p) };
                case 'stripe': {
                    const pts = STRIPE_PTS[0];
                    const [x] = pts[Math.min(pts.length - 1, Math.floor(pts.length * stripeProgress(p)))];
                    return { x: clamp(x, 520, 820), y: 400, z: 1.32 };
                }
                case 'reveal': return { x: lerp(VW / 2 + 40, VW / 2 - 20, inOutSine(p)), y: VH / 2 - 4, z: lerp(1.0, 1.12, inOutSine(p)) };
                default: return C;
            }
        }

        // ---- 2D layer: tools and particles ----
        function toScreen(c) {
            const v = st.view;
            c.setTransform(v.s, 0, 0, v.s, v.ox, v.oy);
        }

        function drawHammer(c, a, blur) {
            const pivot = { x: DENT.x + 150, y: DENT.y - 34 };
            const one = (ang, alpha) => {
                c.save();
                c.globalAlpha = alpha;
                c.translate(pivot.x, pivot.y);
                c.rotate(ang);
                c.scale(0.74, 0.74);
                // Hickory handle with grain
                const hg = c.createLinearGradient(0, -7, 0, 7);
                hg.addColorStop(0, '#c99b62'); hg.addColorStop(0.45, '#a67642'); hg.addColorStop(1, '#5d3b1c');
                c.fillStyle = hg;
                c.beginPath(); c.roundRect(-198, -6.5, 250, 13, 6); c.fill();
                c.strokeStyle = 'rgba(70,40,15,0.35)'; c.lineWidth = 0.7;
                for (let k = 0; k < 4; k++) { c.beginPath(); c.moveTo(-190, -3 + k * 2); c.bezierCurveTo(-120, -4 + k * 2.4, -40, -1 + k * 1.6, 48, -2 + k * 2); c.stroke(); }
                // Grip wrap near the end
                c.fillStyle = '#1d1c20';
                c.beginPath(); c.roundRect(0, -7.5, 54, 15, 6); c.fill();
                // Body hammer head: round face down, pick up
                const sg = c.createLinearGradient(-240, 0, -170, 0);
                sg.addColorStop(0, '#4a4f56'); sg.addColorStop(0.35, '#d9dde2'); sg.addColorStop(0.55, '#f6f8fa'); sg.addColorStop(1, '#5d636b');
                c.fillStyle = sg;
                c.beginPath(); c.roundRect(-226, -14, 56, 56, 8); c.fill();
                c.beginPath(); c.moveTo(-226, -12); c.lineTo(-206, -62); c.lineTo(-190, -62); c.lineTo(-170, -12); c.closePath(); c.fill();
                c.fillStyle = '#9aa1a9';
                c.beginPath(); c.ellipse(-198, 44, 26, 5, 0, 0, Math.PI * 2); c.fill();
                c.restore();
            };
            if (blur > 0.02) for (let k = 5; k >= 1; k--) one(a - blur * k * 0.06, 0.09);
            one(a, 1);
        }

        function drawGun(c, g, rgb, tilt) {
            const nx = g.x + 60, ny = g.y - 150;
            c.save();
            // Soft spray cone: additive haze from the air cap to the panel.
            c.globalCompositeOperation = 'lighter';
            const cone = c.createLinearGradient(nx, ny, g.x, g.y);
            cone.addColorStop(0, `rgba(${rgb[0] | 0},${rgb[1] | 0},${rgb[2] | 0},0.22)`);
            cone.addColorStop(1, `rgba(${rgb[0] | 0},${rgb[1] | 0},${rgb[2] | 0},0.02)`);
            c.fillStyle = cone;
            c.beginPath(); c.moveTo(nx - 3, ny); c.quadraticCurveTo(g.x - 40, g.y - 70, g.x - 66, g.y + 8); c.lineTo(g.x + 62, g.y - 4); c.quadraticCurveTo(g.x + 30, g.y - 80, nx + 3, ny); c.closePath(); c.fill();
            c.restore();

            // Hose sweeping off frame
            c.strokeStyle = '#141317'; c.lineWidth = 7; c.lineCap = 'round';
            c.beginPath(); c.moveTo(nx + 86, ny + 70); c.bezierCurveTo(nx + 120, ny + 200, nx + 300, ny + 120, nx + 420, ny + 260); c.stroke();
            c.strokeStyle = 'rgba(255,255,255,0.08)'; c.lineWidth = 2;
            c.beginPath(); c.moveTo(nx + 86, ny + 68); c.bezierCurveTo(nx + 120, ny + 198, nx + 300, ny + 118, nx + 420, ny + 258); c.stroke();

            c.save();
            c.translate(nx, ny);
            c.rotate(-0.5 + tilt);
            const metal = (y0, y1) => { const m = c.createLinearGradient(0, y0, 0, y1); m.addColorStop(0, '#f2f4f6'); m.addColorStop(0.4, '#a3a9b1'); m.addColorStop(0.7, '#6c727a'); m.addColorStop(1, '#c9ced4'); return m; };
            // Air cap + fluid nozzle
            c.fillStyle = metal(-9, 9);
            c.beginPath(); c.roundRect(-16, -9, 20, 18, 4); c.fill();
            c.fillStyle = '#2d2c31';
            c.beginPath(); c.arc(-16, 0, 3, 0, Math.PI * 2); c.fill();
            // Body
            c.fillStyle = metal(-13, 13);
            c.beginPath(); c.moveTo(2, -12); c.lineTo(92, -14); c.quadraticCurveTo(104, -13, 104, 0); c.lineTo(104, 6); c.lineTo(2, 10); c.closePath(); c.fill();
            // Handle
            c.fillStyle = metal(0, 80);
            c.beginPath(); c.moveTo(70, 4); c.lineTo(96, 4); c.lineTo(102, 82); c.quadraticCurveTo(90, 90, 78, 82); c.closePath(); c.fill();
            // Trigger
            c.strokeStyle = '#d4d8dd'; c.lineWidth = 4;
            c.beginPath(); c.moveTo(28, 6); c.quadraticCurveTo(46, 40, 60, 58); c.stroke();
            // Gravity cup with paint visible through it
            c.fillStyle = 'rgba(220,228,236,0.35)';
            c.beginPath(); c.moveTo(28, -14); c.lineTo(20, -76); c.quadraticCurveTo(44, -86, 70, -76); c.lineTo(60, -14); c.closePath(); c.fill();
            c.fillStyle = `rgba(${rgb[0] | 0},${rgb[1] | 0},${rgb[2] | 0},0.85)`;
            c.beginPath(); c.moveTo(29, -16); c.lineTo(24, -52); c.quadraticCurveTo(44, -58, 66, -52); c.lineTo(59, -16); c.closePath(); c.fill();
            c.fillStyle = 'rgba(255,255,255,0.35)';
            c.fillRect(30, -72, 3, 54);
            c.fillStyle = '#1e1d22';
            c.beginPath(); c.roundRect(17, -86, 56, 9, 3); c.fill();
            c.restore();
        }

        function drawSander(c, b) {
            c.save();
            c.translate(b.x, b.y);
            c.rotate(b.ang * 0.25);
            c.fillStyle = 'rgba(0,0,0,0.3)';
            c.beginPath(); c.roundRect(-78, -14, 160, 40, 10); c.fill();
            const body = c.createLinearGradient(0, -40, 0, 20);
            body.addColorStop(0, '#3a3b42'); body.addColorStop(1, '#16161a');
            c.fillStyle = body;
            c.beginPath(); c.roundRect(-80, -22, 160, 38, 9); c.fill();
            c.fillStyle = '#c8b48a';
            c.fillRect(-80, 12, 160, 6);
            c.fillStyle = 'rgba(255,255,255,0.12)';
            c.fillRect(-74, -19, 148, 3);
            c.restore();
        }

        function drawBuffer(c, b, t) {
            c.save();
            c.translate(b.x, b.y);
            c.fillStyle = 'rgba(0,0,0,0.28)';
            c.beginPath(); c.ellipse(8, 18, 74, 20, 0, 0, Math.PI * 2); c.fill();
            const pad = c.createRadialGradient(-10, -4, 4, 0, 0, 70);
            pad.addColorStop(0, '#fbf8f2'); pad.addColorStop(1, '#d8d1c3');
            c.fillStyle = pad;
            c.beginPath(); c.ellipse(0, 0, 68, 19, 0, 0, Math.PI * 2); c.fill();
            // Motion blur of the spinning pad
            c.strokeStyle = 'rgba(120,110,95,0.35)';
            c.lineWidth = 1;
            for (let k = 0; k < 9; k++) {
                const a = t / 22 + k * 0.7;
                c.beginPath(); c.ellipse(0, 0, 20 + k * 5, 5 + k * 1.4, 0, a, a + 1.2); c.stroke();
            }
            const body = c.createLinearGradient(-30, -80, 30, -80);
            body.addColorStop(0, '#1b1b20'); body.addColorStop(0.5, '#3b3c44'); body.addColorStop(1, '#16161a');
            c.fillStyle = body;
            c.beginPath(); c.roundRect(-28, -78, 56, 62, 10); c.fill();
            c.beginPath(); c.roundRect(18, -66, 170, 22, 10); c.fill();
            c.fillStyle = 'rgba(255,255,255,0.1)'; c.fillRect(-22, -74, 44, 3);
            c.restore();
        }

        function drawBrush(c, x, y, dx, dy) {
            const a = Math.atan2(dy, dx);
            c.save();
            c.translate(x, y);
            c.rotate(a - 2.3);
            // Bristles drag behind the stroke.
            const br = c.createLinearGradient(0, 0, 0, -46);
            br.addColorStop(0, '#d6a440'); br.addColorStop(0.6, '#3a2a18'); br.addColorStop(1, '#2a1c0e');
            c.fillStyle = br;
            c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(-5, -20, -4, -46); c.lineTo(4, -46); c.quadraticCurveTo(5, -20, 0, 0); c.fill();
            const fer = c.createLinearGradient(-5, 0, 5, 0);
            fer.addColorStop(0, '#80868e'); fer.addColorStop(0.5, '#eef0f2'); fer.addColorStop(1, '#6d737b');
            c.fillStyle = fer; c.fillRect(-4.5, -62, 9, 17);
            const wood = c.createLinearGradient(-4, 0, 4, 0);
            wood.addColorStop(0, '#5b3a1e'); wood.addColorStop(0.5, '#a5763f'); wood.addColorStop(1, '#4a2e16');
            c.fillStyle = wood;
            c.beginPath(); c.moveTo(-4, -62); c.lineTo(-2.5, -200); c.lineTo(2.5, -200); c.lineTo(4, -62); c.fill();
            c.restore();
            c.fillStyle = 'rgba(255,236,170,0.9)';
            c.beginPath(); c.arc(x, y, 2.2, 0, Math.PI * 2); c.fill();
        }

        function drawFX(t) {
            const c = f2;
            c.setTransform(1, 0, 0, 1, 0, 0);
            c.clearRect(0, 0, fx.width, fx.height);
            toScreen(c);
            const { key, p } = local(t);

            // Overspray hangs in the air under the lights.
            for (const m of st.mist) {
                const k = m.life / m.max;
                const a = 0.07 * Math.sin(Math.PI * Math.min(1, k * 1.4)) * (1 - k);
                const rg = c.createRadialGradient(m.x, m.y, 0, m.x, m.y, m.r);
                rg.addColorStop(0, `rgba(${m.rgb[0] | 0},${m.rgb[1] | 0},${m.rgb[2] | 0},${a})`);
                rg.addColorStop(1, `rgba(${m.rgb[0] | 0},${m.rgb[1] | 0},${m.rgb[2] | 0},0)`);
                c.fillStyle = rg;
                c.beginPath(); c.arc(m.x, m.y, m.r, 0, Math.PI * 2); c.fill();
            }

            if (key === 'straighten') {
                // Anticipation, a fast drop, impact hold, recoil with overshoot.
                let a = 0.72, vel = 0;
                for (const at of STRIKES) {
                    const d = p - at;
                    if (d > -0.16 && d <= 0) {
                        const q = (d + 0.16) / 0.16;
                        a = q < 0.65 ? lerp(0.72, 1.0, outCubic(q / 0.65)) : lerp(1.0, 0, inCubic((q - 0.65) / 0.35));
                        vel = q < 0.65 ? 0 : 1;
                    } else if (d > 0 && d < 0.012) a = 0;
                    else if (d >= 0.012 && d < 0.14) a = lerp(0, 0.72, outBack((d - 0.012) / 0.128));
                }
                drawHammer(c, a, vel);
            }
            if (key === 'fill') {
                if (p < 0.36) {
                    const sx = DENT.x - 132 + 264 * outCubic(span(p, 0.04, 0.34));
                    c.save();
                    c.translate(sx + 8, DENT.y - 6);
                    c.rotate(0.22 + Math.sin(p * 40) * 0.02);
                    c.fillStyle = 'rgba(230,236,244,0.55)';
                    c.beginPath(); c.moveTo(-6, -92); c.lineTo(22, -92); c.lineTo(28, 90); c.lineTo(-2, 90); c.closePath(); c.fill();
                    c.fillStyle = 'rgba(205,186,170,0.95)';
                    c.fillRect(-4, -88, 6, 176);
                    c.strokeStyle = 'rgba(255,255,255,0.5)'; c.lineWidth = 1;
                    c.beginPath(); c.moveTo(20, -90); c.lineTo(26, 88); c.stroke();
                    c.restore();
                } else if (p < 0.97) drawSander(c, sander(p));
            }
            const coat = COATS[key];
            if (coat && p < SPRAY_END) {
                const g = gunPath(p / SPRAY_END, coat.passes);
                drawGun(c, g, coat.rgb(), g.dir * 0.06);
            }
            if (key === 'clear') {
                if (p < 0.45) { const g = gunPath(p / 0.45, 5); drawGun(c, g, [235, 240, 248], g.dir * 0.06); }
                else if (p < 0.97) drawBuffer(c, buffer(p), t);
            }
            if (key === 'stripe') {
                const sp = stripeProgress(p);
                if (sp > 0 && sp < 1) {
                    const pts = STRIPE_PTS[0];
                    const k = Math.min(pts.length - 1, Math.floor(pts.length * sp));
                    const prev = pts[Math.max(0, k - 3)];
                    drawBrush(c, pts[k][0], pts[k][1], pts[k][0] - prev[0], pts[k][1] - prev[1]);
                }
            }

            // Particles
            c.save();
            c.globalCompositeOperation = 'lighter';
            for (const pt of st.particles) {
                const k = pt.life / pt.max;
                if (pt.kind === 'spark') {
                    const hot = 1 - k;
                    c.strokeStyle = `rgba(255,${(170 + 80 * hot) | 0},${(60 + 120 * hot * hot) | 0},${hot})`;
                    c.lineWidth = pt.w;
                    c.beginPath(); c.moveTo(pt.x, pt.y); c.lineTo(pt.x - pt.vx * 2.4, pt.y - pt.vy * 2.4); c.stroke();
                } else if (pt.kind === 'flash') {
                    const a = Math.pow(1 - k, 2);
                    const rg = c.createRadialGradient(pt.x, pt.y, 0, pt.x, pt.y, 140);
                    rg.addColorStop(0, `rgba(255,244,220,${0.9 * a})`);
                    rg.addColorStop(0.2, `rgba(255,200,140,${0.35 * a})`);
                    rg.addColorStop(1, 'rgba(255,180,120,0)');
                    c.fillStyle = rg;
                    c.beginPath(); c.arc(pt.x, pt.y, 140, 0, Math.PI * 2); c.fill();
                } else if (pt.kind === 'drop') {
                    c.fillStyle = `rgba(${pt.rgb[0] | 0},${pt.rgb[1] | 0},${pt.rgb[2] | 0},${0.35 * (1 - k)})`;
                    c.fillRect(pt.x, pt.y, 1.6, 1.6);
                }
            }
            c.restore();
            for (const pt of st.particles) {
                if (pt.kind !== 'dust') continue;
                const k = pt.life / pt.max;
                c.fillStyle = `rgba(226,214,200,${0.45 * Math.sin(Math.PI * k)})`;
                c.beginPath(); c.arc(pt.x, pt.y, pt.r, 0, Math.PI * 2); c.fill();
            }
        }

        // ---- Render ----
        function render() {
            if (!RT) return;
            const t = st.t;
            const W = glCanvas.width, H = glCanvas.height;
            const u = look(t);
            Object.values(maps).forEach((m) => { if (m.dirty) upload(m); });
            if (stripe.dirty) upload(stripe);

            // Camera -> view transform (shared by GL and the 2D layer).
            const s = st.view.base * st.cam.z;
            const hand = st.playing ? 1 : 0;
            const tt = t / 1000;
            const sx = st.shake ? gauss() * st.shake : 0, sy = st.shake ? gauss() * st.shake : 0;
            st.view.s = s;
            st.view.ox = W / 2 - (st.cam.x + drift(tt, 1) * 3 * hand) * s + sx * st.dpr;
            st.view.oy = H / 2 - (st.cam.y + drift(tt, 5) * 2 * hand) * s + sy * st.dpr;

            // Scene
            gl.bindFramebuffer(gl.FRAMEBUFFER, RT.scene.fb);
            gl.viewport(0, 0, W, H);
            const S = P.scene;
            gl.useProgram(S.p);
            const bind = (unit, tex, loc) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, tex); gl.uniform1i(loc, unit); };
            bind(0, tankTex, S.u.uTank);
            bind(1, maps.prime.tex, S.u.uPrime);
            bind(2, maps.base.tex, S.u.uBase);
            bind(3, maps.candy.tex, S.u.uCandy);
            bind(4, maps.wet.tex, S.u.uWet);
            bind(5, stripe.tex, S.u.uStripe);
            bind(6, maps.polish.tex, S.u.uPolish);
            gl.uniform2f(S.u.uRes, W, H);
            gl.uniform3f(S.u.uView, s, st.view.ox, st.view.oy);
            gl.uniform1f(S.u.uTime, tt);
            gl.uniform3f(S.u.uDent, DENT.x, DENT.y, u.dent);
            gl.uniform4f(S.u.uImpact, ...u.impact);
            gl.uniform4f(S.u.uFiller, ...u.filler);
            gl.uniform3f(S.u.uCandyCol, ...st.candy);
            gl.uniform1f(S.u.uClear, u.clear);
            gl.uniform1f(S.u.uClearRough, u.clearRough);
            gl.uniform1f(S.u.uPeel, u.peel);
            gl.uniform1f(S.u.uEnvShift, u.envShift);
            gl.uniform1f(S.u.uRust, u.rust);
            gl.uniform3f(S.u.uBars, ...u.bars);
            gl.uniform1f(S.u.uExposure, u.exposure);
            gl.drawArrays(gl.TRIANGLES, 0, 3);

            // Bloom: bright pass at quarter res, then a separable blur, twice.
            gl.bindFramebuffer(gl.FRAMEBUFFER, RT.a.fb);
            gl.viewport(0, 0, RT.a.w, RT.a.h);
            gl.useProgram(P.bright.p);
            bind(0, RT.scene.tex, P.bright.u.uTex);
            gl.uniform2f(P.bright.u.uTexel, 1 / W, 1 / H);
            gl.drawArrays(gl.TRIANGLES, 0, 3);
            gl.useProgram(P.blur.p);
            gl.uniform2f(P.blur.u.uRes, RT.a.w, RT.a.h);
            for (let k = 0; k < 2; k++) {
                gl.bindFramebuffer(gl.FRAMEBUFFER, RT.b.fb);
                bind(0, RT.a.tex, P.blur.u.uTex);
                gl.uniform2f(P.blur.u.uDir, (1 + k) / RT.a.w, 0);
                gl.drawArrays(gl.TRIANGLES, 0, 3);
                gl.bindFramebuffer(gl.FRAMEBUFFER, RT.a.fb);
                bind(0, RT.b.tex, P.blur.u.uTex);
                gl.uniform2f(P.blur.u.uDir, 0, (1 + k) / RT.a.h);
                gl.drawArrays(gl.TRIANGLES, 0, 3);
            }

            // Composite to screen
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            gl.viewport(0, 0, W, H);
            const C = P.comp;
            gl.useProgram(C.p);
            bind(0, RT.scene.tex, C.u.uScene);
            bind(1, RT.a.tex, C.u.uBloom);
            gl.uniform2f(C.u.uRes, W, H);
            gl.uniform1f(C.u.uFloorY, FLOOR * s + st.view.oy);
            gl.uniform1f(C.u.uGap, 4 * s);
            gl.uniform1f(C.u.uTime, tt);
            const fade = Math.max(1 - clamp(t / 700), clamp((t - (TOTAL - 700)) / 700));
            gl.uniform1f(C.u.uFade, inOutSine(fade));
            gl.drawArrays(gl.TRIANGLES, 0, 3);

            drawFX(t);
            if (fade > 0) { f2.setTransform(1, 0, 0, 1, 0, 0); f2.fillStyle = `rgba(0,0,0,${inOutSine(fade)})`; f2.fillRect(0, 0, fx.width, fx.height); }

            const i = stageAt(t);
            chips[i]?.style.setProperty('--p', String(clamp((t - STARTS[i]) / STAGES[i].dur)));
            if (hudTime) {
                const sec = Math.floor(t / 1000), fr = Math.floor((t % 1000) / 1000 * 24);
                hudTime.textContent = `00:${String(sec).padStart(2, '0')}:${String(fr).padStart(2, '0')}`;
            }
        }

        function frame(now) {
            st.raf = 0;
            const dt = Math.min(50, now - (st.last || now));
            st.last = now;
            if (st.playing) {
                const t0 = st.t;
                st.t += dt;
                if (st.t >= TOTAL) { st.t = 0; st.stage = -1; advance(0, 0, dt); }
                else advance(t0, st.t, dt);
            }
            // Critically damped camera: no snaps, no wobble.
            const tg = cameraTarget(st.t);
            const w = 2.6, k = dt / 1000;
            ['x', 'y', 'z'].forEach((a) => {
                const v = 'v' + a;
                const acc = w * w * (tg[a] - st.cam[a]) - 2 * w * st.cam[v];
                st.cam[v] += acc * k;
                st.cam[a] += st.cam[v] * k;
            });
            st.shake *= Math.pow(0.00005, k);
            if (st.shake < 0.25) st.shake = 0;
            stepParticles(dt);
            // Follow the site's Finish, live.
            const target = cssPaint();
            st.candy = st.candy.map((v, n) => lerp(v, target[n], 0.08));
            render();
            if (st.visible && (st.playing || st.particles.length || st.mist.length)) st.raf = requestAnimationFrame(frame);
        }
        const kick = () => { if (!st.raf && st.visible) { st.last = 0; st.raf = requestAnimationFrame(frame); } };

        function jump(i, at = 0.001) {
            st.t = STARTS[i] + STAGES[i].dur * at;
            st.stage = i;
            settle(st.t);
            onStage(i);
            Object.assign(st.cam, cameraTarget(st.t), { vx: 0, vy: 0, vz: 0 });
            render();
        }
        function setPlaying(on) {
            st.playing = on;
            root.classList.toggle('is-paused', !on);
            playBtn?.setAttribute('aria-pressed', String(!on));
            playBtn?.setAttribute('aria-label', on ? 'Pause the film' : 'Play the film');
            kick();
        }

        playBtn?.addEventListener('click', () => setPlaying(!st.playing));
        chips.forEach((chip, i) => chip.addEventListener('click', () => { jump(i); kick(); }));
        new ResizeObserver(resize).observe(glCanvas);
        new IntersectionObserver(([e]) => { st.visible = e.isIntersecting && !document.hidden; kick(); }, { threshold: 0.12 }).observe(glCanvas);
        document.addEventListener('visibilitychange', () => { if (document.hidden) st.visible = false; kick(); });
        document.documentElement.addEventListener('paintchange', kick);

        resize();
        if (reduceMotion) { jump(IDX.reveal, 0.55); setPlaying(false); }
        else { settle(0); onStage(0); setPlaying(true); }
        root.craft = { jump, setPlaying, get t() { return st.t; } };
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
