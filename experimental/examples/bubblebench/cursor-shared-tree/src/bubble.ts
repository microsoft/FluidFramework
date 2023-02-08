/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { IBubble } from "@fluid-example/bubblebench-common";
import { Anchor, brand, FieldKey, ISharedTree } from "@fluid-internal/tree";
// eslint-disable-next-line import/no-internal-modules
import { SharedTreeNodeHelper } from "./tree-utils/sharedTreeNodeHelper";

export class Bubble implements IBubble {
    static xFieldKey: FieldKey = brand("x");
    static yFieldKey: FieldKey = brand("y");
    static vxFieldKey: FieldKey = brand("vx");
    static vyFieldKey: FieldKey = brand("vy");
    static rFieldKey: FieldKey = brand("r");

    private readonly treeNodeHelper: SharedTreeNodeHelper;

    constructor(
        public readonly tree: ISharedTree,
        public readonly anchor: Anchor,
    ) {
        this.treeNodeHelper = new SharedTreeNodeHelper(tree, anchor);
    }

    public get x() {
        return this.treeNodeHelper.getFieldValue(Bubble.xFieldKey) as number;
    }
    public set x(value: number) {
        this.treeNodeHelper.setFieldValue(Bubble.xFieldKey, value);
    }

    public get y() {
        return this.treeNodeHelper.getFieldValue(Bubble.yFieldKey) as number;
    }
    public set y(value: number) {
        this.treeNodeHelper.setFieldValue(Bubble.yFieldKey, value);
    }

    public get vx() {
        return this.treeNodeHelper.getFieldValue(Bubble.vxFieldKey) as number;
    }
    public set vx(value: number) {
        this.treeNodeHelper.setFieldValue(Bubble.vxFieldKey, value);
    }

    public get vy() {
        return this.treeNodeHelper.getFieldValue(Bubble.vyFieldKey) as number;
    }
    public set vy(value: number) {
        this.treeNodeHelper.setFieldValue(Bubble.vyFieldKey, value);
    }

    public get r() {
        return this.treeNodeHelper.getFieldValue(Bubble.rFieldKey) as number;
    }
    public set r(value: number) {
        this.treeNodeHelper.setFieldValue(Bubble.rFieldKey, value);
    }
}
