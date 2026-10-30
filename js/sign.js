/*
 * The original sign, resprayed.
 *
 * The shop's first logo (the pickup and the guy on one knee) is used as a
 * paint mask. When the section scrolls into view a spray gun makes passes
 * across it, laying down candy paint with metal flake. A clearcoat shine
 * sweeps over the finished job, and then the gun is the visitor's: press
 * and drag to spray, pick a color, or hit Respray to start over.
 *
 * Canvas 2D only. Reduced motion shows the finished sign straight away.
 */
(() => {
    'use strict';

    const COLORS = {
        tangerine: { name: 'Candy Tangerine', rgb: [255, 90, 31] },
        apple:     { name: 'Candy Apple Red', rgb: [200, 16, 46] },
        teal:      { name: 'Candy Teal',      rgb: [15, 163, 163] },
        cobalt:    { name: 'Cobalt Blue',     rgb: [40, 90, 230] },
        gold:      { name: 'Gold Leaf',       rgb: [226, 178, 60] },
        pearl:     { name: 'Pearl White',     rgb: [240, 236, 228] },
    };

    const AUTO_MS = 5200;   // one full job, start to finish
    const PASSES = 9;       // horizontal passes the gun makes

    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const ease = (t) => 1 - Math.pow(1 - t, 3);

    // Box-Muller: spray lands densest at the center of the fan.
    function gauss() {
        let u = 0, v = 0;
        while (!u) u = Math.random();
        while (!v) v = Math.random();
        return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    }

    function init() {
        const root = document.querySelector('[data-sign]');
        if (!root) return;
        const canvas = root.querySelector('canvas');
        const ctx = canvas.getContext('2d');
        const fallback = root.querySelector('[data-sign-fallback]');
        const status = document.querySelector('[data-sign-status]');
        const respray = document.querySelector('[data-sign-respray]');
        const chips = [...document.querySelectorAll('[data-sign-color]')];
        const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        const mask = new Image();
        mask.src = root.dataset.sign;

        // Offscreen layers: accumulated paint, and the composite scratch.
        const paint = document.createElement('canvas');
        const pctx = paint.getContext('2d');
        const scratch = document.createElement('canvas');
        const sctx = scratch.getContext('2d');

        const st = {
            w: 0, h: 0, dpr: 1,
            color: COLORS.tangerine.rgb,
            mode: 'idle',          // idle -> auto -> shine -> free
            t0: 0, shineT0: 0,
            nozzle: null,          // {x, y} in css px, or null
            pointerDown: false,
            raf: 0, started: false,
        };

        function resize() {
            const r = canvas.getBoundingClientRect();
            st.dpr = Math.min(window.devicePixelRatio || 1, 2);
            st.w = r.width; st.h = r.height;
            const W = Math.round(r.width * st.dpr), H = Math.round(r.height * st.dpr);
            if (canvas.width === W && canvas.height === H) return;
            // Keep the paint that's already on when the layout changes.
            const keep = paint.width ? paint : null;
            const old = keep && document.createElement('canvas');
            if (old) { old.width = paint.width; old.height = paint.height; old.getContext('2d').drawImage(paint, 0, 0); }
            for (const c of [canvas, paint, scratch]) { c.width = W; c.height = H; }
            if (old) pctx.drawImage(old, 0, 0, W, H);
            render(performance.now());
        }

        // One burst of spray at (x, y) in css px.
        function spray(x, y, radius, count) {
            const [r, g, b] = st.color;
            const d = st.dpr;
            for (let i = 0; i < count; i++) {
                const px = (x + gauss() * radius * 0.42) * d;
                const py = (y + gauss() * radius * 0.42) * d;
                const flake = Math.random() < 0.06;
                const size = (flake ? 0.6 + Math.random() * 0.9 : 0.8 + Math.random() * 2.2) * d;
                // Candy builds up: each droplet is translucent, slightly varied.
                const k = 0.75 + Math.random() * 0.45;
                pctx.fillStyle = flake
                    ? `rgba(${Math.min(255, r + 120)},${Math.min(255, g + 110)},${Math.min(255, b + 90)},0.95)`
                    : `rgba(${clamp(r * k, 0, 255) | 0},${clamp(g * k, 0, 255) | 0},${clamp(b * k, 0, 255) | 0},${0.22 + Math.random() * 0.3})`;
                pctx.beginPath();
                pctx.arc(px, py, size, 0, Math.PI * 2);
                pctx.fill();
            }
        }

        // Where the gun is at time p (0..1) of the automatic job: a serpentine
        // of overlapping passes, overshooting the edges like a real painter.
        function autoNozzle(p) {
            const pass = Math.min(PASSES - 1, Math.floor(p * PASSES));
            const f = p * PASSES - pass;
            const dir = pass % 2 ? -1 : 1;
            const x = st.w * (dir > 0 ? -0.06 + f * 1.12 : 1.06 - f * 1.12);
            const y = st.h * (0.06 + (pass / (PASSES - 1)) * 0.88);
            return { x, y };
        }

        function render(now) {
            const W = canvas.width, H = canvas.height;
            if (!W || !mask.complete) return;
            ctx.clearRect(0, 0, W, H);

            // Taped-off stencil: a faint ghost of the sign shows what's coming.
            ctx.globalAlpha = 0.08;
            ctx.drawImage(mask, 0, 0, W, H);
            ctx.globalAlpha = 1;

            // Paint, clipped to the sign.
            sctx.globalCompositeOperation = 'source-over';
            sctx.clearRect(0, 0, W, H);
            sctx.drawImage(paint, 0, 0);
            sctx.globalCompositeOperation = 'destination-in';
            sctx.drawImage(mask, 0, 0, W, H);

            // Clearcoat shine: a bright band sweeps across the wet paint.
            if (st.mode === 'shine' || st.mode === 'free') {
                const p = clamp((now - st.shineT0) / 1600, 0, 1);
                if (p < 1) {
                    const x = (-0.3 + ease(p) * 1.6) * W;
                    const grad = sctx.createLinearGradient(x - W * 0.18, 0, x + W * 0.18, H * 0.4);
                    grad.addColorStop(0, 'rgba(255,255,255,0)');
                    grad.addColorStop(0.5, 'rgba(255,250,240,0.85)');
                    grad.addColorStop(1, 'rgba(255,255,255,0)');
                    sctx.globalCompositeOperation = 'source-atop';
                    sctx.fillStyle = grad;
                    sctx.fillRect(0, 0, W, H);
                }
            }
            ctx.drawImage(scratch, 0, 0);

            // The gun: a soft cloud of overspray and the fan pattern.
            if (st.nozzle) {
                const { x, y } = st.nozzle;
                const d = st.dpr;
                const [r, g, b] = st.color;
                const mist = ctx.createRadialGradient(x * d, y * d, 0, x * d, y * d, 46 * d);
                mist.addColorStop(0, `rgba(${r},${g},${b},0.28)`);
                mist.addColorStop(1, `rgba(${r},${g},${b},0)`);
                ctx.fillStyle = mist;
                ctx.beginPath();
                ctx.arc(x * d, y * d, 46 * d, 0, Math.PI * 2);
                ctx.fill();
                ctx.strokeStyle = 'rgba(241,233,220,0.55)';
                ctx.lineWidth = 1.2 * d;
                ctx.setLineDash([3 * d, 4 * d]);
                ctx.beginPath();
                ctx.ellipse(x * d, y * d, 26 * d, 14 * d, 0, 0, Math.PI * 2);
                ctx.stroke();
                ctx.setLineDash([]);
            }
        }

        function frame(now) {
            st.raf = 0;
            if (st.mode === 'auto') {
                const p = clamp((now - st.t0) / AUTO_MS, 0, 1);
                // Fill in the whole path since the last frame, so the coat comes
                // out just as full on a slow machine as on a fast one.
                const dt = Math.min(250, now - (st.prev || now)) || 16;
                const steps = Math.max(6, Math.round(6 * dt / 16.7));
                for (let i = 0; i < steps; i++) {
                    const q = clamp(p - (i / steps) * (dt / AUTO_MS), 0, 1);
                    const n = autoNozzle(q);
                    spray(n.x, n.y, st.h * 0.11, 100);
                }
                st.nozzle = autoNozzle(p);
                if (p >= 1) {
                    st.nozzle = null;
                    st.mode = 'shine';
                    st.shineT0 = now;
                    setStatus('Fresh coat. Now it’s your turn: press and drag on the sign to spray.');
                }
            } else if (st.mode === 'shine' && now - st.shineT0 > 1700) {
                st.mode = 'free';
                root.classList.add('is-free');
            }
            if (st.pointerDown && st.nozzle) spray(st.nozzle.x, st.nozzle.y, 34, 90);
            st.prev = now;
            render(now);
            if (st.mode === 'auto' || st.mode === 'shine' || st.pointerDown || st.nozzle) st.raf = requestAnimationFrame(frame);
        }

        const kick = () => { if (!st.raf) st.raf = requestAnimationFrame(frame); };
        const setStatus = (msg) => { if (status) status.textContent = msg; };

        function start() {
            if (st.started) return;
            st.started = true;
            if (reduceMotion) {
                // Skip the show: lay down a complete, even coat at once.
                for (let y = 0; y <= st.h; y += 8) for (let x = 0; x <= st.w; x += 8) spray(x, y, 14, 8);
                st.mode = 'free';
                root.classList.add('is-free');
                render(performance.now());
                setStatus('Press and drag on the sign to spray your own colors.');
                return;
            }
            // Spray in the site's current Finish.
            const site = getComputedStyle(document.documentElement).getPropertyValue('--paint').trim().match(/^#([0-9a-f]{6})$/i);
            if (site && st.color === COLORS.tangerine.rgb) {
                const n = parseInt(site[1], 16);
                st.color = [n >> 16, (n >> 8) & 255, n & 255];
                chips.forEach((c) => c.setAttribute('aria-checked', 'false'));
            }
            st.mode = 'auto';
            st.t0 = performance.now();
            st.prev = 0;
            root.classList.remove('is-free');
            setStatus('Spraying a fresh coat of ' + nameOf(st.color) + '…');
            kick();
        }

        function resprayAll() {
            pctx.clearRect(0, 0, paint.width, paint.height);
            st.started = false;
            start();
        }

        const nameOf = (rgb) => Object.values(COLORS).find((c) => c.rgb === rgb)?.name || 'the shop’s current finish';

        // Visitor takes the gun.
        const toLocal = (e) => {
            const r = canvas.getBoundingClientRect();
            return { x: e.clientX - r.left, y: e.clientY - r.top };
        };
        canvas.addEventListener('pointerdown', (e) => {
            if (st.mode === 'auto') return;
            st.pointerDown = true;
            st.nozzle = toLocal(e);
            canvas.setPointerCapture(e.pointerId);
            kick();
        });
        canvas.addEventListener('pointermove', (e) => {
            if (st.mode === 'auto') return;
            if (e.pointerType === 'mouse' || st.pointerDown) { st.nozzle = toLocal(e); kick(); }
        });
        const lift = () => { st.pointerDown = false; };
        canvas.addEventListener('pointerup', lift);
        canvas.addEventListener('pointercancel', lift);
        canvas.addEventListener('pointerleave', () => { if (!st.pointerDown) { st.nozzle = null; kick(); } });

        chips.forEach((chip) => chip.addEventListener('click', () => {
            st.color = COLORS[chip.dataset.signColor].rgb;
            chips.forEach((c) => c.setAttribute('aria-checked', String(c === chip)));
            if (st.mode !== 'auto') setStatus(`${COLORS[chip.dataset.signColor].name} loaded. Press and drag on the sign to spray.`);
        }));
        respray?.addEventListener('click', resprayAll);

        mask.decode().then(() => {
            root.classList.add('is-live');
            fallback?.setAttribute('aria-hidden', 'true');
            new ResizeObserver(resize).observe(canvas);
            resize();
            new IntersectionObserver(([entry], io) => {
                if (entry.isIntersecting) { start(); io.disconnect(); }
            }, { threshold: 0.45 }).observe(root);
        }).catch(() => { /* keep the static image */ });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
