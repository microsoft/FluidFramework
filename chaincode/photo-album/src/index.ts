import { controls, ui } from "@prague/client-ui";
import { IMap } from "@prague/map";
import { IChaincode, IGenericBlob, IPlatform } from "@prague/runtime-definitions";
import { gitHashFile } from "@prague/utils";
import { Chaincode } from "./chaincode";
import { Document } from "./document";
// import style from "style.css";
import "./style.css";

const template =
`<div id="player-div">
    <h1> Photo-Album 2.0 </h1>
    <input id="file-uploader" type="file" type="image">
    <div id="carousel"></div>
</div>`;

class Runner {
    // private root: IMap;
    private images: IGenericBlob[];

    public async run(doc: Document, platform: IPlatform) {
        const hostContent: HTMLDivElement = platform ? platform.queryInterface<HTMLDivElement>("div") : null;
        if (!hostContent) {
            // If headless exist early
            return;
        }

        hostContent.innerHTML = template;

        const fileUploader = document.getElementById("file-uploader") as HTMLInputElement;
        fileUploader.onchange = (e) => {
            const file = fileUploader.files[0];
            console.log(file);

            const arrayBufferReader = new FileReader();

            arrayBufferReader.onloadend = () => {
                const blobData = Buffer.from(arrayBufferReader.result as ArrayBuffer);
                const incl = {
                    content: blobData,
                    fileName: file.name,
                    sha: gitHashFile(blobData),
                    size: blobData.byteLength,
                    type: "generic",
                    url: "",
                } as IGenericBlob;
                // this.images.push()
                this.imageHandler(doc.uploadBlob(incl));
            };
            arrayBufferReader.readAsArrayBuffer(file);
        };

        console.log(fileUploader);

        const host = new ui.BrowserContainerHost();

        const root = doc.getRoot();
        this.images = await doc.getBlobMetaData();

        // Create our distributed Map, called "youTubeVideo", on the root map
        if (!doc.existing) {
            await root.set<IMap>("youTubeVideo", doc.createMap());
        }

        const videoMap = await root.wait<IMap>("youTubeVideo");

        const canvas = new controls.YouTubeVideoCanvas(hostContent.children[0] as HTMLDivElement, videoMap);
        host.attach(canvas);
    }

    private async imageHandler(blobP: Promise<IGenericBlob>) {
        const blob = await blobP;
        this.images.push(blob);
        // const img = document.createElement("img");
        // img.src = blob.url;
        // carousel.appendChild(img);
        this.carouselBuilder();
    }

    private async carouselBuilder() {
        const carousel = document.getElementById("carousel") as HTMLDivElement;
        let i = 0;

        const script = document.createElement("script");
        script.innerHTML = `
                    // Open the Modal
            function openModal() {
            document.getElementById('myModal').style.display = "block";
            }

            // Close the Modal
            function closeModal() {
            document.getElementById('myModal').style.display = "none";
            }

            var slideIndex = 1;
            showSlides(slideIndex);

            // Next/previous controls
            function plusSlides(n) {
            showSlides(slideIndex += n);
            }

            // Thumbnail image controls
            function currentSlide(n) {
            showSlides(slideIndex = n);
            }

            function showSlides(n) {
                var i;
                var slides = document.getElementsByClassName("mySlides");
                var dots = document.getElementsByClassName("demo");
                var captionText = document.getElementById("caption");
                if (n > slides.length) {slideIndex = 1}
                if (n < 1) {slideIndex = slides.length}
                for (i = 0; i < slides.length; i++) {
                    slides[i].style.display = "none";
                }
                for (i = 0; i < dots.length; i++) {
                    dots[i].className = dots[i].className.replace(" active", "");
                }
                slides[slideIndex-1].style.display = "block";
                dots[slideIndex-1].className += " active";
                captionText.innerHTML = dots[slideIndex-1].alt;
            }`;

        carousel.innerHTML = `
            <div class="mySlides">
                <div class="numbertext">1 / 4</div>
                <img src="` + this.images[i++].url + `" style="width:100%">
            </div> `;
        if (this.images.length > i) {
            carousel.innerHTML += `

            <div class="mySlides">
                <div class="numbertext">2 / 4</div>
                <img src="` + this.images[i++].url + `" style="width:100%">
            </div> `;
        } else if (this.images.length > i) {
            carousel.innerHTML += `

            <div class="mySlides">
                <div class="numbertext">3 / 4</div>
                <img src="` + this.images[i++].url + `" style="width:100%">
            </div> `;
        } else if (this.images.length > i) {
            carousel.innerHTML += `

            <div class="mySlides">
                <div class="numbertext">4 / 4</div>
                <img src="` + this.images[i++].url + `" style="width:100%">
            </div> `;
        }
        i = 0;
        carousel.innerHTML += `
            <!-- Next/previous controls -->
            <a class="prev" onclick="plusSlides(-1)">&#10094;</a>
            <a class="next" onclick="plusSlides(1)">&#10095;</a>

            <!-- Thumbnail image controls -->
            <div class="column">
                <img class="demo" src="` + this.images[i++].url + `" onclick="currentSlide(1)" alt="Nature">
            </div>`;
        if (this.images.length > i ) {
            carousel.innerHTML += `
            <div class="column">
                <img class="demo" src="` + this.images[i++].url + `" onclick="currentSlide(2)" alt="Snow">
            </div>`;
        } else if (this.images.length > i ) {
            carousel.innerHTML += `
            <div class="column">
                <img class="demo" src="` + this.images[i++].url + `" onclick="currentSlide(3)" alt="Mountains">
            </div>`;
        } else if (this.images.length > i ) {
            carousel.innerHTML += `
            <div class="column">
                <img class="demo" src="` + this.images[i++].url + `" onclick="currentSlide(4)" alt="Lights">
            </div>`;
        }
        document.head.appendChild(script);

    }
}

export async function instantiate(): Promise<IChaincode> {
    // Instantiate a new runtime per code load. That'll separate handlers, etc...
    const chaincode = new Chaincode(new Runner());
    return chaincode;
}
