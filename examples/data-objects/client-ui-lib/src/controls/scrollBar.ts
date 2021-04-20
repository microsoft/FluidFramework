/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as ui from "../ui";

export interface IRange {
    value: number;
    min: number;
    max: number;
}

// TODO will want to emit events for clicking the thing, etc...

export class ScrollBar extends ui.Component {
    public scrollDiv: HTMLDivElement;
    public scrollRect: ui.Rectangle;
    private readonly track: HTMLDivElement;

    private range: IRange = { value: 0, min: 0, max: 0 };

    /**
     * Sets the value of the track
     */
    public set value(value: number) {
        this.range.value = value;
        this.updateTrack();
    }

    public set min(value: number) {
        this.range.min = value;
        this.updateTrack();
    }

    public set max(value: number) {
        this.range.max = value;
        this.updateTrack();
    }

    constructor(element: HTMLDivElement) {
        super(element);

        this.track = document.createElement("div");
        this.track.style.backgroundColor = "pink";
        this.track.style.borderRadius = "5px";
        this.track.style.position = "absolute";
        this.element.appendChild(this.track);
    }

    public setRange(range: IRange) {
        this.range = { value: range.value, min: range.min, max: range.max };
        this.updateTrack();
    }

    protected resizeCore(bounds: ui.Rectangle) {
        this.updateTrack();
    }

    /**
     * Updates the scroll bar's track element
     */
    private updateTrack() {
        const rangeLength = this.range.max - this.range.min;
        const frac = rangeLength !== 0 ? (this.range.value - this.range.min) / rangeLength : 0;
        const height = Math.max(3, rangeLength !== 0 ? this.size.height / rangeLength : 0, 0);
        const top = frac * this.size.height;
        const left = 3;

        // The below will get put in some kind of updateTrack call
        this.track.style.width = `${Math.max(12, this.size.width - 6)}px`;
        this.track.style.height = `${height}px`;
        this.track.style.left = `${left}px`;
        this.track.style.top = `${top}px`;
    }
}
