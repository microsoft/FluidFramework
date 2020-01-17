/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as api from "@fluid-internal/client-api";
import { getFileBlobType, IGenericBlob, IImageBlob, IVideoBlob } from "@microsoft/fluid-container-definitions";
import { gitHashFileAsync } from "@microsoft/fluid-core-utils";

export async function blobUploadHandler(
    dragZone: HTMLDivElement,
    document: api.Document,
    blobDisplayCB: (file: IGenericBlob) => void) {

    dragZone.ondrop = (event) => {
        event.dataTransfer.dropEffect = "copy";
        event.preventDefault();

        const dt = event.dataTransfer;
        const files = dt.files;
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        fileToInclusion(files[0])
            .then(async (blob) => {
                await document.uploadBlob(blob);
                blobDisplayCB(blob);
            });
    };

    dragZone.ondragover = (event) => {
        event.dataTransfer.dropEffect = "copy";
        event.preventDefault();
    };
}

async function fileToInclusion(file: File): Promise<IGenericBlob> {
    const arrayBufferReader = new FileReader();

    const baseInclusion = {
        fileName: file.name,
        type: getFileBlobType(file.type),
        url: "", // TODO sabroner: can I create the URL locally?
    } as IGenericBlob;

    const arrayBufferP = new Promise<Buffer>((resolve, reject) => {
        arrayBufferReader.onerror = (error) => {
            arrayBufferReader.abort();
            reject(`error: ${JSON.stringify(error)}`);
        };

        arrayBufferReader.onloadend = () => {
            const blobData = Buffer.from(arrayBufferReader.result as ArrayBuffer);
            resolve(blobData);
        };
        arrayBufferReader.readAsArrayBuffer(file);
    });

    switch (baseInclusion.type) {
        case "image": {
            const blobP = imageHandler(file, baseInclusion);
            return arrayBufferP
                .then(async (arrayBuffer) => {
                    const hashP = gitHashFileAsync(arrayBuffer);
                    return Promise.all([blobP, hashP])
                        .then(([blob, hash]) => {
                            const incl: IImageBlob = {
                                content: arrayBuffer,
                                fileName: file.name,
                                height: blob.height,
                                id: hash,
                                size: arrayBuffer.byteLength,
                                type: "image",
                                url: blob.url,
                                width: blob.width,
                            };
                            return incl;
                        });
                });
        }
        case "video": {
            const blobP = videoHandler(file, baseInclusion);
            return arrayBufferP
                .then(async (arrayBuffer) => {
                    const hashP = gitHashFileAsync(arrayBuffer);
                    return Promise.all([blobP, hashP])
                        .then(([blob, hash]) => {
                            const incl: IVideoBlob = {
                                content: arrayBuffer,
                                fileName: file.name,
                                height: blob.height,
                                id: hash,
                                length: blob.length,
                                size: arrayBuffer.byteLength,
                                type: "video",
                                url: blob.url,
                                width: blob.width,
                            };
                            return incl;
                        });
                });
        }
        default: {
            return arrayBufferP
                .then(async (arrayBuffer) => {
                    const hash = await gitHashFileAsync(arrayBuffer);
                    const incl: IGenericBlob = {
                        content: arrayBuffer,
                        fileName: file.name,
                        id: hash,
                        size: arrayBuffer.byteLength,
                        type: "generic",
                        url: baseInclusion.url,
                    };
                    return incl as IGenericBlob;
                });
        }
    }
}

async function imageHandler(imageFile: File, incl: IImageBlob): Promise<IImageBlob> {
    const urlObjReader = new FileReader();

    const urlObjP = new Promise<IImageBlob>((resolve, reject) => {
        urlObjReader.onerror = (error) => {
            urlObjReader.abort();
            reject(`error: ${JSON.stringify(error)}`);
        };

        urlObjReader.onloadend = () => {
            const imageUrl = urlObjReader.result as string;
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

async function videoHandler(videoFile: File, incl: IVideoBlob): Promise<IVideoBlob> {
    const urlObjReader = new FileReader();

    const urlObjP = new Promise<IVideoBlob>((resolve, reject) => {
        urlObjReader.onerror = (error) => {
            urlObjReader.abort();
            reject(`error: ${JSON.stringify(error)}`);
        };

        urlObjReader.onloadend = () => {
            const videoUrl = urlObjReader.result as string;
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
