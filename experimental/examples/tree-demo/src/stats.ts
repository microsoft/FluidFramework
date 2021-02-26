/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

export class Stats {
    private frameCount = 0;
    private _glitchCount = 0;
    private _smoothFps = 60;

    private readonly startTime;
    private currentFrameStart = 0;
    private _lastFrameElapsed = 0;

    constructor() {
        this.startTime = this.now();
    }

    public start() {
        this.currentFrameStart = this.now();
    }

    public endFrame() {
        this.frameCount++;

        const nextFrameStart = this.now();
        this._lastFrameElapsed = nextFrameStart - this.currentFrameStart;
        this.currentFrameStart = nextFrameStart;

        const frameFps = 1000.0 / this._lastFrameElapsed;
        if (frameFps < 24) {
            this._glitchCount++;
        }

        const a = 0.75;
        this._smoothFps = (a * this._smoothFps) + ((1 - a) * frameFps);

        console.assert(isFinite(this._smoothFps), `${this._smoothFps}, ${frameFps}`);
    }

    public get smoothFps() { return this._smoothFps; }

    public get totalFps() {
        return this.frameCount / ((this.now() - this.startTime) / 1000.0);
    }

    public get lastFrameElapsed() { return this._lastFrameElapsed; }

    public get glitchCount() { return this._glitchCount; }

    public now() { return Date.now(); }
}
