/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

export declare type IGenericBlob = IDataBlob | IImageBlob | IVideoBlob;
export interface IBaseBlob {
    content?: Buffer;
    size: number;
    sha: string;
    fileName: string;
    url: string;
}
export interface IDataBlob extends IBaseBlob {
    type: "generic";
}
export interface IImageBlob extends IBaseBlob {
    type: "image";
    height: number;
    width: number;
}
export interface IVideoBlob extends IBaseBlob {
    type: "video";
    height: number;
    width: number;
    length: number;
}