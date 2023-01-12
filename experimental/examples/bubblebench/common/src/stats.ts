/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export class Stats {
    private frameCount = 0;
    private _glitchCount = 0;
    private _smoothFps = 60;

    private readonly startTime = this.now();
    private currentFrameStart = 0;
    private _lastFrameElapsed = 0;

    public endFrame(): void {
        this.frameCount++;

        const nextFrameStart = this.now();
        this._lastFrameElapsed = nextFrameStart - this.currentFrameStart;
        this.currentFrameStart = nextFrameStart;

        const frameFps = 1000 / this._lastFrameElapsed;

        // Note: frameFps can be infinite if the delta from the previous frame is 0 ms.
        if (Number.isFinite(frameFps)) {
            if (frameFps < 18) {
                this._glitchCount++;
            }

            const a = 0.75;
            this._smoothFps = (a * this._smoothFps) + ((1 - a) * frameFps);
        }
    }

    public get smoothFps(): number { return this._smoothFps; }

    public get totalFps(): number {
        return this.frameCount / ((this.now() - this.startTime) / 1000);
    }

    public get lastFrameElapsed(): number { return this._lastFrameElapsed; }

    public get glitchCount(): number { return this._glitchCount; }

    public now(): number { return Date.now(); }
}
