/*
 * Dale's Auto Body — page behavior.
 * Each feature is a small self-contained init; every one of them is optional,
 * so the page works (and reads) fine with JavaScript off.
 */
(() => {
    'use strict';

    const $ = (sel, root = document) => root.querySelector(sel);
    const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
    const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const FOUNDED = 1975;
    const SHOP_TZ = 'America/Chicago';
    // Day index (0 = Sunday) -> [open hour, close hour], or null for appointment-only.
    const HOURS = { 0: null, 1: [10, 18], 2: [10, 18], 3: [10, 18], 4: [10, 18], 5: [10, 18], 6: null };
    const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    /* ---------- Shop clock: what time is it on State Avenue? ---------- */
    function shopNow() {
        const parts = new Intl.DateTimeFormat('en-US', {
            timeZone: SHOP_TZ, weekday: 'short', hour: 'numeric', minute: 'numeric', hourCycle: 'h23', year: 'numeric',
        }).formatToParts(new Date());
        const get = (type) => parts.find((p) => p.type === type)?.value;
        const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'));
        return { day, minutes: Number(get('hour')) * 60 + Number(get('minute')), year: Number(get('year')) };
    }

    const fmtHour = (h) => `${h % 12 || 12} ${h < 12 ? 'AM' : 'PM'}`;

    function nextOpening(day) {
        for (let i = 1; i <= 7; i++) {
            const d = (day + i) % 7;
            if (HOURS[d]) return `${i === 1 ? 'tomorrow' : DAY_NAMES[d]} ${fmtHour(HOURS[d][0])}`;
        }
        return '';
    }

    function shopStatus() {
        const { day, minutes } = shopNow();
        const today = HOURS[day];
        if (!today) return { state: 'appt', text: `By appointment today · opens ${nextOpening(day)}`, short: 'By appointment', day };
        const [open, close] = today.map((h) => h * 60);
        if (minutes >= open && minutes < close) {
            const left = close - minutes;
            const soon = left <= 60 ? ` · closing in ${left} min` : ` · until ${fmtHour(today[1])}`;
            return { state: 'open', text: `Open now${soon}`, short: 'Open now', day };
        }
        const when = minutes < open ? `today ${fmtHour(today[0])}` : nextOpening(day);
        return { state: 'closed', text: `Closed · opens ${when}`, short: 'Closed', day };
    }

    function initStatus() {
        const update = () => {
            const s = shopStatus();
            $$('[data-status]').forEach((el) => {
                el.dataset.state = s.state;
                $('[data-status-text]', el).textContent = el.classList.contains('status-lg') ? s.short : s.text;
            });
            $$('[data-hours] tr').forEach((tr) => tr.toggleAttribute('data-today', Number(tr.dataset.day) === s.day));
        };
        update();
        setInterval(update, 30_000);
    }

    /* ---------- Years in business, always current ---------- */
    function initYears() {
        const { year } = shopNow();
        const years = year - FOUNDED;
        const words = { 50: 'Fifty', 51: 'Fifty-one', 52: 'Fifty-two', 53: 'Fifty-three', 54: 'Fifty-four', 55: 'Fifty-five' };
        $$('[data-years]').forEach((el) => (el.textContent = String(years)));
        $$('[data-years-count]').forEach((el) => (el.textContent = String(years)));
        $$('[data-years-word]').forEach((el) => (el.textContent = words[years] || String(years)));
        $$('[data-year]').forEach((el) => (el.textContent = String(year)));
    }

    /* ---------- Header + mobile nav ---------- */
    function initNav() {
        const header = $('[data-header]');
        const toggle = $('[data-nav-toggle]');
        const menu = $('[data-nav-menu]');

        const onScroll = () => header.classList.toggle('is-scrolled', window.scrollY > 24);
        onScroll();
        window.addEventListener('scroll', onScroll, { passive: true });

        const setOpen = (open) => {
            toggle.setAttribute('aria-expanded', String(open));
            header.classList.toggle('nav-open', open);
            document.body.classList.toggle('no-scroll', open);
        };
        toggle.addEventListener('click', () => setOpen(toggle.getAttribute('aria-expanded') !== 'true'));
        menu.addEventListener('click', (e) => { if (e.target.closest('a')) setOpen(false); });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && header.classList.contains('nav-open')) { setOpen(false); toggle.focus(); }
        });

        // Highlight the section in view.
        const links = new Map($$('.nav-menu a[href^="#"]').map((a) => [a.getAttribute('href').slice(1), a]));
        const spy = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                const link = links.get(entry.target.id);
                if (link && entry.isIntersecting) {
                    links.forEach((l) => l.removeAttribute('aria-current'));
                    link.setAttribute('aria-current', 'true');
                }
            });
        }, { rootMargin: '-45% 0px -50% 0px' });
        links.forEach((_, id) => { const s = document.getElementById(id); if (s) spy.observe(s); });
    }

    /* ---------- Reveal on scroll ---------- */
    function initReveal() {
        const root = document.documentElement;
        const targets = $$('.reveal, .section-head .eyebrow, .section-head .section-lede, .filters, .service, .legacy-copy p, .visit-contact, .map, .booth-steps, .sign-bar');
        targets.forEach((el) => el.classList.add('will-reveal'));
        // Hero text plays immediately (instantly, with reduced motion).
        requestAnimationFrame(() => root.classList.add('is-loaded'));
        if (reduceMotion() || !('IntersectionObserver' in window)) {
            targets.forEach((el) => el.classList.add('is-in'));
            return;
        }
        const io = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (!entry.isIntersecting) return;
                entry.target.classList.add('is-in');
                io.unobserve(entry.target);
            });
        }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
        targets.forEach((el) => io.observe(el));
    }

    /* ---------- Spray-on: headings and photos get painted in as they arrive ---------- */
    function initSpray() {
        const targets = $$('.section-head h2, .tile a, .legacy-photo, .booth, .sign-stage, .footer-mark');
        if (reduceMotion() || !('IntersectionObserver' in window) || !CSS.supports('(mask-image: none) or (-webkit-mask-image: none)')) return;
        targets.forEach((el) => el.classList.add('will-spray'));
        let batch = 0;
        let batchTimer = 0;
        const io = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (!entry.isIntersecting) return;
                const el = entry.target;
                // Photos arriving together get sprayed one after another, like passes.
                el.style.setProperty('--spray-delay', `${Math.min(batch++, 8) * 90}ms`);
                clearTimeout(batchTimer);
                batchTimer = setTimeout(() => { batch = 0; }, 120);
                el.classList.add('is-sprayed');
                el.addEventListener('animationend', (e) => {
                    if (e.animationName === 'spray-in') el.classList.add('spray-done');
                }, { once: false });
                io.unobserve(el);
            });
        }, { rootMargin: '0px 0px -12% 0px', threshold: 0.15 });
        targets.forEach((el) => io.observe(el));
    }

    /* ---------- Count-up numbers ---------- */
    function initCounters() {
        const els = $$('[data-count]');
        if (reduceMotion()) return;
        const io = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (!entry.isIntersecting) return;
                io.unobserve(entry.target);
                const el = entry.target;
                const end = Number(el.textContent);
                const t0 = performance.now();
                const tick = (now) => {
                    const p = Math.min((now - t0) / 1400, 1);
                    el.textContent = String(Math.round(end * (1 - Math.pow(1 - p, 3))));
                    if (p < 1) requestAnimationFrame(tick);
                };
                requestAnimationFrame(tick);
            });
        }, { threshold: 0.6 });
        els.forEach((el) => io.observe(el));
    }

    /* ---------- Portfolio filters + "see all" ---------- */
    function initFilters() {
        const chips = $$('[data-filter]');
        const tiles = $$('[data-gallery] .tile');
        const more = $('[data-more]');
        const LIMIT = 16;
        let expanded = false;
        let current = 'all';
        if (!chips.length) return;

        const apply = (cat) => {
            current = cat;
            chips.forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.filter === cat)));
            tiles.forEach((t, i) => {
                const match = cat === 'all' || t.dataset.cat === cat;
                t.hidden = !match || (cat === 'all' && !expanded && i >= LIMIT);
            });
            if (more) {
                more.hidden = cat !== 'all' || expanded || tiles.length <= LIMIT;
                const count = $('[data-more-count]', more);
                if (count) count.textContent = `(${tiles.length})`;
            }
        };
        const run = (fn) => (document.startViewTransition && !reduceMotion() ? document.startViewTransition(fn) : fn());

        chips.forEach((chip) => chip.addEventListener('click', () => run(() => apply(chip.dataset.filter))));
        more?.addEventListener('click', () => {
            expanded = true;
            run(() => apply(current));
            tiles[LIMIT]?.querySelector('a')?.focus({ preventScroll: true });
        });
        apply('all');
    }

    /* ---------- Lightbox (native <dialog>: focus trap + Esc for free) ---------- */
    function initLightbox() {
        const dialog = $('[data-lightbox-dialog]');
        if (!dialog || typeof dialog.showModal !== 'function') return;
        const img = $('[data-lightbox-img]', dialog);
        const caption = $('[data-lightbox-caption]', dialog);
        const label = $('[data-lightbox-label]', dialog);
        const count = $('[data-lightbox-count]', dialog);
        let group = [];
        let index = 0;
        let opener = null;

        const show = (i) => {
            index = (i + group.length) % group.length;
            const a = group[index];
            img.classList.remove('is-ready');
            img.onload = () => img.classList.add('is-ready');
            img.src = a.getAttribute('href');
            img.alt = a.dataset.caption || '';
            caption.textContent = a.dataset.caption || '';
            label.textContent = a.dataset.label || '';
            count.textContent = `${index + 1} / ${group.length}`;
            // Warm the cache for the neighbors.
            [index + 1, index - 1].forEach((n) => { new Image().src = group[(n + group.length) % group.length].getAttribute('href'); });
        };

        document.addEventListener('click', (e) => {
            const a = e.target.closest('[data-lightbox]');
            if (!a) return;
            e.preventDefault();
            opener = a;
            // Navigate within whichever collection was clicked, skipping filtered-out tiles.
            const scope = a.closest('[data-gallery]') || document;
            group = $$('[data-lightbox]', scope).filter((el) => !el.closest('[hidden]'));
            dialog.showModal();
            document.body.classList.add('no-scroll');
            show(group.indexOf(a));
        });

        $('[data-lightbox-prev]', dialog).addEventListener('click', () => show(index - 1));
        $('[data-lightbox-next]', dialog).addEventListener('click', () => show(index + 1));
        $('[data-lightbox-close]', dialog).addEventListener('click', () => dialog.close());
        dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
        dialog.addEventListener('close', () => { document.body.classList.remove('no-scroll'); opener?.focus({ preventScroll: true }); });
        dialog.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowRight') show(index + 1);
            if (e.key === 'ArrowLeft') show(index - 1);
        });

        // Swipe.
        let x0 = null;
        dialog.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; }, { passive: true });
        dialog.addEventListener('touchend', (e) => {
            if (x0 === null) return;
            const dx = e.changedTouches[0].clientX - x0;
            if (Math.abs(dx) > 50) show(index + (dx < 0 ? 1 : -1));
            x0 = null;
        });
    }

    /* ---------- Pinstripe lettering: drawn in, drifting, catching the light ---------- */
    // Big outlined words behind each section, like a striper's practice board.
    // Each is two outlines a hair apart (a double pinstripe) plus a glint that
    // runs along the line. They draw themselves in when the section arrives,
    // float slowly, and move at their own depth as you scroll.
    const GHOSTS = {
        top:      [['1975', 3, 72, 8, -9, 0.3], ['KC', 86, 12, 9, 7, 0.45]],
        work:     [['1975', 62, 2, 18, -4, 0.3], ['KC', -2, 50, 16, -10, 0.55], ['State Avenue', 46, 86, 9, 3, 0.2]],
        craft:    [['1310 State Avenue', -2, 2, 9, -4, 0.3], ['1975', 78, 80, 12, 8, 0.5]],
        services: [['State Avenue', 34, 0, 11, -3, 0.3], ['1975', -6, 66, 15, -12, 0.45]],
        legacy:   [['1975', 50, -4, 25, -6, 0.3], ['1975', -8, 34, 14, 10, 0.55], ['1975', 70, 60, 11, -14, 0.75], ['1975', 26, 82, 17, 4, 0.4], ['1975', 88, 24, 8, 18, 0.9], ['1975', 8, 2, 9, -20, 0.8], ['KC', 40, 44, 12, -2, 0.15]],
        sign:     [['KC', -4, 10, 34, -8, 0.25], ['1975', 74, 70, 13, 6, 0.5]],
        visit:    [['1310 State Avenue', 6, 0, 10, -3, 0.3], ['State Avenue', 48, 78, 10, -6, 0.45], ['1975', 82, 36, 10, 12, 0.6]],
        footer:   [['1975', 66, 4, 17, -6, 0.3], ['KC', -4, 44, 12, 10, 0.5]],
    };

    function initGhosts() {
        const NS = 'http://www.w3.org/2000/svg';
        const still = reduceMotion();
        const layers = [];
        let gid = 0;

        const build = () => Object.entries(GHOSTS).forEach(([id, list]) => {
            const host = id === 'footer' ? $('.site-footer') : document.getElementById(id);
            if (!host) return;
            host.classList.add('has-ghosts');
            const layer = document.createElement('div');
            layer.className = 'ghosts';
            layer.setAttribute('aria-hidden', 'true');
            host.prepend(layer);
            const items = list.map(([text, x, y, size, rot, depth], n) => {
                const wrap = document.createElement('div');
                wrap.className = 'ghost';
                wrap.style.cssText = `left:${x}%;top:${y}%;--h:${size}vw;--r:${rot}deg;--d:${n * 0.35}s;--float:${26 + ((n * 7) % 12)}s`;
                const svg = document.createElementNS(NS, 'svg');
                const id = `glint-${gid++}`;
                svg.innerHTML = `<defs><linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="160" y2="40">
                        <stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="0.5" stop-color="#fff" stop-opacity="0.9"/><stop offset="1" stop-color="#fff" stop-opacity="0"/>
                        ${still ? '' : `<animateTransform attributeName="gradientTransform" type="translate" from="-400 0" to="1400 0" dur="${7 + (n % 4) * 1.7}s" begin="${n * 1.3}s" repeatCount="indefinite"/>`}
                    </linearGradient></defs>
                    <text class="g-back" x="0" y="0">${text}</text>
                    <text class="g-front" x="2.4" y="2.4">${text}</text>
                    <text class="g-glint" x="2.4" y="2.4" stroke="url(#${id})">${text}</text>`;
                wrap.append(svg);
                layer.append(wrap);
                return { wrap, svg, depth, rot };
            });
            layers.push({ host, layer, items });
        });

        // Fit each SVG's viewBox to its text once the display face is ready.
        const fit = () => layers.forEach(({ items }) => items.forEach(({ svg }) => {
            const b = svg.querySelector('text').getBBox();
            if (!b.width) return;
            svg.setAttribute('viewBox', `${b.x - 4} ${b.y - 4} ${b.width + 12} ${b.height + 12}`);
        }));

        build();
        (document.fonts?.ready || Promise.resolve()).then(fit);

        if (still || !('IntersectionObserver' in window)) {
            layers.forEach(({ layer }) => layer.classList.add('is-drawn'));
            return;
        }
        const io = new IntersectionObserver((entries) => entries.forEach((e) => {
            if (e.isIntersecting) { e.target.classList.add('is-drawn'); io.unobserve(e.target); }
        }), { threshold: 0.12 });
        layers.forEach(({ layer }) => io.observe(layer));

        // Parallax: every word sits at its own depth.
        let ticking = false;
        const update = () => {
            ticking = false;
            const vh = window.innerHeight;
            layers.forEach(({ host, items }) => {
                const r = host.getBoundingClientRect();
                if (r.bottom < -200 || r.top > vh + 200) return;
                const prog = (r.top + r.height / 2 - vh / 2) / vh;
                items.forEach(({ wrap, depth }) => {
                    wrap.style.setProperty('--py', `${(-prog * depth * 160).toFixed(1)}px`);
                    wrap.style.setProperty('--pr', `${(prog * depth * 5).toFixed(2)}deg`);
                });
            });
        };
        window.addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
        window.addEventListener('resize', update);
        update();
    }

    /* ---------- Small tactile touches ---------- */
    function initTactile() {
        if (reduceMotion() || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;

        $$('[data-magnetic]').forEach((el) => {
            el.addEventListener('pointermove', (e) => {
                const r = el.getBoundingClientRect();
                el.style.transform = `translate(${(e.clientX - r.left - r.width / 2) * 0.18}px, ${(e.clientY - r.top - r.height / 2) * 0.3}px)`;
            });
            el.addEventListener('pointerleave', () => { el.style.transform = ''; });
        });

        // Service cards: a light sheen that follows the cursor across the "clear".
        $$('[data-tilt]').forEach((el) => {
            el.addEventListener('pointermove', (e) => {
                const r = el.getBoundingClientRect();
                el.style.setProperty('--mx', `${((e.clientX - r.left) / r.width) * 100}%`);
                el.style.setProperty('--my', `${((e.clientY - r.top) / r.height) * 100}%`);
            });
        });
    }

    document.addEventListener('DOMContentLoaded', () => {
        [initYears, initStatus, initNav, initGhosts, initReveal, initSpray, initCounters, initFilters, initLightbox, initTactile]
            .forEach((fn) => { try { fn(); } catch (err) { console.error(`[daleskc] ${fn.name} failed`, err); } });
    });
})();
