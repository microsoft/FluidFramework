/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { IClient } from "@fluid-example/bubblebench-common";
import { Anchor, brand, FieldKey, IDefaultEditBuilder, ISharedTree } from "@fluid-internal/tree";
import { Bubble } from "./Bubble";
// eslint-disable-next-line import/no-internal-modules
import { iBubbleSchema, int32Schema } from "./tree-utils/schema";
// eslint-disable-next-line import/no-internal-modules
import { SharedTreeNodeHelper } from "./tree-utils/SharedTreeNodeHelper";
// eslint-disable-next-line import/no-internal-modules
import { SharedTreeSequenceHelper } from "./tree-utils/SharedTreeSequenceHelper";

export class Client implements IClient {
    static clientIdFieldKey: FieldKey = brand("clientId");
    static colorFieldKey: FieldKey = brand("color");
    static bubblesFieldKey: FieldKey = brand("bubbles");

    private readonly treeHelper: SharedTreeNodeHelper;
    readonly bubbleSeqeunceHelper: SharedTreeSequenceHelper;

    constructor(
        public readonly tree: ISharedTree,
        public readonly anchor: Anchor,
        readonly editBuilderCallbacks: ((editor: IDefaultEditBuilder) => void)[],
        private readonly shortTermSpawnedAnchors: Set<Anchor>,
        public shouldStashTransactions: boolean = true,
    ) {
        this.treeHelper = new SharedTreeNodeHelper(tree, anchor, this.editBuilderCallbacks);
        this.bubbleSeqeunceHelper = new SharedTreeSequenceHelper(
            tree,
            anchor,
            Client.bubblesFieldKey,
            this.editBuilderCallbacks,
        );
    }

    public get clientId() {
        return this.treeHelper.getFieldValue(Client.clientIdFieldKey) as string;
    }
    public set clientId(value: string) {
        if (this.shouldStashTransactions) {
            this.treeHelper.stashSetFieldValue(Client.clientIdFieldKey, value);
        } else {
            this.treeHelper.setFieldValue(Client.clientIdFieldKey, value);
        }
    }

    public get color() {
        return this.treeHelper.getFieldValue(Client.colorFieldKey) as string;
    }
    public set color(value: string) {
        if (this.shouldStashTransactions) {
            this.treeHelper.stashSetFieldValue(Client.colorFieldKey, value);
        } else {
            this.treeHelper.setFieldValue(Client.colorFieldKey, value);
        }
    }

    public get bubbles() {
        const treeNodes = this.bubbleSeqeunceHelper.getAll();
        treeNodes.forEach(treeNode => this.shortTermSpawnedAnchors.add(treeNode.anchor));
        return treeNodes
            .map((treeNode) => new Bubble(this.tree, treeNode.anchor, this.editBuilderCallbacks));
    }

    public increaseBubbles(bubble: {
        x: number;
        y: number;
        r: number;
        vx: number;
        vy: number;
    }) {
        const newBubbleJsonableTree = {
            type: iBubbleSchema.name,
            fields: {
                x: [{ type: int32Schema.name, value: bubble.x }],
                y: [{ type: int32Schema.name, value: bubble.y }],
                r: [{ type: int32Schema.name, value: bubble.r }],
                vx: [{ type: int32Schema.name, value: bubble.vx }],
                vy: [{ type: int32Schema.name, value: bubble.vy }],
            },
        };
        if (this.shouldStashTransactions) {
            this.bubbleSeqeunceHelper.stashPush(newBubbleJsonableTree);
        } else {
            this.bubbleSeqeunceHelper.push(newBubbleJsonableTree);
        }
    }

    public decreaseBubbles() {
        if (this.bubbleSeqeunceHelper.length() > 1) {
            if (this.shouldStashTransactions) {
                this.bubbleSeqeunceHelper.stashPop();
            } else {
                this.bubbleSeqeunceHelper.pop();
            }
        }
    }
}
