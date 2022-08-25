/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IAppState, IClient, makeBubble, makeClient } from "@fluid-example/bubblebench-common";

export class AppState implements IAppState {
    public readonly applyEdits = () => {};
    public readonly localClient: IClient;
    public readonly clients: IClient[];

    constructor(
        private _width: number,
        private _height: number,
        numBubbles: number,
    ) {
        this.localClient = makeClient(_width, _height, numBubbles);
        this.clients = [this.localClient];
    }

    public setSize(width?: number, height?: number) {
        this._width = width ?? 640;
        this._height = height ?? 480;
    }

    public get width() { return this._width; }
    public get height() { return this._height; }

    private makeBubble() {
        return makeBubble(this.width, this.height);
    }

    public increaseBubbles() {
        this.localClient.bubbles.push(this.makeBubble());
    }

    public decreaseBubbles() {
        const bubbles = this.localClient.bubbles;
        if (bubbles.length > 1) {
            bubbles.pop();
        }
    }
}
