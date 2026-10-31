document.addEventListener('DOMContentLoaded', () => {
    initHeroSlider();
    initReveal();
    initHeaderShadow();
    updateOpenStatus();
    setInterval(updateOpenStatus, 60 * 1000);
    document.querySelectorAll('[data-year]').forEach((el) => { el.textContent = new Date().getFullYear(); });
});

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Single source of truth for hero gallery imagery: [src, alt]
const galleryImages = [
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

function initHeroSlider() {
    const slider = document.querySelector('[data-slider]');
    const front = document.querySelector('[data-hero-img]');
    const back = document.querySelector('[data-hero-next-img]');
    const count = document.querySelector('[data-hero-count]');
    if (!slider || !front || !back) return;

    const total = galleryImages.length;
    let index = 0;
    let busy = false;
    let timer = null;
    let paused = false;

    const preload = (i) => { const img = new Image(); img.src = galleryImages[(i + total) % total][0]; };

    const show = (i) => {
        const next = (i + total) % total;
        if (next === index || busy) return;
        busy = true;
        const [src, alt] = galleryImages[next];
        back.src = src;
        const swap = () => {
            back.classList.add('is-in');
            setTimeout(() => {
                front.src = src;
                front.alt = alt;
                const finish = () => { back.classList.remove('is-in'); busy = false; };
                front.decode ? front.decode().then(finish, finish) : finish();
            }, reduceMotion ? 0 : 600);
        };
        back.decode ? back.decode().then(swap, swap) : (back.onload = swap);
        index = next;
        if (count) count.textContent = `${next + 1} / ${total}`;
        preload(next + 1);
    };

    const restart = () => {
        clearInterval(timer);
        if (reduceMotion || paused) return;
        timer = setInterval(() => show(index + 1), 5500);
    };

    const go = (d) => { show(index + d); restart(); };

    document.querySelector('[data-hero-prev]')?.addEventListener('click', () => go(-1));
    document.querySelector('[data-hero-next]')?.addEventListener('click', () => go(1));

    slider.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
        if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
    });

    // Pause while someone is looking at or interacting with the photos
    const pause = () => { paused = true; clearInterval(timer); };
    const resume = () => { paused = false; restart(); };
    slider.addEventListener('mouseenter', pause);
    slider.addEventListener('mouseleave', resume);
    slider.addEventListener('focusin', pause);
    slider.addEventListener('focusout', (e) => { if (!slider.contains(e.relatedTarget)) resume(); });
    document.addEventListener('visibilitychange', () => (document.hidden ? clearInterval(timer) : restart()));

    // Swipe on phones
    let startX = null;
    slider.addEventListener('touchstart', (e) => { startX = e.touches[0].clientX; }, { passive: true });
    slider.addEventListener('touchend', (e) => {
        if (startX === null) return;
        const dx = e.changedTouches[0].clientX - startX;
        if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
        startX = null;
    });

    if (count) count.textContent = `1 / ${total}`;
    preload(1);
    restart();
}

function initReveal() {
    const items = document.querySelectorAll('.reveal');
    if (reduceMotion || !('IntersectionObserver' in window)) {
        items.forEach((el) => el.classList.add('is-visible'));
        return;
    }
    document.documentElement.classList.add('js-reveal');
    const io = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            entry.target.classList.add('is-visible');
            io.unobserve(entry.target);
        });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    items.forEach((el) => io.observe(el));
}

function initHeaderShadow() {
    const header = document.querySelector('[data-header]');
    if (!header) return;
    const update = () => header.classList.toggle('is-scrolled', window.scrollY > 8);
    update();
    window.addEventListener('scroll', update, { passive: true });
}

function updateOpenStatus() {
    const statusEl = document.getElementById('navStatus');
    const todayEl = document.querySelector('[data-today]');

    // Read the current day and time in Kansas City, regardless of the visitor's time zone
    const parts = Object.fromEntries(
        new Intl.DateTimeFormat('en-US', {
            timeZone: 'America/Chicago', weekday: 'short', hour: 'numeric', minute: 'numeric', hourCycle: 'h23'
        }).formatToParts(new Date()).map((p) => [p.type, p.value])
    );
    const weekend = parts.weekday === 'Sat' || parts.weekday === 'Sun';
    const minutes = Number(parts.hour) * 60 + Number(parts.minute);
    const isOpen = !weekend && minutes >= 10 * 60 && minutes < 18 * 60;

    let text;
    if (isOpen) text = 'Open now • till 6p';
    else if (weekend) text = 'Closed • weekends by appt.';
    else if (minutes < 10 * 60) text = 'Closed • opens 10a';
    else text = 'Closed • 10a–6p weekdays';

    if (statusEl) {
        statusEl.textContent = text;
        statusEl.classList.toggle('open', isOpen);
        statusEl.classList.toggle('closed', !isOpen);
    }
    if (todayEl) {
        todayEl.textContent = isOpen
            ? 'Open right now. Come on by.'
            : weekend
                ? 'Closed today. Call to set up a weekend appointment.'
                : 'Closed right now. Leave a message and Dale will call back.';
        todayEl.classList.toggle('is-open', isOpen);
    }
}
