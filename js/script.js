document.addEventListener('DOMContentLoaded', () => {
    initHeroSlider();
    updateOpenStatus();
    setInterval(updateOpenStatus, 60 * 1000);
});

// Single source of truth for hero gallery imagery
const galleryImages = [
    'Screenshot 2025-12-09 at 10.21.36\u202fPM.png',
    'daleskc.com - 00020.JPG',
    'daleskc.com - 00010.JPG',
    'daleskc.com - 00005.jpg',
    'daleskc.com - 00018.JPG',
    'daleskc.com - 00023.JPG',
    'daleskc.com - 00025.JPG',
    'daleskc.com - 00029.JPG',
    'daleskc.com - 00033.jpg',
    'daleskc.com - 00035.JPG',
    'daleskc.com - 00042.JPG',
    'daleskc.com - 00051.jpg',
    'daleskc.com - 00055.JPG',
    'daleskc.com - 00057.JPG',
    'daleskc.com - 00068.JPG',
    'daleskc.com - 00074.JPG'
];

function initHeroSlider() {
    const heroImg = document.querySelector('[data-hero-img]');
    if (!heroImg || !galleryImages.length) return;

    let index = 0;

    const showImage = (i) => {
        const bounded = (i + galleryImages.length) % galleryImages.length;
        heroImg.src = `images/${galleryImages[bounded]}`;
        index = bounded;
    };

    document.querySelector('[data-hero-prev]')?.addEventListener('click', () => showImage(index - 1));
    document.querySelector('[data-hero-next]')?.addEventListener('click', () => showImage(index + 1));

    showImage(index);
}

function updateOpenStatus() {
    const statusEl = document.getElementById('navStatus');
    if (!statusEl) return;

    const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' }));
    const hour = now.getHours();
    const minute = now.getMinutes();
    const isOpen = hour >= 10 && (hour < 18 || (hour === 18 && minute === 0));

    statusEl.textContent = isOpen ? 'Open now • 10a–6p CST' : 'Closed • 10a–6p CST';
    statusEl.classList.toggle('open', isOpen);
    statusEl.classList.toggle('closed', !isOpen);
    statusEl.setAttribute('aria-label', statusEl.textContent);
}
