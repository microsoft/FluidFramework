/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable no-bitwise */

import * as ui from "../ui";

export class Title extends ui.Component {
    public viewportDiv: HTMLDivElement;

    constructor(element: HTMLDivElement) {
        super(element);
        this.viewportDiv = document.createElement("div");
        this.element.appendChild(this.viewportDiv);
        this.viewportDiv.classList.add("title-bar");
    }

    public measure(size: ui.ISize): ui.ISize {
        return { width: size.width, height: 40 };
    }

    public setTitle(title: string) {
        // eslint-disable-next-line max-len
        this.viewportDiv.innerHTML = `<span id="docname" style="font-size:20px;font-family:Book Antiqua">${title} <span id="doctoken"></span></span>`;
    }

    public setBackgroundColor(title: string) {
        const rgb = this.hexToRGB(this.intToHex(this.hashCode(title)));
        const gradient = `linear-gradient(to right, rgba(${rgb[0]},${rgb[1]},${rgb[2]},0),
                          rgba(${rgb[0]},${rgb[1]},${rgb[2]},1))`;
        this.element.style.background = gradient;
    }

    public setVisibility(visible: boolean) {
        this.element.style.visibility = visible ? "visible" : "hidden";
    }

    protected resizeCore(bounds: ui.Rectangle) {
        const viewportRect = bounds.inner(0.92);
        ui.Rectangle.conformElementToRect(this.viewportDiv, viewportRect);
    }

    // Implementation of java String#hashCode
    private hashCode(str: string): number {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = str.charCodeAt(i) + ((hash << 5) - hash);
        }
        return hash;
    }

    // Integer to RGB color converter.
    private intToHex(code: number): string {
        const c = (code & 0x00FFFFFF).toString(16).toUpperCase();
        return "00000".substring(0, 6 - c.length) + c;
    }

    private hexToRGB(hex: string): number[] {
        let _hex = hex;
        if (_hex.length === 3) {
            _hex = _hex[0] + _hex[0] + _hex[1] + _hex[1] + _hex[2] + _hex[2];
        }
        const num = parseInt(_hex, 16);
        return [num >> 16, num >> 8 & 255, num & 255];
    }
}

/* eslint-enable no-bitwise */
