/*
 * Candy paint, in real time, behind the whole site.
 *
 * A WebGL fragment shader renders a freshly sprayed panel on one fixed,
 * full-screen canvas: a slow-flowing body surface, translucent candy over a
 * metallic base, individually glinting metal flakes, and a clearcoat that
 * catches a studio light strip. The pointer is the light, everywhere on the
 * page. In the hero it burns bright; past the hero it settles into a dim,
 * even panel so content stays readable. The Finish picker repaints it all.
 *
 * No dependencies. Falls back to a CSS gradient when WebGL is unavailable,
 * renders a single still frame for prefers-reduced-motion, drops to 30fps
 * past the hero, and stops drawing when the tab is hidden.
 */
(() => {
    'use strict';

    const PAINTS = {
        tangerine: { name: 'Candy Tangerine', type: 'Candy over gold base', color: [1.0, 0.33, 0.08], flake: [1.0, 0.78, 0.42] },
        apple:     { name: 'Candy Apple Red', type: 'Candy over silver base', color: [0.82, 0.04, 0.12], flake: [1.0, 0.55, 0.45] },
        teal:      { name: 'Candy Teal',      type: 'Candy with silver flake', color: [0.02, 0.62, 0.6],  flake: [0.6, 1.0, 0.92] },
        rootbeer:  { name: 'Root Beer',       type: 'Metallic with gold flake', color: [0.5, 0.2, 0.07],   flake: [1.0, 0.72, 0.38] },
        purple:    { name: 'Midnight Purple', type: 'Pearl over black', color: [0.3, 0.12, 0.62],  flake: [0.78, 0.6, 1.0] },
        cobalt:    { name: 'Cobalt Blue',     type: 'Metallic with blue flake', color: [0.08, 0.28, 0.9],  flake: [0.62, 0.8, 1.0] },
    };

    const VERT = `
        attribute vec2 aPos;
        void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
    `;

    const FRAG = `
        precision highp float;
        uniform vec2  uRes;
        uniform float uTime;
        uniform vec2  uLight;     // 0..1 screen space, y up
        uniform vec3  uColor;
        uniform vec3  uFlake;
        uniform float uDpr;
        uniform float uAmbient;   // 0 = hero composition, 1 = dim page backdrop

        float hash(vec2 p) {
            p = fract(p * vec2(123.34, 456.21));
            p += dot(p, p + 45.32);
            return fract(p.x * p.y);
        }

        float noise(vec2 p) {
            vec2 i = floor(p), f = fract(p);
            vec2 u = f * f * (3.0 - 2.0 * f);
            return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x),
                       mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
        }

        // The body panel: long sweeping body lines plus a gentle, slow swell.
        float surface(vec2 p) {
            float t = uTime * 0.05;
            float h = 0.0;
            h += 0.55 * sin(p.x * 1.1 + p.y * 0.35 + t * 2.0);
            h += 0.25 * sin(p.x * 0.4 - p.y * 1.3 - t * 1.3);
            h += 0.35 * noise(p * 0.9 + vec2(t, -t * 0.7));
            h += 0.12 * noise(p * 2.3 - vec2(t * 0.6, t));
            // A crisp character line, like the crease down a fender.
            float crease = p.y - 0.25 * sin(p.x * 0.8 + t) + 0.35;
            h += 0.18 * smoothstep(0.0, 0.12, crease) ;
            return h;
        }

        // Tone map on luminance so hot candy stays candy instead of drifting to gold.
        vec3 tonemap(vec3 c) {
            float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
            vec3 t = c / (1.0 + l * 0.9);
            return mix(t, vec3(1.0), smoothstep(0.9, 2.2, l) * 0.6);
        }

        void main() {
            vec2 frag = gl_FragCoord.xy;
            float aspect = uRes.x / uRes.y;
            vec2 uv = frag / uRes;
            vec2 p = (uv - 0.5) * vec2(aspect, 1.0) * 3.0;

            // Surface normal from the height field.
            float e = 0.01;
            float h  = surface(p);
            float hx = surface(p + vec2(e, 0.0));
            float hy = surface(p + vec2(0.0, e));
            vec3 N = normalize(vec3(-(hx - h) / e * 0.22, -(hy - h) / e * 0.22, 1.0));

            // A point light hanging just above the panel, at the pointer.
            vec3 V = vec3(0.0, 0.0, 1.0);
            vec2 lp = (uLight - 0.5) * vec2(aspect, 1.0) * 3.0;
            vec2 d = lp - p;
            vec3 L = normalize(vec3(d, 1.1));
            vec3 H = normalize(L + V);
            float atten = 1.0 / (1.0 + dot(d, d) * 0.55);

            float ndl = max(dot(N, L), 0.0);
            float ndh = max(dot(N, H), 0.0);
            float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);

            // Candy: light travels through tinted lacquer, bounces off the
            // metallic base, and comes back saturated. Near-black where unlit.
            vec3 deep  = uColor * uColor * 0.012;
            vec3 candy = deep + uColor * pow(ndl, 3.0) * atten * 1.1;
            candy += uColor * pow(ndh, 24.0) * atten * 1.6;            // metallic base bloom
            candy += mix(uColor, vec3(1.0), 0.3) * pow(ndh, 90.0) * atten * 0.9;

            // Metal flake: a field of tiny, randomly tilted round mirrors.
            float cell = 2.2 * uDpr;
            vec2 fc = floor(frag / cell);
            vec2 fp = fract(frag / cell) - 0.5;
            float r1 = hash(fc), r2 = hash(fc + 17.3), r3 = hash(fc + 41.7);
            vec3 fN = normalize(N + vec3(r1 - 0.5, r2 - 0.5, 0.0) * 0.9);
            float fh = max(dot(fN, H), 0.0);
            float dotMask = smoothstep(0.5, 0.2, length(fp));
            float twinkle = 0.6 + 0.4 * sin(uTime * (1.2 + r1 * 2.5) + r2 * 6.28);
            float glint = pow(fh, 320.0) * step(0.5, r3) * dotMask * twinkle;
            vec3 flake = uFlake * glint * (0.25 + atten) * 2.2;
            flake += uFlake * pow(fh, 50.0) * atten * dotMask * 0.12;  // soft sparkle haze

            // Clearcoat: a hot specular plus a thin studio light-strip reflection.
            vec3 R = reflect(-V, N);
            float strip = smoothstep(0.05, 0.0, abs(R.x * 1.6 - (uLight.x - 0.5) * 1.2 + R.y * 0.35));
            strip *= smoothstep(-0.4, 0.5, R.y + (uLight.y - 0.5)) * 0.14;
            float spec = pow(ndh, 600.0) * atten * 3.0;
            vec3 clear = vec3(1.0, 0.97, 0.92) * (spec + strip) + uColor * fres * 0.05;

            vec3 col = candy + flake + clear;

            // Hero: keep the left side calm for the headline, vignette the rest.
            float calm = smoothstep(0.0, 0.62, uv.x);
            float vig = smoothstep(1.25, 0.3, length((uv - vec2(0.62, 0.5)) * vec2(1.0, 1.25)));
            float hero = mix(0.45, 1.0, calm) * mix(0.25, 1.0, vig);
            // Past the hero: an even, dim panel; only the light near the
            // pointer really wakes it up, like a flashlight on wet paint.
            float spot = 1.0 / (1.0 + dot(d, d) * 1.6);
            float page = 0.13 + 0.34 * spot;
            col *= mix(hero, page, uAmbient);

            col = clamp(tonemap(col), 0.0, 1.0);
            col = pow(col, vec3(0.4545));
            col += (hash(frag + fract(uTime)) - 0.5) / 255.0;    // dither away banding
            gl_FragColor = vec4(col, 1.0);
        }
    `;

    const lerp = (a, b, t) => a + (b - a) * t;
    const lerp3 = (a, b, t) => a.map((v, i) => lerp(v, b[i], t));

    function compile(gl, type, src) {
        const s = gl.createShader(type);
        gl.shaderSource(s, src);
        gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
            throw new Error(gl.getShaderInfoLog(s) || 'shader compile failed');
        }
        return s;
    }

    function init() {
        const canvas = document.querySelector('[data-paint]');
        if (!canvas) return;
        const root = document.documentElement;
        const hero = document.querySelector('.hero');
        const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
        const fallback = () => { root.classList.add('no-webgl'); wireFinish(null); };

        const gl = canvas.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'high-performance' });
        if (!gl) return fallback();

        let program;
        try {
            program = gl.createProgram();
            gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERT));
            gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAG));
            gl.linkProgram(program);
            if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
        } catch (err) {
            console.warn('[paint] falling back to CSS:', err);
            return fallback();
        }
        gl.useProgram(program);

        const buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
        const aPos = gl.getAttribLocation(program, 'aPos');
        gl.enableVertexAttribArray(aPos);
        gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

        const u = Object.fromEntries(
            ['uRes', 'uTime', 'uLight', 'uColor', 'uFlake', 'uDpr', 'uAmbient'].map((n) => [n, gl.getUniformLocation(program, n)])
        );

        const state = {
            light: [0.72, 0.62], lightTarget: [0.72, 0.62],
            color: [...PAINTS.tangerine.color], colorTarget: [...PAINTS.tangerine.color],
            flake: [...PAINTS.tangerine.flake], flakeTarget: [...PAINTS.tangerine.flake],
            ambient: 0, lastPointer: -1e9, lastFrame: 0,
            visible: !document.hidden, raf: 0, start: performance.now(), dpr: 1,
        };

        function resize() {
            // Cap the buffer: flakes need real pixels, but a 4K screen doesn't.
            const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
            const width = window.innerWidth, height = window.innerHeight;
            state.dpr = width * height * dpr * dpr > 2.4e6 ? Math.sqrt(2.4e6 / (width * height)) : dpr;
            canvas.width = Math.max(1, Math.round(width * state.dpr));
            canvas.height = Math.max(1, Math.round(height * state.dpr));
            gl.viewport(0, 0, canvas.width, canvas.height);
            draw(performance.now());
        }

        // 0 while the hero fills the screen, easing to 1 as it scrolls away.
        const ambientTarget = () => {
            const h = hero ? hero.offsetHeight : window.innerHeight;
            return Math.min(Math.max((window.scrollY - h * 0.15) / (h * 0.6), 0), 1);
        };

        function draw(now) {
            const t = (now - state.start) / 1000;

            // Idle: the light drifts on its own, like walking past the car.
            if (now - state.lastPointer > 3500 && !reduceMotion.matches) {
                const hero = [0.68 + Math.cos(t * 0.23) * 0.22, 0.58 + Math.sin(t * 0.31) * 0.2];
                // Below the hero, keep the idle light out from behind the text.
                const edge = [0.9 + Math.cos(t * 0.17) * 0.06, 0.5 + Math.sin(t * 0.21) * 0.35];
                state.lightTarget = [lerp(hero[0], edge[0], state.ambient), lerp(hero[1], edge[1], state.ambient)];
            }
            state.light = lerp3(state.light, state.lightTarget, 0.08);
            state.color = lerp3(state.color, state.colorTarget, 0.06);
            state.flake = lerp3(state.flake, state.flakeTarget, 0.06);
            state.ambient = lerp(state.ambient, ambientTarget(), 0.12);

            gl.uniform2f(u.uRes, canvas.width, canvas.height);
            gl.uniform1f(u.uTime, reduceMotion.matches ? 12.0 : t);
            gl.uniform2f(u.uLight, state.light[0], state.light[1]);
            gl.uniform3fv(u.uColor, state.color);
            gl.uniform3fv(u.uFlake, state.flake);
            gl.uniform1f(u.uDpr, state.dpr);
            gl.uniform1f(u.uAmbient, state.ambient);
            gl.drawArrays(gl.TRIANGLES, 0, 3);
        }

        function loop(now) {
            state.raf = 0;
            if (!state.visible) return;
            // Past the hero the panel is calm; 30fps is plenty and saves battery.
            const minGap = state.ambient > 0.95 ? 1000 / 31 : 0;
            if (now - state.lastFrame >= minGap) { draw(now); state.lastFrame = now; }
            if (!reduceMotion.matches) state.raf = requestAnimationFrame(loop);
        }

        function wake() {
            if (!state.raf && state.visible) state.raf = requestAnimationFrame(loop);
        }

        // With reduced motion there's no loop, so ease changes over a few frames.
        function nudge() {
            if (!reduceMotion.matches) return wake();
            let n = 0;
            const step = (now) => { draw(now); if (++n < 40) requestAnimationFrame(step); };
            requestAnimationFrame(step);
        }

        window.addEventListener('pointermove', (e) => {
            if (e.pointerType === 'touch') return;
            state.lightTarget = [e.clientX / window.innerWidth, 1 - e.clientY / window.innerHeight];
            state.lastPointer = performance.now();
            nudge();
        }, { passive: true });
        window.addEventListener('scroll', nudge, { passive: true });

        document.addEventListener('visibilitychange', () => {
            state.visible = !document.hidden;
            wake();
        });

        canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); root.classList.add('no-webgl'); });
        window.addEventListener('resize', resize);
        reduceMotion.addEventListener?.('change', () => { resize(); wake(); });

        wireFinish((key) => {
            state.colorTarget = [...PAINTS[key].color];
            state.flakeTarget = [...PAINTS[key].flake];
            nudge();
        });

        resize();
        wake();
        root.classList.add('is-painted');
    }

    // The Finish picker: a radio group of paint chips. Arrow keys move
    // between chips; the choice repaints the backdrop and the site accents.
    function wireFinish(onPick) {
        const chips = [...document.querySelectorAll('[data-swatch]')];
        const name = document.querySelector('[data-finish-name]');
        const type = document.querySelector('[data-finish-type]');
        const group = document.querySelector('[data-finish]');
        if (!chips.length) return;

        const pick = (btn, focus) => {
            const key = btn.dataset.swatch;
            chips.forEach((b) => {
                const on = b === btn;
                b.setAttribute('aria-checked', String(on));
                b.tabIndex = on ? 0 : -1;
            });
            if (name) name.textContent = PAINTS[key].name;
            if (type) type.textContent = PAINTS[key].type;
            group?.style.setProperty('--i', String(chips.indexOf(btn)));
            document.documentElement.style.setProperty('--paint', getComputedStyle(btn).getPropertyValue('--c').trim());
            if (focus) btn.focus();
            onPick?.(key);
        };

        chips.forEach((btn, i) => {
            btn.addEventListener('click', () => pick(btn));
            btn.addEventListener('keydown', (e) => {
                const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
                if (!step) return;
                e.preventDefault();
                pick(chips[(i + step + chips.length) % chips.length], true);
            });
        });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
