import { ui } from "@prague/client-ui";
import { IMap } from "@prague/map";
import { IChaincode, IGenericBlob, IPlatform, MessageType } from "@prague/runtime-definitions";
import { gitHashFile } from "@prague/utils";
import { Chaincode } from "./chaincode";
import { Document } from "./document";
// import style from "style.css";
import "./style.css";

const template =
`<div id="player-div">
    <h1> Photo-Album 2.0 </h1>
    <input id="file-uploader" type="file" type="image">
    <div id="carousel">
        <div id="focus" class="focus"></div>
        <a id="prev-button" class="prev">&#10094;</a>
        <a id="next-button" class="next">&#10095;</a>
        <div id="thumbnails" class="row"></div>
    </div>
</div>`;

class PhotoCarousel extends ui.Component {

}

class Runner {

    public async run(doc: Document, platform: IPlatform) {
        const hostContent: HTMLDivElement = platform ? platform.queryInterface<HTMLDivElement>("div") : null;
        if (!hostContent) {
            // If headless exist early
            return;
        }

        hostContent.innerHTML = template;
        this.carouselBuilder(doc);

        const nextButton = document.getElementById("next-button");
        nextButton.onclick = () => {this.plusSlides(1); };

        const prevButton = document.getElementById("prev-button");
        prevButton.onclick = () => {this.plusSlides(-1); };

        const fileUploader = document.getElementById("file-uploader") as HTMLInputElement;
        fileUploader.onchange = (e) => {

            for (const file of fileUploader.files) {
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

                    // Move this somewhere more reasonable.
                    doc.uploadBlob(incl);
                };
                arrayBufferReader.readAsArrayBuffer(file);
            }
        };

        doc.runtime.on(MessageType.BlobUploaded, (ev) => {
            this.carouselBuilder(doc);
        });

        const host = new ui.BrowserContainerHost();

        const root = doc.getRoot();

        const canvas = new PhotoCarousel(hostContent.children[0] as HTMLDivElement);
        host.attach(canvas);
    }

    private async carouselBuilder(doc: Document) {
        const images = await doc.getBlobMetaData();

        const focusImage = document.getElementById("focus") as HTMLDivElement;
        focusImage.innerHTML = "";
        focusImage.style.height = "100%";
        if (images.length > 0 ) {
            focusImage.appendChild(this.buildSlides(images[0].url));
        }

        const thumbnails = document.getElementById("thumbnails") as HTMLDivElement;
        thumbnails.innerHTML = "";
        for (const image of images) {
            thumbnails.appendChild(this.buildThumbnails(image.url));
        }
    }

    private buildSlides(url: string): HTMLDivElement {
        const slide = document.createElement("div");
        slide.id = "main-slide";

        const label = document.createElement("div");
        label.classList.add("numberText");

        const img = document.createElement("img");
        img.id = "focus-image";
        img.src = url;
        img.style.height = "100%";
        img.style.maxHeight = "500px";

        slide.appendChild(label);
        slide.appendChild(img);
        return slide;
    }

    private buildThumbnails(url: string): HTMLDivElement {

        const thumbnailDiv = document.createElement("div");
        thumbnailDiv.classList.add("column");

        const img = document.createElement("img");
        img.classList.add("thumbnail");
        img.src = url;
        img.onclick = () => { this.setCurrentSlide(url); };

        thumbnailDiv.appendChild(img);
        return thumbnailDiv;
    }

    private setCurrentSlide(url: string) {
        const slide = (document.getElementById("focus")) as HTMLDivElement;
        slide.innerHTML = "";
        slide.appendChild(this.buildSlides(url));
    }

    private getCurrentSlideUrl(): string {
        const slide = (document.getElementById("focus-image")) as HTMLImageElement;
        return slide.src;
    }

    private plusSlides(moves: number) {
        const thumbnails = document.getElementsByClassName("thumbnail") as HTMLCollectionOf<HTMLImageElement>;
        const current = this.getCurrentSlideUrl();

        let prior = "";
        let next = "";

        prior = thumbnails[(thumbnails.length - 1)].src;
        console.log(prior);
        let getNext = false;
        for (const thumbnail of thumbnails) {
            if (getNext) {
                next = thumbnail.src;
                break;
            } else if (thumbnail.src === current) {
                getNext = true;
            } else {
                prior = thumbnail.src;
            }
        }

        if (moves === -1 ) {
            this.setCurrentSlide(prior);
        } else {
            this.setCurrentSlide(next);
        }
    }
}

export async function instantiate(): Promise<IChaincode> {
    // Instantiate a new runtime per code load. That'll separate handlers, etc...
    const chaincode = new Chaincode(new Runner());
    return chaincode;
}
