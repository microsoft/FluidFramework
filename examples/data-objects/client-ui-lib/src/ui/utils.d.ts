/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
export declare const id: (elementId: string) => HTMLElement;
export declare function makeElementVisible(elem: any, visible: any): void;
export declare function byteHex(num: number): string;
export interface IColor {
    r: number;
    g: number;
    b: number;
    a: number;
}
export declare const toColorStringNoAlpha: (color: IColor) => string;
/**
 * Converts the provided color to a rgba CSS color string
 */
export declare function toColorString(color: IColor): string;
export declare function hexStrToRGBA(hexStr: string): IColor;
export declare function toColorStruct(color: string): IColor;
export declare function breakFilePath(path: any): {
    source: any;
    path: any;
    filename: any;
    ext: any;
};
export declare function parseURL(url: any): {
    ext: any;
    file: any;
    hash: string;
    host: string;
    params: () => {};
    path: any;
    port: string;
    protocol: string;
    query: string;
    segments: any;
    source: any;
};
export declare function throttle(type: string, name: string, obj?: any): void;
/**
 * Helper class that throttles calling the provided callback based on
 * an animation frame timer
 */
export declare class AnimationFrameThrottler {
    private readonly callback;
    private running;
    constructor(callback: Function);
    trigger(): void;
}
export declare function removeAllChildren(element: HTMLElement): void;
//# sourceMappingURL=utils.d.ts.map