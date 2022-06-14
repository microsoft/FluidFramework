/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISize } from "./size";

export class Rectangle {
    public static fromClientRect(cr: ClientRect) {
        return new Rectangle(cr.left, cr.top, cr.width, cr.height);
    }

    public static conformElementToRect(elm: HTMLElement, rect: Rectangle) {
        rect.conformElement(elm);
        return elm;
    }

    /**
     * Size of the rectangle
     */
    public get size(): ISize {
        return { width: this.width, height: this.height };
    }

    constructor(
        public x: number,
        public y: number,
        public width: number,
        public height: number) {
    }

    public square() {
        let len = this.width;
        let adj = 0;
        if (len > this.height) {
            len = this.height;
            adj = (this.width - len) / 2;
            return new Square(this.x + adj, this.y, len);
        } else {
            adj = (this.height - len) / 2;
            return new Square(this.x, this.y + adj, len);
        }
    }

    public union(other: Rectangle): Rectangle {
        const minX = Math.min(this.x, other.x);
        const minY = Math.min(this.y, other.y);
        const maxX = Math.max(this.x + this.width, other.x + other.width);
        const maxY = Math.max(this.y + this.height, other.y + other.height);
        return new Rectangle(minX, minY, maxX - minX, maxY - minY);
    }

    public contains(other: Rectangle): boolean {
        return other.x >= this.x &&
            (other.x + other.width <= this.x + this.width) &&
            other.y >= this.y &&
            (other.y + other.height <= this.y + this.height);
    }

    public nipVert(pixels: number) {
        return [
            new Rectangle(this.x, this.y, this.width, pixels),
            new Rectangle(this.x, this.y + pixels, this.width, this.height - pixels),
        ];
    }

    public nipVertBottom(pixels: number) {
        return [
            new Rectangle(this.x, this.y, this.width, this.height - pixels),
            new Rectangle(this.x, this.y + (this.height - pixels), this.width, pixels),
        ];
    }

    public nipVertTopBottom(topPixels: number, bottomPixels: number) {
        return [
            new Rectangle(this.x, this.y, this.width, topPixels),
            new Rectangle(this.x, this.y + topPixels, this.width, this.height - topPixels - bottomPixels),
            new Rectangle(this.x, this.y + (this.height - bottomPixels), this.width, bottomPixels),
        ];
    }

    public nipHoriz(pixels: number) {
        return [
            new Rectangle(this.x, this.y, pixels, this.height),
            new Rectangle(this.x + pixels, this.y, this.width - pixels, this.height),
        ];
    }

    public nipHorizRight(pixels: number) {
        return [
            new Rectangle(this.x, this.y, this.width - pixels, this.height),
            new Rectangle(this.x + (this.width - pixels), this.y, pixels, this.height),
        ];
    }

    public conformElementMaxHeight(elm: HTMLElement) {
        elm.style.position = "absolute";
        elm.style.left = `${this.x}px`;
        elm.style.width = `${this.width}px`;
        elm.style.top = `${this.y}px`;
        elm.style.maxHeight = `${this.height}px`;
    }

    public conformElementMaxHeightFromBottom(elm: HTMLElement, bottom: number) {
        elm.style.position = "absolute";
        elm.style.left = `${this.x}px`;
        elm.style.width = `${this.width}px`;
        elm.style.bottom = `${bottom}px`;
        elm.style.maxHeight = `${this.height}px`;
    }

    public conformElementOpenHeight(elm: HTMLElement) {
        elm.style.position = "absolute";
        elm.style.left = `${this.x}px`;
        elm.style.width = `${this.width}px`;
        elm.style.top = `${this.y}px`;
    }

    public moveElementToUpperLeft(elm: HTMLElement) {
        elm.style.position = "absolute";
        elm.style.left = `${this.x}px`;
        elm.style.top = `${this.y}px`;
    }

    public conformElement(elm: HTMLElement) {
        elm.style.position = "absolute";
        elm.style.left = `${this.x}px`;
        elm.style.top = `${this.y}px`;
        elm.style.width = `${this.width}px`;
        elm.style.height = `${this.height}px`;
        return elm;
    }

    public inner4(xfactor: number, yfactor: number, widthFactor: number, heightFactor: number) {
        const ix = this.x + Math.round(xfactor * this.width);
        const iy = this.y + Math.round(yfactor * this.height);
        const iw = Math.floor(this.width * widthFactor);
        const ih = Math.floor(this.height * heightFactor);
        return (new Rectangle(ix, iy, iw, ih));
    }

    public inner(factor: number) {
        const iw = Math.round(factor * this.width);
        const ih = Math.round(factor * this.height);
        const ix = this.x + Math.floor((this.width - iw) / 2);
        const iy = this.y + Math.floor((this.height - ih) / 2);
        return (new Rectangle(ix, iy, iw, ih));
    }

    public innerAbs(pixels: number) {
        const iw = this.width - (2 * pixels);
        const ih = this.height - (2 * pixels);
        const ix = this.x + pixels;
        const iy = this.y + pixels;
        return (new Rectangle(ix, iy, iw, ih));
    }

    public proportionalSplitHoriz(...proportionalWidths: number[]) {
        let totalPropWidth = 0;
        let i: number;

        for (i = 0; i < proportionalWidths.length; i++) {
            totalPropWidth += proportionalWidths[i];
        }

        let totalWidth = 0;
        const widths: number[] = [];
        for (i = 0; i < proportionalWidths.length; i++) {
            widths[i] = (proportionalWidths[i] / totalPropWidth) * this.width;
            totalWidth += widths[i];
        }

        let extraWidth = this.width - totalWidth;
        /* Add back round-off error equally to all rectangles */
        i = 0;
        while (extraWidth > 0) {
            widths[i]++;
            extraWidth--;
            if ((++i) === widths.length) {
                i = 0;
            }
        }
        const rects: Rectangle[] = [];
        let curX = this.x;
        for (i = 0; i < widths.length; i++) {
            rects[i] = new Rectangle(curX, this.y, widths[i], this.height);
            curX += widths[i];
        }
        return rects;
    }

    public proportionalSplitVert(...proportionalHeights: number[]): Rectangle[] {
        let totalPropHeight = 0;
        let i: number;

        for (i = 0; i < proportionalHeights.length; i++) {
            totalPropHeight += proportionalHeights[i];
        }

        let totalHeight = 0;
        const heights: number[] = [];
        for (i = 0; i < proportionalHeights.length; i++) {
            heights[i] = (proportionalHeights[i] / totalPropHeight) * this.height;
            totalHeight += heights[i];
        }

        let extraHeight = this.height - totalHeight;
        /* Add back round-off error equally to all rectangles */
        i = 0;
        while (extraHeight > 0) {
            heights[i]++;
            extraHeight--;
            if ((++i) === heights.length) {
                i = 0;
            }
        }
        const rects: Rectangle[] = [];
        let curY = this.y;
        for (i = 0; i < heights.length; i++) {
            rects[i] = new Rectangle(this.x, curY, this.width, heights[i]);
            curY += heights[i];
        }
        return rects;
    }

    public within(x: number, y: number) {
        return (this.x <= x) && (this.y <= y) && ((this.x + this.width) >= x) && ((this.y + this.height) >= y);
    }

    public subDivideHorizAbs(width: number) {
        const n = Math.ceil(this.width / width);
        return this.subDivideHoriz(n);
    }

    public subDivideHoriz(n: number) {
        const rects: Rectangle[] = [];

        const tileWidth = this.width / n;
        let rem = this.width % n;
        let tileX = this.x;
        for (let i = 0; i < n; i++) {
            rects[i] = new Rectangle(tileX, this.y, tileWidth, this.height);
            if (rem > 0) {
                rects[i].width++;
                rem--;
            }
            tileX += rects[i].width;
        }
        return rects;
    }

    public subDivideVertAbs(height: number, peanutButter = true) {
        const n = Math.ceil(this.height / height);
        return this.subDivideVert(n, peanutButter);
    }

    public subDivideVertAbsEnclosed(height: number, peanutButter = true) {
        const n = Math.ceil(this.height / height);
        return this.subDivideVertEnclosed(n, peanutButter);
    }

    public subDivideVertEnclosed(n: number, peanutButter = true) {
        const rects: Rectangle[] = [];
        const tileHeight = Math.floor(this.height / n);
        let rem = this.height % n;
        let tileY = 0;
        for (let i = 0; i < n; i++) {
            rects[i] = new Rectangle(0, tileY, this.width, tileHeight);
            if (peanutButter && (rem > 0)) {
                rects[i].height++;
                rem--;
            }
            tileY += rects[i].height;
        }
        return rects;
    }

    public subDivideVert(n: number, peanutButter = true) {
        const rects: Rectangle[] = [];
        const tileHeight = Math.floor(this.height / n);
        let rem = this.height % n;
        let tileY = this.y;
        for (let i = 0; i < n; i++) {
            rects[i] = new Rectangle(this.x, tileY, this.width, tileHeight);
            if (peanutButter && (rem > 0)) {
                rects[i].height++;
                rem--;
            }
            tileY += rects[i].height;
        }
        return rects;
    }
}

export class Square extends Rectangle {
    public len: number;

    constructor(x: number, y: number, len: number) {
        super(x, y, len, len);
        this.len = len;
    }
}
