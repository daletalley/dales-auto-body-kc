/*
 * The Craft: one tank, dent to show finish, in about 25 seconds.
 *
 * A Canvas 2D film that plays when the section is on screen. A motorcycle
 * tank sits on a stand in a paint booth. The booth lights flicker on, a
 * hammer knocks the dent out with sparks, filler is spread and block-sanded,
 * then primer, metallic base and candy (in whatever Finish the visitor picked
 * in the hero) are sprayed on in real passes. A gold pinstripe is pulled by
 * brush, clear goes on, the buffer brings it to glass, and the light rolls
 * across the finished tank. Then it starts over.
 *
 * Everything is drawn in a 1280x720 virtual scene and scaled to fit.
 * Stage chips under the film jump to any step; reduced motion shows the
 * finished tank until the visitor presses play.
 */
(() => {
    'use strict';

    const VW = 1280, VH = 720, FLOOR = 612;
    const STAGES = [
        { key: 'damage',     label: 'Damage',        caption: 'Bare steel, one ugly dent.',           dur: 2200 },
        { key: 'straighten', label: 'Straighten',    caption: 'Hammer and dolly, back to true.',       dur: 3000 },
        { key: 'fill',       label: 'Fill & block',  caption: 'A skim of filler, blocked flat by hand.', dur: 3400 },
        { key: 'prime',      label: 'Prime',         caption: 'Epoxy primer seals the metal.',         dur: 2500 },
        { key: 'base',       label: 'Base',          caption: 'Metallic base for the candy to glow through.', dur: 2300 },
        { key: 'candy',      label: 'Candy & flake', caption: 'Candy in even passes, deeper every coat.', dur: 3200 },
        { key: 'stripe',     label: 'Pinstripe',     caption: 'Gold line, pulled by hand.',             dur: 3000 },
        { key: 'clear',      label: 'Clear & buff',  caption: 'Clear, cut and buffed to glass.',        dur: 3400 },
        { key: 'reveal',     label: 'Showroom',      caption: 'Showroom ready.',                        dur: 3800 },
    ];
    const STARTS = STAGES.reduce((acc, s, i) => (acc.push(i ? acc[i - 1] + STAGES[i - 1].dur : 0), acc), []);
    const TOTAL = STARTS[STARTS.length - 1] + STAGES[STAGES.length - 1].dur;

    const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
    const lerp = (a, b, t) => a + (b - a) * t;
    const ease = (t) => 1 - Math.pow(1 - clamp(t), 3);
    const easeInOut = (t) => (t = clamp(t), t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
    const span = (p, a, b) => clamp((p - a) / (b - a));

    function gauss() {
        let u = 0, v = 0;
        while (!u) u = Math.random();
        while (!v) v = Math.random();
        return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    }

    // ---- Geometry (scene coordinates) ----------------------------------

    // Classic teardrop tank, side view: tall rounded nose, long flat-ish
    // spine, tapering tail down toward the seat, tunnel cut along the bottom.
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
    // The spine highlight and the bottom weld seam give the tank its volume.
    function spinePath() {
        const p = new Path2D();
        p.moveTo(300, 330);
        p.bezierCurveTo(480, 270, 800, 278, 990, 340);
        return p;
    }
    function seamPath() {
        const p = new Path2D();
        p.moveTo(318, 506);
        p.bezierCurveTo(420, 528, 560, 524, 640, 504);
        p.bezierCurveTo(724, 482, 808, 458, 900, 462);
        p.bezierCurveTo(970, 464, 1030, 452, 1046, 424);
        return p;
    }
    const TANK_BOX = { x: 236, y: 246, w: 846, h: 300 };
    const DENT = { x: 800, y: 384 };
    const CAP = { x: 561, y: 256 };

    // Cubic segments for the pinstripe spear: two lines from one tip.
    const STRIPES = [
        [[318, 452], [450, 384], [650, 336], [850, 334], [930, 336], [1000, 360], [1010, 392], [1016, 420], [985, 432], [965, 412]],
        [[318, 452], [460, 462], [650, 466], [850, 450], [930, 446], [985, 435], [995, 415], [1000, 400], [988, 392], [976, 400]],
    ];
    function sampleStripe(pts) {
        const out = [];
        for (let i = 0; i + 3 < pts.length; i += 3) {
            const [p0, p1, p2, p3] = [pts[i], pts[i + 1], pts[i + 2], pts[i + 3]];
            for (let k = i ? 1 : 0; k <= 40; k++) {
                const t = k / 40, m = 1 - t;
                out.push([
                    m * m * m * p0[0] + 3 * m * m * t * p1[0] + 3 * m * t * t * p2[0] + t * t * t * p3[0],
                    m * m * m * p0[1] + 3 * m * m * t * p1[1] + 3 * m * t * t * p2[1] + t * t * t * p3[1],
                ]);
            }
        }
        return out;
    }
    const STRIPE_PTS = STRIPES.map(sampleStripe);

    // Serpentine spray path over the tank: passes overshoot the ends.
    function gunPoint(p, passes) {
        const pass = Math.min(passes - 1, Math.floor(p * passes));
        const f = easeInOut(p * passes - pass);
        const x0 = TANK_BOX.x - 60, x1 = TANK_BOX.x + TANK_BOX.w + 60;
        const x = pass % 2 ? lerp(x1, x0, f) : lerp(x0, x1, f);
        const y = TANK_BOX.y + 18 + (pass / (passes - 1)) * (TANK_BOX.h - 40);
        return { x, y };
    }

    function cssColor(name, fallback) {
        const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
        const m = v.match(/^#([0-9a-f]{6})$/i);
        if (!m) return fallback;
        const n = parseInt(m[1], 16);
        return [n >> 16, (n >> 8) & 255, n & 255];
    }

    function init() {
        const root = document.querySelector('[data-craft]');
        if (!root) return;
        const canvas = root.querySelector('canvas');
        const ctx = canvas.getContext('2d');
        const hudNo = root.querySelector('[data-craft-no]');
        const hudName = root.querySelector('[data-craft-name]');
        const hudCaption = root.querySelector('[data-craft-caption]');
        const playBtn = root.querySelector('[data-craft-play]');
        const chips = [...document.querySelectorAll('[data-craft-step]')];
        const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        const TANK = tankPath();
        const SPINE = spinePath();
        const SEAM = seamPath();
        const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

        // Layers live in scene space at LS x resolution.
        let LS = 1;
        let steel, tank, prime, base, candy;
        let tctx, pctx, bctx, cctx;
        const flakes = [];

        const st = {
            t: 0, last: 0, playing: !reduceMotion, visible: false, raf: 0,
            stage: -1, cam: { x: VW / 2, y: VH / 2, z: 1 }, shake: 0,
            particles: [], strikes: 0, candyRGB: [255, 90, 31],
            view: { s: 1, ox: 0, oy: 0 },
        };

        function buildLayers() {
            const cssW = canvas.getBoundingClientRect().width || 800;
            LS = clamp((window.devicePixelRatio || 1) * cssW / VW, 1, 1.5);
            const W = Math.round(VW * LS), H = Math.round(VH * LS);
            steel = mk(W, H); tank = mk(W, H); prime = mk(W, H); base = mk(W, H); candy = mk(W, H);
            [tctx, pctx, bctx, cctx] = [tank, prime, base, candy].map((c) => c.getContext('2d'));
            [tctx, pctx, bctx, cctx].forEach((c) => c.setTransform(LS, 0, 0, LS, 0, 0));

            // Brushed steel, rendered once.
            const s = steel.getContext('2d');
            s.setTransform(LS, 0, 0, LS, 0, 0);
            s.save();
            s.clip(TANK);
            const g = s.createLinearGradient(0, TANK_BOX.y, 0, TANK_BOX.y + TANK_BOX.h);
            g.addColorStop(0, '#9aa0a8'); g.addColorStop(0.28, '#d5d9de'); g.addColorStop(0.55, '#8a9098'); g.addColorStop(1, '#4d5258');
            s.fillStyle = g;
            s.fillRect(TANK_BOX.x, TANK_BOX.y, TANK_BOX.w, TANK_BOX.h);
            for (let y = TANK_BOX.y; y < TANK_BOX.y + TANK_BOX.h; y += 1.2) {
                s.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '0,0,0'},${Math.random() * 0.07})`;
                s.fillRect(TANK_BOX.x, y, TANK_BOX.w, 0.8);
            }
            // A little surface rust and grinder swirl, so it reads as raw metal.
            for (let i = 0; i < 40; i++) {
                const x = TANK_BOX.x + Math.random() * TANK_BOX.w, y = TANK_BOX.y + TANK_BOX.h * (0.55 + Math.random() * 0.45);
                const r = 6 + Math.random() * 22;
                const rg = s.createRadialGradient(x, y, 0, x, y, r);
                rg.addColorStop(0, 'rgba(120,62,30,0.35)'); rg.addColorStop(1, 'rgba(120,62,30,0)');
                s.fillStyle = rg; s.beginPath(); s.arc(x, y, r, 0, Math.PI * 2); s.fill();
            }
            s.restore();

            flakes.length = 0;
            const probe = mk(1, 1).getContext('2d');
            while (flakes.length < 260) {
                const x = TANK_BOX.x + Math.random() * TANK_BOX.w, y = TANK_BOX.y + Math.random() * TANK_BOX.h;
                if (probe.isPointInPath(TANK, x, y)) flakes.push({ x, y, ph: Math.random() * Math.PI * 2, sp: 1 + Math.random() * 2.5 });
            }
        }

        function resize() {
            const r = canvas.getBoundingClientRect();
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            canvas.width = Math.round(r.width * dpr);
            canvas.height = Math.round(r.height * dpr);
            // Fit the scene by width; taller canvases (phones) show more booth.
            // Wide screens see the whole booth; narrow ones crop in on the tank.
            const s = canvas.width / canvas.height < 1.5
                ? Math.min(canvas.width / (VW * 0.74), canvas.height / (VH * 0.6))
                : Math.min(canvas.width / VW, canvas.height / (VH * 0.78));
            st.view = { s, ox: (canvas.width - VW * s) / 2, oy: (canvas.height - VH * s) / 2 };
            if (!steel || Math.abs(LS - clamp(dpr * r.width / VW, 1, 1.5)) > 0.2) { buildLayers(); settle(st.t); }
            draw();
        }

        // ---- Painting helpers ------------------------------------------

        function spray(c, x, y, radius, n, rgb, alpha, flakeChance = 0) {
            const [r, g, b] = rgb;
            for (let i = 0; i < n; i++) {
                const px = x + gauss() * radius * 0.45, py = y + gauss() * radius * 0.45;
                const flake = Math.random() < flakeChance;
                const k = 0.82 + Math.random() * 0.3;
                c.fillStyle = flake
                    ? `rgba(${Math.min(255, r + 140)},${Math.min(255, g + 120)},${Math.min(255, b + 100)},0.9)`
                    : `rgba(${clamp(r * k, 0, 255) | 0},${clamp(g * k, 0, 255) | 0},${clamp(b * k, 0, 255) | 0},${alpha[0] + Math.random() * (alpha[1] - alpha[0])})`;
                c.beginPath();
                c.arc(px, py, flake ? 0.7 + Math.random() * 0.8 : 1.4 + Math.random() * 3.2, 0, Math.PI * 2);
                c.fill();
            }
        }

        const COATS = {
            prime: { layer: () => pctx, rgb: [104, 108, 114], alpha: [0.45, 0.8], passes: 6, flake: 0 },
            base:  { layer: () => bctx, rgb: [196, 200, 207], alpha: [0.45, 0.8], passes: 6, flake: 0.05 },
            candy: { layer: () => cctx, rgb: null,             alpha: [0.18, 0.34], passes: 9, flake: 0.07 },
        };

        // Paint the coat for stage-progress interval (p0, p1].
        function sprayInterval(key, p0, p1) {
            const coat = COATS[key];
            const rgb = coat.rgb || st.candyRGB;
            const steps = Math.max(1, Math.ceil((p1 - p0) * 400));
            for (let i = 1; i <= steps; i++) {
                const p = lerp(p0, p1, i / steps);
                const g = gunPoint(clamp(p / 0.92), coat.passes);
                if (p > 0.92) break;
                spray(coat.layer(), g.x, g.y, 62, Math.max(1, Math.round(36000 * (p1 - p0) / steps)), rgb, coat.alpha, coat.flake);
            }
        }

        // Instantly lay down a finished coat (used when jumping between steps).
        function solidCoat(key) {
            const coat = COATS[key];
            const c = coat.layer();
            const rgb = coat.rgb || st.candyRGB;
            c.save();
            c.clip(TANK);
            c.fillStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${key === 'candy' ? 0.88 : 1})`;
            c.fillRect(TANK_BOX.x, TANK_BOX.y, TANK_BOX.w, TANK_BOX.h);
            for (let i = 0; i < 2600; i++) spray(c, TANK_BOX.x + Math.random() * TANK_BOX.w, TANK_BOX.y + Math.random() * TANK_BOX.h, 4, 1, rgb, coat.alpha, coat.flake * 1.6);
            c.restore();
        }

        function clearLayers() {
            [pctx, bctx, cctx].forEach((c) => { c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, c.canvas.width, c.canvas.height); c.restore(); });
        }

        // Rebuild layers for an arbitrary time (jump, replay, resize).
        function settle(t) {
            clearLayers();
            st.particles.length = 0;
            st.candyRGB = cssColor('--paint', st.candyRGB);
            const idx = stageAt(t);
            ['prime', 'base', 'candy'].forEach((key) => {
                const i = STAGES.findIndex((s) => s.key === key);
                if (idx > i) solidCoat(key);
                else if (idx === i) sprayInterval(key, 0, (t - STARTS[i]) / STAGES[i].dur);
            });
        }

        const stageAt = (t) => { let i = 0; while (i < STAGES.length - 1 && t >= STARTS[i + 1]) i++; return i; };

        // ---- Particles ---------------------------------------------------

        function sparks(x, y) {
            for (let i = 0; i < 46; i++) {
                const a = -Math.PI / 2 + gauss() * 0.9, v = 4 + Math.random() * 9;
                st.particles.push({ kind: 'spark', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0, max: 380 + Math.random() * 420 });
            }
            st.particles.push({ kind: 'ring', x, y, life: 0, max: 420 });
            st.shake = 12;
        }
        function dust(x, y) {
            st.particles.push({ kind: 'dust', x: x + gauss() * 30, y: y + gauss() * 8, vx: gauss() * 0.6, vy: 0.4 + Math.random() * 0.8, life: 0, max: 900 + Math.random() * 700, r: 1 + Math.random() * 2.4 });
        }
        function stepParticles(dt) {
            const k = dt / 16.7;
            st.particles = st.particles.filter((p) => {
                p.life += dt;
                if (p.kind === 'spark') { p.vy += 0.42 * k; p.x += p.vx * k; p.y += p.vy * k; if (p.y > FLOOR) { p.y = FLOOR; p.vy *= -0.35; p.vx *= 0.6; } }
                if (p.kind === 'dust') { p.x += p.vx * k; p.y += p.vy * k; }
                return p.life < p.max;
            });
        }

        // ---- Per-frame simulation ---------------------------------------

        function advance(t0, t1) {
            const i = stageAt(t1);
            const s = STAGES[i];
            const p0 = clamp((t0 - STARTS[i]) / s.dur), p1 = clamp((t1 - STARTS[i]) / s.dur);

            if (i !== st.stage) {
                st.stage = i;
                if (s.key === 'candy') st.candyRGB = cssColor('--paint', st.candyRGB);
                if (s.key === 'damage') { settle(t1); st.strikes = 0; }
                onStage(i);
            }
            if (s.key === 'straighten') {
                [0.2, 0.5, 0.8].forEach((at, n) => { if (p0 < at + 0.06 && p1 >= at + 0.06) { sparks(DENT.x - 4, DENT.y + 10); st.strikes = n + 1; } });
            }
            if (s.key === 'fill' && p1 > 0.36 && Math.random() < 0.8) {
                const b = sanderPos(p1);
                for (let n = 0; n < 2; n++) dust(b.x, b.y + 30);
            }
            if (COATS[s.key]) sprayInterval(s.key, p0, p1);
        }

        function onStage(i) {
            if (hudNo) hudNo.textContent = `${String(i + 1).padStart(2, '0')} / ${String(STAGES.length).padStart(2, '0')}`;
            if (hudName) hudName.textContent = STAGES[i].label;
            if (hudCaption) hudCaption.textContent = STAGES[i].caption;
            root.dataset.stage = STAGES[i].key;
            chips.forEach((c, n) => {
                c.classList.toggle('is-done', n < i);
                c.toggleAttribute('aria-current', n === i);
                if (n === i) c.setAttribute('aria-current', 'step');
            });
        }

        // Sanding block path: overlapping figure-eights over the repair.
        const sanderPos = (p) => {
            const q = span(p, 0.36, 1) * Math.PI * 6;
            return { x: DENT.x + Math.sin(q) * 70, y: DENT.y - 8 + Math.sin(q * 2) * 22 };
        };

        // ---- Drawing -----------------------------------------------------

        function drawBooth(c, t) {
            const flick = t < 900 ? (Math.sin(t * 0.09) > 0.3 || t > 700 ? 1 : 0.15) * ease(t / 900) : 1;
            // Walls
            const wall = c.createLinearGradient(0, 0, 0, FLOOR);
            wall.addColorStop(0, `rgb(${18 + 10 * flick},${17 + 9 * flick},${22 + 10 * flick})`);
            wall.addColorStop(1, '#0c0b0f');
            c.fillStyle = wall;
            c.fillRect(-200, -200, VW + 400, FLOOR + 200);
            c.strokeStyle = 'rgba(241,233,220,0.035)';
            c.lineWidth = 2;
            for (let x = -160; x < VW + 200; x += 160) { c.beginPath(); c.moveTo(x, 90); c.lineTo(x, FLOOR); c.stroke(); }

            // Ceiling light bars
            for (let i = 0; i < 3; i++) {
                const x = 190 + i * 340, w = 220;
                const glow = c.createRadialGradient(x + w / 2, 60, 10, x + w / 2, 60, 360);
                glow.addColorStop(0, `rgba(255,246,230,${0.22 * flick})`);
                glow.addColorStop(1, 'rgba(255,246,230,0)');
                c.fillStyle = glow;
                c.fillRect(x - 300, -100, w + 600, 520);
                c.fillStyle = `rgba(255,250,240,${0.9 * flick})`;
                c.fillRect(x, 50, w, 9);
            }

            // Downdraft floor grates
            const floor = c.createLinearGradient(0, FLOOR, 0, VH + 200);
            floor.addColorStop(0, '#16141a'); floor.addColorStop(1, '#09080b');
            c.fillStyle = floor;
            c.fillRect(-200, FLOOR, VW + 400, VH);
        }

        function drawFloorLines(c) {
            c.strokeStyle = 'rgba(241,233,220,0.05)';
            c.lineWidth = 1;
            for (let i = 1; i < 9; i++) {
                const y = FLOOR + Math.pow(i / 9, 1.6) * 260;
                c.beginPath(); c.moveTo(-200, y); c.lineTo(VW + 200, y); c.stroke();
            }
            for (let i = -12; i <= 12; i++) {
                c.beginPath(); c.moveTo(VW / 2 + i * 60, FLOOR); c.lineTo(VW / 2 + i * 220, VH + 200); c.stroke();
            }
            c.fillStyle = 'rgba(241,233,220,0.12)';
            c.fillRect(-200, FLOOR, VW + 400, 1);
        }

        function drawStand(c) {
            c.fillStyle = '#2a272e';
            c.fillRect(572, 530, 16, FLOOR - 530);
            c.fillRect(500, FLOOR - 8, 160, 8);
            c.fillStyle = '#3a3640';
            c.fillRect(540, 524, 80, 10);
        }

        function composeTank(t) {
            const i = stageAt(t), key = STAGES[i].key;
            const p = clamp((t - STARTS[i]) / STAGES[i].dur);
            const c = tctx;
            c.save();
            c.setTransform(1, 0, 0, 1, 0, 0);
            c.clearRect(0, 0, tank.width, tank.height);
            c.restore();

            c.save();
            c.clip(TANK);
            c.drawImage(steel, 0, 0, VW, VH);

            // The dent: shadowed bowl with a hard crease, fading with each strike.
            const dentAmt = key === 'damage' ? 1 : key === 'straighten' ? 1 - st.strikes / 3 * 0.92 : i > 1 ? 0 : 1;
            if (dentAmt > 0.01) {
                c.globalAlpha = dentAmt;
                const d = c.createRadialGradient(DENT.x + 12, DENT.y + 10, 4, DENT.x, DENT.y, 78);
                d.addColorStop(0, 'rgba(20,22,26,0.85)'); d.addColorStop(0.55, 'rgba(40,44,50,0.45)'); d.addColorStop(0.8, 'rgba(255,255,255,0.35)'); d.addColorStop(1, 'rgba(255,255,255,0)');
                c.fillStyle = d;
                c.beginPath(); c.ellipse(DENT.x, DENT.y, 82, 56, -0.2, 0, Math.PI * 2); c.fill();
                c.strokeStyle = 'rgba(15,16,20,0.7)'; c.lineWidth = 1.6;
                [[-40, -6, 30, 14], [-22, 18, 36, -10], [-10, -24, 18, 22]].forEach(([x1, y1, x2, y2]) => { c.beginPath(); c.moveTo(DENT.x + x1, DENT.y + y1); c.lineTo(DENT.x + x2, DENT.y + y2); c.stroke(); });
                c.globalAlpha = 1;
            }

            // Filler: spread on, then feathered out by the block.
            if (i === 2 || (i > 2 && i < 4)) {
                const spread = i === 2 ? ease(span(p, 0.04, 0.34)) : 1;
                const feather = i === 2 ? span(p, 0.36, 1) : 1;
                c.save();
                c.beginPath();
                c.rect(DENT.x - 130, DENT.y - 90, 260 * spread, 180);
                c.clip();
                const f = c.createRadialGradient(DENT.x, DENT.y, 10, DENT.x, DENT.y, 120);
                f.addColorStop(0, 'rgba(206,188,176,1)');
                f.addColorStop(lerp(0.75, 0.35, feather), 'rgba(200,182,170,0.95)');
                f.addColorStop(1, 'rgba(200,182,170,0)');
                c.fillStyle = f;
                c.beginPath(); c.ellipse(DENT.x, DENT.y, 125, 82, -0.15, 0, Math.PI * 2); c.fill();
                // Sanding scratches build up as the block works.
                c.strokeStyle = `rgba(255,255,255,${0.25 * feather})`;
                c.lineWidth = 0.8;
                for (let k = 0; k < 26 * feather; k++) {
                    const a = k * 2.4, r = 20 + (k * 7) % 80;
                    c.beginPath(); c.ellipse(DENT.x + Math.cos(a) * 18, DENT.y + Math.sin(a) * 10, r, r * 0.35, a * 0.2, 0, Math.PI * 1.2); c.stroke();
                }
                c.restore();
            }

            c.drawImage(prime, 0, 0, VW, VH);
            c.drawImage(base, 0, 0, VW, VH);
            c.drawImage(candy, 0, 0, VW, VH);

            // Pinstripe, pulled from the tip of the spear.
            const stripeP = key === 'stripe' ? easeInOut(span(p, 0.06, 0.9)) : i > 6 ? 1 : 0;
            if (stripeP > 0) drawStripes(c, stripeP);

            // Clear flows out the spray texture: candy levels into one deep color.
            const level = key === 'clear' ? 0.8 * span(p, 0.05, 0.55) : i > 7 ? 0.8 : 0;
            if (level > 0) {
                const [r, g, b] = st.candyRGB;
                c.fillStyle = `rgba(${r * 0.86 | 0},${g * 0.86 | 0},${b * 0.86 | 0},${level})`;
                c.fillRect(TANK_BOX.x, TANK_BOX.y, TANK_BOX.w, TANK_BOX.h);
                if (stripeP > 0) drawStripes(c, stripeP);
            }

            // Form shading: the tank is round, the light is above.
            const form = c.createLinearGradient(0, TANK_BOX.y, 0, TANK_BOX.y + TANK_BOX.h);
            form.addColorStop(0, 'rgba(255,255,255,0.32)');
            form.addColorStop(0.22, 'rgba(255,255,255,0.05)');
            form.addColorStop(0.5, 'rgba(0,0,0,0)');
            form.addColorStop(1, 'rgba(0,0,0,0.6)');
            c.fillStyle = form;
            c.fillRect(TANK_BOX.x, TANK_BOX.y, TANK_BOX.w, TANK_BOX.h);
            c.lineCap = 'round';
            [[26, 0.05], [14, 0.08], [5, 0.16]].forEach(([w, a]) => {
                c.strokeStyle = `rgba(255,255,255,${a})`;
                c.lineWidth = w;
                c.stroke(SPINE);
            });
            c.strokeStyle = 'rgba(0,0,0,0.35)';
            c.lineWidth = 2;
            c.stroke(SEAM);
            c.strokeStyle = 'rgba(255,255,255,0.08)';
            c.lineWidth = 1;
            c.save(); c.translate(0, 2); c.stroke(SEAM); c.restore();

            // Gloss depends on the top coat: matte primer, wet candy, glass clear.
            const gloss = [0.45, 0.45, 0.25, 0.08, 0.3, 0.55, 0.55, 0.55 + 0.45 * span(p, 0.1, 0.9), 1][i];
            const sweep = key === 'reveal' ? lerp(-0.25, 1.25, easeInOut(span(p, 0.05, 0.6)))
                : key === 'clear' ? lerp(-0.25, 1.25, easeInOut(span(p, 0.55, 0.95)))
                : 0.35 + Math.sin(t / 2400) * 0.08;
            const bx = TANK_BOX.x + TANK_BOX.w * sweep;
            const band = c.createLinearGradient(bx - 90, TANK_BOX.y, bx + 90, TANK_BOX.y + 120);
            band.addColorStop(0, 'rgba(255,255,255,0)');
            band.addColorStop(0.5, `rgba(255,252,245,${0.7 * gloss})`);
            band.addColorStop(1, 'rgba(255,255,255,0)');
            c.fillStyle = band;
            // Fade the band out down the side of the tank instead of a hard edge.
            for (let k = 0; k < 12; k++) {
                c.globalAlpha = Math.pow(1 - k / 12, 1.6);
                c.fillRect(TANK_BOX.x, TANK_BOX.y + k * TANK_BOX.h * 0.05, TANK_BOX.w, TANK_BOX.h * 0.05 + 0.5);
            }
            c.globalAlpha = 1;
            // Ceiling light reflections, sharp only once it's glossy.
            c.fillStyle = `rgba(255,250,240,${0.55 * gloss * gloss})`;
            for (let k = 0; k < 3; k++) c.fillRect(330 + k * 210 + (sweep - 0.35) * 40, 268 + k * 2, 120 * gloss, 4);

            // Flake twinkles under the clear.
            if (i >= 5) {
                const on = i === 5 ? span(p, 0.2, 1) : 1;
                for (const f of flakes) {
                    const tw = Math.pow(Math.max(0, Math.sin(t / 1000 * f.sp + f.ph)), 18) * on;
                    if (tw < 0.05) continue;
                    c.fillStyle = `rgba(255,248,230,${tw})`;
                    c.fillRect(f.x - 0.8, f.y - 0.8, 1.6, 1.6);
                    if (tw > 0.6 && gloss > 0.7) { c.fillRect(f.x - 5 * tw, f.y - 0.4, 10 * tw, 0.8); c.fillRect(f.x - 0.4, f.y - 5 * tw, 0.8, 10 * tw); }
                }
            }
            c.restore();

            // Rim light and the chrome cap.
            c.strokeStyle = 'rgba(255,255,255,0.18)';
            c.lineWidth = 1.5;
            c.stroke(TANK);
            const cap = c.createLinearGradient(0, CAP.y - 18, 0, CAP.y + 6);
            cap.addColorStop(0, '#f4f6f8'); cap.addColorStop(0.5, '#8d939b'); cap.addColorStop(1, '#dfe3e8');
            c.fillStyle = cap;
            c.beginPath(); c.ellipse(CAP.x, CAP.y, 40, 9, -0.12, 0, Math.PI * 2); c.fill();
            c.fillRect(CAP.x - 25, CAP.y - 14, 50, 13);
            c.beginPath(); c.ellipse(CAP.x, CAP.y - 14, 25, 6, -0.12, 0, Math.PI * 2); c.fill();
        }

        function drawStripes(c, p) {
            const gold = '#e8bf57';
            STRIPE_PTS.forEach((pts, si) => {
                const n = Math.max(2, Math.floor(pts.length * p));
                for (let k = 1; k < n; k++) {
                    const t = k / pts.length;
                    // Pinstripe brushes taper at the start and finish of a pull.
                    c.lineWidth = (si ? 2.6 : 3.4) * (0.35 + Math.sin(Math.min(1, t * 1.05) * Math.PI) * 0.75);
                    c.strokeStyle = gold;
                    c.lineCap = 'round';
                    c.beginPath(); c.moveTo(pts[k - 1][0], pts[k - 1][1]); c.lineTo(pts[k][0], pts[k][1]); c.stroke();
                }
            });
            // Thin dark keyline under the gold for depth.
            c.globalCompositeOperation = 'destination-over';
            c.strokeStyle = 'rgba(0,0,0,0.5)';
            c.lineWidth = 6;
            STRIPE_PTS.forEach((pts) => {
                const n = Math.max(2, Math.floor(pts.length * p));
                c.beginPath(); c.moveTo(pts[0][0], pts[0][1] + 1.5);
                for (let k = 1; k < n; k++) c.lineTo(pts[k][0], pts[k][1] + 1.5);
                c.stroke();
            });
            c.globalCompositeOperation = 'source-over';
        }

        function drawTools(c, t) {
            const i = stageAt(t), key = STAGES[i].key;
            const p = clamp((t - STARTS[i]) / STAGES[i].dur);

            if (key === 'straighten') {
                // Swing: raise slowly, drop fast, small recoil.
                let a = 0.75;
                for (const at of [0.2, 0.5, 0.8]) {
                    const d = p - at;
                    if (d > -0.2 && d <= 0.06) a = d < 0 ? lerp(0.75, 0.95, ease((d + 0.2) / 0.2)) : lerp(0.95, -0.02, (d / 0.06) ** 2);
                    else if (d > 0.06 && d < 0.18) a = lerp(-0.02, 0.75, ease((d - 0.06) / 0.12));
                }
                const pivot = { x: DENT.x + 196, y: DENT.y - 44 };
                c.save();
                c.translate(pivot.x, pivot.y);
                c.rotate(a);
                const hg = c.createLinearGradient(0, -6, 0, 6);
                hg.addColorStop(0, '#a5733f'); hg.addColorStop(1, '#5b3b1d');
                c.fillStyle = hg;
                c.fillRect(-196, -6, 236, 12);
                const head = c.createLinearGradient(-226, 0, -166, 0);
                head.addColorStop(0, '#5c6168'); head.addColorStop(0.5, '#d8dce1'); head.addColorStop(1, '#6a7078');
                c.fillStyle = head;
                c.beginPath(); c.roundRect(-228, -22, 64, 70, 6); c.fill();
                c.restore();
            }

            if (key === 'fill') {
                if (p < 0.36) {
                    const sx = DENT.x - 130 + 260 * ease(span(p, 0.04, 0.34));
                    c.save();
                    c.translate(sx, DENT.y);
                    c.rotate(0.25);
                    c.fillStyle = 'rgba(240,236,228,0.85)';
                    c.beginPath(); c.moveTo(-10, -80); c.lineTo(14, -80); c.lineTo(22, 80); c.lineTo(-2, 80); c.closePath(); c.fill();
                    c.restore();
                } else {
                    const b = sanderPos(p);
                    c.save();
                    c.translate(b.x, b.y);
                    c.rotate(Math.sin(p * 30) * 0.05);
                    c.fillStyle = '#23242a';
                    c.beginPath(); c.roundRect(-70, -18, 140, 36, 8); c.fill();
                    c.fillStyle = '#e3401f';
                    c.beginPath(); c.roundRect(-58, -34, 116, 20, 8); c.fill();
                    c.fillStyle = '#9b8a6a';
                    c.fillRect(-70, 14, 140, 6);
                    c.restore();
                }
            }

            if (COATS[key] && p < 0.92) {
                const coat = COATS[key];
                const g = gunPoint(clamp(p / 0.92), coat.passes);
                const rgb = coat.rgb || st.candyRGB;
                drawGun(c, g, rgb);
            }

            if (key === 'clear') {
                if (p < 0.5) {
                    const g = gunPoint(clamp(p / 0.5), 5);
                    drawGun(c, g, [235, 240, 248]);
                } else if (p < 0.98) {
                    // Rotary buffer working across the panel.
                    const q = span(p, 0.5, 0.98);
                    const x = lerp(TANK_BOX.x + 120, TANK_BOX.x + TANK_BOX.w - 120, easeInOut(q)), y = 330 + Math.sin(q * Math.PI * 4) * 40;
                    c.save();
                    c.translate(x, y);
                    c.fillStyle = 'rgba(0,0,0,0.25)';
                    c.beginPath(); c.ellipse(6, 14, 66, 20, 0, 0, Math.PI * 2); c.fill();
                    c.fillStyle = '#f0ebe0';
                    c.beginPath(); c.ellipse(0, 0, 62, 18, 0, 0, Math.PI * 2); c.fill();
                    c.strokeStyle = 'rgba(0,0,0,0.25)';
                    c.lineWidth = 1.2;
                    for (let k = 0; k < 6; k++) {
                        const a = t / 40 + k;
                        c.beginPath(); c.moveTo(0, 0); c.lineTo(Math.cos(a) * 60, Math.sin(a) * 16); c.stroke();
                    }
                    c.fillStyle = '#2b2a30';
                    c.fillRect(-26, -64, 52, 56);
                    c.fillStyle = '#e3401f';
                    c.fillRect(-26, -64, 52, 10);
                    c.fillStyle = '#2b2a30';
                    c.fillRect(20, -50, 150, 18);
                    c.restore();
                }
            }

            if (key === 'stripe') {
                const q = easeInOut(span(p, 0.06, 0.9));
                if (q > 0 && q < 1) {
                    const pts = STRIPE_PTS[0];
                    const [x, y] = pts[Math.min(pts.length - 1, Math.floor(pts.length * q))];
                    c.save();
                    c.translate(x, y);
                    c.rotate(-0.9);
                    c.fillStyle = '#e8bf57';
                    c.beginPath(); c.moveTo(0, 0); c.lineTo(-3, -34); c.lineTo(3, -34); c.closePath(); c.fill();
                    c.fillStyle = '#c9ced6'; c.fillRect(-3, -48, 6, 14);
                    c.fillStyle = '#7a4a24'; c.fillRect(-2.5, -150, 5, 102);
                    c.restore();
                    c.fillStyle = 'rgba(255,240,200,0.9)';
                    c.beginPath(); c.arc(x, y, 3, 0, Math.PI * 2); c.fill();
                }
            }
        }

        function drawGun(c, g, rgb) {
            const [r, gg, b] = rgb;
            // Spray fan from the nozzle to the panel.
            const nx = g.x + 70, ny = g.y - 150;
            const fan = c.createLinearGradient(nx, ny, g.x, g.y);
            fan.addColorStop(0, `rgba(${r},${gg},${b},0.5)`);
            fan.addColorStop(1, `rgba(${r},${gg},${b},0.08)`);
            c.fillStyle = fan;
            c.beginPath(); c.moveTo(nx - 4, ny); c.lineTo(g.x - 62, g.y + 10); c.lineTo(g.x + 58, g.y - 6); c.lineTo(nx + 4, ny); c.closePath(); c.fill();
            const mist = c.createRadialGradient(g.x, g.y, 0, g.x, g.y, 110);
            mist.addColorStop(0, `rgba(${r},${gg},${b},0.32)`);
            mist.addColorStop(1, `rgba(${r},${gg},${b},0)`);
            c.fillStyle = mist;
            c.beginPath(); c.arc(g.x, g.y, 110, 0, Math.PI * 2); c.fill();

            // The gun: cup on top, body, handle.
            c.save();
            c.translate(nx, ny);
            c.rotate(-0.45);
            const metal = c.createLinearGradient(0, -14, 0, 14);
            metal.addColorStop(0, '#eef0f3'); metal.addColorStop(0.5, '#8f959d'); metal.addColorStop(1, '#c4c9cf');
            c.fillStyle = metal;
            c.beginPath(); c.roundRect(0, -12, 96, 24, 8); c.fill();
            c.fillRect(-10, -5, 14, 10);
            c.beginPath(); c.roundRect(60, 8, 22, 70, 6); c.fill();
            c.fillStyle = 'rgba(230,236,240,0.55)';
            c.beginPath(); c.roundRect(24, -64, 40, 54, 8); c.fill();
            c.fillStyle = `rgba(${r},${gg},${b},0.85)`;
            c.beginPath(); c.roundRect(27, -40, 34, 28, 5); c.fill();
            c.fillStyle = '#2b2a30';
            c.fillRect(20, -70, 48, 8);
            c.restore();
        }

        function drawParticles(c) {
            for (const p of st.particles) {
                const k = p.life / p.max;
                if (p.kind === 'spark') {
                    c.strokeStyle = `rgba(255,${200 - 120 * k | 0},${90 - 80 * k | 0},${1 - k})`;
                    c.lineWidth = 2;
                    c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(p.x - p.vx * 2, p.y - p.vy * 2); c.stroke();
                } else if (p.kind === 'ring') {
                    c.strokeStyle = `rgba(255,240,210,${0.8 * (1 - k)})`;
                    c.lineWidth = 3 * (1 - k);
                    c.beginPath(); c.ellipse(p.x, p.y, 20 + k * 140, 10 + k * 60, -0.2, 0, Math.PI * 2); c.stroke();
                    c.fillStyle = `rgba(255,250,235,${0.5 * (1 - k) ** 3})`;
                    c.beginPath(); c.arc(p.x, p.y, 60, 0, Math.PI * 2); c.fill();
                } else {
                    c.fillStyle = `rgba(222,208,196,${0.6 * (1 - k)})`;
                    c.beginPath(); c.arc(p.x, p.y, p.r, 0, Math.PI * 2); c.fill();
                }
            }
        }

        function cameraTarget(t) {
            const i = stageAt(t), key = STAGES[i].key;
            const p = clamp((t - STARTS[i]) / STAGES[i].dur);
            if (key === 'damage') return { x: lerp(VW / 2, DENT.x - 60, ease(span(p, 0.4, 1))), y: lerp(VH / 2, DENT.y, ease(span(p, 0.4, 1))), z: lerp(1, 1.3, ease(span(p, 0.4, 1))) };
            if (key === 'straighten' || key === 'fill') return { x: DENT.x - 40, y: DENT.y - 10, z: 1.42 };
            if (key === 'stripe') {
                const pts = STRIPE_PTS[0];
                const [x] = pts[Math.min(pts.length - 1, Math.floor(pts.length * easeInOut(span(p, 0.06, 0.9))))];
                return { x: clamp(x, 480, 820), y: 400, z: 1.28 };
            }
            if (key === 'reveal') return { x: VW / 2, y: VH / 2 + 10, z: lerp(1.02, 1.1, easeInOut(p)) };
            return { x: VW / 2, y: VH / 2, z: 1 };
        }

        function draw() {
            const { s, ox, oy } = st.view;
            const t = st.t;
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.fillStyle = '#0c0b0f';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            if (!steel) return;

            const cam = st.cam;
            const sx = st.shake ? gauss() * st.shake : 0, sy = st.shake ? gauss() * st.shake : 0;
            const apply = (depth) => {
                ctx.setTransform(s, 0, 0, s, ox, oy);
                ctx.translate(VW / 2 + sx * depth, VH / 2 + sy * depth);
                const z = lerp(1, cam.z, depth);
                ctx.scale(z, z);
                ctx.translate(-lerp(VW / 2, cam.x, depth), -lerp(VH / 2, cam.y, depth));
            };

            apply(0.4);
            drawBooth(ctx, t);
            apply(1);
            drawFloorLines(ctx);
            composeTank(t);

            // Reflection in the floor, fading away from the tank.
            ctx.save();
            ctx.translate(0, FLOOR * 2 - 60);
            ctx.scale(1, -1);
            ctx.globalAlpha = 0.18;
            ctx.drawImage(tank, 0, 0, VW, VH);
            ctx.restore();
            const fade = ctx.createLinearGradient(0, FLOOR, 0, FLOOR + 200);
            fade.addColorStop(0, 'rgba(12,11,15,0.2)');
            fade.addColorStop(1, 'rgba(12,11,15,1)');
            ctx.fillStyle = fade;
            ctx.fillRect(-400, FLOOR, VW + 800, VH);

            drawStand(ctx);
            ctx.drawImage(tank, 0, 0, VW, VH);
            drawTools(ctx, t);
            drawParticles(ctx);

            // Fade through black at the loop point.
            const end = clamp((t - (TOTAL - 500)) / 500), start = 1 - clamp(t / 400);
            const black = Math.max(end, start);
            if (black > 0) {
                ctx.setTransform(1, 0, 0, 1, 0, 0);
                ctx.fillStyle = `rgba(12,11,15,${black})`;
                ctx.fillRect(0, 0, canvas.width, canvas.height);
            }

            // Progress bars on the step chips.
            const i = stageAt(t);
            chips[i]?.style.setProperty('--p', String(clamp((t - STARTS[i]) / STAGES[i].dur)));
        }

        function frame(now) {
            st.raf = 0;
            const dt = Math.min(64, now - (st.last || now));
            st.last = now;
            if (st.playing) {
                const t0 = st.t;
                st.t += dt;
                if (st.t >= TOTAL) { st.t = 0; st.stage = -1; }
                else advance(t0, st.t);
                if (st.stage === -1) advance(0, st.t);
            }
            const target = cameraTarget(st.t);
            const k = 1 - Math.pow(0.04, dt / 1000);
            st.cam.x = lerp(st.cam.x, target.x, k);
            st.cam.y = lerp(st.cam.y, target.y, k);
            st.cam.z = lerp(st.cam.z, target.z, k);
            st.shake *= Math.pow(0.0001, dt / 1000);
            if (st.shake < 0.3) st.shake = 0;
            stepParticles(dt);
            draw();
            if (st.visible && (st.playing || st.particles.length)) st.raf = requestAnimationFrame(frame);
        }

        const kick = () => { if (!st.raf && st.visible) { st.last = 0; st.raf = requestAnimationFrame(frame); } };

        function jump(i) {
            st.t = STARTS[i] + 1;
            st.stage = -1;
            settle(st.t);
            st.strikes = i > 1 ? 3 : 0;
            advance(st.t, st.t);
            const target = cameraTarget(st.t);
            Object.assign(st.cam, target);
            draw();
        }

        function setPlaying(on) {
            st.playing = on;
            root.classList.toggle('is-paused', !on);
            playBtn?.setAttribute('aria-pressed', String(!on));
            playBtn?.setAttribute('aria-label', on ? 'Pause the animation' : 'Play the animation');
            kick();
        }

        playBtn?.addEventListener('click', () => setPlaying(!st.playing));
        chips.forEach((chip, i) => chip.addEventListener('click', () => { jump(i); if (!st.playing) draw(); kick(); }));

        new ResizeObserver(resize).observe(canvas);
        new IntersectionObserver(([e]) => { st.visible = e.isIntersecting && !document.hidden; kick(); }, { threshold: 0.15 }).observe(canvas);
        document.addEventListener('visibilitychange', () => { st.visible = !document.hidden && st.visible; kick(); });

        resize();
        if (reduceMotion) {
            // Show the finished job; the visitor can press play to watch it.
            jump(STAGES.length - 1);
            st.t = STARTS[STAGES.length - 1] + STAGES[STAGES.length - 1].dur * 0.7;
            setPlaying(false);
            draw();
        } else {
            advance(0, 0);
            setPlaying(true);
        }

        // Expose a tiny hook for automated screenshots.
        root.craft = { jump, setPlaying, get t() { return st.t; } };
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
