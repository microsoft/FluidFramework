import { TransactionResult } from "../../../checkout";
import { ISharedTree } from "../../../shared-tree";
import { Anchor, FieldKey, Value } from "../../../tree";

export class SharedTreeNodeHelper {
    constructor(
        public readonly tree: ISharedTree,
        public readonly anchor: Anchor
    ) { }

    /**
     * Gets the value at a given field of the Shared Tree node held by this class instance.
     * This requires temporarily allocating a cursor and freeing it after getting the value.
     * @param fieldKey - The FieldKey of the field (node) within the tree node held by this class instance.
     * @returns the value of the field (node) at the given FieldKey within the tree node held by this class instance.
     */
    getFieldValue(fieldKey: FieldKey): unknown {
        const cursor = this.getCursor();
        cursor.enterField(fieldKey);
        const value = cursor.value;
        cursor.free();
        return value;
    }

    /**
     * @returns A cursor pointing to the tree node held by this class instance.
     */
    getCursor() {
        const cursor = this.tree.forest.allocateCursor();
        this.tree.forest.tryMoveCursorTo(this.anchor, cursor);
        return cursor;
    }

    /**
     * Modifies the value at the given FieldKey within the SharedTree node held by this class instance.
     * @param fieldKey - The FieldKey of the field (node) within the tree node held by this class instance.
     * @param value - the value to be set at the given field (node) within the tree node held by this class instance.
     */
    editFieldValue(fieldKey: FieldKey, value: Value) {
        const cursor = this.getCursor();
        cursor.enterField(fieldKey);
        const fieldAnchor = cursor.buildAnchor();
        this.tree.runTransaction((forest, editor) => {
            const path = this.tree.locate(fieldAnchor)
            if (!path) {
                throw new Error("path to anchor does not exist")
            }
            this.tree.context.prepareForEdit();
            cursor.free();
            editor.setValue(path, value);
            return TransactionResult.Apply;
        });
    }

}
