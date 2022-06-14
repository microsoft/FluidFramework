/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export interface IRange {
    start: number;
    end: number;
}

const Nope = -1;

export class Cursor {
    public off = true;
    private _editSpan: HTMLSpanElement | undefined;
    public get editSpan(): HTMLSpanElement {
        if (this._editSpan === undefined) {
            throw new Error("Edit span accessed before creation");
        }
        return this._editSpan;
    }
    public mark = Nope;
    protected bgColor = "blue";
    protected enabled = true;

    constructor(public viewportDiv: HTMLDivElement, public pos = 0) {
        this.makeSpan();
    }

    /**
     * Enable the cursor - makes the cursor visible
     */
    public enable() {
        if (this.enabled) {
            return;
        }

        this.enabled = true;
        this.show();

        this.blinkCursor();
    }

    /**
     * Disable the cursor - hides the cursor and prevents it from showing up
     */
    public disable() {
        if (!this.enabled) {
            return;
        }

        this.enabled = false;
        this.hide(true);
        this.clearSelection();
    }

    public tryMark() {
        if (this.mark === Nope) {
            this.mark = this.pos;
        }
    }

    public emptySelection() {
        return this.mark === this.pos;
    }

    public clearSelection() {
        this.mark = Nope;
    }

    public getSelection(): IRange | undefined {
        if (this.mark !== Nope) {
            return {
                end: Math.max(this.mark, this.pos),
                start: Math.min(this.mark, this.pos),
            };
        }
    }

    public hide(hidePresenceDiv: boolean = false) {
        this.editSpan.style.visibility = "hidden";
    }

    public show() {
        if (!this.enabled) {
            return;
        }
        this.editSpan.style.backgroundColor = this.bgColor;
        this.editSpan.style.visibility = "visible";
    }

    public makeSpan() {
        this._editSpan = document.createElement("span");
        this.editSpan.innerText = "\uFEFF";
        this.editSpan.style.zIndex = "3";
        this.editSpan.style.position = "absolute";
        this.editSpan.style.left = "0px";
        this.editSpan.style.top = "0px";
        this.editSpan.style.width = "1px";
        this.show();
    }

    public rect() {
        return this.editSpan.getBoundingClientRect();
    }

    public scope() {
        this.bgColor = "gray";
        this.editSpan.style.backgroundColor = this.bgColor;
        this.editSpan.style.zIndex = "4";
        this.editSpan.style.width = "1px";
    }

    public lateralMove(x: number) {
        this.editSpan.style.left = `${x}px`;
    }

    public assignToLine(x: number, h: number, lineDiv: HTMLDivElement) {
        this.editSpan.style.left = `${x}px`;
        this.editSpan.style.height = `${h}px`;
        if (this.editSpan.parentElement) {
            this.editSpan.parentElement.removeChild(this.editSpan);
        }
        lineDiv.appendChild(this.editSpan);
        this.blinkCursor();
    }

    protected blinkCursor() {
        this.editSpan.classList.add("blinking");
    }
}
