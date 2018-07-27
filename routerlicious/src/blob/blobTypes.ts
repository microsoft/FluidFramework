
export interface IDataBlob {
    content?: Buffer;
    size: number;
    type: string;
    sha: string;
    fileName: string;
    url: string; // Link to durable URL
}

export interface IImageBlob extends IDataBlob {
    height: number;
    width: number;
}

export function isIImageBlob(blob: IDataBlob): blob is IImageBlob {
    return (blob as IImageBlob).height !== undefined;
}

export function getFileBlobType(mimeType: string) {
    switch (mimeType) {
        case "image/jpeg":
        case "image/png":
        case "image/gif":
        case "image/bmp": {
            return "image";
        }
        default: {
            return null;
        }
    }
}
