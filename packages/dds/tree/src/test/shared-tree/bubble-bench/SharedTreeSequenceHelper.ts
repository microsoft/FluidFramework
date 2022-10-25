/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { TransactionResult } from "../../../checkout";
import { ISharedTree } from "../../../shared-tree";
import { Anchor, FieldKey } from "../../../tree";
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

    public getAllAnchors() {
        const nodeAnchors: Anchor[] = [];
        const cursor = this.treeNodeHelper.getCursor();

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

    public length() {
        const cursor = this.treeNodeHelper.getCursor();
        cursor.enterField(this.sequenceFieldKey);
        const length: number = cursor.getFieldLength();
        cursor.free();
        return length;
    }

    // // How can you push to the end of the sequence rather than the beginning in one
    // public push(jsonTree: JsonableTree) {
    //     const cursor = this.tree.forest.allocateCursor();
    //     this.tree.forest.tryMoveCursorTo(this.parentAnchor, cursor);

    //     this.tree.runTransaction((forest, editor) => {
    //         const parentPath = this.tree.locate(cursor.buildAnchor());
    //         if (!parentPath) {
    //             throw new Error("path to anchor does not exist")
    //         }
    //         this.tree.context.prepareForEdit();
    //         const finalPath = {
    //             parent: parentPath,
    //             parentField: this.sequenceFieldKey,
    //             parentIndex: this.length()
    //         };
    //         cursor.free();
    //         editor.insert(finalPath,
    //             singleTextCursor(jsonTree));
    //         return TransactionResult.Apply;
    //     });
    // }

    // public insert(jsonTree: JsonableTree, index: number) {
    //     const cursor = this.tree.forest.allocateCursor();
    //     this.tree.forest.tryMoveCursorTo(this.parentAnchor, cursor);

    //     this.tree.runTransaction((forest, editor) => {
    //         const parentPath = this.tree.locate(cursor.buildAnchor());
    //         if (!parentPath) {
    //             throw new Error("path to anchor does not exist")
    //         }
    //         this.tree.context.prepareForEdit();
    //         const finalPath = {
    //             parent: parentPath,
    //             parentField: this.sequenceFieldKey,
    //             parentIndex: index
    //         };
    //         cursor.free();
    //         editor.insert(finalPath,
    //             singleTextCursor(jsonTree));
    //         return TransactionResult.Apply;
    //     });
    // }

    public pop() {
        this.tree.runTransaction((forest, editor) => {
            const cursor = this.treeNodeHelper.getCursor();
            const parentPath = this.tree.locate(cursor.buildAnchor());
            const field = editor.sequenceField(parentPath, this.sequenceFieldKey);
            field.delete(this.length() - 1, 1);
            this.tree.context.prepareForEdit();
            cursor.free();
            return TransactionResult.Apply;
        });
    }
}
