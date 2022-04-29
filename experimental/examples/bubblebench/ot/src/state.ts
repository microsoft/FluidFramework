/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { SharedJson1 } from "@fluid-experimental/sharejs-json1";
import { IAppState, IClient, IArrayish, makeBubble, randomColor } from "@fluid-example/bubblebench-common";
import { observe } from "./proxy";

interface IApp { clients: IArrayish<IClient>; }

export class AppState implements IAppState {
    private readonly root: IApp;

    public readonly localClient: IClient;

    constructor(
        tree: SharedJson1,
        private _width: number,
        private _height: number,
        numBubbles: number,
    ) {
        this.root = observe(tree.get() as unknown as IApp, (op) => tree.apply(op));

        const client = {
            clientId: "pending",
            color: randomColor(),
            bubbles: new Array(numBubbles).fill(undefined).map(() => this.makeBubble()),
        };

        const length = this.root.clients.push(client);
        this.localClient = this.root.clients[length - 1];
    }

    public applyEdits() { }

    public setSize(width?: number, height?: number) {
        this._width = width ?? 640;
        this._height = height ?? 480;
    }

    public get width() { return this._width; }
    public get height() { return this._height; }

    public get clients(): IArrayish<IClient> {
        return this.root.clients;
    }

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
