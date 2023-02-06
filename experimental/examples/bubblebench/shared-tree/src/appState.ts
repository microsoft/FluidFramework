/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { IAppState, makeBubble, randomColor } from "@fluid-example/bubblebench-common";
import { Anchor, brand, ISharedTree, JsonableTree, moveToDetachedField } from "@fluid-internal/tree";
import { Client } from "./client";
import {
    bubbleSchema,
    clientSchema,
    numberSchema,
    stringSchema,
} from "./schema";
// eslint-disable-next-line import/no-internal-modules
import { SharedTreeSequenceHelper } from "./tree-utils/sharedTreeSequenceHelper";

export class AppState implements IAppState {
    readonly clientsSequenceHelper: SharedTreeSequenceHelper;
    readonly shortTermSpawnedAnchors: Set<Anchor> = new Set();
    readonly localClientId: string;

    constructor(
        private readonly tree: ISharedTree,
        public width: number,
        public height: number,
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
        const initialClientJson = this.makeClientInitialJsonTree(numBubbles);
        this.localClientId = initialClientJson.clientId;
        // Insert it the local client the shared tree
        this.clientsSequenceHelper.push(initialClientJson.tree);

        console.log(`created client with id ${this.localClient.clientId} and color ${this.localClient.color}`);
    }

    public get localClient() {
        const treeNodes = this.clientsSequenceHelper.getAll();
        treeNodes.forEach(treeNode => this.shortTermSpawnedAnchors.add(treeNode.anchor));

        const localClientNode = treeNodes
        .filter(treeNode => treeNode.getFieldValue(Client.clientIdFieldKey) === this.localClientId);

        if (localClientNode.length < 1) {
           throw new Error('Failed to retreieve local client node');
        }

        return new Client(this.tree, localClientNode[0].anchor, this.shortTermSpawnedAnchors,);
    }

    public applyEdits() {
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
            type: clientSchema.name,
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
            const bubble = makeBubble(this.width, this.height);
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            clientInitialJsonTree.fields!.bubbles.push({
                type: bubbleSchema.name,
                fields: {
                    x: [{ type: numberSchema.name, value: bubble.x }],
                    y: [{ type: numberSchema.name, value: bubble.y }],
                    r: [{ type: numberSchema.name, value: bubble.r }],
                    vx: [{ type: numberSchema.name, value: bubble.vx }],
                    vy: [{ type: numberSchema.name, value: bubble.vy }],
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
            .map((treeNode) => new Client(this.tree, treeNode.anchor, this.shortTermSpawnedAnchors));
    }

    public setSize(width?: number, height?: number) {
        this.width = width ?? 640;
        this.height = height ?? 480;
    }

    public increaseBubbles() {
        this.localClient.increaseBubbles(makeBubble(this.width, this.height));
    }

    public decreaseBubbles() {
        this.localClient.decreaseBubbles();
    }
}
