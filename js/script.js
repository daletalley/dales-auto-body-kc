document.addEventListener("DOMContentLoaded", function() {
    populateGallery();
    setupSmoothScrolling();
    setupModal();
});

function populateGallery() {
    const gallery = document.getElementById("gallery");
    const imageFolder = "images/";
    const images = ["daleskc.com - 00001.JPG", "daleskc.com - 00002.JPG",  "daleskc.com - 00003.JPG",  "daleskc.com - 00004.JPEG",  "daleskc.com - 00005.jpg",  "daleskc.com - 00006.jpg",  "daleskc.com - 00007.jpg",  "daleskc.com - 00008.jpg",  "daleskc.com - 00009.jpg",  "daleskc.com - 00010.JPG",  "daleskc.com - 00011.JPG",  "daleskc.com - 00012.jpg",  "daleskc.com - 00013.JPG",  "daleskc.com - 00014.JPG",  "daleskc.com - 00015.JPG",  "daleskc.com - 00016.JPG",  "daleskc.com - 00017.JPG",  "daleskc.com - 00018.JPG",  "daleskc.com - 00019.JPG",  "daleskc.com - 00020.JPG",  "daleskc.com - 00021.JPG",  "daleskc.com - 00022.JPG",  "daleskc.com - 00023.JPG",  "daleskc.com - 00024.JPG",  "daleskc.com - 00025.JPG",  "daleskc.com - 00026.JPG",  "daleskc.com - 00027.JPG",  "daleskc.com - 00028.JPG",  "daleskc.com - 00029.JPG",  "daleskc.com - 00030.JPG",  "daleskc.com - 00031.JPG",  "daleskc.com - 00032.jpg",  "daleskc.com - 00033.jpg",  "daleskc.com - 00034.JPG",  "daleskc.com - 00035.JPG",  "daleskc.com - 00036.JPG",  "daleskc.com - 00037.JPG",  "daleskc.com - 00038.JPG",  "daleskc.com - 00039.JPG",  "daleskc.com - 00040.JPG",  "daleskc.com - 00041.JPG",  "daleskc.com - 00042.JPG",  "daleskc.com - 00043.JPG",  "daleskc.com - 00044.JPG",  "daleskc.com - 00045.JPG",  "daleskc.com - 00046.JPG",  "daleskc.com - 00047.JPG",  "daleskc.com - 00048.JPG",  "daleskc.com - 00049.JPG", "daleskc.com - 00051.jpg",  "daleskc.com - 00052.JPG",  "daleskc.com - 00053.JPG",  "daleskc.com - 00054.jpg",  "daleskc.com - 00055.JPG",  "daleskc.com - 00056.JPG",  "daleskc.com - 00057.JPG",  "daleskc.com - 00058.JPG",  "daleskc.com - 00059.JPG",  "daleskc.com - 00060.JPG",  "daleskc.com - 00061.JPG",  "daleskc.com - 00062.JPG",  "daleskc.com - 00063.JPG",  "daleskc.com - 00064.JPG",  "daleskc.com - 00065.JPG",  "daleskc.com - 00066.JPG",  "daleskc.com - 00067.JPG",  "daleskc.com - 00068.JPG",  "daleskc.com - 00069.JPG",  "daleskc.com - 00070.JPG",  "daleskc.com - 00071.JPG",  "daleskc.com - 00072.jpg",  "daleskc.com - 00073.JPG",  "daleskc.com - 00074.JPG",  "daleskc.com - 00075.PNG",  "daleskc.com - 00076.PNG",  "daleskc.com - 00077.PNG",];

    images.forEach(image => {
        const img = document.createElement("img");
        img.src = imageFolder + image;
        img.alt = "Dale's Auto Body KC"; // Add appropriate alt text for each image
        img.classList.add("gallery-image", "modal-trigger");
        gallery.appendChild(img);
    });
}

function setupSmoothScrolling() {
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            document.querySelector(this.getAttribute('href')).scrollIntoView({
                behavior: 'smooth'
            });
        });
    });
}

function setupModal() {
    var modal = document.getElementById('myModal');
    var span = document.getElementsByClassName("close")[0];

    document.querySelectorAll('.modal-trigger').forEach(img => {
        img.onclick = function() {
            modal.style.display = "block";
            var modalImg = document.getElementById("img01");
            var captionText = document.getElementById("caption");
            modalImg.src = this.src;
            captionText.innerHTML = this.alt;
        };
    });

    span.onclick = function() { 
        modal.style.display = "none";
    }
}