/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
// import { IBubble } from "@fluid-example/bubblebench-common";
// import { Anchor, brand, FieldKey, ISharedTree } from "@fluid-internal/tree";
import { IDefaultEditBuilder } from "../../../feature-libraries";
import { ISharedTree } from "../../../shared-tree";
import { Anchor, FieldKey } from "../../../tree";
import { brand } from "../../../util";
import { SharedTreeNodeHelper } from "./SharedTreeNodeHelper";

export class Bubble {
    static xFieldKey: FieldKey = brand("x");
    static yFieldKey: FieldKey = brand("y");
    static vxFieldKey: FieldKey = brand("vx");
    static vyFieldKey: FieldKey = brand("vy");
    static rFieldKey: FieldKey = brand("r");

    private readonly treeNodeHelper: SharedTreeNodeHelper;

    constructor(
        public readonly tree: ISharedTree,
        public readonly anchor: Anchor,
        readonly editBuilderCallbacks: ((editor: IDefaultEditBuilder) => void)[],
        public shouldStashTransactions: boolean = true,
    ) {
        this.treeNodeHelper = new SharedTreeNodeHelper(tree, anchor, this.editBuilderCallbacks);
    }

    public get x() {
        return this.treeNodeHelper.getFieldValue(Bubble.xFieldKey) as number;
    }
    public set x(value: number) {
        if (this.shouldStashTransactions) {
            this.treeNodeHelper.stashEditBuilderCallback(Bubble.xFieldKey, value);
        } else {
            this.treeNodeHelper.setFieldValue(Bubble.xFieldKey, value);
        }
    }

    public get y() {
        return this.treeNodeHelper.getFieldValue(Bubble.yFieldKey) as number;
    }
    public set y(value: number) {
        if (this.shouldStashTransactions) {
            this.treeNodeHelper.stashEditBuilderCallback(Bubble.yFieldKey, value);
        } else {
            this.treeNodeHelper.setFieldValue(Bubble.yFieldKey, value);
        }
    }

    public get vx() {
        return this.treeNodeHelper.getFieldValue(Bubble.vxFieldKey) as number;
    }
    public set vx(value: number) {
        if (this.shouldStashTransactions) {
            this.treeNodeHelper.stashEditBuilderCallback(Bubble.vxFieldKey, value);
        } else {
            this.treeNodeHelper.setFieldValue(Bubble.vxFieldKey, value);
        }
    }

    public get vy() {
        return this.treeNodeHelper.getFieldValue(Bubble.vyFieldKey) as number;
    }
    public set vy(value: number) {
        if (this.shouldStashTransactions) {
            this.treeNodeHelper.stashEditBuilderCallback(Bubble.vyFieldKey, value);
        } else {
            this.treeNodeHelper.setFieldValue(Bubble.vyFieldKey, value);
        }
    }

    public get r() {
        return this.treeNodeHelper.getFieldValue(Bubble.rFieldKey) as number;
    }
    public set r(value: number) {
        if (this.shouldStashTransactions) {
            this.treeNodeHelper.stashEditBuilderCallback(Bubble.rFieldKey, value);
        } else {
            this.treeNodeHelper.setFieldValue(Bubble.rFieldKey, value);
        }
    }
}
