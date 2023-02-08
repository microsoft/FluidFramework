/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { IClient } from "@fluid-example/bubblebench-common";
import { Anchor, brand, FieldKey, ISharedTree } from "@fluid-internal/tree";
import { Bubble } from "./bubble";
// eslint-disable-next-line import/no-internal-modules
import { bubbleSchema, numberSchema } from "./schema";
// eslint-disable-next-line import/no-internal-modules
import { SharedTreeNodeHelper } from "./tree-utils/sharedTreeNodeHelper";
// eslint-disable-next-line import/no-internal-modules
import { SharedTreeSequenceHelper } from "./tree-utils/sharedTreeSequenceHelper";

export class Client implements IClient {
    static clientIdFieldKey: FieldKey = brand("clientId");
    static colorFieldKey: FieldKey = brand("color");
    static bubblesFieldKey: FieldKey = brand("bubbles");

    private readonly treeHelper: SharedTreeNodeHelper;
    readonly bubbleSeqeunceHelper: SharedTreeSequenceHelper;

    constructor(
        public readonly tree: ISharedTree,
        public readonly anchor: Anchor,
        private readonly shortTermSpawnedAnchors: Set<Anchor>,
    ) {
        this.treeHelper = new SharedTreeNodeHelper(tree, anchor);
        this.bubbleSeqeunceHelper = new SharedTreeSequenceHelper(
            tree,
            anchor,
            Client.bubblesFieldKey,
        );
    }

    public get clientId() {
        return this.treeHelper.getFieldValue(Client.clientIdFieldKey) as string;
    }
    public set clientId(value: string) {

        this.treeHelper.setFieldValue(Client.clientIdFieldKey, value);

    }

    public get color() {
        return this.treeHelper.getFieldValue(Client.colorFieldKey) as string;
    }
    public set color(value: string) {

        this.treeHelper.setFieldValue(Client.colorFieldKey, value);

    }

    public get bubbles() {
        const treeNodes = this.bubbleSeqeunceHelper.getAll();
        treeNodes.forEach(treeNode => this.shortTermSpawnedAnchors.add(treeNode.anchor));
        return treeNodes
            .map((treeNode) => new Bubble(this.tree, treeNode.anchor));
    }

    public increaseBubbles(bubble: {
        x: number;
        y: number;
        r: number;
        vx: number;
        vy: number;
    }) {
        const newBubbleJsonableTree = {
            type: bubbleSchema.name,
            fields: {
                x: [{ type: numberSchema.name, value: bubble.x }],
                y: [{ type: numberSchema.name, value: bubble.y }],
                r: [{ type: numberSchema.name, value: bubble.r }],
                vx: [{ type: numberSchema.name, value: bubble.vx }],
                vy: [{ type: numberSchema.name, value: bubble.vy }],
            },
        };
        this.bubbleSeqeunceHelper.push(newBubbleJsonableTree);
    }

    public decreaseBubbles() {
        if (this.bubbleSeqeunceHelper.length() > 1) {
            this.bubbleSeqeunceHelper.pop();
        }
    }
}
