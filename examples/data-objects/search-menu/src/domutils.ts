/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// Called from a few contexts, inclusions are called render
export function clearSubtree(elm: HTMLElement) {
    const removeList: Node[] = [];
    for (const child of elm.childNodes) {
        if (!(child as HTMLElement).classList.contains("preserve")) {
            removeList.push(child);
        }
    }
    for (const node of removeList) {
        elm.removeChild(node);
    }
}

const textWidthCache = new Map<string, Map<string, number>>();
let cachedCanvas: HTMLCanvasElement;

export function getTextWidth(text: string, font: string) {
    let fontMap = textWidthCache.get(font);
    let w: number;
    if (!fontMap) {
        fontMap = new Map<string, number>();
    } else {
        w = fontMap.get(text);
    }
    if (w === undefined) {
        const canvas = cachedCanvas || (cachedCanvas = document.createElement("canvas"));
        const context = canvas.getContext("2d");
        context.font = font;
        const metrics = context.measureText(text);
        w = metrics.width;
        fontMap.set(text, w);
    }
    return w;
}

export function getTextHeight(elm: HTMLDivElement) {
    const computedStyle = getComputedStyle(elm);
    if (computedStyle.lineHeight && (computedStyle.lineHeight.length > 0) &&
        (computedStyle.lineHeight !== "normal")) {
        return parseInt(computedStyle.lineHeight, 10);
    } else {
        return parseInt(computedStyle.fontSize, 10);
    }
}
