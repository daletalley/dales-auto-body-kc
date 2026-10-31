/*
 * The Craft: a '75 Chevelle, one dented door, start to finish.
 *
 * A real-time render of a 1975 Chevelle Malibu Colonnade coupe in the paint
 * booth, in true proportions: long hood, short deck, the Coke-bottle
 * beltline kicking up over the rear wheel, one long coupe door, frameless
 * door glass, the thick Colonnade pillar and wedge quarter window, a black
 * vinyl top, chrome bumpers, drip rail, wheel-opening and rocker moldings,
 * a bullet mirror, side markers, Rally wheels on whitewalls. The car is
 * procedural (distance fields in a WebGL fragment shader), so every edge
 * stays sharp when the camera moves in, and it's lit by the booth's ceiling
 * softboxes, whose reflections run down the body like real paint photography.
 *
 * The repair is a real collision job on the door: hammered out, sanded to a
 * featheredge, filled and blocked, masked with paper and tape, primed,
 * sprayed in a color matched to the car, cleared, unmasked, and the
 * pinstripe goes back on down the whole side by hand. Coats are sprayed into
 * high-resolution coverage maps around the door; fresh paint is wet and
 * flashes off; the buffer polishes where it travels. Tools, sparks, dust,
 * spray and masking paper are drawn on a 2D layer in the same camera, at
 * real-world size, with contact shadows on the panel.
 *
 * The car's color is the site's current Finish (--paint), live. 30fps, only
 * while on screen. Reduced motion shows the finished car, paused.
 */
(() => {
    'use strict';

    const VW = 1280, VH = 720, FLOOR = 690;
    // Repair maps cover only the area around the door, at 2x scene resolution.
    const REGION = { x: 450, y: 450, w: 400, h: 200, k: 2 };
    const STAGES = [
        { key: 'damage',     label: 'Damage',       caption: 'A ’75 Chevelle, sideswiped right through the pinstripe.', dur: 4200 },
        { key: 'straighten', label: 'Straighten',   caption: 'Metal worked back to its true shape.',        dur: 3400 },
        { key: 'sand',       label: 'Sand',         caption: 'Feathered out to bare metal.',                dur: 3400 },
        { key: 'fill',       label: 'Fill & block', caption: 'A skim of filler, blocked flat by hand.',     dur: 3800 },
        { key: 'prime',      label: 'Mask & prime', caption: 'Masked off, primed and sealed.',              dur: 3800 },
        { key: 'color',      label: 'Color match',  caption: 'Tinted to match the car, not the chip.',      dur: 3800 },
        { key: 'clear',      label: 'Clear',        caption: 'Clear coat, then the paper comes off.',       dur: 3600 },
        { key: 'stripe',     label: 'Pinstripe',    caption: 'The line filled back in by hand, true to the original.', dur: 4400 },
        { key: 'reveal',     label: 'Showroom',     caption: 'You’d never know.',                           dur: 6600 },
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

    // ---- The Chevelle's side profile (scene px, y down, nose to the left) ----
    // Kept in step with the same functions in the shader.
    const hoodY = (x) => 492 - 4 * sstep(110, 470, x);
    const beltY = (x) => 488 - 12 * sstep(770, 960, x);
    const deckY = (x) => 476 + (x - 1030) * 0.03;
    const topY = (x) => (x < 470 ? hoodY(x) : x > 1030 ? deckY(x) : beltY(x));
    const stripeY = (x) => topY(x) + 13;
    const DOOR = { x0: 488, x1: 772, y1: 650 };
    const DENT = { x: 628, y: 514 };
    const TS = 0.42;                       // tool scale: real-world size next to the car
    // The pinstripe is filled back in across the repainted door only.
    const STRIPE_X0 = 484, STRIPE_X1 = 776;

    function cssPaint() {
        const v = getComputedStyle(document.documentElement).getPropertyValue('--paint').trim();
        const m = v.match(/^#([0-9a-f]{6})$/i);
        if (!m) return [0.78, 0.06, 0.18];
        const n = parseInt(m[1], 16);
        return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
    }

    function gunPath(p, box, passes) {
        const q = clamp(p) * passes;
        const pass = Math.min(passes - 1, Math.floor(q));
        const f = q - pass;
        const dir = pass % 2 ? -1 : 1;
        const x0 = box.x0 - 34, x1 = box.x1 + 34;
        const k = inOut(f);
        const x = dir > 0 ? lerp(x0, x1, k) : lerp(x1, x0, k);
        const yA = box.y0 + (pass / Math.max(1, passes - 1)) * (box.y1 - box.y0);
        const yB = box.y0 + (Math.min(pass + 1, passes - 1) / Math.max(1, passes - 1)) * (box.y1 - box.y0);
        const y = lerp(yA, yB, sstep(0.86, 1, f)) - Math.sin(f * Math.PI) * 2;
        return { x, y, dir, on: x > box.x0 - 14 && x < box.x1 + 14 };
    }

    const VERT = 'attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}';
    const COMMON = `
        precision highp float;
        float hash(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
        float noise(vec2 p){vec2 i=floor(p),f=fract(p);vec2 u=f*f*(3.-2.*f);
            return mix(mix(hash(i),hash(i+vec2(1,0)),u.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),u.x),u.y);}
        float fbm(vec2 p){float s=0.,a=.5;for(int i=0;i<4;i++){s+=a*noise(p);p*=2.03;a*=.5;}return s;}
        float sdBox(vec2 p, vec2 b, float r){vec2 q=abs(p)-b+r;return length(max(q,0.))+min(max(q.x,q.y),0.)-r;}
    `;

    const SCENE_FRAG = COMMON + `
        uniform vec2 uRes; uniform vec3 uView; uniform float uTime;
        uniform sampler2D uSand, uFiller, uPrime, uBase, uWet, uPolish;
        uniform vec3 uDent;
        uniform vec4 uImpact;
        uniform vec3 uCarCol;
        uniform float uScratch, uClearDoor, uClearRough, uPeel, uEnvShift, uExposure, uStripeX;
        uniform vec3 uBars;
        const float FLOOR = 690.;
        const vec2 WF = vec2(300., 620.);
        const vec2 WR = vec2(940., 620.);
        const vec2 RO = vec2(450., 450.);
        const vec2 RS = vec2(400., 200.);

        float hoodY(float x) { return 492.0 - 4.0 * smoothstep(110.0, 470.0, x); }
        float beltY(float x) { return 488.0 - 12.0 * smoothstep(770.0, 960.0, x); }
        float deckY(float x) { return 476.0 + (x - 1030.0) * 0.03; }
        float topY(float x) { return x < 470.0 ? hoodY(x) : (x > 1030.0 ? deckY(x) : beltY(x)); }
        float charY(float x) { return 548.0 - 8.0 * smoothstep(780.0, 940.0, x); }
        float botY(float x) { return 650.0 - 8.0 * (smoothstep(370.0, 170.0, x) + smoothstep(1030.0, 1190.0, x)); }
        float roofY(float x) { float t = (x - 770.0) / 260.0; return 392.0 + t * t * 22.0; }

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
                c += vec3(1.0, 0.975, 0.93) * 7.0 * peak * bx * by * k * (0.94 + 0.06 * sin((R.x - cx) * 24.0));
            }
            float sx = R.x + uEnvShift * 0.35;
            c += vec3(0.82, 0.88, 1.0) * 1.3 * peak * smoothstep(0.80 - w, 0.80 + w, sx) * (1.0 - smoothstep(0.92 - w, 0.92 + w, sx)) * smoothstep(-0.5, 0.25, up);
            c += vec3(1.0, 0.88, 0.76) * 1.2 * peak * smoothstep(-0.95 - w, -0.95 + w, R.x) * (1.0 - smoothstep(-0.87 - w, -0.87 + w, R.x)) * smoothstep(-0.3, 0.4, up);
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
        vec3 chrome(vec3 N, float lit) { return shade(N, vec3(0.92), 1.0, 0.04, 0.0, 0.02, lit); }

        vec3 booth(vec2 p, float lit) {
            vec3 c;
            if (p.y < FLOOR) {
                c = mix(vec3(0.032, 0.03, 0.036), vec3(0.011, 0.010, 0.013), smoothstep(240.0, FLOOR, p.y)) * (0.35 + 0.65 * lit);
                float seam = smoothstep(1.4, 0.0, abs(mod(p.x + 80.0, 160.0) - 80.0) - 78.6);
                c += vec3(0.012) * seam * lit;
                for (int i = 0; i < 3; i++) {
                    float fi = float(i);
                    float k = i == 0 ? uBars.x : (i == 1 ? uBars.y : uBars.z);
                    float x0 = 300.0 + fi * 340.0;
                    vec2 q = (p - vec2(x0, 250.0)) / vec2(300.0, 230.0);
                    c += vec3(0.05, 0.048, 0.046) * k * exp(-dot(q, q) * 1.6);
                    float fx = step(abs(p.x - x0), 110.0) * step(abs(p.y - 236.0), 4.0);
                    c += vec3(1.5, 1.46, 1.4) * fx * k;
                }
            } else {
                float z = (p.y - FLOOR) / 120.0;
                c = vec3(0.016, 0.015, 0.018) * (1.0 - z * 0.4) * (0.4 + 0.6 * lit);
                float gx = abs(fract((p.x - 640.0) / (60.0 + z * 160.0)) - 0.5);
                float gy = abs(fract(pow(max(z, 0.0), 0.62) * 9.0) - 0.5);
                c += vec3(0.010) * (smoothstep(0.47, 0.5, gx) + smoothstep(0.45, 0.5, gy)) * lit;
                vec2 sh = (p - vec2(650.0, FLOOR + 3.0)) / vec2(600.0, 16.0);
                c *= 1.0 - 0.8 * exp(-dot(sh, sh) * 1.4);
                for (int i = 0; i < 2; i++) {
                    vec2 tq = (p - vec2(i == 0 ? 300.0 : 940.0, FLOOR + 1.0)) / vec2(70.0, 6.0);
                    c *= 1.0 - 0.6 * exp(-dot(tq, tq));
                }
            }
            return c;
        }

        float region(sampler2D s, vec2 p) {
            vec2 q = (p - RO) / RS;
            if (q.x < 0.0 || q.x > 1.0 || q.y < 0.0 || q.y > 1.0) return 0.0;
            return texture2D(s, q).a;
        }

        float smax(float a, float b, float k) { float h = clamp(0.5 - 0.5 * (b - a) / k, 0.0, 1.0); return mix(b, a, h) + k * h * (1.0 - h); }
        float smin(float a, float b, float k) { float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0); return mix(b, a, h) - k * h * (1.0 - h); }

        // The body side as a signed distance (negative inside), every corner rounded.
        float bodySD(vec2 p) {
            float top = topY(p.x), bot = botY(p.x);
            float nose = 110.0 + (p.y - 492.0) * 0.06;
            float tail = 1215.0 - (p.y - 476.0) * 0.04;
            float d = smax(smax(top - p.y, p.y - bot, 8.0), smax(nose - p.x, p.x - tail, 8.0), 16.0);
            vec2 wc = p.x < 620.0 ? vec2(300.0, 613.0) : vec2(940.0, 613.0);
            return smax(d, 84.0 - length(p - wc), 5.0);
        }
        // The greenhouse: a curved windshield flowing up out of the cowl, a crowned
        // roof, and the long Colonnade C-pillar sweeping down into the deck.
        float greenTop(float x) {
            float belt = topY(x);
            float roof = 380.0 + pow((x - 800.0) / 300.0, 2.0) * 16.0;
            // The windshield springs straight up off the cowl, ahead of the door,
            // and the roof runs back to meet the deck.
            float rise = pow(clamp((x - 418.0) / 300.0, 0.0, 1.0), 0.8);
            rise = rise * rise * (3.0 - 2.0 * rise);
            float fall = smoothstep(1072.0, 860.0, x);
            return mix(belt, roof, rise * fall);
        }
        float greenSD(vec2 p) {
            float gt = greenTop(p.x);
            float s = (greenTop(p.x + 1.0) - greenTop(p.x - 1.0)) * 0.5;
            float dTop = (gt - p.y) / sqrt(1.0 + s * s);
            // Where the greenhouse has no height (along the hood and deck) it
            // isn't there at all: no hairline down the length of the car.
            return max(max(dTop, p.y - topY(p.x) - 0.5), 1.5 - (topY(p.x) - gt));
        }

        vec3 wheel(vec2 wq, float wr, float aa, float lit) {
            float a = atan(wq.y, wq.x);
            // Tire: a bulging sidewall that catches a soft line of light
            float sw = clamp((wr - 52.0) / 25.0, 0.0, 1.0);
            vec3 Nt = normalize(vec3(wq / max(wr, 1.0) * (sw - 0.45) * 1.4, 1.0));
            vec3 tire = shade(Nt, vec3(0.02), 0.0, 0.5, 0.0, 0.1, lit);
            float ww = smoothstep(58.5 - aa, 59.5 + aa, wr) * (1.0 - smoothstep(65.5 - aa, 66.5 + aa, wr));
            tire = mix(tire, shade(Nt, vec3(0.80, 0.78, 0.74), 0.0, 0.45, 0.0, 0.1, lit), ww);
            // Rally wheel
            float rimM = 1.0 - smoothstep(52.5 - aa, 52.5 + aa, wr);
            float rt = clamp((wr - 43.0) / 9.5, 0.0, 1.0);                 // trim ring: a polished torus
            vec3 Nr = normalize(vec3(wq / max(wr, 1.0) * (rt - 0.5) * 2.2, 1.0));
            float ringM = smoothstep(42.5, 43.5, wr);
            vec3 Nf = normalize(vec3(-wq / 44.0 * 0.32, 1.0));               // dished center
            vec3 face = shade(Nf, vec3(0.50, 0.51, 0.53), 0.75, 0.32, 0.4, 0.06, lit);
            // Five rounded slots, open to the dark drum behind
            float slot = 0.0;
            for (int i = 0; i < 5; i++) {
                float sa = float(i) * 1.25664 + 0.6;
                vec2 dir = vec2(cos(sa), sin(sa));
                vec2 q = vec2(dot(wq, dir) - 31.0, dot(wq, vec2(-dir.y, dir.x)));
                slot = max(slot, 1.0 - smoothstep(-aa, aa, sdBox(q, vec2(6.0, 3.6), 3.2)));
            }
            face = mix(face, vec3(0.006), slot);
            float lug = 0.0;
            for (int i = 0; i < 5; i++) {
                float la = float(i) * 1.25664;
                lug = max(lug, 1.0 - smoothstep(1.6, 2.6, length(wq - vec2(cos(la), sin(la)) * 19.0)));
            }
            float capR = 12.5;
            float cap = 1.0 - smoothstep(capR - aa, capR + aa, wr);
            vec3 w = mix(face, chrome(Nr, lit), ringM);
            w = mix(w, chrome(normalize(vec3(0.0, -0.4, 1.0)), lit), lug);
            w = mix(w, chrome(normalize(vec3(wq / capR * 0.75, 1.0)), lit), cap);
            return mix(tire, w, rimM);
        }

        void main() {
            vec2 dev = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
            vec2 p = (dev - uView.yz) / uView.x;
            float aa = 1.2 / uView.x;
            float lit = (uBars.x + uBars.y + uBars.z) / 3.0;
            vec3 col = booth(p, lit);
            vec3 paint = pow(uCarCol, vec3(1.35));

            float top = topY(p.x);
            float bot = botY(p.x);

            vec2 wc = p.x < 620.0 ? WF : WR;
            vec2 wq = p - wc;
            float wr = length(wq);
            float tireM = 1.0 - smoothstep(70.0 - aa, 70.0 + aa, wr);
            vec2 ac = wc - vec2(0.0, 7.0);
            float archR = length(p - ac);
            float inArch = (1.0 - smoothstep(84.0 - aa, 84.0 + aa, archR)) * step(p.y, ac.y + 77.0);

            float bd = bodySD(p);
            float body = 1.0 - smoothstep(-aa, aa, bd);
            float gs = greenSD(p);
            float green = (1.0 - smoothstep(-aa, aa, gs)) * (1.0 - body);

            float fb = sdBox(p - vec2(112.0, 578.0), vec2(24.0, 13.0), 10.0);
            float rb = sdBox(p - vec2(1222.0, 571.0), vec2(22.0, 12.0), 10.0);
            float bdist = min(fb, rb);
            float bump = 1.0 - smoothstep(-aa, aa, bdist);

            float car = max(max(body, green), bump);

            if (car > 0.002 || tireM > 0.002 || inArch > 0.002) {
                vec3 c = vec3(0.004) * (1.0 - smoothstep(30.0, 84.0, archR) * 0.6);
                if (tireM > 0.0) {
                    vec3 wcol = wheel(wq / 0.909, wr / 0.909, aa / 0.909, lit);
                    // The fender shades the top of the wheel
                    wcol *= mix(0.35, 1.0, smoothstep(wc.y - 72.0, wc.y + 10.0, p.y));
                    c = mix(c, wcol, tireM);
                }

                if (car > 0.0) {
                    vec3 bc;
                    if (bump > 0.5 && body < 0.5) {
                        // Wraparound chrome bumper: rounded in every direction
                        float by = p.x < 640.0 ? 578.0 : 571.0;
                        vec2 e = vec2(0.8, 0.0);
                        vec2 gb = normalize(vec2(min(sdBox(p + e - vec2(112.0, 578.0), vec2(24.0, 13.0), 10.0), sdBox(p + e - vec2(1222.0, 571.0), vec2(22.0, 12.0), 10.0)) - min(sdBox(p - e - vec2(112.0, 578.0), vec2(24.0, 13.0), 10.0), sdBox(p - e - vec2(1222.0, 571.0), vec2(22.0, 12.0), 10.0)),
                                             min(sdBox(p + e.yx - vec2(112.0, 578.0), vec2(24.0, 13.0), 10.0), sdBox(p + e.yx - vec2(1222.0, 571.0), vec2(22.0, 12.0), 10.0)) - min(sdBox(p - e.yx - vec2(112.0, 578.0), vec2(24.0, 13.0), 10.0), sdBox(p - e.yx - vec2(1222.0, 571.0), vec2(22.0, 12.0), 10.0))) + 1e-5);
                        float rollB = pow(smoothstep(-12.0, 0.0, bdist), 1.5);
                        vec3 Nb = normalize(vec3(gb * rollB * 1.8 + vec2(0.0, (p.y - by) / 16.0 * 0.5), 1.0));
                        bc = chrome(Nb, lit);
                        bc *= 0.55 + 0.45 * smoothstep(0.0, 2.2, abs(p.y - by - 3.0));
                    } else if (green >= body) {   // edge pixels shade as the part they belong to
                        float inset = -gs;
                        float xQ = mix(978.0, 916.0, clamp((478.0 - p.y) / 86.0, 0.0, 1.0));
                        float dg = smin(inset - 7.0, 768.0 - p.x, 7.0);
                        float qg = smin(smin(inset - 7.0, p.x - 796.0, 6.0), xQ - p.x, 10.0);
                        float wd = max(dg, qg);
                        float glassM = smoothstep(-aa, aa, wd);
                        float rev = smoothstep(-2.4 - aa, -2.4 + aa, wd) * (1.0 - glassM);
                        // Drip rail along the roof only, and never thinner than a pixel.
                        float dw = max(1.4, aa * 1.2);
                        float drip = (1.0 - smoothstep(dw - aa, dw + aa, inset)) * smoothstep(600.0, 670.0, p.x) * smoothstep(940.0, 880.0, p.x);
                        // Glass leans in toward the roof and reflects the booth faintly.
                        float lean = smoothstep(80.0, 0.0, inset);
                        vec3 Ng = normalize(vec3((p.x - 760.0) / 2200.0, -0.24 - 0.22 * lean, 1.0));
                        vec3 glass = shade(Ng, vec3(0.01, 0.012, 0.014), 0.0, 0.05, 0.0, 0.05, lit);
                        glass += vec3(0.012, 0.013, 0.015) * smoothstep(0.0, 50.0, wd);    // a hint of cabin
                        float grain = noise(p * 2.3) * 0.5 + noise(p * 6.1) * 0.5;
                        float roll = pow(smoothstep(14.0, 0.0, inset), 2.0);
                        vec3 Nv = normalize(vec3((grain - 0.5) * 0.2, -0.25 - 0.9 * roll + (grain - 0.5) * 0.2, 1.0));
                        vec3 vinyl = shade(normalize(vec3(0.0, -0.18 - 0.9 * roll, 1.0)), paint, 0.3, 0.3, 1.0, 0.02, lit);
                        bc = mix(vinyl, glass, glassM);
                        bc = mix(bc, chrome(normalize(vec3(0.0, wd < -1.2 ? -0.6 : 0.5, 1.0)), lit) * 0.85, rev);
                        bc = mix(bc, chrome(normalize(vec3(0.0, -0.7, 1.0)), lit), drip);
                    } else {
                        // ---- Body: curvature, rolled edges, Coke-bottle hips ----
                        float crease = charY(p.x);
                        float above = smoothstep(crease + 1.6, crease - 1.6, p.y);
                        float tUp = clamp((crease - p.y) / max(crease - top, 1.0), 0.0, 1.0);
                        float tDn = clamp((p.y - crease) / max(bot - crease, 1.0), 0.0, 1.0);
                        float ny = mix(0.03 + 0.55 * tDn * tDn - 0.07 * exp(-tDn * 14.0), -0.06 - 0.18 * tUp * tUp, above);
                        vec3 N = vec3((p.x - 650.0) / 1700.0, ny, 1.0);
                        vec2 hq = (p - vec2(940.0, 525.0)) / vec2(1.35, 1.0);
                        N.xy += normalize(hq) * 0.15 * smoothstep(250.0, 140.0, length(hq)) * smoothstep(84.0, 122.0, archR);
                        vec2 fq = (p - vec2(300.0, 530.0)) / vec2(1.3, 1.0);
                        N.xy += normalize(fq) * 0.14 * smoothstep(210.0, 120.0, length(fq)) * smoothstep(84.0, 112.0, archR);
                        // Every silhouette edge rolls away: this is what makes it read as solid metal.
                        vec2 e = vec2(0.75, 0.0);
                        vec2 gb = vec2(bodySD(p + e) - bodySD(p - e), bodySD(p + e.yx) - bodySD(p - e.yx));
                        gb /= max(length(gb), 1e-4);
                        float roll = smoothstep(-18.0, 0.0, bd);
                        N.xy += gb * roll * roll * 2.2;
                        // Door shut lines
                        float g1 = p.x - 488.0, g2 = p.x - 772.0;
                        float gn = abs(g1) < abs(g2) ? g1 : g2;
                        float gap = abs(gn) + step(p.y, top + 1.0) * 10.0;
                        N.x += 0.7 * smoothstep(4.0, 0.5, gap) * sign(gn);

                        // The hit: a dent, and long sideswipe scrapes straight through the pinstripe
                        vec2 dd = (p - uDent.xy) / vec2(26.0, 13.0);
                        float g = exp(-dot(dd, dd));
                        N.xy += uDent.z * (2.0 * dd / vec2(26.0, 13.0) * g * 3.4 + vec2(fbm(p * 0.25) - 0.5, 0.5 - fbm(p * 0.25 + 3.0)) * g * 0.7);
                        if (uImpact.z >= 0.0 && uImpact.z < 1.4) {
                            vec2 rp = p - uImpact.xy;
                            float r = length(rp);
                            float fr = uImpact.z * 170.0;
                            float wv = sin((r - fr) * 0.36) * exp(-uImpact.z * 3.4) * exp(-abs(r - fr) * 0.045);
                            N.xy += rp / (r + 1.0) * wv * 0.3 * uImpact.w;
                        }

                        float sand = region(uSand, p);
                        float fil = region(uFiller, p);
                        float pr = smoothstep(0.0, 0.85, region(uPrime, p));
                        float bs = smoothstep(0.0, 0.55, region(uBase, p));
                        float wet = region(uWet, p);
                        float pol = region(uPolish, p);
                        float onDoor = step(488.0, p.x) * step(p.x, 772.0);

                        float fine = smoothstep(1.4, 3.0, uView.x);
                        N.xy += (vec2(noise(p * 1.6), noise(p * 1.6 + 7.3)) - 0.5) * uPeel * bs * onDoor * (1.0 - pol) * fine;
                        float swirl = sin(length(p - uDent.xy) * 3.5 + noise(p * 0.6) * 6.0) * 0.5 + 0.5;
                        float bare = smoothstep(0.6, 0.78, sand);
                        N.xy += vec2(swirl - 0.5) * 0.08 * bare * (1.0 - max(fil, max(pr, bs)));
                        N = normalize(N);

                        vec3 alb = paint;
                        float metal = 0.3, rough = 0.3, clear = 1.0;
                        float sy1 = top + 13.0, sy2 = top + 18.0;
                        float stripeRun = step(96.0, p.x) * step(p.x, 1222.0) * smoothstep(1.0, 3.5, gap);
                        float lines = max(1.0 - smoothstep(0.75 - aa, 0.75 + aa, abs(p.y - sy1)), 1.0 - smoothstep(0.45 - aa, 0.45 + aa, abs(p.y - sy2))) * stripeRun;
                        alb = mix(alb, vec3(0.86, 0.66, 0.30), lines); metal = mix(metal, 0.6, lines);

                        vec2 sq = p - uDent.xy - vec2(0.0, -4.0);
                        float streak = smoothstep(0.7, 0.92, noise(vec2(sq.x * 0.012, sq.y * 1.1)) * 0.6 + noise(vec2(sq.x * 0.05, sq.y * 2.3)) * 0.4);
                        float scr = streak * smoothstep(1.0, 0.45, length(sq / vec2(118.0, 20.0))) * uScratch;
                        alb = mix(alb, mix(vec3(0.66, 0.66, 0.64), vec3(0.32, 0.33, 0.34), noise(p * 0.7)), scr);
                        rough = mix(rough, 0.7, scr); clear *= 1.0 - scr; metal = mix(metal, 0.2, scr);

                        float scuff = smoothstep(0.06, 0.24, sand);
                        float ring = smoothstep(0.34, 0.5, sand);
                        rough = mix(rough, 0.62, scuff); clear *= 1.0 - scuff;
                        alb = mix(alb, vec3(0.56, 0.56, 0.55), ring * 0.85); metal = mix(metal, 0.0, ring);
                        alb = mix(alb, vec3(0.60, 0.62, 0.65) * (0.85 + 0.25 * swirl), bare); metal = mix(metal, 1.0, bare); rough = mix(rough, 0.42, bare);

                        alb = mix(alb, vec3(0.80, 0.72, 0.62) * (0.94 + 0.1 * noise(p * 1.8)), fil);
                        metal = mix(metal, 0.0, fil); rough = mix(rough, 0.8, fil);

                        alb = mix(alb, vec3(0.36, 0.37, 0.38), pr); metal = mix(metal, 0.0, pr); rough = mix(rough, mix(0.66, 0.2, wet), pr);
                        alb = mix(alb, paint, bs); metal = mix(metal, 0.3, bs); rough = mix(rough, mix(0.4, 0.14, wet), bs);
                        float newClear = uClearDoor * bs * onDoor;
                        clear = max(clear * (1.0 - max(pr, bs) * onDoor), newClear);
                        float cr = mix(0.02, mix(uClearRough, 0.016, pol), newClear);

                        // The pinstripe filled back in across the repainted door
                        float newS = lines * onDoor * step(p.x, uStripeX);
                        alb = mix(alb, vec3(0.86, 0.66, 0.30), newS); metal = mix(metal, 0.6, newS); clear = max(clear, newS * uClearDoor);

                        bc = shade(N, alb, metal, rough, clear, cr, lit);

                        vec2 fc = floor(p / 0.5);
                        float h1 = hash(fc), h2 = hash(fc + 3.1), h3 = hash(fc + 9.7);
                        vec3 fN = normalize(N + vec3(h1 - 0.5, h2 - 0.5, 0.0) * 1.2);
                        vec3 fR = vec3(2.0 * fN.z * fN.x, 2.0 * fN.z * fN.y, 2.0 * fN.z * fN.z - 1.0);
                        float paintK = clamp((1.0 - ring) * (1.0 - fil) * (1.0 - pr) + bs, 0.0, 1.0);
                        bc += env(fR, 0.04) * 0.01 * step(0.74, h3) * paintK * (uCarCol * 1.2 + 0.2) * smoothstep(3.0, 6.0, uView.x);

                        // Chrome: wheel-opening moldings, rocker molding, flush handle
                        float wm = (1.0 - smoothstep(1.4 - aa, 1.4 + aa, abs(archR - 85.6))) * step(p.y, ac.y + 40.0);
                        float rk = (1.0 - smoothstep(1.5 - aa, 1.5 + aa, abs(p.y - (bot - 7.0)))) * step(386.0, p.x) * step(p.x, 854.0);
                        float hm = 1.0 - smoothstep(-aa, aa, sdBox(p - vec2(748.0, 512.0), vec2(14.0, 2.6), 2.0));
                        bc *= 1.0 - 0.5 * (1.0 - smoothstep(-1.0, 1.5, sdBox(p - vec2(748.0, 514.0), vec2(15.0, 4.0), 3.0)));
                        bc = mix(bc, chrome(normalize(vec3(normalize(p - ac) * 0.6, 1.0)), lit), wm);
                        bc = mix(bc, chrome(normalize(vec3(0.0, (p.y - (bot - 7.0)) * 0.6, 1.0)), lit), rk);
                        bc = mix(bc, chrome(normalize(vec3(0.0, clamp((p.y - 512.0) / 3.0, -1.0, 1.0) * 0.8, 1.0)), lit), hm);
                        float fm = 1.0 - smoothstep(-aa, aa, sdBox(p - vec2(150.0, 548.0), vec2(10.0, 3.2), 2.5));
                        float rm = 1.0 - smoothstep(-aa, aa, sdBox(p - vec2(1190.0, 540.0), vec2(9.0, 3.0), 2.5));
                        bc = mix(bc, shade(N, vec3(0.9, 0.42, 0.04), 0.0, 0.1, 1.0, 0.02, lit) + vec3(0.05, 0.02, 0.0), fm);
                        bc = mix(bc, shade(N, vec3(0.75, 0.04, 0.04), 0.0, 0.1, 1.0, 0.02, lit) + vec3(0.04, 0.0, 0.0), rm);

                        // Soft occlusion: shut lines, under the belt seal, near arches and the rocker
                        bc *= 0.15 + 0.85 * smoothstep(0.4, 1.3, gap);
                        bc *= mix(0.6, 1.0, smoothstep(0.0, 4.0, p.y - top));
                        bc *= mix(0.5, 1.0, smoothstep(0.0, 22.0, archR - 84.0));
                    }
                    // Bullet mirror
                    vec2 mq = (p - vec2(510.0, 478.0)) / vec2(13.0, 6.5);
                    float mir = 1.0 - smoothstep(1.0 - aa / 6.0, 1.0 + aa / 6.0, length(mq));
                    float stalk = 1.0 - smoothstep(-aa, aa, sdBox(p - vec2(516.0, 485.0), vec2(2.2, 5.0), 1.0));
                    bc = mix(bc, chrome(normalize(vec3(mq * 0.8, 1.0)), lit), max(mir, stalk));
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
                scene: program(SCENE_FRAG, ['uRes', 'uView', 'uTime', 'uSand', 'uFiller', 'uPrime', 'uBase', 'uWet', 'uPolish', 'uDent', 'uImpact', 'uCarCol', 'uScratch', 'uClearDoor', 'uClearRough', 'uPeel', 'uEnvShift', 'uExposure', 'uStripeX', 'uBars']),
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
            const c = mk(REGION.w * REGION.k, REGION.h * REGION.k);
            const g = c.getContext('2d');
            g.setTransform(REGION.k, 0, 0, REGION.k, -REGION.x * REGION.k, -REGION.y * REGION.k);
            maps[k] = { c, g, tex: makeTex(), dirty: true };
        });
        const upload = (m) => {
            gl.bindTexture(gl.TEXTURE_2D, m.tex);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, m.c);
            m.dirty = false;
        };

        const paper = (() => {
            const c = mk(128, 128);
            const g = c.getContext('2d');
            g.fillStyle = '#e8e1d2';
            g.fillRect(0, 0, 128, 128);
            for (let i = 0; i < 900; i++) {
                g.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '120,105,80'},${Math.random() * 0.05})`;
                g.fillRect(Math.random() * 128, Math.random() * 128, 1, 1);
            }
            return f2.createPattern(c, 'repeat');
        })();

        let RT = null;
        const st = {
            t: 0, last: 0, playing: !reduceMotion, visible: false, raf: 0, stage: -1,
            cam: { x: 662, y: 530, z: 1, vx: 0, vy: 0, vz: 0 }, shake: 0,
            view: { base: 1, s: 1, ox: 0, oy: 0 }, dpr: 1,
            particles: [], mist: [], strikes: 0, impact: { x: 0, y: 0, t: -1e9, k: 0 },
            car: cssPaint(),
        };

        function resize() {
            const r = glCanvas.getBoundingClientRect();
            if (!r.width) return;
            const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
            let W = Math.round(r.width * dpr), H = Math.round(r.height * dpr);
            const cap = 1.15e6;
            if (W * H > cap) { const k = Math.sqrt(cap / (W * H)); W = Math.round(W * k); H = Math.round(H * k); }
            glCanvas.width = W; glCanvas.height = H;
            fx.width = W; fx.height = H;
            st.dpr = W / r.width;
            // The whole car (about 1200 scene px long) fits the frame at z = 1.
            st.view.base = Math.min(W / 1240, H / 430);
            RT = { scene: target(W, H), a: target(Math.ceil(W / 4), Math.ceil(H / 4)), b: target(Math.ceil(W / 4), Math.ceil(H / 4)) };
            render();
        }

        // ---- Painting into the repair maps ----
        const doorClip = (g) => { g.beginPath(); g.rect(DOOR.x0 + 0.8, topY(DOOR.x0) + 2, DOOR.x1 - DOOR.x0 - 1.6, DOOR.y1 - topY(DOOR.x0) - 2); g.clip(); };
        function droplets(m, x, y, radius, n, alpha, clip) {
            const g = m.g;
            g.save();
            if (clip) clip(g);
            for (let i = 0; i < n; i++) {
                g.fillStyle = `rgba(255,255,255,${alpha[0] + Math.random() * (alpha[1] - alpha[0])})`;
                g.beginPath();
                g.arc(x + gauss() * radius * 0.42, y + gauss() * radius * 0.42, 0.7 + Math.random() * 1.5, 0, Math.PI * 2);
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

        const REPAIR = { x0: DENT.x - 40, x1: DENT.x + 40, y0: DENT.y - 18, y1: DENT.y + 20 };
        const DOORBOX = { x0: DOOR.x0 + 8, x1: DOOR.x1 - 8, y0: topY(DOOR.x0) + 4, y1: DOOR.y1 - 6 };
        const COATS = {
            // Primer is reverse-masked: a soft-edged patch over the repair only.
            prime: { map: 'prime', path: primerPath, r: 34, a: 0.035, rgb: () => [150, 152, 158], clip: null },
            color: { map: 'base', box: DOORBOX, passes: 6, r: 30, a: 0.1, rgb: () => st.car.map((v) => v * 255), clip: doorClip },
        };
        const SPRAY_END = 0.86;
        // Spot priming: tight overlapping orbits, widening then closing in, so the
        // patch is densest over the repair and feathers to nothing at its edge.
        function primerPath(q) {
            const a = q * Math.PI * 2 * 4.5;
            const r = 30 * Math.sin(Math.PI * clamp(q)) + 6;
            return { x: DENT.x + Math.cos(a) * r * 1.45, y: DENT.y + Math.sin(a) * r * 0.8, dir: Math.cos(a) > 0 ? 1 : -1, on: true };
        }
        const coatPos = (coat, q) => (coat.path ? coat.path(q) : gunPath(q, coat.box, coat.passes));
        const PRIME_START = 0.28;

        // Finish a coat: complete the remaining passes in one go, so it stays
        // exactly the shape the gun was making.
        function solidCoat(key) {
            if (key === 'color') {
                // Color covers the whole door, edge to edge, inside its masking.
                const g = maps.base.g;
                g.save(); doorClip(g); g.fillStyle = '#fff'; g.fillRect(REGION.x, REGION.y, REGION.w, REGION.h); g.restore();
                maps.base.dirty = true;
                return;
            }
            sprayInterval(key, PRIME_START, 1, false);
            sprayInterval(key, PRIME_START, 1, false);
        }
        const coatP = (key, p) => (key === 'prime' ? span(p, PRIME_START, 1) : p);
        // Each step of a pass lays a soft, even film; overlapping passes build
        // a smooth coat with a feathered edge, the way a gun really lays paint.
        function sprayInterval(key, p0, p1, live) {
            const coat = COATS[key];
            p0 = coatP(key, p0); p1 = coatP(key, p1);
            const steps = Math.max(1, Math.ceil((p1 - p0) * 500));
            for (let i = 1; i <= steps; i++) {
                const p = lerp(p0, p1, i / steps);
                if (p > SPRAY_END || p <= 0) continue;
                const g = coatPos(coat, p / SPRAY_END);
                if (!g.on) continue;
                stamp(maps[coat.map], g.x, g.y, coat.r, coat.a, coat.clip);
                stamp(maps.wet, g.x, g.y, coat.r, 0.07, coat.clip);
                if (live && i === steps) emitSpray(g, coat.rgb());
            }
        }
        function stamp(m, x, y, r, a, clip) {
            const g = m.g;
            g.save();
            if (clip) clip(g);
            const rg = g.createRadialGradient(x, y, 0, x, y, r);
            rg.addColorStop(0, `rgba(255,255,255,${a})`);
            rg.addColorStop(0.55, `rgba(255,255,255,${a * 0.7})`);
            rg.addColorStop(1, 'rgba(255,255,255,0)');
            g.fillStyle = rg;
            g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
            g.restore();
            m.dirty = true;
        }

        const sanderAt = (q, wide) => {
            const a = q * Math.PI * 2 * (wide ? 5 : 7);
            const rx = wide ? 30 : 18, ry = wide ? 18 : 11;
            return { x: DENT.x + Math.cos(a) * rx + Math.sin(q * 9) * 6, y: DENT.y + Math.sin(a) * ry + Math.cos(q * 7) * 3 };
        };
        function sandTo(p0, p1) {
            const steps = Math.max(1, Math.ceil((p1 - p0) * 300));
            for (let k = 1; k <= steps; k++) {
                const q = span(lerp(p0, p1, k / steps), 0.06, 0.92);
                if (q <= 0 || q >= 1) continue;
                const s = sanderAt(q, false);
                blob(maps.sand, s.x, s.y, 31, 0.05);
            }
        }
        function fillTo(p0, p1) {
            const steps = Math.max(1, Math.ceil((p1 - p0) * 200));
            for (let k = 1; k <= steps; k++) {
                const p = lerp(p0, p1, k / steps);
                if (p < 0.36) {
                    if (p < 0.04) continue;
                    const x = DENT.x - 34 + 68 * outCubic(span(p, 0.04, 0.34));
                    for (let j = -3; j <= 3; j++) blob(maps.filler, x, DENT.y + j * 5, 20, 0.22);
                } else if (p < 0.94) {
                    const s = sanderAt(span(p, 0.36, 0.94), true);
                    const g = maps.filler.g;
                    g.save();
                    g.globalCompositeOperation = 'destination-out';
                    const rg = g.createRadialGradient(s.x, s.y, 4, s.x, s.y, 26);
                    rg.addColorStop(0, 'rgba(0,0,0,0)');
                    rg.addColorStop(1, 'rgba(0,0,0,0.05)');
                    g.fillStyle = rg;
                    g.beginPath(); g.arc(s.x, s.y, 26, 0, Math.PI * 2); g.fill();
                    g.restore();
                    maps.filler.dirty = true;
                }
            }
        }
        const buffer = (p) => {
            const q = span(p, 0.0, 0.28);
            return { q, x: lerp(DOOR.x0 + 24, DOOR.x1 - 24, inOut(q)), y: 562 + Math.sin(q * Math.PI * 4) * 36 };
        };
        function polishTo(p0, p1) {
            const steps = Math.max(1, Math.ceil((p1 - p0) * 200));
            for (let k = 1; k <= steps; k++) {
                const b = buffer(lerp(p0, p1, k / steps));
                if (b.q <= 0 || b.q >= 1) continue;
                blob(maps.polish, b.x, b.y, 40, 0.18);
            }
        }

        const stripeProgress = (p) => inOut(span(p, 0.05, 0.9));

        // ---- Particles ----
        function sparks(x, y, k) {
            for (let i = 0; i < 50 * k; i++) {
                const a = -Math.PI / 2 + gauss() * 1.1, v = 1.5 + Math.random() * 5;
                st.particles.push({ kind: 'spark', x, y, vx: Math.cos(a) * v + 0.6, vy: Math.sin(a) * v, life: 0, max: 260 + Math.random() * 520, w: 0.4 + Math.random() * 0.6 });
            }
            st.particles.push({ kind: 'flash', x, y, life: 0, max: 130 });
            st.shake = 6 * k;
        }
        function dust(x, y, n, spread = 18) {
            for (let i = 0; i < n; i++) {
                const a = Math.random() * Math.PI * 2, v = 0.2 + Math.random() * 0.8;
                st.particles.push({ kind: 'dust', x: x + Math.cos(a) * spread * 0.6, y: y + Math.sin(a) * spread * 0.4, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.6 - 0.05, life: 0, max: 1000 + Math.random() * 1400, r: 0.3 + Math.random() * 0.8 });
            }
        }
        function emitSpray(g, rgb) {
            const nx = g.x + 74 * TS, ny = g.y - 128 * TS;
            for (let i = 0; i < 14; i++) {
                const tx = g.x + gauss() * 9, ty = g.y + gauss() * 5;
                const T = 100 + Math.random() * 70;
                st.particles.push({ kind: 'drop', x: nx + gauss(), y: ny + gauss(), vx: (tx - nx) / (T / 16.7), vy: (ty - ny) / (T / 16.7), life: 0, max: T, rgb });
            }
            if (Math.random() < 0.6) st.mist.push({ x: g.x + gauss() * 14, y: g.y + gauss() * 9, vx: gauss() * 0.12 - g.dir * 0.1, vy: -0.1 - Math.random() * 0.15, r: 14 + Math.random() * 20, life: 0, max: 2000 + Math.random() * 1600, rgb });
        }
        function stepParticles(dt) {
            const k = dt / 16.7;
            st.particles = st.particles.filter((p) => {
                p.life += dt;
                if (p.kind === 'spark') {
                    p.vy += 0.2 * k; p.vx *= Math.pow(0.99, k);
                    p.x += p.vx * k; p.y += p.vy * k;
                    if (p.y > FLOOR) { p.y = FLOOR; p.vy *= -0.3; p.vx *= 0.7; }
                } else if (p.kind !== 'flash') {
                    p.x += p.vx * k; p.y += p.vy * k;
                    if (p.kind === 'dust') { p.vx *= 0.985; p.vy = p.vy * 0.985 + 0.005; }
                }
                return p.life < p.max;
            });
            st.mist = st.mist.filter((m) => { m.life += dt; m.x += m.vx * k; m.y += m.vy * k; m.r += 0.06 * k; return m.life < m.max; });
            if (st.mist.length > 70) st.mist.splice(0, st.mist.length - 70);
            if (st.particles.length > 1000) st.particles.splice(0, st.particles.length - 1000);
        }

        // ---- Timeline ----
        const stageAt = (t) => { let i = 0; while (i < STAGES.length - 1 && t >= STARTS[i + 1]) i++; return i; };
        const local = (t) => { const i = stageAt(t); return { i, key: STAGES[i].key, p: clamp((t - STARTS[i]) / STAGES[i].dur) }; };
        // Hammer-and-dolly work: lots of light taps walking around the dent.
        const TAPS = Array.from({ length: 11 }, (_, n) => {
            const a = n * 2.4;
            return { at: 0.2 + n * 0.058, dx: Math.cos(a) * 9 * (1 - n / 11), dy: Math.sin(a) * 4 * (1 - n / 11) };
        });
        const STRIKES = TAPS.map((x) => x.at);

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
            st.strikes = i > IDX.straighten ? TAPS.length : i === IDX.straighten ? STRIKES.filter((s) => p > s).length : 0;
        }

        function advance(t0, t1, dt) {
            const { i, key, p } = local(t1);
            const p0 = clamp((t0 - STARTS[i]) / STAGES[i].dur);
            if (i !== st.stage) {
                if (st.stage === -1 || i < st.stage || i === 0) settle(t1);
                st.stage = i;
                onStage(i);
            }
            if (key === 'straighten') {
                TAPS.forEach((tap, n) => {
                    if (p0 < tap.at && p >= tap.at) {
                        st.strikes = n + 1;
                        st.impact = { x: DENT.x + tap.dx, y: DENT.y + tap.dy, t: t1, k: 0.35 };
                        st.shake = 0.9;
                    }
                });
            }
            if (key === 'sand') {
                sandTo(p0, p);
                const q = span(p, 0.06, 0.92);
                if (q > 0 && q < 1) { const s = sanderAt(q, false); dust(s.x, s.y, 3, 30); }
            }
            if (key === 'fill') {
                fillTo(p0, p);
                if (p > 0.36 && p < 0.94) { const s = sanderAt(span(p, 0.36, 0.94), true); dust(s.x, s.y, 2, 26); }
            }
            if (COATS[key]) sprayInterval(key, p0, p, true);
            if (key === 'clear' && p < 0.62) {
                const g = gunPath(p / 0.62, DOORBOX, 5);
                if (g.on) { stamp(maps.wet, g.x, g.y, 26, 0.09, doorClip); emitSpray(g, [235, 240, 248]); }
            }
            if (key === 'reveal') {
                polishTo(p0, p);
                const b = buffer(p);
                if (b.q > 0 && b.q < 1 && Math.random() < 0.4) dust(b.x, b.y, 1, 30);
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

        const hud = root.querySelector('.booth-hud');
        let hudTimer = 0;
        function onStage(i) {
            // Captions crossfade instead of snapping.
            const write = () => {
                if (hudNo) hudNo.textContent = String(i + 1).padStart(2, '0');
                if (hudName) hudName.textContent = STAGES[i].label;
                if (hudCaption) hudCaption.textContent = STAGES[i].caption;
                hud?.classList.remove('is-swapping');
            };
            clearTimeout(hudTimer);
            if (hud && st.playing) { hud.classList.add('is-swapping'); hudTimer = setTimeout(write, 280); } else write();
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
                dent: i === 0 ? 1 : i === 1 ? 1 - st.strikes / TAPS.length * 0.97 : 0.03 * (1 - span(p, 0, 0.2)) * (i === 2 ? 1 : 0),
                scratch: i <= IDX.straighten ? 1 : i === IDX.sand ? 1 - span(p, 0.1, 0.5) : 0,
                clearDoor: key === 'clear' ? sstep(0, 0.6, p) : i > IDX.clear ? 1 : 0,
                clearRough: key === 'clear' ? lerp(0.05, 0.03, sstep(0.3, 1, p)) : 0.03,
                peel: i >= IDX.color ? (i === IDX.reveal ? lerp(0.03, 0.02, p) : 0.03) : 0,
                envShift: key === 'reveal' ? lerp(Math.sin(t / 5200) * 0.05, lerp(-0.75, 0.6, inOut(span(p, 0.3, 0.95))), sstep(0.0, 0.3, p)) : Math.sin(t / 5200) * 0.05,
                exposure: key === 'reveal' ? lerp(1.0, 1.04, sstep(0.2, 0.6, p)) : 1.0,
                impact: [st.impact.x, st.impact.y, key === 'straighten' && age >= 0 ? age : -1, st.impact.k],
                // Before the stripe stage the old line is intact; the door's new
                // paint covers it, and the new line is laid back over everything.
                stripeX: key === 'stripe' ? lerp(STRIPE_X0, STRIPE_X1, stripeProgress(p)) : i > IDX.stripe ? 9999 : -1,
            };
        }

        // One continuous camera move through the whole film: a Catmull-Rom
        // spline through framing keys, so it never stops and starts per step.
        const D = STAGES.map((x) => x.dur);
        const at = (i, f) => STARTS[i] + D[i] * f;
        const CAM_KEYS = [
            [0, 662, 530, 1.0],
            [at(0, 0.36), 662, 530, 1.0],
            [at(1, 0.02), 634, 512, 3.3],
            [at(1, 0.6), 630, 510, 3.55],
            [at(2, 0.5), 632, 512, 3.4],
            [at(3, 0.6), 630, 512, 3.2],
            [at(4, 0.12), 632, 556, 2.0],
            [at(4, 0.6), 630, 516, 2.85],
            [at(5, 0.3), 630, 562, 2.0],
            [at(6, 0.6), 632, 560, 1.9],
            [at(7, 0.08), 548, 506, 3.2],
            [at(7, 0.9), 716, 506, 3.2],
            [at(8, 0.22), 640, 556, 2.1],
            [at(8, 0.8), 662, 530, 1.0],
            [TOTAL, 662, 530, 1.0],
        ];
        function cameraTarget(t) {
            let i = 0;
            while (i < CAM_KEYS.length - 2 && t > CAM_KEYS[i + 1][0]) i++;
            const k0 = CAM_KEYS[Math.max(0, i - 1)], k1 = CAM_KEYS[i], k2 = CAM_KEYS[i + 1], k3 = CAM_KEYS[Math.min(CAM_KEYS.length - 1, i + 2)];
            const h = Math.max(1, k2[0] - k1[0]);
            const u = clamp((t - k1[0]) / h);
            // Tangents measured per millisecond, so speed carries smoothly across
            // keys of different lengths (no lurch at a framing point).
            const tan = (a, b, n) => (b[n] - a[n]) / Math.max(1, b[0] - a[0]);
            const h00 = 2 * u * u * u - 3 * u * u + 1, h10 = u * u * u - 2 * u * u + u, h01 = -2 * u * u * u + 3 * u * u, h11 = u * u * u - u * u;
            const herm = (n) => h00 * k1[n] + h10 * h * tan(k0, k2, n) * (k0 === k1 ? 0 : 1) + h01 * k2[n] + h11 * h * tan(k1, k3, n) * (k2 === k3 ? 0 : 1);
            const cam = { x: herm(1), y: herm(2), z: herm(3) };
            // While striping, ride along with the brush.
            const { key, p } = local(t);
            if (key === 'stripe') {
                const w = sstep(0.04, 0.14, p) * (1 - sstep(0.86, 0.96, p));
                cam.x = lerp(cam.x, clamp(lerp(STRIPE_X0, STRIPE_X1, stripeProgress(p)), 548, 716), w);
            }
            return cam;
        }

        // The painter keeps the gun in hand from primer through color to clear:
        // between coats it travels to the next pass and the cup changes color.
        function gunState(t) {
            const { key, p } = local(t);
            const grey = [150, 152, 158], clearC = [235, 240, 248];
            const carC = st.car.map((v) => v * 255);
            const mixC = (a, b, k) => a.map((v, n) => lerp(v, b[n], k));
            const off = (g) => ({ x: g.x + 170, y: g.y - 130, dir: g.dir });
            const between = (a, b, k) => ({ x: lerp(a.x, b.x, inOut(k)), y: lerp(a.y, b.y, inOut(k)) - Math.sin(Math.PI * k) * 18, dir: k < 0.5 ? a.dir : b.dir });
            const P0 = primerPath(0), P1 = primerPath(1);
            const C0 = gunPath(0, COATS.color.box, COATS.color.passes), C1 = gunPath(1, COATS.color.box, COATS.color.passes);
            const L0 = gunPath(0, DOORBOX, 5), L1 = gunPath(1, DOORBOX, 5);
            if (key === 'prime') {
                const cp = coatP(key, p);
                if (p < PRIME_START - 0.12) return null;
                if (cp <= 0) return { g: between(off(P0), P0, span(p, PRIME_START - 0.12, PRIME_START)), rgb: grey, spraying: false };
                if (cp < SPRAY_END) return { g: primerPath(cp / SPRAY_END), rgb: grey, spraying: true };
                const k = span(cp, SPRAY_END, 1);
                return { g: between(P1, C0, k), rgb: mixC(grey, carC, sstep(0.3, 0.7, k)), spraying: false };
            }
            if (key === 'color') {
                if (p < SPRAY_END) return { g: gunPath(p / SPRAY_END, COATS.color.box, COATS.color.passes), rgb: carC, spraying: true };
                const k = span(p, SPRAY_END, 1);
                return { g: between(C1, L0, k), rgb: mixC(carC, clearC, sstep(0.3, 0.7, k)), spraying: false };
            }
            if (key === 'clear') {
                if (p < 0.62) return { g: gunPath(p / 0.62, DOORBOX, 5), rgb: clearC, spraying: true };
                if (p < 0.74) return { g: between(L1, off(L1), span(p, 0.62, 0.74)), rgb: clearC, spraying: false };
            }
            return null;
        }

        // ---- 2D layer: tools at real-world size, with contact shadows ----
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
        // Draw a tool in its own full-size units, scaled down around an anchor.
        const tool = (c, x, y, fn) => { c.save(); c.translate(x, y); c.scale(TS, TS); fn(); c.restore(); };

        // A real body hammer: forged head (long tapered neck, round face, pick),
        // hickory handle with grain, a wedge in the eye, a swelled grip.
        // lift: 0 at impact, 1 fully raised. Raised means closer to the camera,
        // so it reads a touch larger and throws a softer, farther shadow.
        function drawHammer(c, lift, blur, enter, ox = 0, oy = 0) {
            // Swung from the lower right: the handle runs down-right from the head,
            // the face comes down onto the dent, raising rolls the head back.
            const ang0 = 0.62;
            const ang = ang0 + lift * 0.6;
            const sc = TS * (1 + lift * 0.16);
            const face = [-236, 54];                                    // face center, tool units
            const r0 = [Math.cos(ang0) * face[0] - Math.sin(ang0) * face[1], Math.sin(ang0) * face[0] + Math.cos(ang0) * face[1]];
            const px = DENT.x + ox - r0[0] * TS + enter * 120, py = DENT.y + oy - r0[1] * TS + enter * 90;
            const fw = [Math.cos(ang) * face[0] - Math.sin(ang) * face[1], Math.sin(ang) * face[0] + Math.cos(ang) * face[1]];
            const hx = px + fw[0] * sc, hy = py + fw[1] * sc;
            contact(c, hx + 2 + lift * 14, hy + 3 + lift * 12, 10 + lift * 14, 5 + lift * 8, 0.42 * (1 - lift * 0.55) * (1 - enter));

            const one = (a, alpha) => {
                c.save();
                c.globalAlpha = alpha;
                c.translate(px, py);
                c.rotate(a);
                c.scale(sc, sc);
                // Handle: tapered hickory, swelling into the grip, with grain
                const hg = c.createLinearGradient(0, -9, 0, 9);
                hg.addColorStop(0, '#e2bb84'); hg.addColorStop(0.35, '#c8955a'); hg.addColorStop(0.7, '#9c6a37'); hg.addColorStop(1, '#5e3c1c');
                c.fillStyle = hg;
                c.beginPath();
                c.moveTo(-226, -6); c.bezierCurveTo(-150, -6.5, -60, -7, -10, -8.5);
                c.bezierCurveTo(20, -9.5, 40, -9, 48, -6); c.quadraticCurveTo(54, 0, 48, 6);
                c.bezierCurveTo(40, 9, 20, 9.5, -10, 8.5); c.bezierCurveTo(-60, 7, -150, 6.5, -226, 6); c.closePath(); c.fill();
                c.strokeStyle = 'rgba(90,55,25,0.35)'; c.lineWidth = 0.7;
                for (let k = 0; k < 5; k++) {
                    const o = -4 + k * 2;
                    c.beginPath(); c.moveTo(-224, o * 0.9); c.bezierCurveTo(-140, o * 1.1 + 0.8, -60, o * 0.8 - 0.6, 44, o * 1.15); c.stroke();
                }
                c.fillStyle = 'rgba(255,240,215,0.28)'; c.fillRect(-222, -5, 250, 1.1);
                // Head: neck (cylindrical shading), face disc, pick
                const neck = c.createLinearGradient(-250, 0, -222, 0);
                neck.addColorStop(0, '#3e434a'); neck.addColorStop(0.28, '#a9b0b8'); neck.addColorStop(0.45, '#f3f6f9'); neck.addColorStop(0.62, '#8e959e'); neck.addColorStop(1, '#3a3f45');
                c.fillStyle = neck;
                c.beginPath();
                c.moveTo(-246, -14); c.lineTo(-226, -14); c.lineTo(-224, 18);
                c.quadraticCurveTo(-222, 34, -219, 44); c.lineTo(-253, 44); c.quadraticCurveTo(-250, 34, -248, 18); c.closePath(); c.fill();
                // Face: a short drum ending in a slightly crowned striking face
                c.beginPath(); c.moveTo(-254, 42); c.lineTo(-218, 42); c.lineTo(-218, 52); c.lineTo(-254, 52); c.closePath(); c.fill();
                const fg = c.createRadialGradient(-240, 52, 2, -236, 54, 19);
                fg.addColorStop(0, '#ffffff'); fg.addColorStop(0.5, '#c9cfd6'); fg.addColorStop(1, '#5d636b');
                c.fillStyle = fg;
                c.beginPath(); c.ellipse(-236, 53, 18, 5, 0, 0, Math.PI * 2); c.fill();
                c.strokeStyle = 'rgba(30,32,36,0.6)'; c.lineWidth = 1;
                c.beginPath(); c.ellipse(-236, 53, 18, 5, 0, 0, Math.PI * 2); c.stroke();
                // Pick: a tapered blade
                c.fillStyle = neck;
                c.beginPath(); c.moveTo(-246, -14); c.quadraticCurveTo(-242, -46, -237, -70); c.lineTo(-234, -70); c.quadraticCurveTo(-229, -46, -226, -14); c.closePath(); c.fill();
                // Eye with the handle's end grain and steel wedge
                c.fillStyle = '#7a5129'; c.fillRect(-243, -12, 14, 6);
                c.fillStyle = '#c3c8ce'; c.fillRect(-237, -12, 2, 6);
                c.strokeStyle = 'rgba(255,255,255,0.55)'; c.lineWidth = 0.8;
                c.beginPath(); c.moveTo(-237, -66); c.lineTo(-240, -16); c.moveTo(-239, 20); c.lineTo(-240, 42); c.stroke();
                c.restore();
            };
            if (blur > 0) for (let k = 4; k >= 1; k--) one(ang + k * 0.05 * blur, 0.07);
            one(ang, 1);
        }

        // A dual-action sander, seen from behind as it works the panel:
        // hook-and-loop disc spinning under the pad, rubber-overmolded body,
        // palm cap, side throttle lever, exhaust port and ribbed hose.
        function drawSander(c, x, y, t, running) {
            const jx = running ? (Math.random() - 0.5) * 0.5 : 0, jy = running ? (Math.random() - 0.5) * 0.5 : 0;
            contact(c, x + 4, y + 5, 38, 30, 0.42);
            tool(c, x + jx, y + jy, () => {
                const spin = t / 9;
                // Disc and backing pad
                c.fillStyle = '#121214';
                c.beginPath(); c.arc(0, 0, 76, 0, Math.PI * 2); c.fill();
                const disc = c.createRadialGradient(0, 0, 40, 0, 0, 74);
                disc.addColorStop(0, '#9c8f73'); disc.addColorStop(0.8, '#c3b593'); disc.addColorStop(1, '#8a7e64');
                c.fillStyle = disc;
                c.beginPath(); c.arc(0, 0, 73, 0, Math.PI * 2); c.fill();
                // Dust-extraction holes smear into rings when it spins
                c.strokeStyle = running ? 'rgba(60,52,40,0.35)' : 'rgba(40,34,26,0.8)';
                c.lineWidth = running ? 3 : 1;
                if (running) { c.beginPath(); c.arc(0, 0, 62, 0, Math.PI * 2); c.stroke(); c.beginPath(); c.arc(0, 0, 48, 0, Math.PI * 2); c.stroke(); }
                else for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; c.beginPath(); c.arc(Math.cos(a) * 60, Math.sin(a) * 60, 3, 0, Math.PI * 2); c.stroke(); }
                c.strokeStyle = 'rgba(255,248,230,0.35)'; c.lineWidth = 1.5;
                for (let k = 0; k < 4; k++) { c.beginPath(); c.arc(0, 0, 70, spin + k * 1.57, spin + k * 1.57 + 0.5); c.stroke(); }
                // Exhaust port and ribbed hose, out the back
                const port = c.createLinearGradient(30, 30, 50, 10);
                port.addColorStop(0, '#26272c'); port.addColorStop(0.5, '#4a4b53'); port.addColorStop(1, '#1b1b1f');
                c.save(); c.rotate(0.72);
                c.fillStyle = port; c.beginPath(); c.roundRect(40, -14, 70, 28, 8); c.fill();
                c.restore();
                c.strokeStyle = '#18181b'; c.lineWidth = 22; c.lineCap = 'round';
                c.beginPath(); c.moveTo(78, 80); c.bezierCurveTo(130, 150, 220, 140, 330, 260); c.stroke();
                c.strokeStyle = 'rgba(255,255,255,0.08)'; c.lineWidth = 22; c.setLineDash([3, 5]);
                c.beginPath(); c.moveTo(78, 80); c.bezierCurveTo(130, 150, 220, 140, 330, 260); c.stroke();
                c.setLineDash([]);
                // Body: overmolded housing with grip ribs
                const body = c.createRadialGradient(-16, -20, 8, 0, 0, 58);
                body.addColorStop(0, '#4b4d55'); body.addColorStop(0.65, '#25262b'); body.addColorStop(1, '#141417');
                c.fillStyle = body; c.beginPath(); c.arc(0, -2, 56, 0, Math.PI * 2); c.fill();
                c.strokeStyle = 'rgba(0,0,0,0.55)'; c.lineWidth = 2;
                for (let k = 0; k < 28; k++) { const a = k / 28 * Math.PI * 2; c.beginPath(); c.moveTo(Math.cos(a) * 44, -2 + Math.sin(a) * 44); c.lineTo(Math.cos(a) * 54, -2 + Math.sin(a) * 54); c.stroke(); }
                c.strokeStyle = 'rgba(255,255,255,0.18)'; c.lineWidth = 1.4;
                c.beginPath(); c.arc(0, -2, 55, Math.PI * 1.08, Math.PI * 1.7); c.stroke();
                // Accent ring and palm cap
                c.strokeStyle = '#e3b11f'; c.lineWidth = 3;
                c.beginPath(); c.arc(0, -4, 38, 0, Math.PI * 2); c.stroke();
                const cap = c.createRadialGradient(-10, -16, 3, 0, -4, 36);
                cap.addColorStop(0, '#5a5c64'); cap.addColorStop(1, '#1e1f23');
                c.fillStyle = cap; c.beginPath(); c.arc(0, -4, 35, 0, Math.PI * 2); c.fill();
                c.fillStyle = 'rgba(255,255,255,0.08)';
                for (let r = 0; r < 4; r++) for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 2 + r * 0.3; c.beginPath(); c.arc(Math.cos(a) * (8 + r * 7), -4 + Math.sin(a) * (8 + r * 7), 1.4, 0, Math.PI * 2); c.fill(); }
                // Throttle lever along the left side
                const lev = c.createLinearGradient(-70, 0, -54, 0);
                lev.addColorStop(0, '#6e747c'); lev.addColorStop(0.5, '#e9edf1'); lev.addColorStop(1, '#7c838b');
                c.strokeStyle = lev; c.lineWidth = 7; c.lineCap = 'round';
                c.beginPath(); c.arc(0, -2, 62, Math.PI * 0.72, Math.PI * 1.18); c.stroke();
            });
        }

        function drawSpreader(c, x, y, p) {
            contact(c, x + 3, y + 3, 26, 17, 0.3);
            tool(c, x, y, () => {
                c.rotate(-0.35 + Math.sin(p * 30) * 0.03);
                const g = c.createLinearGradient(-40, 0, 40, 0);
                g.addColorStop(0, 'rgba(236,242,248,0.75)'); g.addColorStop(0.5, 'rgba(255,255,255,0.9)'); g.addColorStop(1, 'rgba(210,220,230,0.7)');
                c.fillStyle = g;
                c.beginPath(); c.moveTo(-60, 0); c.lineTo(60, 0); c.lineTo(40, -64); c.lineTo(-40, -64); c.closePath(); c.fill();
                c.fillStyle = 'rgba(206,186,164,0.95)';
                c.beginPath(); c.moveTo(-58, 0); c.lineTo(58, 0); c.lineTo(52, -9); c.lineTo(-52, -9); c.closePath(); c.fill();
            });
        }

        function drawGun(c, g, rgb, spraying = true) {
            const nx = g.x + 74 * TS, ny = g.y - 128 * TS;
            c.save();
            if (!spraying) c.globalAlpha = 0;
            c.globalCompositeOperation = 'lighter';
            const cone = c.createLinearGradient(nx, ny, g.x, g.y);
            cone.addColorStop(0, `rgba(${rgb[0] | 0},${rgb[1] | 0},${rgb[2] | 0},0.2)`);
            cone.addColorStop(1, `rgba(${rgb[0] | 0},${rgb[1] | 0},${rgb[2] | 0},0.02)`);
            c.fillStyle = cone;
            c.beginPath(); c.moveTo(nx - 1, ny); c.quadraticCurveTo(g.x - 13, g.y - 25, g.x - 26, g.y + 3); c.lineTo(g.x + 24, g.y - 2); c.quadraticCurveTo(g.x + 14, g.y - 30, nx + 1, ny); c.closePath(); c.fill();
            c.restore();
            if (spraying) contact(c, g.x + 3, g.y + 2, 30, 11, 0.12);
            tool(c, nx, ny, () => {
                c.strokeStyle = '#111114'; c.lineWidth = 7; c.lineCap = 'round';
                c.beginPath(); c.moveTo(96, 82); c.bezierCurveTo(130, 210, 300, 140, 440, 290); c.stroke();
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
                c.strokeStyle = steelGrad(c, 20, 0, 60, 0); c.lineWidth = 5;
                c.beginPath(); c.moveTo(24, 8); c.quadraticCurveTo(40, 40, 58, 62); c.stroke();
                c.fillStyle = 'rgba(225,232,240,0.28)';
                c.beginPath(); c.moveTo(30, -14); c.lineTo(22, -82); c.quadraticCurveTo(46, -92, 72, -82); c.lineTo(62, -14); c.closePath(); c.fill();
                c.fillStyle = `rgba(${rgb[0] | 0},${rgb[1] | 0},${rgb[2] | 0},0.9)`;
                c.beginPath(); c.moveTo(31, -16); c.lineTo(26, -54); c.quadraticCurveTo(46, -60, 68, -54); c.lineTo(61, -16); c.closePath(); c.fill();
                c.fillStyle = 'rgba(255,255,255,0.45)'; c.fillRect(31, -78, 2.5, 60);
                c.fillStyle = '#1b1b20'; c.beginPath(); c.roundRect(18, -92, 58, 10, 3); c.fill();
            });
        }

        function drawBrush(c, x, y, slope) {
            contact(c, x - 17, y + 2, 26, 4, 0.25);
            tool(c, x, y, () => {
                c.rotate(-0.08 + Math.atan(slope));
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
            });
            c.fillStyle = 'rgba(255,236,170,0.95)';
            c.beginPath(); c.arc(x, y, 0.8, 0, Math.PI * 2); c.fill();
        }

        function drawBuffer(c, x, y, t) {
            contact(c, x + 3, y + 4, 46, 34, 0.4);
            tool(c, x, y, () => {
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
            });
        }

        function drawMasking(c, k, peel) {
            if (k <= 0 || peel >= 1) return;
            const top = topY(DOOR.x0) + 1;
            const sheets = [
                { x: -300, y: 300, w: DOOR.x0 - 1 + 300, h: 400, from: -1 },
                { x: DOOR.x1 + 1, y: 300, w: 900, h: 400, from: 1 },
                { x: DOOR.x0 - 1, y: 300, w: DOOR.x1 - DOOR.x0 + 2, h: top - 300, from: 0 },
            ];
            sheets.forEach((s) => {
                const slide = (1 - outCubic(k)) * s.from * 200;
                const lift = s.from ? 0 : -(1 - outCubic(k)) * 120;
                const off = peel * (s.from ? s.from * 260 : -160);
                c.save();
                c.globalAlpha = Math.min(1, k * 1.6) * (1 - peel);
                c.translate(slide + (s.from ? off : 0), lift + (s.from ? 0 : off));
                c.fillStyle = paper;
                c.fillRect(s.x, s.y, s.w, s.h);
                const fold = c.createLinearGradient(s.x, 0, s.x + s.w, 0);
                for (let f = 0; f <= 10; f++) fold.addColorStop(f / 10, f % 2 ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)');
                c.fillStyle = fold; c.fillRect(s.x, s.y, s.w, s.h);
                const light = c.createLinearGradient(0, s.y, 0, s.y + s.h);
                light.addColorStop(0, 'rgba(255,255,255,0.06)'); light.addColorStop(1, 'rgba(0,0,0,0.3)');
                c.fillStyle = light; c.fillRect(s.x, s.y, s.w, s.h);
                c.fillStyle = 'rgba(214,190,120,0.96)';
                if (s.from === -1) c.fillRect(s.x + s.w - 6, s.y, 6, s.h);
                if (s.from === 1) c.fillRect(s.x, s.y, 6, s.h);
                if (s.from === 0) c.fillRect(s.x, s.y + s.h - 5, s.w, 5);
                c.restore();
            });
            c.save();
            c.globalAlpha = (1 - peel) * Math.min(1, k * 2) * 0.35;
            const sg = c.createLinearGradient(DOOR.x0, 0, DOOR.x0 + 9, 0);
            sg.addColorStop(0, 'rgba(0,0,0,0.8)'); sg.addColorStop(1, 'rgba(0,0,0,0)');
            c.fillStyle = sg; c.fillRect(DOOR.x0, top, 9, DOOR.y1 + 8 - top);
            c.restore();
        }

        function drawFX(t) {
            const c = f2;
            c.setTransform(1, 0, 0, 1, 0, 0);
            c.clearRect(0, 0, fx.width, fx.height);
            toScreen(c);
            const { i, key, p } = local(t);

            // Masking starts going up while the last of the blocking finishes,
            // and the paper is still coming off as the striper moves in.
            const maskK = key === 'fill' ? 0.4 * span(p, 0.9, 1) : key === 'prime' ? lerp(0.4, 1, span(p, 0, PRIME_START * 0.9)) : (i > IDX.prime && i <= IDX.clear) ? 1 : 0;
            const peel = key === 'clear' ? 0.85 * inCubic(span(p, 0.72, 1)) : key === 'stripe' ? lerp(0.85, 1, span(p, 0, 0.08)) : 0;
            drawMasking(c, Math.max(maskK, key === 'stripe' && p < 0.08 ? 1 : 0), peel);

            for (const m of st.mist) {
                const k = m.life / m.max;
                const a = 0.06 * Math.sin(Math.PI * Math.min(1, k * 1.4)) * (1 - k);
                const rg = c.createRadialGradient(m.x, m.y, 0, m.x, m.y, m.r);
                rg.addColorStop(0, `rgba(${m.rgb[0] | 0},${m.rgb[1] | 0},${m.rgb[2] | 0},${a})`);
                rg.addColorStop(1, `rgba(${m.rgb[0] | 0},${m.rgb[1] | 0},${m.rgb[2] | 0},0)`);
                c.fillStyle = rg; c.beginPath(); c.arc(m.x, m.y, m.r, 0, Math.PI * 2); c.fill();
            }

            if (key === 'straighten') {
                // Light, quick wrist taps: a small rise, a short drop, a tiny bounce.
                const REST = 0.28;
                let lift = REST, blur = 0, tx = TAPS[0].dx, ty = TAPS[0].dy;
                for (let n = 0; n < TAPS.length; n++) {
                    const tap = TAPS[n], d = p - tap.at;
                    if (d > -0.04 && d <= 0) {
                        const q = (d + 0.04) / 0.04;
                        lift = q < 0.5 ? lerp(REST, 0.36, outCubic(q / 0.5)) : lerp(0.36, 0, inCubic((q - 0.5) / 0.5));
                        blur = q > 0.5 ? 0.5 : 0;
                        const prev = TAPS[Math.max(0, n - 1)];
                        tx = lerp(prev.dx, tap.dx, outCubic(q)); ty = lerp(prev.dy, tap.dy, outCubic(q));
                    } else if (d > 0 && d < 0.018) { lift = lerp(0, REST, outBack(d / 0.018)); tx = tap.dx; ty = tap.dy; }
                    else if (d >= 0.018) { tx = tap.dx; ty = tap.dy; }
                }
                const enter = (1 - outCubic(span(p, 0, 0.16))) + inCubic(span(p, 0.86, 1));
                drawHammer(c, lift, blur, enter, tx, ty);
            }
            if (key === 'sand') {
                const q = span(p, 0.06, 0.92);
                const off = (1 - outCubic(span(p, 0, 0.1))) + inCubic(span(p, 0.9, 1));
                const s = sanderAt(Math.max(q, 0.001), false);
                drawSander(c, s.x + off * 140, s.y + off * 100, t, q > 0 && q < 1);
            }
            if (key === 'fill') {
                // The spreader hands off to the sander, overlapping, no cut.
                if (p < 0.42) {
                    const off = (1 - outCubic(span(p, 0, 0.06))) + inCubic(span(p, 0.33, 0.42));
                    drawSpreader(c, DENT.x - 34 + 68 * outCubic(span(p, 0.04, 0.34)) + off * 110, DENT.y + 17 + off * 80, p);
                }
                if (p > 0.32) {
                    const off = (1 - outCubic(span(p, 0.32, 0.42))) + inCubic(span(p, 0.92, 1));
                    const s = sanderAt(span(p, 0.36, 0.94), true);
                    drawSander(c, s.x + off * 140, s.y + off * 100, t, p > 0.36 && p < 0.94);
                }
            }
            const gun = gunState(t);
            if (gun) drawGun(c, gun.g, gun.rgb, gun.spraying);
            if (key === 'stripe') {
                const sp = stripeProgress(p);
                const x = lerp(STRIPE_X0, STRIPE_X1, sp);
                const off = (1 - outCubic(span(p, 0, 0.06))) + inCubic(span(p, 0.9, 1));
                if (off < 1) drawBrush(c, x - off * 40, stripeY(x) - off * 70, (stripeY(x + 4) - stripeY(x - 4)) / 8);
            }
            if (key === 'reveal') {
                const b = buffer(p);
                if (b.q > 0 && b.q < 1) {
                    const enter = outCubic(span(b.q, 0, 0.1)), leave = inCubic(span(b.q, 0.9, 1));
                    drawBuffer(c, b.x + (1 - enter) * 130 + leave * 150, b.y + (1 - enter) * 100 + leave * 110, t);
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
                    const rg = c.createRadialGradient(pt.x, pt.y, 0, pt.x, pt.y, 46);
                    rg.addColorStop(0, `rgba(255,244,220,${0.85 * a})`);
                    rg.addColorStop(0.25, `rgba(255,200,140,${0.3 * a})`);
                    rg.addColorStop(1, 'rgba(255,180,120,0)');
                    c.fillStyle = rg; c.beginPath(); c.arc(pt.x, pt.y, 46, 0, Math.PI * 2); c.fill();
                } else if (pt.kind === 'drop') {
                    c.fillStyle = `rgba(${pt.rgb[0] | 0},${pt.rgb[1] | 0},${pt.rgb[2] | 0},${0.35 * (1 - k)})`;
                    c.fillRect(pt.x, pt.y, 0.7, 0.7);
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

            const s = st.view.base * st.cam.z;
            const tt = t / 1000;
            const hand = st.playing ? 1 : 0;
            const sx = st.shake ? gauss() * st.shake : 0, sy = st.shake ? gauss() * st.shake : 0;
            st.view.s = s;
            st.view.ox = W / 2 - (st.cam.x + drift(tt, 1) * 1.2 * hand) * s + sx * st.dpr;
            st.view.oy = H / 2 - (st.cam.y + drift(tt, 5) * 0.8 * hand) * s + sy * st.dpr;

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
            gl.uniform1f(S.u.uStripeX, u.stripeX);
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

        const FRAME = 1000 / 60;
        function frame(now) {
            st.raf = 0;
            const elapsed = st.last ? now - st.last : FRAME;
            const dt = Math.min(66, elapsed);
            st.last = now;
            if (st.playing) {
                const t0 = st.t;
                st.t += dt;
                if (st.t >= TOTAL) { st.t = 0; st.stage = -1; advance(0, 0, dt); }
                else advance(t0, st.t, dt);
            }
            const tg = cameraTarget(st.t);
            const w = 3.6, k = dt / 1000;
            ['x', 'y', 'z'].forEach((a) => {
                const v = 'v' + a;
                st.cam[v] += (w * w * (tg[a] - st.cam[a]) - 2 * w * st.cam[v]) * k;
                st.cam[a] += st.cam[v] * k;
            });
            st.shake *= Math.pow(0.00005, k);
            if (st.shake < 0.2) st.shake = 0;
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
        if (reduceMotion) { jump(IDX.reveal, 0.9); setPlaying(false); }
        else { settle(0); onStage(0); setPlaying(true); }
        root.craft = { jump, setPlaying, get t() { return st.t; } };
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
