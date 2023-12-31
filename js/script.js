document.addEventListener("DOMContentLoaded", function() {
    populateSlideshow();
    setupThumbnailSlider();
});

function populateSlideshow() {
    const carouselInner = document.getElementById('carouselInner');
    const images = ["daleskc.com - 00001.JPG", "daleskc.com - 00002.JPG",  "daleskc.com - 00003.JPG",  "daleskc.com - 00004.JPEG",  "daleskc.com - 00005.jpg",  "daleskc.com - 00006.jpg",  "daleskc.com - 00007.jpg",  "daleskc.com - 00008.jpg",  "daleskc.com - 00009.jpg",  "daleskc.com - 00010.JPG",  "daleskc.com - 00011.JPG",  "daleskc.com - 00012.jpg",  "daleskc.com - 00013.JPG",  "daleskc.com - 00014.JPG",  "daleskc.com - 00015.JPG",  "daleskc.com - 00016.JPG",  "daleskc.com - 00017.JPG",  "daleskc.com - 00018.JPG",  "daleskc.com - 00019.JPG",  "daleskc.com - 00020.JPG",  "daleskc.com - 00021.JPG",  "daleskc.com - 00022.JPG",  "daleskc.com - 00023.JPG",  "daleskc.com - 00024.JPG",  "daleskc.com - 00025.JPG",  "daleskc.com - 00026.JPG",  "daleskc.com - 00027.JPG",  "daleskc.com - 00028.JPG",  "daleskc.com - 00029.JPG",  "daleskc.com - 00030.JPG",  "daleskc.com - 00031.JPG",  "daleskc.com - 00032.jpg",  "daleskc.com - 00033.jpg",  "daleskc.com - 00034.JPG",  "daleskc.com - 00035.JPG",  "daleskc.com - 00036.JPG",  "daleskc.com - 00037.JPG",  "daleskc.com - 00038.JPG",  "daleskc.com - 00039.JPG",  "daleskc.com - 00040.JPG",  "daleskc.com - 00041.JPG",  "daleskc.com - 00042.JPG",  "daleskc.com - 00043.JPG",  "daleskc.com - 00044.JPG",  "daleskc.com - 00045.JPG",  "daleskc.com - 00046.JPG",  "daleskc.com - 00047.JPG",  "daleskc.com - 00048.JPG",  "daleskc.com - 00049.JPG", "daleskc.com - 00051.jpg",  "daleskc.com - 00052.JPG",  "daleskc.com - 00053.JPG",  "daleskc.com - 00054.jpg",  "daleskc.com - 00055.JPG",  "daleskc.com - 00056.JPG",  "daleskc.com - 00057.JPG",  "daleskc.com - 00058.JPG",  "daleskc.com - 00059.JPG",  "daleskc.com - 00060.JPG",  "daleskc.com - 00061.JPG",  "daleskc.com - 00062.JPG",  "daleskc.com - 00063.JPG",  "daleskc.com - 00064.JPG",  "daleskc.com - 00065.JPG",  "daleskc.com - 00066.JPG",  "daleskc.com - 00067.JPG",  "daleskc.com - 00068.JPG",  "daleskc.com - 00069.JPG",  "daleskc.com - 00070.JPG",  "daleskc.com - 00071.JPG",  "daleskc.com - 00072.jpg",  "daleskc.com - 00073.JPG",  "daleskc.com - 00074.JPG",  "daleskc.com - 00075.PNG",  "daleskc.com - 00076.PNG",  "daleskc.com - 00077.PNG",];
    const imageFolder = "images/";

    images.forEach((image, index) => {
        const itemDiv = document.createElement("div");
        itemDiv.className = `carousel-item ${index === 0 ? "active" : ""}`;
        itemDiv.innerHTML = `<img src="${imageFolder + image}" class="d-block w-100">`;
        carouselInner.appendChild(itemDiv);
    });
}

function setupThumbnailSlider() {
    const thumbnailsContainer = document.querySelector('.thumbnail-slider');
    const images = ["daleskc.com - 00001.JPG", "daleskc.com - 00002.JPG",  "daleskc.com - 00003.JPG",  "daleskc.com - 00004.JPEG",  "daleskc.com - 00005.jpg",  "daleskc.com - 00006.jpg",  "daleskc.com - 00007.jpg",  "daleskc.com - 00008.jpg",  "daleskc.com - 00009.jpg",  "daleskc.com - 00010.JPG",  "daleskc.com - 00011.JPG",  "daleskc.com - 00012.jpg",  "daleskc.com - 00013.JPG",  "daleskc.com - 00014.JPG",  "daleskc.com - 00015.JPG",  "daleskc.com - 00016.JPG",  "daleskc.com - 00017.JPG",  "daleskc.com - 00018.JPG",  "daleskc.com - 00019.JPG",  "daleskc.com - 00020.JPG",  "daleskc.com - 00021.JPG",  "daleskc.com - 00022.JPG",  "daleskc.com - 00023.JPG",  "daleskc.com - 00024.JPG",  "daleskc.com - 00025.JPG",  "daleskc.com - 00026.JPG",  "daleskc.com - 00027.JPG",  "daleskc.com - 00028.JPG",  "daleskc.com - 00029.JPG",  "daleskc.com - 00030.JPG",  "daleskc.com - 00031.JPG",  "daleskc.com - 00032.jpg",  "daleskc.com - 00033.jpg",  "daleskc.com - 00034.JPG",  "daleskc.com - 00035.JPG",  "daleskc.com - 00036.JPG",  "daleskc.com - 00037.JPG",  "daleskc.com - 00038.JPG",  "daleskc.com - 00039.JPG",  "daleskc.com - 00040.JPG",  "daleskc.com - 00041.JPG",  "daleskc.com - 00042.JPG",  "daleskc.com - 00043.JPG",  "daleskc.com - 00044.JPG",  "daleskc.com - 00045.JPG",  "daleskc.com - 00046.JPG",  "daleskc.com - 00047.JPG",  "daleskc.com - 00048.JPG",  "daleskc.com - 00049.JPG", "daleskc.com - 00051.jpg",  "daleskc.com - 00052.JPG",  "daleskc.com - 00053.JPG",  "daleskc.com - 00054.jpg",  "daleskc.com - 00055.JPG",  "daleskc.com - 00056.JPG",  "daleskc.com - 00057.JPG",  "daleskc.com - 00058.JPG",  "daleskc.com - 00059.JPG",  "daleskc.com - 00060.JPG",  "daleskc.com - 00061.JPG",  "daleskc.com - 00062.JPG",  "daleskc.com - 00063.JPG",  "daleskc.com - 00064.JPG",  "daleskc.com - 00065.JPG",  "daleskc.com - 00066.JPG",  "daleskc.com - 00067.JPG",  "daleskc.com - 00068.JPG",  "daleskc.com - 00069.JPG",  "daleskc.com - 00070.JPG",  "daleskc.com - 00071.JPG",  "daleskc.com - 00072.jpg",  "daleskc.com - 00073.JPG",  "daleskc.com - 00074.JPG",  "daleskc.com - 00075.PNG",  "daleskc.com - 00076.PNG",  "daleskc.com - 00077.PNG",];

    images.forEach((image, index) => {
        const imgElement = document.createElement("img");
        imgElement.src = "images/" + image;
        imgElement.onclick = () => $('#slideshowGallery').carousel(index);
        thumbnailsContainer.appendChild(imgElement);
    });
}
