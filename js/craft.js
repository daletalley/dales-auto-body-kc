/*
 * The Craft: one dented door, start to finish.
 *
 * A real-time render of the side of a car in the paint booth, framed between
 * the wheels. The car is procedural (signed distance fields in a WebGL
 * fragment shader), so every edge stays sharp when the camera moves in:
 * body panels with a crisp character line, door gaps, chrome handles, glass,
 * trim, tires and machined wheels, all lit by the booth's ceiling softboxes,
 * whose reflections run down the side of the car the way they do in real
 * paint photography.
 *
 * The repair is a real collision job: the dent is hammered out, sanded to
 * bare metal (the featheredge "bullseye" painters know), filled and blocked,
 * masked off with paper and tape, primed, sprayed in a color matched to the
 * car, cleared, unmasked, and the pinstripe goes back on down the whole side
 * by hand. Coats are sprayed into coverage maps the shader reads every frame;
 * fresh paint is wet and flashes off; the buffer polishes where it travels.
 * Tools, sparks, dust, spray and masking paper are drawn on a 2D layer above
 * in the same camera, with contact shadows on the panel.
 *
 * The car's color is the site's current Finish (--paint), live. The film
 * renders at 30fps and only while on screen. Reduced motion shows the
 * finished car, paused.
 */
(() => {
    'use strict';

    const VW = 1280, VH = 720, FLOOR = 690;
    const COV = 0.5;
    const STAGES = [
        { key: 'damage',     label: 'Damage',       caption: 'One door, one bad day.',                      dur: 3200 },
        { key: 'straighten', label: 'Straighten',   caption: 'Metal worked back to its true shape.',        dur: 3400 },
        { key: 'sand',       label: 'Sand',         caption: 'Feathered out to bare metal.',                dur: 3400 },
        { key: 'fill',       label: 'Fill & block', caption: 'A skim of filler, blocked flat by hand.',     dur: 3800 },
        { key: 'prime',      label: 'Mask & prime', caption: 'Masked off, primed and sealed.',              dur: 3800 },
        { key: 'color',      label: 'Color match',  caption: 'Tinted to match the car, not the chip.',      dur: 3800 },
        { key: 'clear',      label: 'Clear',        caption: 'Clear coat, then the paper comes off.',       dur: 3600 },
        { key: 'stripe',     label: 'Pinstripe',    caption: 'The line goes back on, end to end, by hand.', dur: 4200 },
        { key: 'reveal',     label: 'Showroom',     caption: 'You’d never know.',                           dur: 6200 },
    ];
    const STARTS = STAGES.reduce((a, s, i) => (a.push(i ? a[i - 1] + STAGES[i - 1].dur : 0), a), []);
    const TOTAL = STARTS[STARTS.length - 1] + STAGES[STAGES.length - 1].dur;
    const IDX = Object.fromEntries(STAGES.map((s, i) => [s.key, i]));

    const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
    const lerp = (a, b, t) => a + (b - a) * t;
    const span = (p, a, b) => clamp((p - a) / (b - a));
    const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
    const inOut = (t) => -(Math.cos(Math.PI * clamp(t)) - 1) / 2;
    const outCubic = (t) => 1 - Math.pow(1 - clamp(t), 3);
    const inCubic = (t) => Math.pow(clamp(t), 3);
    const outBack = (t) => { const c = 1.6; t = clamp(t) - 1; return 1 + (c + 1) * t * t * t + c * t * t; };
    function gauss() {
        let u = 0, v = 0;
        while (!u) u = Math.random();
        while (!v) v = Math.random();
        return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    }
    const drift = (t, s) => Math.sin(t * 0.31 + s) * 0.6 + Math.sin(t * 0.83 + s * 2.1) * 0.3 + Math.sin(t * 1.9 + s * 3.7) * 0.1;

    // The car's geometry (scene px, y down). The shader mirrors these.
    const beltY = (x) => 304 - 0.012 * (x - 640);
    const charY = (x) => 376 - 0.018 * (x - 640);
    const DOOR = { x0: 332, x1: 638, y1: 548 };
    const DENT = { x: 470, y: 438 };
    const STRIPE_OFF = [16, 22];

    function cssPaint() {
        const v = getComputedStyle(document.documentElement).getPropertyValue('--paint').trim();
        const m = v.match(/^#([0-9a-f]{6})$/i);
        if (!m) return [0.78, 0.06, 0.18];
        const n = parseInt(m[1], 16);
        return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
    }

    // Spray passes over a box, with soft wrist arcs at the turnarounds.
    function gunPath(p, box, passes) {
        const q = clamp(p) * passes;
        const pass = Math.min(passes - 1, Math.floor(q));
        const f = q - pass;
        const dir = pass % 2 ? -1 : 1;
        const x0 = box.x0 - 70, x1 = box.x1 + 70;
        const k = inOut(f);
        const x = dir > 0 ? lerp(x0, x1, k) : lerp(x1, x0, k);
        const yA = box.y0 + (pass / Math.max(1, passes - 1)) * (box.y1 - box.y0);
        const yB = box.y0 + (Math.min(pass + 1, passes - 1) / Math.max(1, passes - 1)) * (box.y1 - box.y0);
        const y = lerp(yA, yB, sstep(0.86, 1, f)) - Math.sin(f * Math.PI) * 5;
        return { x, y, dir, on: x > box.x0 - 30 && x < box.x1 + 30 };
    }

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
        uniform sampler2D uSand, uFiller, uPrime, uBase, uWet, uPolish, uStripe;
        uniform vec3 uDent;
        uniform vec4 uImpact;
        uniform vec3 uCarCol;
        uniform float uScratch, uClearDoor, uClearRough, uPeel, uEnvShift, uExposure;
        uniform vec3 uBars;
        const vec2 SCENE = vec2(1280., 720.);
        const float FLOOR = 690.;
        const vec2 WF = vec2(150., 572.);
        const vec2 WR = vec2(1140., 572.);

        float beltY(float x) { return 304.0 - 0.012 * (x - 640.0); }
        float charY(float x) { return 376.0 - 0.018 * (x - 640.0); }
        float roofY(float x) { float t = (x - 690.0) / 430.0; return 166.0 + t * t * 74.0; }

        // The booth as seen in a reflection direction R (y down).
        vec3 env(vec3 R, float rough) {
            float w = 0.012 + rough * 0.55;
            float peak = 1.0 / (1.0 + rough * 16.0);
            float up = -R.y;
            vec3 c = vec3(0.016, 0.015, 0.018) + vec3(0.05, 0.048, 0.052) * smoothstep(-0.25, 0.7, up);
            for (int i = 0; i < 3; i++) {
                float fi = float(i);
                float cx = -0.52 + fi * 0.52 + uEnvShift;
                float k = i == 0 ? uBars.x : (i == 1 ? uBars.y : uBars.z);
                float bx = smoothstep(cx - 0.17 - w, cx - 0.17 + w, R.x) * (1.0 - smoothstep(cx + 0.17 - w, cx + 0.17 + w, R.x));
                float by = smoothstep(0.42 - w, 0.42 + w, up) * (1.0 - smoothstep(0.80 - w, 0.80 + w, up));
                c += vec3(1.0, 0.975, 0.93) * 7.0 * peak * bx * by * k * (0.88 + 0.12 * sin((R.x - cx) * 60.0));
            }
            float sx = R.x + uEnvShift * 0.35;
            c += vec3(0.82, 0.88, 1.0) * 3.0 * peak * smoothstep(0.80 - w, 0.80 + w, sx) * (1.0 - smoothstep(0.92 - w, 0.92 + w, sx)) * smoothstep(-0.5, 0.25, up);
            c += vec3(1.0, 0.88, 0.76) * 1.2 * peak * smoothstep(-0.95 - w, -0.95 + w, R.x) * (1.0 - smoothstep(-0.87 - w, -0.87 + w, R.x)) * smoothstep(-0.3, 0.4, up);
            // A long low strip light gives the lower body its line.
            c += vec3(0.9, 0.92, 1.0) * 1.6 * peak * (1.0 - smoothstep(0.0, 0.06 + w, abs(up + 0.28))) * smoothstep(0.9, 0.3, abs(R.x));
            c = mix(c, vec3(0.008), smoothstep(-0.05, -0.45, up) * 0.75);
            return c;
        }
        vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }

        vec3 shade(vec3 N, vec3 alb, float metal, float rough, float clear, float clearRough, float lit) {
            vec3 R = vec3(2.0 * N.z * N.x, 2.0 * N.z * N.y, 2.0 * N.z * N.z - 1.0);
            float NdV = max(N.z, 0.0);
            vec3 F0 = mix(vec3(0.04), alb, metal);
            vec3 F = F0 + (1.0 - F0) * pow(1.0 - NdV, 5.0);
            float key = clamp(-N.y * 0.7 + N.z * 0.5, 0.0, 1.0);
            vec3 c = alb * (1.0 - metal) * (0.03 + 0.55 * key * lit) + env(R, rough) * F;
            c += alb * metal * rough * (0.1 + 0.3 * key) * lit;
            float Fc = 0.04 + 0.96 * pow(1.0 - NdV, 5.0);
            return c * (1.0 - Fc * clear) + env(R, clearRough) * Fc * clear;
        }

        vec3 booth(vec2 p, float lit) {
            vec3 c;
            if (p.y < FLOOR) {
                c = mix(vec3(0.032, 0.03, 0.036), vec3(0.011, 0.010, 0.013), smoothstep(30.0, FLOOR, p.y)) * (0.35 + 0.65 * lit);
                float seam = smoothstep(1.4, 0.0, abs(mod(p.x + 80.0, 160.0) - 80.0) - 78.6);
                c += vec3(0.012) * seam * lit;
                for (int i = 0; i < 3; i++) {
                    float fi = float(i);
                    float k = i == 0 ? uBars.x : (i == 1 ? uBars.y : uBars.z);
                    vec2 q = (p - vec2(300.0 + fi * 340.0, 40.0)) / vec2(280.0, 260.0);
                    c += vec3(0.055, 0.053, 0.05) * k * exp(-dot(q, q) * 1.6);
                }
            } else {
                float z = (p.y - FLOOR) / 120.0;
                c = vec3(0.016, 0.015, 0.018) * (1.0 - z * 0.4) * (0.4 + 0.6 * lit);
                float gx = abs(fract((p.x - 640.0) / (60.0 + z * 160.0)) - 0.5);
                float gy = abs(fract(pow(max(z, 0.0), 0.62) * 9.0) - 0.5);
                c += vec3(0.010) * (smoothstep(0.47, 0.5, gx) + smoothstep(0.45, 0.5, gy)) * lit;
                vec2 sh = (p - vec2(645.0, FLOOR + 4.0)) / vec2(620.0, 22.0);
                c *= 1.0 - 0.75 * exp(-dot(sh, sh) * 1.4);
            }
            return c;
        }

        void main() {
            vec2 dev = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
            vec2 p = (dev - uView.yz) / uView.x;
            float aa = 1.2 / uView.x;
            float lit = (uBars.x + uBars.y + uBars.z) / 3.0;
            vec3 col = booth(p, lit);
            vec2 uv = p / SCENE;
            vec3 carCol = uCarCol;

            float belt = beltY(p.x);
            float crease = charY(p.x);
            float roof = roofY(p.x);

            // Wheels and arches
            vec2 wc = p.x < 645.0 ? WF : WR;
            vec2 wq = p - wc;
            float wr = length(wq);
            float tireM = 1.0 - smoothstep(116.0 - aa, 116.0 + aa, wr);
            vec2 ac = vec2(wc.x, wc.y - 6.0);
            float archR = length(p - ac);
            float inArch = (1.0 - smoothstep(138.0 - aa, 138.0 + aa, archR)) * step(p.y, 566.0 + 140.0);

            // Greenhouse: glass, pillars, frames
            float aBase = 252.0, aTopX = 430.0, cBase = 1092.0, cTopX = 930.0;
            float yA0 = beltY(aBase), yA1 = roofY(aTopX), yC0 = beltY(cBase), yC1 = roofY(cTopX);
            float xA = mix(aBase, aTopX, clamp((yA0 - p.y) / (yA0 - yA1), 0.0, 1.0));
            float xC = mix(cBase, cTopX, clamp((yC0 - p.y) / (yC0 - yC1), 0.0, 1.0));
            float gd = min(min(p.y - roof, belt - p.y), min((p.x - xA) * 0.72, (xC - p.x) * 0.76));
            float green = smoothstep(-aa, aa, gd);

            // Body side
            float body = smoothstep(belt - aa, belt + aa, p.y) * (1.0 - smoothstep(566.0 - aa, 566.0 + aa, p.y)) * (1.0 - inArch);
            float car = max(body, green);

            if (car > 0.002 || tireM > 0.002 || inArch > 0.002) {
                vec3 c = vec3(0.006) * (1.0 - smoothstep(60.0, 138.0, archR) * 0.5);   // wheel well
                if (tireM > 0.0) {
                    float a = atan(wq.y, wq.x);
                    vec3 Nt = normalize(vec3(wq / 116.0 * 0.55, 1.0));
                    vec3 tire = shade(Nt, vec3(0.025), 0.0, 0.62, 0.0, 0.1, lit) * (0.6 + 0.4 * smoothstep(116.0, 92.0, wr));
                    // Sidewall lettering ring, just a hint
                    tire += vec3(0.02) * smoothstep(1.2, 0.0, abs(wr - 100.0)) * step(0.3, fract(a * 6.0));
                    float rimM = 1.0 - smoothstep(78.0 - aa, 78.0 + aa, wr);
                    float spoke = smoothstep(0.55, 0.62, cos(5.0 * (a + 0.3)) * 0.5 + 0.5 + (1.0 - wr / 78.0) * 0.4);
                    float lip = smoothstep(70.0, 72.0, wr) * rimM;
                    float face = max(spoke * smoothstep(74.0, 70.0, wr) * smoothstep(20.0, 26.0, wr), max(lip, 1.0 - smoothstep(24.0, 26.0, wr)));
                    vec3 Nr = normalize(vec3(wq / 78.0 * 0.9 * (lip + 0.25), 1.0));
                    vec3 rim = shade(Nr, vec3(0.80, 0.81, 0.83), 1.0, mix(0.22, 0.12, lip), 0.6, 0.03, lit);
                    vec3 wheel = mix(tire, mix(vec3(0.012), rim, face), rimM);
                    c = mix(c, wheel, tireM);
                }

                if (car > 0.0) {
                    vec3 bc;
                    if (green > 0.5) {
                        float bp = 1.0 - smoothstep(9.0, 11.0, abs(p.x - 648.0));
                        float trim = max(1.0 - smoothstep(11.0, 13.0, gd), bp);
                        vec3 Ng = normalize(vec3(0.03 + (p.x - 640.0) / 4000.0, -0.17 - 0.12 * smoothstep(80.0, 0.0, gd), 1.0));
                        vec3 glass = shade(Ng, vec3(0.012, 0.014, 0.016), 0.0, 0.03, 1.0, 0.02, lit);
                        glass += vec3(0.01, 0.011, 0.012) * smoothstep(0.0, 120.0, gd);
                        vec3 black = shade(normalize(vec3(0.0, -0.25, 1.0)), vec3(0.01), 0.0, 0.08, 1.0, 0.03, lit);
                        bc = mix(glass, black, trim);
                    } else {
                        // Tumblehome above the character line, tuck-under below it.
                        float above = smoothstep(crease + 1.6, crease - 1.6, p.y);
                        float tUp = clamp((crease - p.y) / max(crease - belt, 1.0), 0.0, 1.0);
                        float tDn = clamp((p.y - crease) / (566.0 - crease), 0.0, 1.0);
                        float ny = mix(0.04 + 0.62 * tDn * tDn - 0.08 * exp(-tDn * 18.0), -0.10 - 0.16 * tUp * tUp, above);
                        float nx = (p.x - 640.0) / 2600.0;
                        ny -= 0.6 * smoothstep(belt + 7.0, belt, p.y);
                        ny += 0.55 * smoothstep(552.0, 566.0, p.y);
                        vec3 N = vec3(nx, ny, 1.0);
                        // Arch lips flare out
                        N.xy += normalize(p - ac) * 0.55 * smoothstep(26.0, 0.0, archR - 138.0);
                        // Panel edges roll into the shut lines
                        float g1 = p.x - 332.0, g2 = p.x - 638.0, g3 = p.x - 932.0;
                        float gn = abs(g1) < abs(g2) ? (abs(g1) < abs(g3) ? g1 : g3) : (abs(g2) < abs(g3) ? g2 : g3);
                        float gap = abs(gn);
                        N.x += 0.7 * smoothstep(5.0, 0.6, gap) * sign(gn);

                        // Dent, creases, and the ripple from each hammer blow
                        vec2 dd = (p - uDent.xy) / vec2(46.0, 34.0);
                        float g = exp(-dot(dd, dd));
                        N.xy += uDent.z * (2.0 * dd / vec2(46.0, 34.0) * g * 13.0 + vec2(fbm(p * 0.12) - 0.5, 0.5 - fbm(p * 0.12 + 3.0)) * g * 0.8);
                        if (uImpact.z >= 0.0 && uImpact.z < 1.4) {
                            vec2 rp = p - uImpact.xy;
                            float r = length(rp);
                            float fr = uImpact.z * 360.0;
                            float wv = sin((r - fr) * 0.17) * exp(-uImpact.z * 3.4) * exp(-abs(r - fr) * 0.02);
                            N.xy += rp / (r + 1.0) * wv * 0.3 * uImpact.w;
                        }

                        float sand = texture2D(uSand, uv).a;
                        float fil = texture2D(uFiller, uv).a;
                        float pr = texture2D(uPrime, uv).a;
                        float bs = texture2D(uBase, uv).a;
                        float wet = texture2D(uWet, uv).a;
                        float pol = texture2D(uPolish, uv).a;
                        float onDoor = step(332.0, p.x) * step(p.x, 638.0);

                        N.xy += (vec2(noise(p * 0.8), noise(p * 0.8 + 7.3)) - 0.5) * uPeel * bs * onDoor * (1.0 - pol);
                        float swirl = sin(length(p - uDent.xy) * 1.7 + noise(p * 0.3) * 6.0) * 0.5 + 0.5;
                        float bare = smoothstep(0.6, 0.78, sand);
                        N.xy += vec2(swirl - 0.5) * 0.08 * bare * (1.0 - max(fil, max(pr, bs)));
                        N = normalize(N);

                        // Original paint, with the old pinstripe
                        vec3 alb = pow(carCol, vec3(1.35));
                        float metal = 0.3, rough = 0.3, clear = 1.0;
                        float s1 = 1.0 - smoothstep(0.9 - aa, 0.9 + aa, abs(p.y - (crease + 16.0)));
                        float s2 = 1.0 - smoothstep(0.55 - aa, 0.55 + aa, abs(p.y - (crease + 22.0)));
                        float oldStripe = max(s1, s2) * smoothstep(1.0, 4.0, gap);
                        alb = mix(alb, vec3(0.86, 0.66, 0.30), oldStripe); metal = mix(metal, 0.6, oldStripe);

                        // Scrapes: paint gouged through to primer
                        vec2 sq = p - uDent.xy;
                        float scr = smoothstep(0.82, 0.95, noise(vec2(sq.x * 0.02 + sq.y * 0.12, sq.y * 0.9 - sq.x * 0.08)));
                        scr *= smoothstep(120.0, 30.0, length(sq * vec2(0.7, 1.4))) * uScratch;
                        alb = mix(alb, vec3(0.62, 0.62, 0.6), scr); rough = mix(rough, 0.7, scr); clear *= 1.0 - scr;

                        // Featheredge: scuffed paint, then old primer, then bare steel
                        float scuff = smoothstep(0.06, 0.24, sand);
                        float ring = smoothstep(0.34, 0.5, sand);
                        rough = mix(rough, 0.62, scuff); clear *= 1.0 - scuff;
                        alb = mix(alb, vec3(0.56, 0.56, 0.55), ring * 0.85); metal = mix(metal, 0.0, ring);
                        alb = mix(alb, vec3(0.60, 0.62, 0.65) * (0.85 + 0.25 * swirl), bare); metal = mix(metal, 1.0, bare); rough = mix(rough, 0.42, bare);

                        alb = mix(alb, vec3(0.80, 0.72, 0.62) * (0.94 + 0.1 * noise(p * 0.9)), fil);
                        metal = mix(metal, 0.0, fil); rough = mix(rough, 0.8, fil);

                        alb = mix(alb, vec3(0.30, 0.31, 0.33), pr); metal = mix(metal, 0.0, pr); rough = mix(rough, mix(0.72, 0.18, wet), pr);
                        alb = mix(alb, pow(carCol, vec3(1.35)), bs); metal = mix(metal, 0.3, bs); rough = mix(rough, mix(0.38, 0.16, wet), bs);
                        float newClear = uClearDoor * bs * onDoor;
                        clear = max(clear * (1.0 - max(pr, bs) * onDoor), newClear);
                        float cr = mix(0.02, mix(uClearRough, 0.016, pol), newClear);

                        vec4 sp = texture2D(uStripe, uv);
                        alb = mix(alb, sp.rgb, sp.a); metal = mix(metal, 0.6, sp.a);

                        bc = shade(N, alb, metal, rough, clear, cr, lit);

                        // Metallic flake in the paint
                        vec2 fc = floor(p / 0.8);
                        float h1 = hash(fc), h2 = hash(fc + 3.1), h3 = hash(fc + 9.7);
                        vec3 fN = normalize(N + vec3(h1 - 0.5, h2 - 0.5, 0.0) * 1.2);
                        vec3 fR = vec3(2.0 * fN.z * fN.x, 2.0 * fN.z * fN.y, 2.0 * fN.z * fN.z - 1.0);
                        float paintK = clamp((1.0 - ring) * (1.0 - fil) * (1.0 - pr) + bs, 0.0, 1.0);
                        bc += env(fR, 0.04) * 0.012 * step(0.72, h3) * paintK * (carCol * 1.2 + 0.2);

                        // Chrome handles in their recesses
                        for (int k = 0; k < 2; k++) {
                            vec2 hc = k == 0 ? vec2(560.0, 344.0) : vec2(866.0, 340.0);
                            vec2 hq = abs(p - hc) - vec2(34.0, 5.0);
                            float hd = length(max(hq, 0.0)) + min(max(hq.x, hq.y), 0.0) - 4.0;
                            vec2 rq = abs(p - hc - vec2(0.0, 3.0)) - vec2(30.0, 7.0);
                            float rd = length(max(rq, 0.0)) + min(max(rq.x, rq.y), 0.0) - 5.0;
                            bc *= 1.0 - 0.55 * (1.0 - smoothstep(-2.0, 2.0, rd));
                            float hm = 1.0 - smoothstep(-aa, aa, hd);
                            vec3 Nh = normalize(vec3(0.0, clamp((p.y - hc.y) / 8.0, -1.0, 1.0) * 0.9, 1.0));
                            bc = mix(bc, shade(Nh, vec3(0.9), 1.0, 0.05, 0.0, 0.02, lit), hm);
                        }
                        bc *= 0.15 + 0.85 * smoothstep(0.4, 1.4, gap);
                        float seal = smoothstep(belt + 5.0 + aa, belt + 5.0 - aa, p.y);
                        bc = mix(bc, shade(normalize(vec3(0.0, -0.5, 1.0)), vec3(0.01), 0.0, 0.2, 0.6, 0.05, lit), seal);
                        float rocker = smoothstep(548.0 - aa, 548.0 + aa, p.y);
                        bc = mix(bc, shade(normalize(vec3(0.0, 0.25 + 0.8 * smoothstep(548.0, 566.0, p.y), 1.0)), vec3(0.02), 0.0, 0.5, 0.0, 0.1, lit), rocker);
                        bc *= mix(0.55, 1.0, smoothstep(0.0, 40.0, archR - 138.0));
                    }
                    c = mix(c, bc, car);
                }
                col = mix(col, c, clamp(max(car, max(tireM, inArch)), 0.0, 1.0));
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
            gl_FragColor = vec4(c * smoothstep(0.66, 1.0, l), 1.0);
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
        uniform sampler2D uScene, uBloom; uniform vec2 uRes; uniform float uFloorY, uTime, uFade;
        void main() {
            vec2 uv = gl_FragCoord.xy / uRes;
            float devY = uRes.y - gl_FragCoord.y;
            vec2 cd = uv - 0.5;
            float ca = 0.0016 * dot(cd, cd) * 4.0;
            vec3 c = vec3(texture2D(uScene, uv - cd * ca).r, texture2D(uScene, uv).g, texture2D(uScene, uv + cd * ca).b);
            if (devY > uFloorY) {
                float dy = devY - uFloorY;
                vec2 ruv = vec2(uv.x, 1.0 - (uFloorY - dy) / uRes.y);
                vec3 r = texture2D(uScene, ruv).rgb * 0.55 + texture2D(uBloom, ruv).rgb * 0.8;
                c += r * 0.24 * exp(-dy / (uRes.y * 0.08));
            }
            c += texture2D(uBloom, uv).rgb * 0.8;
            c *= mix(0.52, 1.0, smoothstep(0.95, 0.3, length(cd * vec2(1.0, 1.2))));
            c += (hash(gl_FragCoord.xy + fract(uTime * 7.31)) - 0.5) * 0.028;
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

        const gl = glCanvas.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'high-performance' });
        if (!gl) { root.classList.add('no-gl'); return; }

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
                scene: program(SCENE_FRAG, ['uRes', 'uView', 'uTime', 'uSand', 'uFiller', 'uPrime', 'uBase', 'uWet', 'uPolish', 'uStripe', 'uDent', 'uImpact', 'uCarCol', 'uScratch', 'uClearDoor', 'uClearRough', 'uPeel', 'uEnvShift', 'uExposure', 'uBars']),
                bright: program(BRIGHT_FRAG, ['uTex', 'uTexel']),
                blur: program(BLUR_FRAG, ['uTex', 'uDir', 'uRes']),
                comp: program(COMPOSITE_FRAG, ['uScene', 'uBloom', 'uRes', 'uFloorY', 'uTime', 'uFade']),
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

        const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
        const maps = {};
        ['sand', 'filler', 'prime', 'base', 'wet', 'polish'].forEach((k) => {
            const c = mk(VW * COV, VH * COV);
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

        // Masking paper texture, made once.
        const paper = (() => {
            const c = mk(256, 256);
            const g = c.getContext('2d');
            g.fillStyle = '#e8e1d2';
            g.fillRect(0, 0, 256, 256);
            for (let i = 0; i < 2200; i++) {
                g.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '120,105,80'},${Math.random() * 0.05})`;
                g.fillRect(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 2, 1 + Math.random() * 2);
            }
            return f2.createPattern(c, 'repeat');
        })();

        let RT = null;
        const st = {
            t: 0, last: 0, playing: !reduceMotion, visible: false, raf: 0, stage: -1,
            cam: { x: 640, y: 432, z: 1, vx: 0, vy: 0, vz: 0 }, shake: 0,
            view: { base: 1, s: 1, ox: 0, oy: 0 }, dpr: 1,
            particles: [], mist: [], strikes: 0, impact: { x: 0, y: 0, t: -1e9, k: 0 },
            car: cssPaint(),
        };

        function resize() {
            const r = glCanvas.getBoundingClientRect();
            if (!r.width) return;
            const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
            let W = Math.round(r.width * dpr), H = Math.round(r.height * dpr);
            const cap = 1.5e6;
            if (W * H > cap) { const k = Math.sqrt(cap / (W * H)); W = Math.round(W * k); H = Math.round(H * k); }
            glCanvas.width = W; glCanvas.height = H;
            fx.width = W; fx.height = H;
            st.dpr = W / r.width;
            const narrow = W / H < 1.5;
            st.view.base = narrow ? Math.min(W / (VW * 0.8), H / (VH * 0.62)) : Math.min(W / (VW * 0.98), H / (VH * 0.66));
            RT = { scene: target(W, H), a: target(Math.ceil(W / 4), Math.ceil(H / 4)), b: target(Math.ceil(W / 4), Math.ceil(H / 4)) };
            render();
        }

        // ---- Painting into the maps ----
        const doorClip = (g) => { g.beginPath(); g.rect(DOOR.x0 + 1, beltY(DOOR.x1) + 4, DOOR.x1 - DOOR.x0 - 2, DOOR.y1 - beltY(DOOR.x1) - 4); g.clip(); };
        function droplets(m, x, y, radius, n, alpha, clip) {
            const g = m.g;
            g.save();
            if (clip) clip(g);
            for (let i = 0; i < n; i++) {
                g.fillStyle = `rgba(255,255,255,${alpha[0] + Math.random() * (alpha[1] - alpha[0])})`;
                g.beginPath();
                g.arc(x + gauss() * radius * 0.42, y + gauss() * radius * 0.42, 1.6 + Math.random() * 3.4, 0, Math.PI * 2);
                g.fill();
            }
            g.restore();
            m.dirty = true;
        }
        function blob(m, x, y, r, a, op = 'source-over') {
            const g = m.g;
            g.save();
            g.globalCompositeOperation = op;
            const rg = g.createRadialGradient(x, y, 0, x, y, r);
            rg.addColorStop(0, `rgba(255,255,255,${a})`);
            rg.addColorStop(1, 'rgba(255,255,255,0)');
            g.fillStyle = rg;
            g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
            g.restore();
            m.dirty = true;
        }
        const clearMap = (m) => { m.g.save(); m.g.setTransform(1, 0, 0, 1, 0, 0); m.g.clearRect(0, 0, m.c.width, m.c.height); m.g.restore(); m.dirty = true; };

        const REPAIR = { x0: DENT.x - 110, x1: DENT.x + 110, y0: DENT.y - 80, y1: DENT.y + 80 };
        const DOORBOX = { x0: DOOR.x0 + 10, x1: DOOR.x1 - 10, y0: beltY(DOOR.x1) + 22, y1: DOOR.y1 - 14 };
        const COATS = {
            prime: { map: 'prime', box: REPAIR, passes: 5, alpha: [0.3, 0.55], n: 22000, rgb: () => [150, 152, 158], clip: (g) => { g.beginPath(); g.ellipse(DENT.x, DENT.y, 140, 104, 0, 0, Math.PI * 2); g.clip(); } },
            color: { map: 'base', box: DOORBOX, passes: 7, alpha: [0.3, 0.55], n: 52000, rgb: () => st.car.map((v) => v * 255), clip: doorClip },
        };
        const SPRAY_END = 0.86;
        const PRIME_START = 0.28;   // masking goes up first

        // A finished coat is a full, even film (inside its masking).
        function solidCoat(key) {
            const coat = COATS[key];
            const g = maps[coat.map].g;
            g.save();
            coat.clip(g);
            g.fillStyle = '#fff';
            g.fillRect(0, 0, VW, VH);
            g.restore();
            maps[coat.map].dirty = true;
        }

        function coatP(key, p) { return key === 'prime' ? span(p, PRIME_START, 1) : p; }
        function sprayInterval(key, p0, p1, live) {
            const coat = COATS[key];
            p0 = coatP(key, p0); p1 = coatP(key, p1);
            const steps = Math.max(1, Math.ceil((p1 - p0) * 500));
            for (let i = 1; i <= steps; i++) {
                const p = lerp(p0, p1, i / steps);
                if (p > SPRAY_END || p <= 0) continue;
                const g = gunPath(p / SPRAY_END, coat.box, coat.passes);
                if (!g.on) continue;
                const n = Math.max(1, Math.round(coat.n * (p1 - p0) / steps));
                droplets(maps[coat.map], g.x, g.y, 60, n, coat.alpha, coat.clip);
                droplets(maps.wet, g.x, g.y, 60, Math.ceil(n / 3), [0.3, 0.6], coat.clip);
                if (live && i === steps) emitSpray(g, coat.rgb());
            }
        }

        const sanderAt = (q, wide) => {
            const a = q * Math.PI * 2 * (wide ? 5 : 7);
            const rx = wide ? 70 : 42, ry = wide ? 44 : 28;
            return { x: DENT.x + Math.cos(a) * rx + Math.sin(q * 9) * 14, y: DENT.y + Math.sin(a) * ry + Math.cos(q * 7) * 8 };
        };
        function sandTo(p0, p1) {
            const steps = Math.max(1, Math.ceil((p1 - p0) * 300));
            for (let k = 1; k <= steps; k++) {
                const q = span(lerp(p0, p1, k / steps), 0.06, 0.92);
                if (q <= 0 || q >= 1) continue;
                const s = sanderAt(q, false);
                blob(maps.sand, s.x, s.y, 74, 0.05);
            }
        }
        function fillTo(p0, p1) {
            const steps = Math.max(1, Math.ceil((p1 - p0) * 200));
            for (let k = 1; k <= steps; k++) {
                const p = lerp(p0, p1, k / steps);
                if (p < 0.36) {
                    if (p < 0.04) continue;
                    const x = DENT.x - 80 + 160 * outCubic(span(p, 0.04, 0.34));
                    for (let j = -3; j <= 3; j++) blob(maps.filler, x, DENT.y + j * 12, 46, 0.22);
                } else if (p < 0.94) {
                    const s = sanderAt(span(p, 0.36, 0.94), true);
                    const g = maps.filler.g;
                    g.save();
                    g.globalCompositeOperation = 'destination-out';
                    const rg = g.createRadialGradient(s.x, s.y, 10, s.x, s.y, 60);
                    rg.addColorStop(0, 'rgba(0,0,0,0)');
                    rg.addColorStop(1, 'rgba(0,0,0,0.05)');
                    g.fillStyle = rg;
                    g.beginPath(); g.arc(s.x, s.y, 60, 0, Math.PI * 2); g.fill();
                    g.restore();
                    maps.filler.dirty = true;
                }
            }
        }
        const buffer = (p) => {
            const q = span(p, 0.0, 0.3);
            return { q, x: lerp(DOOR.x0 + 50, DOOR.x1 - 50, inOut(q)), y: 420 + Math.sin(q * Math.PI * 4) * 60 };
        };
        function polishTo(p0, p1) {
            const steps = Math.max(1, Math.ceil((p1 - p0) * 200));
            for (let k = 1; k <= steps; k++) {
                const b = buffer(lerp(p0, p1, k / steps));
                if (b.q <= 0 || b.q >= 1) continue;
                blob(maps.polish, b.x, b.y, 90, 0.18);
            }
        }

        const stripeProgress = (p) => inOut(span(p, 0.05, 0.9));
        const STRIPE_X0 = -60, STRIPE_X1 = 1340;
        function drawStripe(p) {
            const g = stripe.g;
            g.clearRect(0, 0, VW, VH);
            if (p > 0) {
                const xEnd = lerp(STRIPE_X0, STRIPE_X1, p);
                const line = (off, w) => {
                    g.strokeStyle = 'rgb(220,170,78)'; g.lineWidth = w; g.lineCap = 'round';
                    g.beginPath();
                    for (let x = STRIPE_X0; x <= xEnd; x += 6) {
                        const y = charY(x) + off;
                        x === STRIPE_X0 ? g.moveTo(x, y) : g.lineTo(x, y);
                    }
                    g.stroke();
                };
                line(STRIPE_OFF[0], 2.0);
                line(STRIPE_OFF[1], 1.2);
            }
            stripe.dirty = true;
            stripe.p = p;
        }

        // ---- Particles ----
        function sparks(x, y, k) {
            for (let i = 0; i < 60 * k; i++) {
                const a = -Math.PI / 2 + gauss() * 1.1, v = 3 + Math.random() * 10;
                st.particles.push({ kind: 'spark', x, y, vx: Math.cos(a) * v + 1.2, vy: Math.sin(a) * v, life: 0, max: 280 + Math.random() * 560, w: 0.7 + Math.random() * 1.2 });
            }
            st.particles.push({ kind: 'flash', x, y, life: 0, max: 130 });
            st.shake = 8 * k;
        }
        function dust(x, y, n, spread = 40) {
            for (let i = 0; i < n; i++) {
                const a = Math.random() * Math.PI * 2, v = 0.4 + Math.random() * 1.6;
                st.particles.push({ kind: 'dust', x: x + Math.cos(a) * spread * 0.6, y: y + Math.sin(a) * spread * 0.4, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.6 - 0.1, life: 0, max: 1000 + Math.random() * 1400, r: 0.7 + Math.random() * 1.8 });
            }
        }
        function emitSpray(g, rgb) {
            const nx = g.x + 74, ny = g.y - 128;
            for (let i = 0; i < 16; i++) {
                const tx = g.x + gauss() * 20, ty = g.y + gauss() * 12;
                const T = 110 + Math.random() * 80;
                st.particles.push({ kind: 'drop', x: nx + gauss() * 2, y: ny + gauss() * 2, vx: (tx - nx) / (T / 16.7), vy: (ty - ny) / (T / 16.7), life: 0, max: T, rgb });
            }
            if (Math.random() < 0.6) st.mist.push({ x: g.x + gauss() * 30, y: g.y + gauss() * 20, vx: gauss() * 0.25 - g.dir * 0.2, vy: -0.2 - Math.random() * 0.3, r: 30 + Math.random() * 46, life: 0, max: 2000 + Math.random() * 1600, rgb });
        }
        function stepParticles(dt) {
            const k = dt / 16.7;
            st.particles = st.particles.filter((p) => {
                p.life += dt;
                if (p.kind === 'spark') {
                    p.vy += 0.38 * k; p.vx *= Math.pow(0.99, k);
                    p.x += p.vx * k; p.y += p.vy * k;
                    if (p.y > FLOOR) { p.y = FLOOR; p.vy *= -0.3; p.vx *= 0.7; }
                } else if (p.kind !== 'flash') {
                    p.x += p.vx * k; p.y += p.vy * k;
                    if (p.kind === 'dust') { p.vx *= 0.985; p.vy = p.vy * 0.985 + 0.01; }
                }
                return p.life < p.max;
            });
            st.mist = st.mist.filter((m) => { m.life += dt; m.x += m.vx * k; m.y += m.vy * k; m.r += 0.12 * k; return m.life < m.max; });
            if (st.mist.length > 70) st.mist.splice(0, st.mist.length - 70);
            if (st.particles.length > 1000) st.particles.splice(0, st.particles.length - 1000);
        }

        // ---- Timeline ----
        const stageAt = (t) => { let i = 0; while (i < STAGES.length - 1 && t >= STARTS[i + 1]) i++; return i; };
        const local = (t) => { const i = stageAt(t); return { i, key: STAGES[i].key, p: clamp((t - STARTS[i]) / STAGES[i].dur) }; };
        const STRIKES = [0.24, 0.52, 0.78];

        function settle(t) {
            Object.values(maps).forEach(clearMap);
            st.particles.length = 0;
            st.mist.length = 0;
            const { i, p } = local(t);
            if (i >= IDX.sand) sandTo(0, i > IDX.sand ? 1 : p);
            if (i >= IDX.fill) fillTo(0, i > IDX.fill ? 1 : p);
            ['prime', 'color'].forEach((key) => {
                if (i > IDX[key]) solidCoat(key);
                else if (i === IDX[key]) sprayInterval(key, 0, p, false);
            });
            if (i > IDX.color) clearMap(maps.wet);
            if (i === IDX.reveal) polishTo(0, p);
            drawStripe(i > IDX.stripe ? 1 : i === IDX.stripe ? stripeProgress(p) : 0);
            st.strikes = i > IDX.straighten ? 3 : i === IDX.straighten ? STRIKES.filter((s) => p > s).length : 0;
        }

        function advance(t0, t1, dt) {
            const { i, key, p } = local(t1);
            const p0 = clamp((t0 - STARTS[i]) / STAGES[i].dur);
            if (i !== st.stage) {
                if (st.stage === -1 || i < st.stage || i === 0) settle(t1);
                else ['prime', 'color'].forEach((k) => { if (IDX[k] === st.stage) solidCoat(k); });
                st.stage = i;
                onStage(i);
            }
            if (key === 'straighten') {
                STRIKES.forEach((at, n) => {
                    if (p0 < at && p >= at) {
                        const k = n === 2 ? 0.7 : 1;
                        st.strikes = n + 1;
                        st.impact = { x: DENT.x, y: DENT.y, t: t1, k };
                        sparks(DENT.x - 4, DENT.y + 4, k);
                    }
                });
            }
            if (key === 'sand') {
                sandTo(p0, p);
                const q = span(p, 0.06, 0.92);
                if (q > 0 && q < 1) { const s = sanderAt(q, false); dust(s.x, s.y, 3, 70); }
            }
            if (key === 'fill') {
                fillTo(p0, p);
                if (p > 0.36 && p < 0.94) { const s = sanderAt(span(p, 0.36, 0.94), true); dust(s.x, s.y, 2, 60); }
            }
            if (COATS[key]) sprayInterval(key, p0, p, true);
            if (key === 'clear' && p < 0.62) {
                const g = gunPath(p / 0.62, DOORBOX, 6);
                if (g.on) { droplets(maps.wet, g.x, g.y, 60, 40, [0.3, 0.6], doorClip); emitSpray(g, [235, 240, 248]); }
            }
            if (key === 'stripe') {
                const sp = stripeProgress(p);
                if (Math.abs(sp - stripe.p) > 0.001) drawStripe(sp);
            }
            if (key === 'reveal') {
                polishTo(p0, p);
                const b = buffer(p);
                if (b.q > 0 && b.q < 1 && Math.random() < 0.4) dust(b.x, b.y, 1, 70);
            }
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

        function look(t) {
            const { i, key, p } = local(t);
            const tube = (k) => {
                const on = 300 + k * 360;
                if (t < on) return 0.03;
                const a = t - on;
                if (a < 420) return (Math.sin(a * 0.11 + k * 3) > 0.15 ? 1 : 0.15) * (0.4 + a / 700);
                return 1;
            };
            const age = (t - st.impact.t) / 1000;
            return {
                bars: i === 0 ? [tube(0), tube(1), tube(2)] : [1, 1, 1],
                dent: i === 0 ? 1 : i === 1 ? 1 - st.strikes / 3 * 0.97 : 0,
                scratch: i <= IDX.straighten ? 1 : i === IDX.sand ? 1 - span(p, 0.1, 0.5) : 0,
                clearDoor: key === 'clear' ? sstep(0, 0.6, p) : i > IDX.clear ? 1 : 0,
                clearRough: key === 'clear' ? 0.05 : 0.03,
                peel: i >= IDX.color ? (i === IDX.reveal ? 0.02 : 0.03) : 0,
                envShift: key === 'reveal' ? lerp(-0.75, 0.6, inOut(span(p, 0.3, 0.95))) : Math.sin(t / 5200) * 0.05,
                exposure: key === 'reveal' ? 1.04 : 1.0,
                impact: [st.impact.x, st.impact.y, key === 'straighten' && age >= 0 ? age : -1, st.impact.k],
            };
        }

        function cameraTarget(t) {
            const { key, p } = local(t);
            const WIDE = { x: 640, y: 432, z: 1 };
            const ON_DENT = { x: DENT.x + 10, y: DENT.y - 8 };
            const ON_DOOR = { x: (DOOR.x0 + DOOR.x1) / 2 + 20, y: 420, z: 1.55 };
            switch (key) {
                case 'damage': { const k = inOut(span(p, 0.3, 1)); return { x: lerp(WIDE.x, ON_DENT.x, k), y: lerp(WIDE.y, ON_DENT.y, k), z: lerp(1, 2.1, k) }; }
                case 'straighten': return { ...ON_DENT, z: 2.3 };
                case 'sand': return { ...ON_DENT, z: 2.15 };
                case 'fill': return { ...ON_DENT, z: lerp(2.15, 2.0, p) };
                case 'prime': return p < PRIME_START ? ON_DOOR : { ...ON_DENT, z: 1.9 };
                case 'color': case 'clear': return ON_DOOR;
                case 'stripe': { const x = lerp(STRIPE_X0, STRIPE_X1, stripeProgress(p)); return { x: clamp(x, 300, 980), y: 400, z: 1.7 }; }
                case 'reveal': {
                    if (p < 0.3) return { x: lerp(ON_DOOR.x, 560, span(p, 0, 0.3)), y: 420, z: 1.5 };
                    const k = inOut(span(p, 0.3, 0.75));
                    return { x: lerp(560, 640, k), y: lerp(420, 436, k), z: lerp(1.5, 1.0, k) };
                }
                default: return WIDE;
            }
        }

        // ---- 2D layer: tools with contact shadows ----
        const toScreen = (c) => { const v = st.view; c.setTransform(v.s, 0, 0, v.s, v.ox, v.oy); };
        function contact(c, x, y, rx, ry, a) {
            const rg = c.createRadialGradient(x, y, 0, x, y, rx);
            rg.addColorStop(0, `rgba(0,0,0,${a})`);
            rg.addColorStop(1, 'rgba(0,0,0,0)');
            c.save(); c.translate(x, y); c.scale(1, ry / rx); c.translate(-x, -y);
            c.fillStyle = rg; c.beginPath(); c.arc(x, y, rx, 0, Math.PI * 2); c.fill();
            c.restore();
        }
        const steelGrad = (c, x0, y0, x1, y1) => {
            const g = c.createLinearGradient(x0, y0, x1, y1);
            g.addColorStop(0, '#5b6168'); g.addColorStop(0.3, '#c9ced4'); g.addColorStop(0.48, '#f7f9fb'); g.addColorStop(0.62, '#9aa1a9'); g.addColorStop(1, '#4b5056');
            return g;
        };

        function drawHammer(c, ang, blur) {
            // Body hammer swung in from off-frame right: long neck, round face.
            const pivot = { x: DENT.x + 168, y: DENT.y + 66 };
            const one = (a, alpha) => {
                c.save();
                c.globalAlpha = alpha;
                c.translate(pivot.x, pivot.y);
                c.rotate(a + 0.32);
                c.scale(0.78, 0.78);
                const h = c.createLinearGradient(0, -6, 0, 6);
                h.addColorStop(0, '#d6ad78'); h.addColorStop(0.5, '#a97a46'); h.addColorStop(1, '#6a4523');
                c.fillStyle = h;
                c.beginPath(); c.moveTo(-210, -4.5); c.lineTo(30, -6.5); c.lineTo(30, 6.5); c.lineTo(-210, 4.5); c.closePath(); c.fill();
                c.fillStyle = 'rgba(255,255,255,0.18)'; c.fillRect(-206, -4, 230, 1.2);
                c.fillStyle = steelGrad(c, -246, -40, -222, 40);
                c.beginPath(); c.roundRect(-242, -40, 24, 46, 3); c.fill();
                c.beginPath(); c.ellipse(-230, 10, 15, 8, 0, 0, Math.PI * 2); c.fill();
                c.beginPath(); c.moveTo(-240, -40); c.lineTo(-234, -84); c.lineTo(-226, -84); c.lineTo(-220, -40); c.closePath(); c.fill();
                c.strokeStyle = 'rgba(255,255,255,0.5)'; c.lineWidth = 0.8;
                c.beginPath(); c.moveTo(-236, -82); c.lineTo(-238, -38); c.stroke();
                c.restore();
            };
            if (blur) for (let k = 4; k >= 1; k--) one(ang + k * 0.035, 0.08);
            one(ang, 1);
        }

        function drawSander(c, x, y, t) {
            // Dual-action sander from behind: housing, spinning pad edge, hose.
            contact(c, x + 10, y + 12, 96, 70, 0.45);
            c.save();
            c.translate(x, y);
            const spin = t / 12;
            c.strokeStyle = 'rgba(40,40,46,0.9)'; c.lineWidth = 7;
            c.beginPath(); c.arc(0, 0, 70, 0, Math.PI * 2); c.stroke();
            c.strokeStyle = 'rgba(200,190,160,0.35)'; c.lineWidth = 2;
            for (let k = 0; k < 3; k++) { c.beginPath(); c.arc(0, 0, 70, spin + k * 2.1, spin + k * 2.1 + 0.9); c.stroke(); }
            const hg = c.createRadialGradient(-18, -22, 6, 0, 0, 62);
            hg.addColorStop(0, '#4a4b54'); hg.addColorStop(0.7, '#202127'); hg.addColorStop(1, '#141418');
            c.fillStyle = hg; c.beginPath(); c.arc(0, 0, 60, 0, Math.PI * 2); c.fill();
            c.strokeStyle = 'rgba(255,255,255,0.14)'; c.lineWidth = 1.2;
            c.beginPath(); c.arc(0, 0, 58, Math.PI * 1.05, Math.PI * 1.75); c.stroke();
            c.fillStyle = '#0c0c0f';
            for (let k = 0; k < 8; k++) { c.save(); c.rotate(k * Math.PI / 4); c.beginPath(); c.roundRect(24, -3, 18, 6, 3); c.fill(); c.restore(); }
            const cap = c.createRadialGradient(-6, -6, 2, 0, 0, 20);
            cap.addColorStop(0, '#d9dde2'); cap.addColorStop(1, '#6b7078');
            c.fillStyle = cap; c.beginPath(); c.arc(0, 0, 16, 0, Math.PI * 2); c.fill();
            const bg = c.createLinearGradient(30, 20, 60, 60);
            bg.addColorStop(0, '#2c2d34'); bg.addColorStop(1, '#16161a');
            c.fillStyle = bg;
            c.beginPath(); c.moveTo(36, 28); c.lineTo(200, 160); c.lineTo(178, 190); c.lineTo(14, 52); c.closePath(); c.fill();
            c.fillStyle = '#c62828';
            c.beginPath(); c.moveTo(70, 66); c.lineTo(96, 88); c.lineTo(88, 98); c.lineTo(62, 76); c.closePath(); c.fill();
            c.restore();
            c.strokeStyle = '#111114'; c.lineWidth = 9; c.lineCap = 'round';
            c.beginPath(); c.moveTo(x + 190, y + 176); c.bezierCurveTo(x + 260, y + 240, x + 360, y + 200, x + 520, y + 300); c.stroke();
        }

        function drawSpreader(c, x, y, p) {
            contact(c, x + 6, y + 8, 60, 40, 0.3);
            c.save();
            c.translate(x, y);
            c.rotate(-0.35 + Math.sin(p * 30) * 0.03);
            const g = c.createLinearGradient(-40, 0, 40, 0);
            g.addColorStop(0, 'rgba(236,242,248,0.75)'); g.addColorStop(0.5, 'rgba(255,255,255,0.9)'); g.addColorStop(1, 'rgba(210,220,230,0.7)');
            c.fillStyle = g;
            c.beginPath(); c.moveTo(-60, 0); c.lineTo(60, 0); c.lineTo(40, -64); c.lineTo(-40, -64); c.closePath(); c.fill();
            c.strokeStyle = 'rgba(255,255,255,0.8)'; c.lineWidth = 1;
            c.beginPath(); c.moveTo(-60, 0); c.lineTo(60, 0); c.stroke();
            c.fillStyle = 'rgba(206,186,164,0.95)';
            c.beginPath(); c.moveTo(-58, 0); c.lineTo(58, 0); c.lineTo(52, -9); c.lineTo(-52, -9); c.closePath(); c.fill();
            c.restore();
        }

        function drawGun(c, g, rgb) {
            const nx = g.x + 74, ny = g.y - 128;
            c.save();
            c.globalCompositeOperation = 'lighter';
            const cone = c.createLinearGradient(nx, ny, g.x, g.y);
            cone.addColorStop(0, `rgba(${rgb[0] | 0},${rgb[1] | 0},${rgb[2] | 0},0.2)`);
            cone.addColorStop(1, `rgba(${rgb[0] | 0},${rgb[1] | 0},${rgb[2] | 0},0.02)`);
            c.fillStyle = cone;
            c.beginPath(); c.moveTo(nx - 3, ny); c.quadraticCurveTo(g.x - 30, g.y - 60, g.x - 60, g.y + 6); c.lineTo(g.x + 56, g.y - 4); c.quadraticCurveTo(g.x + 34, g.y - 70, nx + 3, ny); c.closePath(); c.fill();
            c.restore();
            contact(c, g.x + 6, g.y + 4, 70, 26, 0.12);
            c.strokeStyle = '#111114'; c.lineWidth = 7; c.lineCap = 'round';
            c.beginPath(); c.moveTo(nx + 96, ny + 82); c.bezierCurveTo(nx + 130, ny + 210, nx + 300, ny + 140, nx + 440, ny + 290); c.stroke();
            c.save();
            c.translate(nx, ny);
            c.rotate(-0.62 + g.dir * 0.05);
            c.fillStyle = steelGrad(c, 0, -12, 0, 12);
            c.beginPath(); c.roundRect(-20, -11, 22, 22, 5); c.fill();
            c.beginPath(); c.roundRect(-26, -17, 8, 10, 2); c.fill();
            c.beginPath(); c.roundRect(-26, 7, 8, 10, 2); c.fill();
            c.fillStyle = steelGrad(c, 0, -15, 0, 14);
            c.beginPath(); c.moveTo(0, -13); c.bezierCurveTo(40, -16, 80, -18, 104, -12); c.quadraticCurveTo(114, -4, 108, 8); c.lineTo(0, 11); c.closePath(); c.fill();
            c.fillStyle = '#1b1b20';
            c.beginPath(); c.roundRect(104, -9, 16, 9, 3); c.fill();
            c.beginPath(); c.roundRect(100, 2, 14, 8, 3); c.fill();
            c.fillStyle = steelGrad(c, 70, 0, 104, 0);
            c.beginPath(); c.moveTo(72, 8); c.lineTo(100, 8); c.quadraticCurveTo(108, 50, 104, 92); c.quadraticCurveTo(90, 100, 78, 92); c.quadraticCurveTo(76, 50, 72, 8); c.fill();
            c.fillStyle = 'rgba(20,20,24,0.9)';
            c.beginPath(); c.roundRect(80, 40, 22, 50, 8); c.fill();
            c.strokeStyle = steelGrad(c, 20, 0, 60, 0); c.lineWidth = 5; c.lineCap = 'round';
            c.beginPath(); c.moveTo(24, 8); c.quadraticCurveTo(40, 40, 58, 62); c.stroke();
            c.fillStyle = 'rgba(225,232,240,0.28)';
            c.beginPath(); c.moveTo(30, -14); c.lineTo(22, -82); c.quadraticCurveTo(46, -92, 72, -82); c.lineTo(62, -14); c.closePath(); c.fill();
            c.fillStyle = `rgba(${rgb[0] | 0},${rgb[1] | 0},${rgb[2] | 0},0.9)`;
            c.beginPath(); c.moveTo(31, -16); c.lineTo(26, -54); c.quadraticCurveTo(46, -60, 68, -54); c.lineTo(61, -16); c.closePath(); c.fill();
            c.fillStyle = 'rgba(255,255,255,0.45)'; c.fillRect(31, -78, 2.5, 60);
            c.fillStyle = '#1b1b20'; c.beginPath(); c.roundRect(18, -92, 58, 10, 3); c.fill();
            c.restore();
        }

        function drawBrush(c, x, y) {
            // Sword striper laid along the line, pulled left to right.
            contact(c, x - 40, y + 4, 60, 8, 0.25);
            c.save();
            c.translate(x, y);
            c.rotate(-0.08);
            const br = c.createLinearGradient(-70, 0, 0, 0);
            br.addColorStop(0, '#2a1c0e'); br.addColorStop(0.7, '#5a3d1c'); br.addColorStop(1, '#d6a440');
            c.fillStyle = br;
            c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(-30, -2, -70, -10); c.lineTo(-70, -2); c.quadraticCurveTo(-30, 2, 0, 0); c.fill();
            c.fillStyle = steelGrad(c, 0, -14, 0, 4);
            c.beginPath(); c.roundRect(-92, -14, 24, 12, 2); c.fill();
            const wood = c.createLinearGradient(0, -14, 0, -4);
            wood.addColorStop(0, '#c08a4a'); wood.addColorStop(1, '#6a4320');
            c.fillStyle = wood;
            c.beginPath(); c.moveTo(-92, -12); c.lineTo(-250, -30); c.lineTo(-252, -24); c.lineTo(-92, -4); c.closePath(); c.fill();
            c.restore();
            c.fillStyle = 'rgba(255,236,170,0.95)';
            c.beginPath(); c.arc(x, y, 1.8, 0, Math.PI * 2); c.fill();
        }

        function drawBuffer(c, x, y, t) {
            contact(c, x + 8, y + 10, 110, 80, 0.4);
            c.save();
            c.translate(x, y);
            const pad = c.createRadialGradient(-20, -20, 10, 0, 0, 84);
            pad.addColorStop(0, '#f6f1e6'); pad.addColorStop(1, '#cfc6b4');
            c.fillStyle = pad; c.beginPath(); c.arc(0, 0, 82, 0, Math.PI * 2); c.fill();
            c.strokeStyle = 'rgba(120,110,95,0.3)'; c.lineWidth = 1;
            for (let k = 0; k < 7; k++) { const a = t / 18 + k * 0.9; c.beginPath(); c.arc(0, 0, 30 + k * 7, a, a + 1.3); c.stroke(); }
            const hg = c.createRadialGradient(-12, -14, 4, 0, 0, 46);
            hg.addColorStop(0, '#4a4b54'); hg.addColorStop(1, '#16161a');
            c.fillStyle = hg; c.beginPath(); c.arc(0, 0, 44, 0, Math.PI * 2); c.fill();
            c.fillStyle = '#1d1d22';
            c.beginPath(); c.moveTo(30, -20); c.lineTo(230, -110); c.lineTo(244, -84); c.lineTo(40, 6); c.closePath(); c.fill();
            c.fillStyle = '#c62828'; c.beginPath(); c.arc(0, 0, 9, 0, Math.PI * 2); c.fill();
            c.restore();
        }

        function drawMasking(c, k, peel) {
            if (k <= 0 || peel >= 1) return;
            const top = beltY(DOOR.x1) + 3;
            const sheets = [
                { x: -300, y: 40, w: DOOR.x0 - 2 + 300, h: 700, from: -1 },
                { x: DOOR.x1 + 2, y: 40, w: 1000, h: 700, from: 1 },
                { x: DOOR.x0 - 2, y: 40, w: DOOR.x1 - DOOR.x0 + 4, h: top - 40, from: 0 },
            ];
            sheets.forEach((s) => {
                const slide = (1 - outCubic(k)) * s.from * 360;
                const lift = s.from ? 0 : -(1 - outCubic(k)) * 240;
                const off = peel * (s.from ? s.from * 460 : -300);
                c.save();
                c.globalAlpha = Math.min(1, k * 1.6) * (1 - peel);
                c.translate(slide + (s.from ? off : 0), lift + (s.from ? 0 : off));
                c.fillStyle = paper;
                c.fillRect(s.x, s.y, s.w, s.h);
                const fold = c.createLinearGradient(s.x, 0, s.x + s.w, 0);
                for (let f = 0; f <= 8; f++) fold.addColorStop(f / 8, f % 2 ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)');
                c.fillStyle = fold; c.fillRect(s.x, s.y, s.w, s.h);
                const light = c.createLinearGradient(0, s.y, 0, s.y + s.h);
                light.addColorStop(0, 'rgba(255,255,255,0.06)'); light.addColorStop(1, 'rgba(0,0,0,0.3)');
                c.fillStyle = light; c.fillRect(s.x, s.y, s.w, s.h);
                c.fillStyle = 'rgba(214,190,120,0.96)';
                if (s.from === -1) c.fillRect(s.x + s.w - 14, s.y, 14, s.h);
                if (s.from === 1) c.fillRect(s.x, s.y, 14, s.h);
                if (s.from === 0) c.fillRect(s.x, s.y + s.h - 12, s.w, 12);
                c.restore();
            });
            c.save();
            c.globalAlpha = (1 - peel) * Math.min(1, k * 2) * 0.35;
            const sg = c.createLinearGradient(DOOR.x0, 0, DOOR.x0 + 20, 0);
            sg.addColorStop(0, 'rgba(0,0,0,0.8)'); sg.addColorStop(1, 'rgba(0,0,0,0)');
            c.fillStyle = sg; c.fillRect(DOOR.x0, top, 20, DOOR.y1 + 20 - top);
            c.restore();
        }

        function drawFX(t) {
            const c = f2;
            c.setTransform(1, 0, 0, 1, 0, 0);
            c.clearRect(0, 0, fx.width, fx.height);
            toScreen(c);
            const { i, key, p } = local(t);

            const maskK = key === 'prime' ? span(p, 0, PRIME_START * 0.9) : (i > IDX.prime && i <= IDX.clear) ? 1 : 0;
            const peel = key === 'clear' ? inCubic(span(p, 0.7, 1)) : 0;
            drawMasking(c, maskK, peel);

            for (const m of st.mist) {
                const k = m.life / m.max;
                const a = 0.06 * Math.sin(Math.PI * Math.min(1, k * 1.4)) * (1 - k);
                const rg = c.createRadialGradient(m.x, m.y, 0, m.x, m.y, m.r);
                rg.addColorStop(0, `rgba(${m.rgb[0] | 0},${m.rgb[1] | 0},${m.rgb[2] | 0},${a})`);
                rg.addColorStop(1, `rgba(${m.rgb[0] | 0},${m.rgb[1] | 0},${m.rgb[2] | 0},0)`);
                c.fillStyle = rg; c.beginPath(); c.arc(m.x, m.y, m.r, 0, Math.PI * 2); c.fill();
            }

            if (key === 'straighten') {
                // Anticipation, a fast drop, a held impact, recoil with overshoot.
                let a = 0.7, blur = false;
                for (const at of STRIKES) {
                    const d = p - at;
                    if (d > -0.16 && d <= 0) {
                        const q = (d + 0.16) / 0.16;
                        a = q < 0.62 ? lerp(0.7, 1.0, outCubic(q / 0.62)) : lerp(1.0, 0, inCubic((q - 0.62) / 0.38));
                        blur = q >= 0.62;
                    } else if (d > 0 && d < 0.012) a = 0;
                    else if (d >= 0.012 && d < 0.14) a = lerp(0, 0.7, outBack((d - 0.012) / 0.128));
                }
                if (a < 0.08) contact(c, DENT.x, DENT.y + 6, 30, 14, 0.5);
                drawHammer(c, -a, blur);
            }
            if (key === 'sand') {
                const q = span(p, 0.06, 0.92);
                const enter = outCubic(span(p, 0, 0.08)), leave = inCubic(span(p, 0.92, 1));
                const s = sanderAt(Math.max(q, 0.001), false);
                drawSander(c, s.x + (1 - enter) * 300 + leave * 320, s.y + (1 - enter) * 200 + leave * 220, t);
            }
            if (key === 'fill') {
                if (p < 0.36) drawSpreader(c, DENT.x - 80 + 160 * outCubic(span(p, 0.04, 0.34)), DENT.y + 40, p);
                else if (p < 0.98) {
                    const s = sanderAt(span(p, 0.36, 0.94), true);
                    const leave = inCubic(span(p, 0.92, 0.98));
                    drawSander(c, s.x + leave * 320, s.y + leave * 220, t);
                }
            }
            const coat = COATS[key];
            if (coat) {
                const cp = coatP(key, p);
                if (cp > 0 && cp < SPRAY_END) drawGun(c, gunPath(cp / SPRAY_END, coat.box, coat.passes), coat.rgb());
            }
            if (key === 'clear' && p < 0.62) drawGun(c, gunPath(p / 0.62, DOORBOX, 6), [235, 240, 248]);
            if (key === 'stripe') {
                const sp = stripeProgress(p);
                if (sp > 0 && sp < 1) { const x = lerp(STRIPE_X0, STRIPE_X1, sp); drawBrush(c, x, charY(x) + STRIPE_OFF[0]); }
            }
            if (key === 'reveal') {
                const b = buffer(p);
                if (b.q > 0 && b.q < 1) {
                    const enter = outCubic(span(b.q, 0, 0.1)), leave = inCubic(span(b.q, 0.9, 1));
                    drawBuffer(c, b.x + (1 - enter) * 300 + leave * 340, b.y + (1 - enter) * 220 + leave * 260, t);
                }
            }

            c.save();
            c.globalCompositeOperation = 'lighter';
            for (const pt of st.particles) {
                const k = pt.life / pt.max;
                if (pt.kind === 'spark') {
                    const hot = 1 - k;
                    c.strokeStyle = `rgba(255,${(170 + 80 * hot) | 0},${(60 + 120 * hot * hot) | 0},${hot})`;
                    c.lineWidth = pt.w;
                    c.beginPath(); c.moveTo(pt.x, pt.y); c.lineTo(pt.x - pt.vx * 2.2, pt.y - pt.vy * 2.2); c.stroke();
                } else if (pt.kind === 'flash') {
                    const a = Math.pow(1 - k, 2);
                    const rg = c.createRadialGradient(pt.x, pt.y, 0, pt.x, pt.y, 110);
                    rg.addColorStop(0, `rgba(255,244,220,${0.85 * a})`);
                    rg.addColorStop(0.25, `rgba(255,200,140,${0.3 * a})`);
                    rg.addColorStop(1, 'rgba(255,180,120,0)');
                    c.fillStyle = rg; c.beginPath(); c.arc(pt.x, pt.y, 110, 0, Math.PI * 2); c.fill();
                } else if (pt.kind === 'drop') {
                    c.fillStyle = `rgba(${pt.rgb[0] | 0},${pt.rgb[1] | 0},${pt.rgb[2] | 0},${0.35 * (1 - k)})`;
                    c.fillRect(pt.x, pt.y, 1.5, 1.5);
                }
            }
            c.restore();
            for (const pt of st.particles) {
                if (pt.kind !== 'dust') continue;
                const k = pt.life / pt.max;
                c.fillStyle = `rgba(228,218,204,${0.5 * Math.sin(Math.PI * k)})`;
                c.beginPath(); c.arc(pt.x, pt.y, pt.r, 0, Math.PI * 2); c.fill();
            }
        }

        function render() {
            if (!RT) return;
            const t = st.t;
            const W = glCanvas.width, H = glCanvas.height;
            const u = look(t);
            Object.values(maps).forEach((m) => { if (m.dirty) upload(m); });
            if (stripe.dirty) upload(stripe);

            const s = st.view.base * st.cam.z;
            const tt = t / 1000;
            const hand = st.playing ? 1 : 0;
            const sx = st.shake ? gauss() * st.shake : 0, sy = st.shake ? gauss() * st.shake : 0;
            st.view.s = s;
            st.view.ox = W / 2 - (st.cam.x + drift(tt, 1) * 2.5 * hand) * s + sx * st.dpr;
            st.view.oy = H / 2 - (st.cam.y + drift(tt, 5) * 1.6 * hand) * s + sy * st.dpr;

            gl.bindFramebuffer(gl.FRAMEBUFFER, RT.scene.fb);
            gl.viewport(0, 0, W, H);
            const S = P.scene;
            gl.useProgram(S.p);
            const bind = (unit, tex, loc) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, tex); gl.uniform1i(loc, unit); };
            bind(0, maps.sand.tex, S.u.uSand);
            bind(1, maps.filler.tex, S.u.uFiller);
            bind(2, maps.prime.tex, S.u.uPrime);
            bind(3, maps.base.tex, S.u.uBase);
            bind(4, maps.wet.tex, S.u.uWet);
            bind(5, maps.polish.tex, S.u.uPolish);
            bind(6, stripe.tex, S.u.uStripe);
            gl.uniform2f(S.u.uRes, W, H);
            gl.uniform3f(S.u.uView, s, st.view.ox, st.view.oy);
            gl.uniform1f(S.u.uTime, tt);
            gl.uniform3f(S.u.uDent, DENT.x, DENT.y, u.dent);
            gl.uniform4f(S.u.uImpact, ...u.impact);
            gl.uniform3f(S.u.uCarCol, ...st.car);
            gl.uniform1f(S.u.uScratch, u.scratch);
            gl.uniform1f(S.u.uClearDoor, u.clearDoor);
            gl.uniform1f(S.u.uClearRough, u.clearRough);
            gl.uniform1f(S.u.uPeel, u.peel);
            gl.uniform1f(S.u.uEnvShift, u.envShift);
            gl.uniform1f(S.u.uExposure, u.exposure);
            gl.uniform3f(S.u.uBars, ...u.bars);
            gl.drawArrays(gl.TRIANGLES, 0, 3);

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

            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            gl.viewport(0, 0, W, H);
            const C = P.comp;
            gl.useProgram(C.p);
            bind(0, RT.scene.tex, C.u.uScene);
            bind(1, RT.a.tex, C.u.uBloom);
            gl.uniform2f(C.u.uRes, W, H);
            gl.uniform1f(C.u.uFloorY, FLOOR * s + st.view.oy);
            gl.uniform1f(C.u.uTime, tt);
            const fade = Math.max(1 - clamp(t / 700), clamp((t - (TOTAL - 700)) / 700));
            gl.uniform1f(C.u.uFade, inOut(fade));
            gl.drawArrays(gl.TRIANGLES, 0, 3);

            drawFX(t);
            if (fade > 0) { f2.setTransform(1, 0, 0, 1, 0, 0); f2.fillStyle = `rgba(0,0,0,${inOut(fade)})`; f2.fillRect(0, 0, fx.width, fx.height); }

            const i = stageAt(t);
            chips[i]?.style.setProperty('--p', String(clamp((t - STARTS[i]) / STAGES[i].dur)));
            if (hudTime) {
                const sec = Math.floor(t / 1000), fr = Math.floor((t % 1000) / 1000 * 24);
                hudTime.textContent = `00:${String(sec).padStart(2, '0')}:${String(fr).padStart(2, '0')}`;
            }
        }

        // 30fps is plenty for a film and keeps laptops cool.
        const FRAME = 1000 / 30;
        function frame(now) {
            st.raf = 0;
            const elapsed = st.last ? now - st.last : FRAME;
            if (elapsed < FRAME - 2) { st.raf = requestAnimationFrame(frame); return; }
            const dt = Math.min(66, elapsed);
            st.last = now;
            if (st.playing) {
                const t0 = st.t;
                st.t += dt;
                if (st.t >= TOTAL) { st.t = 0; st.stage = -1; advance(0, 0, dt); }
                else advance(t0, st.t, dt);
            }
            const tg = cameraTarget(st.t);
            const w = 2.4, k = dt / 1000;
            ['x', 'y', 'z'].forEach((a) => {
                const v = 'v' + a;
                st.cam[v] += (w * w * (tg[a] - st.cam[a]) - 2 * w * st.cam[v]) * k;
                st.cam[a] += st.cam[v] * k;
            });
            st.shake *= Math.pow(0.00005, k);
            if (st.shake < 0.25) st.shake = 0;
            stepParticles(dt);
            const target = cssPaint();
            st.car = st.car.map((v, n) => lerp(v, target[n], 0.12));
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
        document.documentElement.addEventListener('paintchange', () => { if (!st.playing) { st.car = cssPaint(); render(); } });

        resize();
        if (reduceMotion) { jump(IDX.reveal, 0.85); setPlaying(false); }
        else { settle(0); onStage(0); setPlaying(true); }
        root.craft = { jump, setPlaying, get t() { return st.t; } };
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
