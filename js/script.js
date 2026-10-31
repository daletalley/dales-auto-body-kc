/* Dale's Auto Body: site behavior. No dependencies. */
(() => {
    'use strict';

    // ---- Config: change hours or photos here --------------------------------
    const SHOP = {
        timeZone: 'America/Chicago',
        openDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
        opens: 10 * 60,   // minutes after midnight (10:00a)
        closes: 18 * 60   // (6:00p)
    };

    // [src, alt]. The first entry must match the <img> in index.html.
    const PHOTOS = [
        ['images/work/shop-741.webp', "Dale's Auto Body shop on State Avenue"],
        ['images/work/20-640.webp', 'Peach fairing and tour pack with chrome trim, close up'],
        ['images/work/10-640.webp', 'Tangerine metallic bagger inside the shop with its owner in the background'],
        ['images/work/05-480.webp', 'Black saddlebags with purple and lime spear graphics'],
        ['images/work/18-640.webp', 'Front three-quarter view of the peach bagger with twin headlights and big chrome wheel'],
        ['images/work/23-640.webp', 'Root beer and gold road glide with sweeping graphics, whitewall tires and spoke wheels'],
        ['images/work/25-640.webp', 'Root beer bagger with gold graphics and tan stitched seat'],
        ['images/work/29-640.webp', 'Burgundy touring bike with tan seat and chrome engine, three-quarter view'],
        ['images/work/33-354.webp', 'Rear of a blue bike with LED taillight strip'],
        ['images/work/35-640.webp', 'Close up of black pleated seat stitching'],
        ['images/work/42-640.webp', 'Yellow bagger with black graphics on a motorcycle lift'],
        ['images/work/51-580.webp', 'Candy red fender with a Kansas City Chiefs emblem'],
        ['images/work/55-640.webp', 'Black road glide with stretched bags parked by a white fence'],
        ['images/work/57-640.webp', 'Black road glide side profile on blacktop'],
        ['images/work/68-640.webp', 'Orange and black bagger with outlined flame graphics and a polished spinner front wheel'],
        ['images/work/74-640.webp', 'Chrome V-twin engine on a black bagger']
    ];

    const AUTOPLAY_MS = 5500;
    const FADE_MS = 600;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const $ = (sel, root = document) => root.querySelector(sel);

    // ---- Hero photo slider ---------------------------------------------------
    function initSlider() {
        const slider = $('[data-slider]');
        if (!slider) return;
        const front = $('[data-hero-img]', slider);
        const back = $('[data-hero-next-img]', slider);
        const count = $('[data-hero-count]', slider);
        const toggle = $('[data-hero-toggle]', slider);
        if (!front || !back) return;

        const total = () => PHOTOS.length;
        const loadImage = (src) => new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(src);
            img.onerror = reject;
            img.src = src;
        });

        let index = 0;
        let pending = null;   // latest requested index while a fade is running
        let fading = false;
        let timer = null;
        let hoverPause = false;
        let userPaused = reduceMotion;

        const setCount = () => { if (count) count.textContent = `${index + 1} / ${total()}`; };

        async function show(target) {
            if (fading) { pending = target; return; }
            const n = total();
            const next = ((target % n) + n) % n;
            if (next === index) return;
            fading = true;
            const [src, alt] = PHOTOS[next];
            try {
                await loadImage(src);
                back.src = src;
                back.classList.add('is-in');
                await new Promise((r) => setTimeout(r, reduceMotion ? 0 : FADE_MS));
                front.src = src;
                front.alt = alt;
                if (front.decode) await front.decode().catch(() => {});
                index = next;
                setCount();
            } catch {
                // Photo failed to load; drop it so the slider keeps working
                PHOTOS.splice(next, 1);
                if (next < index) index -= 1;
                setCount();
            } finally {
                back.classList.remove('is-in');
                fading = false;
            }
            loadImage(PHOTOS[(index + 1) % total()][0]).catch(() => {});
            if (pending !== null) { const p = pending; pending = null; show(p); }
        }

        const running = () => !userPaused && !hoverPause && !document.hidden;

        function schedule() {
            clearInterval(timer);
            timer = running() ? setInterval(() => show(index + 1), AUTOPLAY_MS) : null;
            // Announce slide changes only when they come from the visitor, not autoplay
            slider.setAttribute('aria-live', running() ? 'off' : 'polite');
        }

        const step = (d) => { show((pending ?? index) + d); schedule(); };

        $('[data-hero-prev]', slider)?.addEventListener('click', () => step(-1));
        $('[data-hero-next]', slider)?.addEventListener('click', () => step(1));

        toggle?.addEventListener('click', () => {
            userPaused = !userPaused;
            toggle.setAttribute('aria-pressed', String(userPaused));
            toggle.setAttribute('aria-label', userPaused ? 'Play slideshow' : 'Pause slideshow');
            schedule();
        });
        if (toggle && reduceMotion) {
            toggle.setAttribute('aria-pressed', 'true');
            toggle.setAttribute('aria-label', 'Play slideshow');
        }

        slider.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
            if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
        });

        const pause = () => { hoverPause = true; schedule(); };
        const resume = () => { hoverPause = false; schedule(); };
        slider.addEventListener('mouseenter', pause);
        slider.addEventListener('mouseleave', resume);
        slider.addEventListener('focusin', pause);
        slider.addEventListener('focusout', (e) => { if (!slider.contains(e.relatedTarget)) resume(); });
        document.addEventListener('visibilitychange', schedule);

        // Swipe (horizontal only, so vertical page scrolling is untouched)
        let start = null;
        slider.addEventListener('touchstart', (e) => {
            const t = e.touches[0];
            start = { x: t.clientX, y: t.clientY };
        }, { passive: true });
        slider.addEventListener('touchend', (e) => {
            if (!start) return;
            const t = e.changedTouches[0];
            const dx = t.clientX - start.x;
            const dy = t.clientY - start.y;
            if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.5) step(dx < 0 ? 1 : -1);
            start = null;
        }, { passive: true });

        setCount();
        // Wait until the page is idle before warming the next photo
        (window.requestIdleCallback || setTimeout)(() => loadImage(PHOTOS[1][0]).catch(() => {}));
        schedule();
    }

    // ---- Fade sections in as they scroll into view ---------------------------
    function initReveal() {
        const items = document.querySelectorAll('.reveal');
        if (reduceMotion || !('IntersectionObserver' in window)) return;
        document.documentElement.classList.add('js-reveal');
        const io = new IntersectionObserver((entries) => {
            for (const entry of entries) {
                if (!entry.isIntersecting) continue;
                entry.target.classList.add('is-visible');
                io.unobserve(entry.target);
            }
        }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
        items.forEach((el) => {
            // Anything already on screen shows immediately, so nothing flashes on load
            const r = el.getBoundingClientRect();
            if (r.top < window.innerHeight && r.bottom > 0) el.classList.add('is-visible');
            else io.observe(el);
        });
    }

    // ---- Header shadow + mobile call bar -------------------------------------
    function initScrollUI() {
        const header = $('[data-header]');
        const bar = $('[data-callbar]');
        const heroCta = $('.hero .cta-row');
        const footer = $('.footer');

        if (header) {
            // A 1px sentinel at the top of the page avoids work on every scroll event
            const sentinel = document.createElement('div');
            sentinel.setAttribute('aria-hidden', 'true');
            sentinel.style.cssText = 'position:absolute;top:0;height:8px;width:1px;';
            document.body.prepend(sentinel);
            new IntersectionObserver(([e]) => header.classList.toggle('is-scrolled', !e.isIntersecting)).observe(sentinel);
        }

        if (bar && heroCta && footer && 'IntersectionObserver' in window) {
            const seen = { cta: true, footer: false };
            const update = () => {
                const show = !seen.cta && !seen.footer;
                bar.classList.toggle('is-shown', show);
                bar.toggleAttribute('inert', !show);
            };
            new IntersectionObserver(([e]) => { seen.cta = e.isIntersecting; update(); }).observe(heroCta);
            new IntersectionObserver(([e]) => { seen.footer = e.isIntersecting; update(); }).observe(footer);
        }
    }

    // ---- Open / closed status, in Kansas City time ---------------------------
    function shopClock(date = new Date()) {
        const parts = {};
        for (const p of new Intl.DateTimeFormat('en-US', {
            timeZone: SHOP.timeZone, weekday: 'short', hour: 'numeric', minute: 'numeric', hourCycle: 'h23'
        }).formatToParts(date)) parts[p.type] = p.value;
        return { day: parts.weekday, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
    }

    function updateStatus() {
        const { day, minutes } = shopClock();
        const workday = SHOP.openDays.includes(day);
        const isOpen = workday && minutes >= SHOP.opens && minutes < SHOP.closes;

        let pill;
        let detail;
        if (isOpen) {
            pill = 'Open now • till 6p';
            detail = 'Open right now. Come on by.';
        } else if (!workday) {
            pill = 'Closed • weekends by appt.';
            detail = 'Closed today. Call to set up a weekend appointment.';
        } else if (minutes < SHOP.opens) {
            pill = 'Closed • opens 10a';
            detail = 'Opens at 10a today. Leave a message and Dale will call back.';
        } else {
            pill = day === 'Fri' ? 'Closed • weekends by appt.' : 'Closed • opens 10a';
            detail = 'Closed for the day. Leave a message and Dale will call back.';
        }

        const statusEl = document.getElementById('navStatus');
        if (statusEl && statusEl.textContent !== pill) {
            statusEl.textContent = pill;
            statusEl.classList.toggle('open', isOpen);
            statusEl.classList.toggle('closed', !isOpen);
        }
        const todayEl = $('[data-today]');
        if (todayEl && todayEl.textContent !== detail) {
            todayEl.textContent = detail;
            todayEl.classList.toggle('is-open', isOpen);
        }
    }

    function initStatus() {
        updateStatus();
        // Re-check at the top of each minute, and when the tab comes back into view
        setTimeout(() => { updateStatus(); setInterval(updateStatus, 60_000); }, 60_000 - (Date.now() % 60_000));
        document.addEventListener('visibilitychange', () => { if (!document.hidden) updateStatus(); });
    }

    // ---- Boot ------------------------------------------------------------------
    function init() {
        document.querySelectorAll('[data-year]').forEach((el) => { el.textContent = new Date().getFullYear(); });
        initStatus();
        initReveal();
        initScrollUI();
        initSlider();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
