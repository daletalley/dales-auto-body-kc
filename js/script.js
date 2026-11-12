document.addEventListener('DOMContentLoaded', () => {
    initHeroSlider();
    updateOpenStatus();
    setInterval(updateOpenStatus, 60 * 1000);
});

// Single source of truth for hero gallery imagery (compressed copies of the original photos)
const galleryImages = [
    'shop.webp',
    'work-00020.webp',
    'work-00010.webp',
    'work-00005.webp',
    'work-00018.webp',
    'work-00023.webp',
    'work-00025.webp',
    'work-00029.webp',
    'work-00033.webp',
    'work-00035.webp',
    'work-00042.webp',
    'work-00051.webp',
    'work-00055.webp',
    'work-00057.webp',
    'work-00068.webp',
    'work-00074.webp'
];

function initHeroSlider() {
    const heroImg = document.querySelector('[data-hero-img]');
    if (!heroImg || !galleryImages.length) return;

    let index = 0;

    const showImage = (i) => {
        const bounded = (i + galleryImages.length) % galleryImages.length;
        heroImg.src = `images/web/${galleryImages[bounded]}`;
        index = bounded;
        new Image().src = `images/web/${galleryImages[(bounded + 1) % galleryImages.length]}`; // have the next one ready
    };

    document.querySelector('[data-hero-prev]')?.addEventListener('click', () => showImage(index - 1));
    document.querySelector('[data-hero-next]')?.addEventListener('click', () => showImage(index + 1));

    // swipe on phones
    let x0 = null;
    heroImg.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; }, { passive: true });
    heroImg.addEventListener('touchend', (e) => { if (x0 === null) return; const dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 40) showImage(index + (dx < 0 ? 1 : -1)); x0 = null; });
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

    statusEl.textContent = weekend ? 'By appointment today' : isOpen ? 'Open now • until 6p' : mins < 600 ? 'Closed • opens 10a' : day === 'Fri' ? 'Closed • opens Mon 10a' : 'Closed • opens 10a';
    statusEl.classList.toggle('open', isOpen);
    statusEl.classList.toggle('closed', !isOpen);
}
