/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { IAppState, makeBubble, randomColor } from "@fluid-example/bubblebench-common";
import { brand, ISharedTree, JsonableTree, moveToDetachedField } from "@fluid-internal/tree";
import { Client } from "./Client";
import {
    iBubbleSchema,
    iClientSchema,
    int32Schema,
    stringSchema,
} from "./schema";
import { SharedTreeSequenceHelper } from "./SharedTreeSequenceHelper";

export class AppState implements IAppState {
    readonly localClient: Client; // Note I am not using the interface IClient unlike other bubblebench examples
    readonly clientsSequenceHelper: SharedTreeSequenceHelper;
    constructor(
        private readonly tree: ISharedTree,
        private _width: number,
        private _height: number,
        numBubbles: number,
    ) {
        // Move to root node (which is the Shared AppState Node) and initialize this.clientsSequenceHelper
        const cursor = tree.forest.allocateCursor();
        moveToDetachedField(tree.forest, cursor);
        cursor.enterNode(0);
        this.clientsSequenceHelper = new SharedTreeSequenceHelper(
            tree,
            cursor.buildAnchor(),
            brand("clients"),
        );
        cursor.free();

        // Create the initial JsonableTree for the new local client
        const initialClientJsonTree =
            this.makeClientInitialJsonTree(numBubbles);
        // Insert it the local client the shared tree
        this.clientsSequenceHelper.push(initialClientJsonTree);
        // Keep a reference to the local client inserted into the shared tree
        const newClientIndex = this.clientsSequenceHelper.length() - 1;
        console.log(`new client Index: ${newClientIndex}`);
        this.localClient = new Client(
            tree,
            this.clientsSequenceHelper.getAnchor(newClientIndex),
        );
        console.log(`created client with id ${this.localClient.clientId} and color ${this.localClient.color}`);
    }

    public applyEdits() {} // Is it needed with the new shared tree?

    makeClientInitialJsonTree(numBubbles: number): JsonableTree {
        const clientInitialJsonTree: JsonableTree = {
            type: iClientSchema.name,
            fields: {
                clientId: [
                    { type: stringSchema.name, value: `${Math.random()}` },
                ],
                color: [{ type: stringSchema.name, value: randomColor() }],
                bubbles: [],
            },
        };

        // create and add initial bubbles to initial client json tree
        for (let i = 0; i < 1; i++) {
            const bubble = makeBubble(this._width, this._height);
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            clientInitialJsonTree.fields!.bubbles.push({
                type: iBubbleSchema.name,
                fields: {
                    x: [{ type: int32Schema.name, value: bubble.x }],
                    y: [{ type: int32Schema.name, value: bubble.y }],
                    r: [{ type: int32Schema.name, value: bubble.r }],
                    vx: [{ type: int32Schema.name, value: bubble.vx }],
                    vy: [{ type: int32Schema.name, value: bubble.vy }],
                },
            });
        }

        return clientInitialJsonTree;
    }

    public get clients() {
        return this.clientsSequenceHelper
            .getAll()
            .map((treeNode) => new Client(this.tree, treeNode.anchor));
    }

    public get width() {
        return this._width;
    }
    public get height() {
        return this._height;
    }

    public setSize(width?: number, height?: number) {
        this._width = width ?? 640;
        this._height = height ?? 480;
    }

    public increaseBubbles() {
        // console.log('about to increase bubble');
        // this.localClient.increaseBubbles(makeBubble(this._width, this._height));
        // console.log('increased bubble');
    }

    public decreaseBubbles() {
        // console.log('about to pop bubble');
        // this.localClient.decreaseBubbles();
        // console.log('popped bubble');
    }
}
