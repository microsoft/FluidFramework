/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import {
    Anchor,
    FieldKey,
    IDefaultEditBuilder,
    ISharedTree,
    JsonableTree,
    singleTextCursor,
    TransactionResult,
    TreeNavigationResult,
} from "@fluid-internal/tree";
import { SharedTreeNodeHelper } from "./SharedTreeNodeHelper";

export class SharedTreeSequenceHelper {
    private readonly treeNodeHelper: SharedTreeNodeHelper;
    private readonly spawnedAnchors: Set<Anchor> = new Set();
    constructor(
        public readonly tree: ISharedTree,
        public readonly parentAnchor: Anchor,
        public readonly sequenceFieldKey: FieldKey,
        public readonly editBuilderCallbacks: ((editor: IDefaultEditBuilder) => void)[],
    ) {
        this.treeNodeHelper = new SharedTreeNodeHelper(
            tree,
            parentAnchor,
            this.editBuilderCallbacks,
        );
    }
    public getAnchor(index: number): Anchor {
        const cursor = this.treeNodeHelper.getCursor();
        cursor.enterField(this.sequenceFieldKey);
        cursor.enterNode(index);
        const treeNode: Anchor = cursor.buildAnchor();
        debugger;
        cursor.free();
        return treeNode;
    }

    public get(index: number): SharedTreeNodeHelper {
        return new SharedTreeNodeHelper(
            this.tree,
            this.getAnchor(index),
            this.editBuilderCallbacks,
        );
    }

    public getAllAnchors() {
        // Removes anchors built from last call.
        // this.spawnedAnchors.forEach(anchor => this.tree.forest.forgetAnchor(anchor));
        // this.spawnedAnchors.clear();

        const nodeAnchors: Anchor[] = [];
        // const cursor = this.treeNodeHelper.getCursor();
        const cursor = this.tree.forest.allocateCursor();
        const result = this.tree.forest.tryMoveCursorToNode(this.parentAnchor, cursor);
        if (result !== TreeNavigationResult.Ok) {
            console.log(`failed to navigate to node, result: ${result}`);
            return nodeAnchors;
        }
        cursor.enterField(this.sequenceFieldKey);
        let currentNode = cursor.firstNode();
        if (currentNode === false) {
            cursor.free();
            return nodeAnchors; // The node has no members in its sequence.
        }
        while (currentNode === true) {
            nodeAnchors.push(cursor.buildAnchor());
            currentNode = cursor.nextNode();
        }
        cursor.free();

        // saves anchors built from this call so they can be freed after use.
        nodeAnchors.forEach(anchor => this.spawnedAnchors.add(anchor));
        return nodeAnchors;
    }

    public getAll(): SharedTreeNodeHelper[] {
        return this.getAllAnchors().map(
            (anchor) => new SharedTreeNodeHelper(this.tree, anchor, this.editBuilderCallbacks),
        );
    }

    public length(): number {
        const cursor = this.treeNodeHelper.getCursor();
        cursor.enterField(this.sequenceFieldKey);
        const length: number = cursor.getFieldLength();
        cursor.free();
        return length;
    }

    public push(jsonTree: JsonableTree): void {
        const cursor = this.tree.forest.allocateCursor();
        this.tree.forest.tryMoveCursorToNode(this.parentAnchor, cursor);

        this.tree.runTransaction((forest, editor) => {
            const parentPath = this.tree.locate(cursor.buildAnchor());
            if (!parentPath) {
                throw new Error("path to anchor does not exist");
            }
            const field = editor.sequenceField(
                parentPath,
                this.sequenceFieldKey,
            );
            this.tree.context.prepareForEdit();
            cursor.free();
            field.insert(this.length(), singleTextCursor(jsonTree));
            return TransactionResult.Apply;
        });
    }

    public pop(): void {
        this.tree.runTransaction((forest, editor) => {
            const cursor = this.treeNodeHelper.getCursor();
            const parentAnchor = cursor.buildAnchor();
            const parentPath = this.tree.locate(parentAnchor);
            const field = editor.sequenceField(
                parentPath,
                this.sequenceFieldKey,
            );
            this.tree.forest.forgetAnchor(parentAnchor);
            this.tree.context.prepareForEdit();
            cursor.free();
            field.delete(this.length() - 1, 1);
            return TransactionResult.Apply;
        });
    }

    public stashPush(jsonTree: JsonableTree) {
        const cursor = this.tree.forest.allocateCursor();
        this.tree.forest.tryMoveCursorToNode(this.parentAnchor, cursor);
        const parentPath = this.tree.locate(cursor.buildAnchor());
        if (!parentPath) {
            throw new Error("path to anchor does not exist");
        }
        cursor.free();
        this.editBuilderCallbacks.push(
            (editor: IDefaultEditBuilder) => {
                const field = editor.sequenceField(
                    parentPath,
                    this.sequenceFieldKey,
                );
                field.insert(this.length(), singleTextCursor(jsonTree));
            }
        );
    }

    public stashPop() {
        const cursor = this.tree.forest.allocateCursor();
        this.tree.forest.tryMoveCursorToNode(this.parentAnchor, cursor);
        const parentPath = this.tree.locate(cursor.buildAnchor());
        if (!parentPath) {
            throw new Error("path to anchor does not exist");
        }
        cursor.free();
        this.editBuilderCallbacks.push(
            (editor: IDefaultEditBuilder) => {
                const field = editor.sequenceField(
                    parentPath,
                    this.sequenceFieldKey,
                );
                field.delete(this.length() - 1, 1);
            }
        );
    }
}
