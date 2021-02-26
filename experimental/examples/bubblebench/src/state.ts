/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Change, SharedTree } from "@fluid-experimental/tree";
import { randomColor, rnd } from "./rnd";
import { IApp, IBubble, IClient, TreeArrayProxy, TreeObjectProxy } from "./proxy";
import { fromJson } from "./treeutils";

export class AppState {
    private readonly update: (...change: Change[]) => void;
    public readonly applyEdits: () => void;
    private readonly root: IApp;

    public readonly localClient: IClient;

    private readonly deferredUpdates = true;
    private readonly deferredChanges: Change[] = [];

    constructor(
        private readonly tree: SharedTree,
        stageWidth: number,
        stageHeight: number,
        numBubbles: number,
    ) {
        this.update = this.deferredUpdates
            ? this.deferredChanges.push.bind(this.deferredChanges)
            : this.tree.applyEdit.bind(tree);

        this.applyEdits = this.deferredUpdates
            ? () => {
                this.tree.applyEdit(...this.deferredChanges);
                this.deferredChanges.length = 0;
            }
            : () => {};

        this.root = TreeObjectProxy<IApp>(this.tree, this.tree.currentView.root, this.update);

        const clientNode = fromJson({
            clientId: "pending",
            color: randomColor(),
            bubbles: new Array(numBubbles).fill(undefined).map(() => this.makeBubble(stageWidth, stageHeight)),
        });

        this.clients.pushNode(clientNode);
        this.localClient = TreeObjectProxy(this.tree, clientNode.identifier, this.update);

        this.applyEdits();
    }

    public get clients(): TreeArrayProxy<IClient> {
        return this.root.clients;
    }

    public get localBubbles(): TreeArrayProxy<IBubble> {
        return this.localClient.bubbles;
    }

    private makeBubble(stageWidth: number, stageHeight: number) {
        const radius = (rnd.float64() * 15) + 5;
        const maxSpeed = 4;
        const diameter = radius * 2;

        return {
            x: radius + (stageWidth - diameter) * rnd.float64(),
            y: radius + (stageHeight - diameter) * rnd.float64(),
            r: radius,
            vx: maxSpeed * (rnd.float64() * 2 - 1),
            vy: maxSpeed * (rnd.float64() * 2 - 1),
        };
    }

    public increaseBubbles(width: number, height: number) {
        this.localBubbles.pushNode(fromJson(this.makeBubble(width, height)));
    }

    public decreaseBubbles() {
        if (this.localBubbles.length > 1) {
            this.localBubbles.pop();
        }
    }
}
