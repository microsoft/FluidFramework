import { IDocument } from "../api-core";
import { gitHashFile } from "../core-utils";
import { getFileBlobType, IDataBlob, IImageBlob } from "./blobTypes";

export async function blobUploadHandler(dragZone: HTMLDivElement,
                                        document: IDocument,
                                        blobDisplayCB: (file: IDataBlob) => void) {

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

function blobToFile(blob: Blob, fileName: string): File {
    const b: any = blob;
    b.lastModifiedDate = new Date();
    b.name = fileName;

    return b as File;
}

export async function urlToInclusion(path: string): Promise<IDataBlob> {
    // TODO sabroner: wow this is brittle.
    const pathComponents = path.split("/");
    const fileName = pathComponents[pathComponents.length - 1];

    return new Promise<IDataBlob>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("GET", path);
        xhr.responseType = "blob"; // force the HTTP response, response-type header to be blob
        xhr.onload = () => {
            resolve(fileToInclusion(blobToFile(xhr.response, fileName)));
        };
        xhr.send();
    });
}

export async function fileToInclusion(file: File): Promise<IDataBlob> {
    const arrayBufferReader = new FileReader();

    const baseInclusion = {
        fileName: file.name,
        type: file.type,
        url: "", // TODO sabroner: can I create the URL locally?
    } as IDataBlob;

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

    let blobP: Promise<IDataBlob>;

    switch (getFileBlobType(baseInclusion.type)) {
        case "image": {
            blobP = imageHandler(file, baseInclusion as IImageBlob);

            return Promise.all([arrayBufferP, blobP])
                .then(([arrayBuffer, blob]) => {
                    const incls: IImageBlob = {
                        content: arrayBuffer,
                        fileName: file.name,
                        height: (blob as IImageBlob).height,
                        sha: gitHashFile(arrayBuffer),
                        size: arrayBuffer.byteLength,
                        type: file.type,
                        url: baseInclusion.url,
                        width: (blob as IImageBlob).width,
                    };
                    return incls as IImageBlob;
                });
        }
        case "text": {
            blobP = textHandler(file, baseInclusion as IDataBlob);
            return Promise.all([arrayBufferP, blobP])
                .then(([arrayBuffer, text]) => {
                    const incls: IDataBlob = {
                        content: arrayBuffer,
                        fileName: file.name,
                        sha: gitHashFile(arrayBuffer),
                        size: arrayBuffer.byteLength,
                        type: file.type,
                        url: baseInclusion.url,
                    };
                    return incls as IDataBlob;
                });
        }
        default: {
            console.log("default");
            break;
        }
    }
}

async function imageHandler(imageFile: File, incl: IImageBlob): Promise<IImageBlob> {
    const urlObjReader = new FileReader();

    const urlObjP = new Promise<IImageBlob>((resolve, reject) => {
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

async function textHandler(textFile: File, incl: IDataBlob): Promise<IDataBlob> {
    /// STUB
    return null;
}
