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

export function findFirstMatch(root: HTMLElement, match: (elm: HTMLElement) => boolean): HTMLElement {
    if (match(root)) {
        return root;
    } else {
        let childElement = root.firstElementChild as HTMLElement;
        while (childElement) {
            const result = findFirstMatch(childElement, match);
            if (result) {
                return result;
            } else {
                childElement = childElement.nextElementSibling as HTMLElement;
            }
        }
    }
}

const textWidthCache = new Map<string, Map<string, number>>();
const lineHeightCache = new Map<string, number>();
let cachedCanvas: HTMLCanvasElement;

export function getLineHeight(fontstr: string, lineHeight?: string) {
    let _fontstr = fontstr;
    if (lineHeight) {
        _fontstr += (`/${lineHeight}`);
    }
    let height = lineHeightCache.get(_fontstr);
    if (height === undefined) {
        const elm = document.createElement("div");
        elm.style.position = "absolute";
        elm.style.zIndex = "-10";
        elm.style.left = "0px";
        elm.style.top = "0px";
        elm.style.font = _fontstr;
        document.body.appendChild(elm);
        height = getTextHeight(elm);
        document.body.removeChild(elm);
        lineHeightCache.set(_fontstr, height);
    }
    if (isNaN(height)) {
        console.log(`nan height with fontstr ${_fontstr}`);
    }
    return height;
}

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

export function getMultiTextWidth(texts: string[], font: string) {
    // Re-use canvas object for better performance
    const canvas = cachedCanvas || (cachedCanvas = document.createElement("canvas"));
    const context = canvas.getContext("2d");
    context.font = font;
    let sum = 0;
    for (const text of texts) {
        const metrics = context.measureText(text);
        sum += metrics.width;
    }
    return sum;
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
