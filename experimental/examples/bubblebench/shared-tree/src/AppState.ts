/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { IAppState, makeBubble, randomColor } from "@fluid-example/bubblebench-common";
import { Anchor, brand, IDefaultEditBuilder, ISharedTree, JsonableTree, moveToDetachedField, TransactionResult } from "@fluid-internal/tree";
import { Client } from "./Client";
import {
    iBubbleSchema,
    iClientSchema,
    int32Schema,
    stringSchema,
    // eslint-disable-next-line import/no-internal-modules
} from "./tree-utils/schema";
// eslint-disable-next-line import/no-internal-modules
import { SharedTreeNodeHelper } from "./tree-utils/SharedTreeNodeHelper";
// eslint-disable-next-line import/no-internal-modules
import { SharedTreeSequenceHelper } from "./tree-utils/SharedTreeSequenceHelper";

export class AppState implements IAppState {
    readonly clientsSequenceHelper: SharedTreeSequenceHelper;
    readonly editBuilderCallbacks: ((editor: IDefaultEditBuilder) => void)[] = [];
    readonly shortTermSpawnedAnchors: Set<Anchor> = new Set();
    readonly localClientNode: SharedTreeNodeHelper;
    readonly localClientId: string;

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
            this.editBuilderCallbacks,
        );
        cursor.free();

        // Create the initial JsonableTree for the new local client
        const initialClientJson = this.makeClientInitialJsonTree(numBubbles);
        this.localClientId = initialClientJson.clientId;

        // Insert it the local client the shared tree
        this.clientsSequenceHelper.push(initialClientJson.tree);
        // Keep a reference to the local client inserted into the shared tree
        const newClientIndex = this.clientsSequenceHelper.length() - 1;
        // console.log(`new client Index: ${newClientIndex}`);
        this.localClientNode = new SharedTreeNodeHelper(
            tree,
            this.clientsSequenceHelper.getAnchor(newClientIndex),
            this.editBuilderCallbacks
        );
        console.log(`created client with id ${this.localClient.clientId} and color ${this.localClient.color}`);
    }

    public get localClient() {
        // return new Client(this.tree, this.localClientNode.anchor, this.editBuilderCallbacks);

        const treeNodes = this.clientsSequenceHelper.getAll();
        treeNodes.forEach(treeNode => this.shortTermSpawnedAnchors.add(treeNode.anchor));

        const localClientNode = treeNodes
        .filter(treeNode => treeNode.getFieldValue(Client.clientIdFieldKey) === this.localClientId);

        if (localClientNode.length < 1) {
           throw new Error('Failed to retreieve local client node');
        }

        return new Client(this.tree, localClientNode[0].anchor, this.editBuilderCallbacks, this.shortTermSpawnedAnchors, false);
    }

    public applyEdits() {
        // console.log(`AppState applied ${this.editBuilderCallbacks.length} in bulk!`);
        if (this.editBuilderCallbacks.length > 0) {
            this.tree.runTransaction((forest, editor) => {
                this.tree.context.prepareForEdit();
                this.editBuilderCallbacks.forEach((editCallback) => editCallback(editor));
                return TransactionResult.Apply;
            });
            this.editBuilderCallbacks.length = 0;
        }
        this.shortTermSpawnedAnchors.forEach(anchor => {
            try {
                this.tree.forest.forgetAnchor(anchor);
                // console.log('successfully forget anchor')
            } catch (e) {
                // console.log("failed to forget anchor.", e)
            }
        });
    }

    makeClientInitialJsonTree(numBubbles: number) {
        const clientId = `${Math.random()}`;
        const clientInitialJsonTree: JsonableTree = {
            type: iClientSchema.name,
            fields: {
                clientId: [
                    { type: stringSchema.name, value: clientId },
                ],
                color: [{ type: stringSchema.name, value: randomColor() }],
                bubbles: [],
            },
        };

        // create and add initial bubbles to initial client json tree
        for (let i = 0; i < numBubbles; i++) {
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

        return {
            tree: clientInitialJsonTree,
            clientId
        };
    }

    public get clients() {
        const treeNodes = this.clientsSequenceHelper.getAll();
        treeNodes.forEach(treeNode => this.shortTermSpawnedAnchors.add(treeNode.anchor));
        return treeNodes
            .map((treeNode) => new Client(this.tree, treeNode.anchor, this.editBuilderCallbacks, this.shortTermSpawnedAnchors, true));
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
        this.localClient.increaseBubbles(makeBubble(this._width, this._height));
        // console.log('increased bubble');
    }

    public decreaseBubbles() {
        // console.log('about to pop bubble');
        this.localClient.decreaseBubbles();
        // console.log('popped bubble');
    }
}
