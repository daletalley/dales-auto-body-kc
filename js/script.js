document.addEventListener('DOMContentLoaded', () => {
    initHeroSlider();
});

// Single source of truth for hero gallery imagery
const galleryImages = [
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
