import { api, core, utils } from "@prague/client-api";

export async function blobUploadHandler(
    dragZone: HTMLDivElement,
    document: api.Document,
    blobDisplayCB: (file: core.IGenericBlob) => void) {

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

export async function urlToInclusion(path: string): Promise<core.IGenericBlob> {
    // TODO sabroner: wow this is brittle.
    const pathComponents = path.split("/");
    const fileName = pathComponents[pathComponents.length - 1];

    return new Promise<core.IGenericBlob>((resolve, reject) => {
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

async function fileToInclusion(file: File): Promise<core.IGenericBlob> {
    const arrayBufferReader = new FileReader();

    const baseInclusion = {
        fileName: file.name,
        type: core.getFileBlobType(file.type),
        url: "", // TODO sabroner: can I create the URL locally?
    } as core.IGenericBlob;

    const arrayBufferP = new Promise<Buffer>((resolve, reject) => {
        arrayBufferReader.onerror = (error) => {
            arrayBufferReader.abort();
            reject("error: " + JSON.stringify(error));
        };

        arrayBufferReader.onloadend = () => {
            const blobData = Buffer.from(arrayBufferReader.result as ArrayBuffer);
            resolve(blobData);
        };
        arrayBufferReader.readAsArrayBuffer(file);
    });

    switch (baseInclusion.type) {
        case "image": {
            const blobP = imageHandler(file, baseInclusion as core.IImageBlob);

            return Promise.all([arrayBufferP, blobP])
                .then(([arrayBuffer, blob]) => {
                    const incl: core.IImageBlob = {
                        content: arrayBuffer,
                        fileName: file.name,
                        height: (blob as core.IImageBlob).height,
                        sha: utils.gitHashFile(arrayBuffer),
                        size: arrayBuffer.byteLength,
                        type: "image",
                        url: blob.url,
                        width: (blob as core.IImageBlob).width,
                    };
                    return incl as core.IImageBlob;
                });
        }
        case "video": {
            const blobP = videoHandler(file, baseInclusion);
            return Promise.all([arrayBufferP, blobP])
                .then(([arrayBuffer, blob]) => {
                    const incl: core.IVideoBlob = {
                        content: arrayBuffer,
                        fileName: file.name,
                        height: blob.height,
                        length: blob.length,
                        sha: utils.gitHashFile(arrayBuffer),
                        size: arrayBuffer.byteLength,
                        type: "video",
                        url: blob.url,
                        width: blob.width,
                    };
                    return incl as core.IVideoBlob;
                });
        }
        default: {
            return Promise.all([arrayBufferP])
                .then(([arrayBuffer]) => {
                    const incl: core.IGenericBlob = {
                        content: arrayBuffer,
                        fileName: file.name,
                        sha: utils.gitHashFile(arrayBuffer),
                        size: arrayBuffer.byteLength,
                        type: "generic",
                        url: baseInclusion.url,
                    };
                    return incl as core.IGenericBlob;
                });
        }
    }
}

async function imageHandler(imageFile: File, incl: core.IImageBlob): Promise<core.IImageBlob> {
    const urlObjReader = new FileReader();

    const urlObjP = new Promise<core.IImageBlob>((resolve, reject) => {
        urlObjReader.onerror = (error) => {
            urlObjReader.abort();
            reject("error: " + JSON.stringify(error));
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

async function videoHandler(videoFile: File, incl: core.IVideoBlob): Promise<core.IVideoBlob> {
    const urlObjReader = new FileReader();

    const urlObjP = new Promise<core.IVideoBlob>((resolve, reject) => {
        urlObjReader.onerror = (error) => {
            urlObjReader.abort();
            reject("error: " + JSON.stringify(error));
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
