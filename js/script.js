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
        const targets = $$('.reveal, .section-head, .service, .tile, .show-card, .step, .legacy-photo, .legacy-copy, .estimate, .visit-info, .flourish');
        targets.forEach((el) => el.classList.add('will-reveal'));
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
        // Hero text plays immediately.
        requestAnimationFrame(() => document.documentElement.classList.add('is-loaded'));
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

    /* ---------- Showroom: arrows + drag to scroll ---------- */
    function initShowroom() {
        const track = $('[data-show-track]');
        if (!track) return;
        const step = () => (track.querySelector('.show-card')?.getBoundingClientRect().width || 400) + 24;
        $('[data-show-prev]').addEventListener('click', () => track.scrollBy({ left: -step(), behavior: 'smooth' }));
        $('[data-show-next]').addEventListener('click', () => track.scrollBy({ left: step(), behavior: 'smooth' }));
        track.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowRight') { e.preventDefault(); track.scrollBy({ left: step(), behavior: 'smooth' }); }
            if (e.key === 'ArrowLeft') { e.preventDefault(); track.scrollBy({ left: -step(), behavior: 'smooth' }); }
        });

        // Mouse drag (touch already scrolls natively).
        let down = null;
        let dragged = false;
        track.addEventListener('pointerdown', (e) => {
            if (e.pointerType !== 'mouse') return;
            down = { x: e.clientX, left: track.scrollLeft };
            dragged = false;
        });
        window.addEventListener('pointermove', (e) => {
            if (!down) return;
            const dx = e.clientX - down.x;
            if (Math.abs(dx) > 4) { dragged = true; track.classList.add('is-dragging'); }
            track.scrollLeft = down.left - dx;
        });
        window.addEventListener('pointerup', () => { down = null; track.classList.remove('is-dragging'); });
        // A drag shouldn't count as a click on the photo.
        track.addEventListener('click', (e) => { if (dragged) { e.preventDefault(); e.stopImmediatePropagation(); dragged = false; } }, true);
    }

    /* ---------- The Craft: build the paint stack as steps scroll by ---------- */
    function initCraft() {
        const stack = $('[data-stack]');
        const readout = $('[data-stack-step]');
        const name = $('[data-stack-name]');
        const layerNames = $$('.layer span', stack).map((s) => s.textContent);
        const steps = $$('.step');
        if (!stack || !steps.length) return;

        const setStep = (n) => {
            stack.dataset.level = String(n);
            readout.textContent = String(n).padStart(2, '0');
            if (name) name.textContent = layerNames[n - 1] || '';
            steps.forEach((s) => s.classList.toggle('is-active', Number(s.dataset.step) === n));
        };
        setStep(1);

        // Active step = the last one whose top has crossed the middle of the
        // viewport. Position-based, so scrolling back up un-builds the stack.
        let current = 1;
        let ticking = false;
        const update = () => {
            ticking = false;
            const line = window.innerHeight * 0.55;
            let n = 1;
            steps.forEach((s) => { if (s.getBoundingClientRect().top < line) n = Number(s.dataset.step); });
            if (n !== current) { current = n; setStep(n); }
        };
        window.addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
        update();

        // Tilt the panel with the pointer so the clear catches light.
        const visual = $('.craft-visual');
        if (!reduceMotion()) {
            visual.addEventListener('pointermove', (e) => {
                const r = visual.getBoundingClientRect();
                stack.style.setProperty('--rx', `${((e.clientY - r.top) / r.height - 0.5) * -10}deg`);
                stack.style.setProperty('--ry', `${((e.clientX - r.left) / r.width - 0.5) * 14}deg`);
            });
            visual.addEventListener('pointerleave', () => { stack.style.removeProperty('--rx'); stack.style.removeProperty('--ry'); });
        }
    }

    /* ---------- Portfolio filters ---------- */
    function initFilters() {
        const chips = $$('[data-filter]');
        const tiles = $$('[data-gallery] .tile');
        if (!chips.length) return;

        const apply = (cat) => {
            chips.forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.filter === cat)));
            tiles.forEach((t) => { t.hidden = cat !== 'all' && t.dataset.cat !== cat; });
        };

        chips.forEach((chip) => chip.addEventListener('click', () => {
            const cat = chip.dataset.filter;
            if (document.startViewTransition && !reduceMotion()) document.startViewTransition(() => apply(cat));
            else apply(cat);
        }));
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
            const scope = a.closest('[data-gallery], [data-show-track]') || document;
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

    /* ---------- Estimate form -> prefilled email (no backend needed) ---------- */
    function initEstimate() {
        const form = $('[data-estimate]');
        if (!form) return;
        const status = $('[data-form-status]', form);

        form.addEventListener('submit', (e) => {
            e.preventDefault();
            const required = $$('[required]', form);
            const missing = required.filter((el) => !el.value.trim());
            required.forEach((el) => el.toggleAttribute('aria-invalid', missing.includes(el)));
            if (missing.length) {
                status.textContent = 'Just need your name, phone, and vehicle so Dale can call you back.';
                status.dataset.tone = 'warn';
                missing[0].focus();
                return;
            }

            const data = new FormData(form);
            const work = data.getAll('work');
            const subject = `Estimate request: ${data.get('vehicle')}`;
            const body = [
                `Name: ${data.get('name')}`,
                `Phone: ${data.get('phone')}`,
                `Vehicle: ${data.get('vehicle')}`,
                `Work needed: ${work.length ? work.join(', ') : 'Not sure yet'}`,
                '',
                String(data.get('details') || '').trim() || '(No details given)',
                '',
                '— Sent from daleskc.com. Photos attached if I have them.',
            ].join('\n');

            window.location.href = `mailto:dalesautobody@gmail.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
            status.textContent = 'Your email app should be open with everything filled in. No email app? Call (913) 371-6654.';
            status.dataset.tone = 'ok';
        });

        form.addEventListener('input', (e) => { if (e.target.value.trim()) e.target.removeAttribute('aria-invalid'); });
    }

    /* ---------- Map loads on request (keeps Google off the critical path) ---------- */
    function initMap() {
        const btn = $('[data-map-load]');
        if (!btn) return;
        btn.addEventListener('click', () => {
            const iframe = document.createElement('iframe');
            iframe.src = 'https://www.google.com/maps?q=1310+State+Avenue+Kansas+City+KS+66102&output=embed';
            iframe.title = 'Map to Dale’s Auto Body, 1310 State Avenue, Kansas City, KS';
            iframe.loading = 'lazy';
            iframe.referrerPolicy = 'no-referrer-when-downgrade';
            iframe.allowFullscreen = true;
            btn.replaceWith(iframe);
        });
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
        [initYears, initStatus, initNav, initReveal, initCounters, initShowroom, initCraft, initFilters, initLightbox, initEstimate, initMap, initTactile]
            .forEach((fn) => { try { fn(); } catch (err) { console.error(`[daleskc] ${fn.name} failed`, err); } });
    });
})();
