import * as api from "../api-core";
import { getFileBlobType } from "../api-core";
import { gitHashFile } from "../core-utils";

export async function blobUploadHandler(dragZone: HTMLDivElement,
                                        document: api.IDocument,
                                        blobDisplayCB: (file: api.IGenericBlob) => void) {

    dragZone.ondrop = (event) => {
        event.dataTransfer.dropEffect = "copy";
        event.preventDefault();

        const dt = event.dataTransfer;
        const files = dt.files;
        fileToInclusion(files[0])
            .then(async (blob) => {
                blobDisplayCB(blob);
                document.uploadBlob(blob); // Fetches URL... Can we move the url fetch into this func
            });
    };

    dragZone.ondragover = (event) => {
        event.dataTransfer.dropEffect = "copy";
        event.preventDefault();
    };
}

export async function urlToInclusion(path: string): Promise<api.IGenericBlob> {
    // TODO sabroner: wow this is brittle.
    const pathComponents = path.split("/");
    const fileName = pathComponents[pathComponents.length - 1];

    return new Promise<api.IGenericBlob>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("GET", path);
        xhr.responseType = "blob"; // force the HTTP response, response-type header to be blob
        xhr.onload = () => {

            const b: any = xhr.response;
            b.lastModifiedDate = new Date();
            b.name = fileName;
            const f: File = b;
            resolve(fileToInclusion(f));
        };
        xhr.send();
    });
}

async function fileToInclusion(file: File): Promise<api.IGenericBlob> {
    const arrayBufferReader = new FileReader();

    const baseInclusion = {
        fileName: file.name,
        type: getFileBlobType(file.type),
        url: "", // TODO sabroner: can I create the URL locally?
    } as api.IGenericBlob;

    const arrayBufferP = new Promise<Buffer>((resolve, reject) => {
        arrayBufferReader.onerror = (error) => {
            arrayBufferReader.abort();
            reject("error: " + JSON.stringify(error));
        };

        arrayBufferReader.onloadend = () => {
            const blobData = Buffer.from(arrayBufferReader.result);
            resolve(blobData);
        };
        arrayBufferReader.readAsArrayBuffer(file);
    });

    switch (baseInclusion.type) {
        case "image": {
            const blobP = imageHandler(file, baseInclusion as api.IImageBlob);

            return Promise.all([arrayBufferP, blobP])
                .then(([arrayBuffer, blob]) => {
                    const incl: api.IImageBlob = {
                        content: arrayBuffer,
                        fileName: file.name,
                        height: (blob as api.IImageBlob).height,
                        sha: gitHashFile(arrayBuffer),
                        size: arrayBuffer.byteLength,
                        type: "image",
                        url: blob.url,
                        width: (blob as api.IImageBlob).width,
                    };
                    return incl as api.IImageBlob;
                });
        }
        case "video": {
            const blobP = videoHandler(file, baseInclusion);
            return Promise.all([arrayBufferP, blobP])
                .then(([arrayBuffer, blob]) => {
                    const incl: api.IVideoBlob = {
                        content: arrayBuffer,
                        fileName: file.name,
                        height: blob.height,
                        length: blob.length,
                        sha: gitHashFile(arrayBuffer),
                        size: arrayBuffer.byteLength,
                        type: "video",
                        url: blob.url,
                        width: blob.width,
                    };
                    return incl as api.IVideoBlob;
                });
        }
        default: {
            return Promise.all([arrayBufferP])
                .then(([arrayBuffer]) => {
                    const incl: api.IGenericBlob = {
                        content: arrayBuffer,
                        fileName: file.name,
                        sha: gitHashFile(arrayBuffer),
                        size: arrayBuffer.byteLength,
                        type: "generic",
                        url: baseInclusion.url,
                    };
                    return incl as api.IGenericBlob;
                });
        }
    }
}

async function imageHandler(imageFile: File, incl: api.IImageBlob): Promise<api.IImageBlob> {
    const urlObjReader = new FileReader();

    const urlObjP = new Promise<api.IImageBlob>((resolve, reject) => {
        urlObjReader.onerror = (error) => {
            urlObjReader.abort();
            reject("error: " + JSON.stringify(error));
        };

        urlObjReader.onloadend = () => {
            const imageUrl = urlObjReader.result;
            const img = document.createElement("img");
            img.src = imageUrl;
            img.onload = () => {
                incl.height = img.height;
                incl.width = img.width;
                incl.url = imageUrl;
                resolve(incl);
            };
        };

        urlObjReader.readAsDataURL(imageFile);
    });
    return urlObjP;
}

async function videoHandler(videoFile: File, incl: api.IVideoBlob): Promise<api.IVideoBlob> {
    const urlObjReader = new FileReader();

    const urlObjP = new Promise<api.IVideoBlob>((resolve, reject) => {
        urlObjReader.onerror = (error) => {
            urlObjReader.abort();
            reject("error: " + JSON.stringify(error));
        };

        urlObjReader.onloadend = () => {
            const videoUrl = urlObjReader.result;
            const video = document.createElement("video");
            video.src = videoUrl;
            video.load();

            video.onloadedmetadata = (event) => {
                incl.height = video.videoHeight;
                incl.width = video.videoWidth;
                incl.length = video.duration;
                incl.url = videoUrl;
                resolve(incl);
            };
        };

        urlObjReader.readAsDataURL(videoFile);
    });
    return urlObjP;
}
