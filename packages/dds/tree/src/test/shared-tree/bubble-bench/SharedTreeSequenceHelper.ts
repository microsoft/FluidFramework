/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { TransactionResult } from "../../../checkout";
import { singleTextCursor } from "../../../feature-libraries";
import { ISharedTree } from "../../../shared-tree";
import { Anchor, FieldKey, JsonableTree } from "../../../tree";
import { SharedTreeNodeHelper } from "./SharedTreeNodeHelper";

export class SharedTreeSequenceHelper {
    private readonly treeNodeHelper: SharedTreeNodeHelper;
    constructor(
        public readonly tree: ISharedTree,
        public readonly parentAnchor: Anchor,
        public readonly sequenceFieldKey: FieldKey,
    ) {
        this.treeNodeHelper = new SharedTreeNodeHelper(tree, parentAnchor);
    }

    public getAnchor(index: number) {
        const cursor = this.treeNodeHelper.getCursor();
        cursor.enterField(this.sequenceFieldKey);
        cursor.enterNode(index);
        const treeNode = cursor.buildAnchor();
        cursor.free();
        return treeNode;
    }

    public get(index: number) {
        return new SharedTreeNodeHelper(this.tree, this.getAnchor(index));
    }

    public getAllAnchors() {
        const nodeAnchors: Anchor[] = [];
        const cursor = this.treeNodeHelper.getCursor();
        cursor.enterField(this.sequenceFieldKey);
        let currentNode = cursor.firstNode();
        if (!currentNode) {
            cursor.free();
            return nodeAnchors; // The node has no members in its sequence.
        }
        while (currentNode) {
            nodeAnchors.push(cursor.buildAnchor());
            currentNode = cursor.nextNode();
        }

        cursor.free();
        return nodeAnchors;
    }

    public getAll() {
        return this.getAllAnchors().map((anchor) => new SharedTreeNodeHelper(this.tree, anchor));
    }

    public length() {
        const cursor = this.treeNodeHelper.getCursor();
        cursor.enterField(this.sequenceFieldKey);
        const length: number = cursor.getFieldLength();
        cursor.free();
        return length;
    }

    public push(jsonTree: JsonableTree) {
        const cursor = this.tree.forest.allocateCursor();
        this.tree.forest.tryMoveCursorTo(this.parentAnchor, cursor);

        this.tree.runTransaction((forest, editor) => {
            const parentPath = this.tree.locate(cursor.buildAnchor());
            if (!parentPath) {
                throw new Error("path to anchor does not exist");
            }
            const field = editor.sequenceField(parentPath, this.sequenceFieldKey);
            this.tree.context.prepareForEdit();
            cursor.free();
            field.insert(this.length(), singleTextCursor(jsonTree));
            return TransactionResult.Apply;
        });
    }

    public pop() {
        this.tree.runTransaction((forest, editor) => {
            const cursor = this.treeNodeHelper.getCursor();
            const parentPath = this.tree.locate(cursor.buildAnchor());
            const field = editor.sequenceField(parentPath, this.sequenceFieldKey);
            this.tree.context.prepareForEdit();
            cursor.free();
            field.delete(this.length() - 1, 1);
            return TransactionResult.Apply;
        });
    }
}
