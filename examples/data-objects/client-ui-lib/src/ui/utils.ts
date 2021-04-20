/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// Utility to fetch elements by ID
export const id = (elementId: string): HTMLElement => (document.getElementById(elementId));

export function makeElementVisible(elem, visible) {
    elem.style.display = visible ? "block" : "none";
}

// Convenience function used by color converters.
export function byteHex(num: number) {
    let hex = num.toString(16);
    if (hex.length === 1) {
        hex = `0${hex}`;
    }
    return hex;
}

// -----------------------------------------
// Color Wrangling
// -----------------------------------------

export interface IColor {
    r: number;
    g: number;
    b: number;
    a: number;
}

// eslint-disable-next-line max-len
export const toColorStringNoAlpha = (color: IColor) => `#${byteHex(color.r * 255)}${byteHex(color.g * 255)}${byteHex(color.b * 255)}`;

/**
 * Converts an RGB component in the range [0,1] to [0,255]
 */
const toRGBInteger = (value: number) => Math.round(value * 255);

/**
 * Converts the provided color to a rgba CSS color string
 */
export function toColorString(color: IColor) {
    const r = toRGBInteger(color.r);
    const g = toRGBInteger(color.g);
    const b = toRGBInteger(color.b);
    return `rgba(${r}, ${g}, ${b}, ${color.a})`;
}

// Helper function to support HTML hexColor Strings
export function hexStrToRGBA(hexStr: string): IColor {
    let _hexStr = hexStr;
    // RGBA color object
    const colorObject: IColor = { r: 1, g: 1, b: 1, a: 1 };

    // Remove hash if it exists
    _hexStr = _hexStr.replace("#", "");

    if (_hexStr.length === 6) {
        // No Alpha
        colorObject.r = parseInt(_hexStr.slice(0, 2), 16) / 255;
        colorObject.g = parseInt(_hexStr.slice(2, 4), 16) / 255;
        colorObject.b = parseInt(_hexStr.slice(4, 6), 16) / 255;
        colorObject.a = parseInt("0xFF", 16) / 255;
    } else if (_hexStr.length === 8) {
        // Alpha
        colorObject.r = parseInt(_hexStr.slice(0, 2), 16) / 255;
        colorObject.g = parseInt(_hexStr.slice(2, 4), 16) / 255;
        colorObject.b = parseInt(_hexStr.slice(4, 6), 16) / 255;
        colorObject.a = parseInt(_hexStr.slice(6, 8), 16) / 255;
    } else if (_hexStr.length === 3) {
        // Shorthand hex color
        const rVal = _hexStr.slice(0, 1);
        const gVal = _hexStr.slice(1, 2);
        const bVal = _hexStr.slice(2, 3);
        colorObject.r = parseInt(rVal + rVal, 16) / 255;
        colorObject.g = parseInt(gVal + gVal, 16) / 255;
        colorObject.b = parseInt(bVal + bVal, 16) / 255;
    } else {
        throw new Error(`Invalid HexString length: ${_hexStr.length}. Expected HexString length is either 8, 6, or 3.`);
    }
    return colorObject;
}

// Convert from the few color names used in this app to Windows.UI.Input.Inking"s color code.
// If it isn"t one of those, then decode the hex string.  Otherwise return gray.
// The alpha component is always set to full (255).
export function toColorStruct(color: string): IColor {
    switch (color) {
        // Ink colors
        case "Black": return { r: 0x00, g: 0x00, b: 0x00, a: 0xff };
        case "Blue": return { r: 0x00, g: 0x00, b: 0xff, a: 0xff };
        case "Red": return { r: 0xFF, g: 0x00, b: 0x00, a: 0xff };
        case "Green": return { r: 0x00, g: 0xff, b: 0x00, a: 0xff };
        // Highlighting colors
        case "Yellow": return { r: 0xff, g: 0xff, b: 0x00, a: 0xff };
        case "Aqua": return { r: 0x66, g: 0xcd, b: 0xaa, a: 0xff };
        case "Lime": return { r: 0x00, g: 0xff, b: 0x00, a: 0xff };
        // Select colors
        case "Gold": return { r: 0xff, g: 0xd7, b: 0x00, a: 0xff };
        case "White": return { r: 0xFF, g: 0xff, b: 0xff, a: 0xff };
        default:
            return hexStrToRGBA(color);
    }
}

// ----------------------------------------------------------------------
// URL/Path parsing stuff
// ----------------------------------------------------------------------
export function breakFilePath(path) {
    const m = path.match(/(.*)[/\\]([^/\\]+)\.(\w+)/);
    if (m) {
        return { source: m[0], path: m[1], filename: m[2], ext: m[3] };
    } else {
        return { source: m[0], path: "", filename: "", ext: "" };
    }
}

export function parseURL(url) {
    const a = document.createElement("a");
    a.href = url;
    const parts = breakFilePath(a.pathname);
    return {
        ext: parts.ext,
        file: parts.filename,
        hash: a.hash.replace("#", ""),
        host: a.hostname,
        params: () => {
            const ret = {};
            const seg = a.search.replace(/^\?/, "").split("&");
            const len = seg.length;
            let i = 0;
            let s;
            for (; i < len; i++) {
                if (!seg[i]) { continue; }
                s = seg[i].split("=");
                ret[s[0]] = s[1];
            }
            return ret;
        },
        path: parts.path,
        port: a.port,
        protocol: a.protocol.replace(":", ""),
        query: a.search,
        segments: parts.path.replace(/^\//, "").split("/"),
        source: url,
    };
}

// Following recomendations of https://developer.mozilla.org/en-US/docs/Web/Events/resize to
// throttle computationally expensive events
export function throttle(type: string, name: string, obj?: any) {
    let _obj = obj;
    _obj = _obj || window;
    let running = false;
    _obj.addEventListener(
        type,
        () => {
            if (running) {
                return;
            }

            running = true;
            requestAnimationFrame(() => {
                _obj.dispatchEvent(new CustomEvent(name));
                running = false;
            });
        });
}

/**
 * Helper class that throttles calling the provided callback based on
 * an animation frame timer
 */
export class AnimationFrameThrottler {
    private running = false;

    // eslint-disable-next-line @typescript-eslint/ban-types
    constructor(private readonly callback: Function) {
    }

    public trigger(): void {
        if (this.running) {
            return;
        }

        this.running = true;
        requestAnimationFrame(() => {
            this.callback();
            this.running = false;
        });
    }
}

export function removeAllChildren(element: HTMLElement) {
    // Remove any existing children and attach ourselves
    while (element.hasChildNodes()) {
        element.removeChild(element.lastChild);
    }
}
