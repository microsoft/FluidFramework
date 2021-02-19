export class Stats {
    private frameCount = 0;
    private _glitchCount = 0;
    private _smoothFps = 60;

    private startTime = 0;
    private lastFrameStart = 0;

    public start() {
        this.startTime = Date.now();
    }

    public endFrame() {
        this.frameCount++;

        const nextFrameStart = Date.now();
        const frameElapsed = nextFrameStart - this.lastFrameStart;
        this.lastFrameStart = nextFrameStart;

        const frameFps = 1000.0 / frameElapsed;
        if (frameFps < 24) {
            this._glitchCount++;
        }

        this._smoothFps = (0.95 * this._smoothFps) + (0.05 * frameFps);
    }

    public get smoothFps() { return this._smoothFps; }

    public get totalFps() {
        return this.frameCount / ((Date.now() - this.startTime) / 1000.0);
    }

    public get glitchCount() { return this._glitchCount; }
}
