document.addEventListener('DOMContentLoaded', () => {
    initHeroSlider();
    updateOpenStatus();
    setInterval(updateOpenStatus, 60 * 1000);
});

// Single source of truth for hero gallery imagery (compressed copies of the original photos)
const galleryImages = [
    { src: 'shop.webp', alt: "Dale's Auto Body shop on State Avenue" },
    { src: 'work-00020.webp', alt: 'Custom peach paint on a motorcycle fairing and bags' },
    { src: 'work-00010.webp', alt: 'Copper bagger with gold pinstripes, finished and parked outside the shop' },
    { src: 'work-00005.webp', alt: 'Gloss black motorcycle bags with a purple and green custom graphic' },
    { src: 'work-00018.webp', alt: 'Road Glide in custom peach paint with matching fairing and bags' },
    { src: 'work-00023.webp', alt: 'Copper and gold bagger with stretched bags, side view' },
    { src: 'work-00025.webp', alt: 'Bagger in candy copper with gold pinstripe flames and a two-tone seat' },
    { src: 'work-00029.webp', alt: 'Maroon touring motorcycle with a tan seat and chrome trim' },
    { src: 'work-00033.webp', alt: 'Candy blue rear fender with a built-in red LED light strip' },
    { src: 'work-00035.webp', alt: 'Pleated black seat upholstery' },
    { src: 'work-00042.webp', alt: 'Yellow bagger with black pinstripes on the lift in the shop' },
    { src: 'work-00051.webp', alt: 'Red fender with a Chiefs arrowhead graphic' },
    { src: 'work-00055.webp', alt: 'Black bagger with long stretched bags' },
    { src: 'work-00057.webp', alt: 'Black Road Glide with stretched bags and a chrome wheel' },
    { src: 'work-00068.webp', alt: 'Orange and black flamed Road Glide with a big custom front wheel' },
    { src: 'work-00074.webp', alt: 'Chrome engine detail on a black touring motorcycle' }
];

function initHeroSlider() {
    const heroImg = document.querySelector('[data-hero-img]');
    if (!heroImg || !galleryImages.length) return;

    let index = 0;
    const url = (i) => `images/web/${galleryImages[(i + galleryImages.length) % galleryImages.length].src}`;

    // load the next photo first, then swap photo, fit and description together (tall photos show whole)
    let want = 0;
    const showImage = (i) => {
        const bounded = (i + galleryImages.length) % galleryImages.length;
        index = want = bounded;
        const next = new Image();
        next.onload = next.onerror = () => {
            if (want !== bounded) return; // a newer tap won
            heroImg.classList.toggle('tall', next.naturalHeight > next.naturalWidth);
            heroImg.src = next.src;
            heroImg.alt = galleryImages[bounded].alt;
        };
        next.src = url(bounded);
        new Image().src = url(bounded + 1); // have the neighbours ready
        new Image().src = url(bounded - 1);
    };

    document.querySelector('[data-hero-prev]')?.addEventListener('click', () => showImage(index - 1));
    document.querySelector('[data-hero-next]')?.addEventListener('click', () => showImage(index + 1));

    // swipe on phones: only a clearly sideways swipe changes the photo, so scrolling never does
    let x0 = null, y0 = null;
    const swipeArea = document.querySelector('.hero-slider') || heroImg;
    swipeArea.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
    swipeArea.addEventListener('touchcancel', () => { x0 = y0 = null; });
    swipeArea.addEventListener('touchend', (e) => {
        if (x0 === null) return;
        const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
        if (Math.abs(dx) > 40 && Math.abs(dx) > 1.5 * Math.abs(dy)) showImage(index + (dx < 0 ? 1 : -1));
        x0 = y0 = null;
    });

    // left/right arrow keys when the slider has focus
    document.querySelector('.hero-slider')?.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowLeft') showImage(index - 1);
        if (e.key === 'ArrowRight') showImage(index + 1);
    });
}

// Weekdays 10a–6p Kansas City time; weekends by appointment
function updateOpenStatus() {
    const statusEl = document.getElementById('navStatus');
    if (!statusEl) return;

    const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', weekday: 'short', hour: 'numeric', minute: 'numeric', hour12: false }).formatToParts(new Date());
    const get = (t) => parts.find((p) => p.type === t)?.value;
    const day = get('weekday');
    const mins = (+get('hour') % 24) * 60 + +get('minute');
    const weekend = day === 'Sat' || day === 'Sun';
    const isOpen = !weekend && mins >= 600 && mins < 1080;

    statusEl.textContent = weekend ? 'By appointment today' : isOpen ? 'Open now • until 6p' : mins < 600 ? 'Closed • opens 10a' : day === 'Fri' ? 'Closed • opens Mon 10a' : 'Closed • opens tomorrow 10a';
    statusEl.classList.toggle('open', isOpen);
    statusEl.classList.toggle('closed', !isOpen);
}
