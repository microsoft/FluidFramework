import * as api from "../api-core";
import { gitHashFile } from "../core-utils";

export async function blobUploadHandler(dragZone: HTMLDivElement,
                                        document: api.IDocument,
                                        blobDisplayCB: (file: api.IDataBlob) => void) {

    dragZone.ondrop = (event) => {
        event.dataTransfer.dropEffect = "copy";
        event.preventDefault();

        const dt = event.dataTransfer;
        const files = dt.files;
        fileToInclusion(files[0])
            .then(async (blob) => {
                blob = await document.uploadBlob(blob);
                blobDisplayCB(blob);
            });
    };

    dragZone.ondragover = (event) => {
        event.dataTransfer.dropEffect = "copy";
        event.preventDefault();
    };
}

export async function urlToInclusion(path: string): Promise<api.IDataBlob> {
    // TODO sabroner: wow this is brittle.
    const pathComponents = path.split("/");
    const fileName = pathComponents[pathComponents.length - 1];

    return new Promise<api.IDataBlob>((resolve, reject) => {
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

async function fileToInclusion(file: File): Promise<api.IDataBlob> {
    const arrayBufferReader = new FileReader();

    const baseInclusion = {
        fileName: file.name,
        type: file.type,
        url: "", // TODO sabroner: can I create the URL locally?
    } as api.IDataBlob;

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

    let blobP: Promise<api.IDataBlob>;

    switch (api.getFileBlobType(baseInclusion.type)) {
        case "image": {
            blobP = imageHandler(file, baseInclusion as api.IImageBlob);

            return Promise.all([arrayBufferP, blobP])
                .then(([arrayBuffer, blob]) => {
                    const incl: api.IImageBlob = {
                        content: arrayBuffer,
                        fileName: file.name,
                        height: (blob as api.IImageBlob).height,
                        sha: gitHashFile(arrayBuffer),
                        size: arrayBuffer.byteLength,
                        type: file.type,
                        url: baseInclusion.url,
                        width: (blob as api.IImageBlob).width,
                    };
                    return incl as api.IImageBlob;
                });
        }
        case "text": {
            blobP = textHandler(file, baseInclusion as api.IDataBlob);
            return Promise.all([arrayBufferP, blobP])
                .then(([arrayBuffer, blob]) => {
                    const incl: api.IDataBlob = {
                        content: arrayBuffer,
                        fileName: file.name,
                        sha: gitHashFile(arrayBuffer),
                        size: arrayBuffer.byteLength,
                        type: file.type,
                        url: baseInclusion.url,
                    };
                    return incl as api.IDataBlob;
                });
        }
        default: {
            console.log("default");
            return Promise.all([arrayBufferP])
                .then(([arrayBuffer]) => {
                    const incl: api.IDataBlob = {
                        content: arrayBuffer,
                        fileName: file.name,
                        sha: gitHashFile(arrayBuffer),
                        size: arrayBuffer.byteLength,
                        type: file.type,
                        url: baseInclusion.url,
                    };
                    return incl as api.IDataBlob;
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
                resolve(incl);
            };
        };

        urlObjReader.readAsDataURL(imageFile);
    });
    return urlObjP;
}

async function textHandler(textFile: File, incl: api.IDataBlob): Promise<api.IDataBlob> {
    /// STUB
    return null;
}
