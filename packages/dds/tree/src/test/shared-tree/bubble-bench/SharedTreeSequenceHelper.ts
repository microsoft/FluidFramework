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

    public getCursor(index: number) {
        const cursor = this.treeNodeHelper.getCursor();
        cursor.enterField(this.sequenceFieldKey);
        cursor.enterNode(index);
        return cursor;
    }

    public get(index: number) {
        const cursor = this.treeNodeHelper.getCursor();
        cursor.enterField(this.sequenceFieldKey);
        cursor.enterNode(index);
        const treeNode = new SharedTreeNodeHelper(this.tree, cursor.buildAnchor());
        cursor.free();
        return treeNode;
    }

    public getAll() {
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

    public length(): number {
        const cursor = this.treeNodeHelper.getCursor();
        const length = cursor.getFieldLength() as number;
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


    // public pop() {
    //     const cursor = this.tree.forest.allocateCursor();
    //     this.tree.forest.tryMoveCursorTo(this.parentAnchor, cursor);
    //     cursor.down(this.sequenceFieldKey, this.length() - 1);
    //     this.tree.runTransaction((forest, editor) => {
    //         const path = this.tree.locate(cursor.buildAnchor());
    //         if (!path) {
    //             throw new Error("path to anchor does not exist")
    //         }
    //         this.tree.context.prepareForEdit();
    //         cursor.free();
    //         editor.delete(path, 1);
    //         return TransactionResult.Apply;
    //     });
    // }

}
