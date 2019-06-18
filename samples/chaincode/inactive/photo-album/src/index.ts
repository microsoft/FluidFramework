/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IMap } from "@prague/map";
import { IChaincode, IGenericBlob, IPlatform, IRuntime, MessageType } from "@prague/runtime-definitions";
import { gitHashFile } from "@prague/utils";
import { EventEmitter } from "events";
import { Chaincode } from "./chaincode";
import { Document } from "./document";
import "./style.css";

const template =
`<div id="player-div">
    <input id="file-uploader" type="file" type="image">
    <div id="carousel">
        <div id="focus" class="focus"></div>
        <a id="prev-button" class="prev">&#10094;</a>
        <a id="next-button" class="next">&#10095;</a>
        <div id="thumbnails" class="row"></div>
    </div>
</div>`;

class PhotoPlatformRunner extends EventEmitter implements IPlatform {
    private album: IMap;

    public async queryInterface<T>(id: string): Promise<T> {
        switch (id) {
            case "document":
                return null;
            case "div":
                return null;
            default:
                return null;
        }
    }

    public async run(runtime: IRuntime, platform: IPlatform): Promise<IPlatform> {
        this.start(await Document.load(runtime), platform).catch((error) => console.error(error));
        return this;
    }

    private async start(doc: Document, platform: IPlatform) {
        const hostContent: HTMLDivElement = platform ? await platform.queryInterface<HTMLDivElement>("div") : null;
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

                    doc.uploadBlob(incl);
                };
                arrayBufferReader.readAsArrayBuffer(file);
            }
        };
        doc.runtime.on(MessageType.BlobUploaded, (ev) => {
            this.carouselBuilder(doc);
        });

        const root = doc.getRoot();
        if (!doc.existing) {
            await root.set<IMap>("album", doc.createMap());
        }

        this.album = await root.wait("album") as IMap;

        this.album.on("valueChanged", async (changed, local, op) => {
            if (!local) {
                const active = await this.album.get("active");
                const slide = (document.getElementById("focus")) as HTMLDivElement;
                slide.innerHTML = "";
                slide.appendChild(this.buildSlides(active));
            }
        });

        if (await this.album.has("active")) {
            this.buildSlides(await this.album.get("active") );
        }
    }

    private async carouselBuilder(doc: Document) {
        const images = await doc.getBlobMetaData();

        const focusImage = document.getElementById("focus") as HTMLDivElement;
        focusImage.innerHTML = "";
        focusImage.style.height = "100%";
        if (images.length > 0 ) {
            this.setCurrentSlide(images[0].url);
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
        if (this.album) {
            this.album.set("active", url);
        }

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
    const chaincode = new Chaincode(new PhotoPlatformRunner());
    return chaincode;
}
