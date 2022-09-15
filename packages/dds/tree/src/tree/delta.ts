/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { unreachableCase } from "@fluidframework/common-utils";
import { Brand, fail, OffsetListFactory, Opaque } from "../util";
import { ITreeCursorSynchronous } from "./cursor";
import { JsonableTree } from "./treeTextFormat";
import { FieldKey, Value } from "./types";

/**
 * This format describes changes that must be applied to a document tree in order to update it.
 * Instances of this format are generated based on incoming changesets and consumed by a view layer (e.g., Forest) to
 * update itself.
 *
 * Because this format is only meant for updating document state, it does not fully represent user intentions.
 * For example, if some edit A inserts content and some subsequent edit B deletes that content, then a Delta that
 * represents the state update for these two edits would not include the insertion and deletion.
 * For the same reason, this format is also not fit to be rebased in the face of concurrent changes.
 * Instead this format is used to describe the end product of rebasing user intentions over concurrent edits.
 *
 * This format is self-contained in the following ways:
 *
 * 1. It uses integer indices (offsets, technically) to describe necessary changes.
 * As such, it does not rely on document nodes being randomly accessible by ID.
 *
 * 2. This format does not require historical information in order to apply the changes it describes.
 * For example, if a user undoes the deletion of a subtree, then the Delta generated for the undo edit will contain all
 * information necessary to re-create the subtree from scratch.
 *
 * This format can be generated from any Changeset without having access to the current document state.
 *
 * This format is meant to serve as the lowest common denominator to represent state changes resulting from any kind
 * of operation on any kind of field.
 * This means all such operations must be expressible in terms of this format.
 *
 * Future work:
 * - Define where and how field-specific and operation-specific metadata is meant to be represented.
 * - Add a move table to describe the src and dst paths of move operations.
 *
 * Within the above design constrains, this format is designed with the following goals in mind:
 *
 * 1. Make it easy to walk both a document tree and the delta tree to apply the changes described in the delta
 * with a minimum amount of backtracking over the contents of the tree.
 * This a boon for both code simplicity and performance.
 *
 * 2. Make the format terse.
 *
 * 3. Make the format uniform.
 *
 * These goals are reflected in the following design choices (this is very much optional reading for users of this
 * format):
 *
 * 1. All marks that apply to field elements are represented in a single linear structure where marks that affect later
 * element of the document field appear after marks that affect earlier elements of the document field.
 *
 * If the marks were not ordered in this fashion then a consumer would need to backtrack within the document field.
 *
 * If the marks were represented in multiple such linear structures then it would be necessary to either:
 * - backtrack when iterating over one structure fully, then the next
 * - maintain a pointer within each such linear structure and advance them in lock-step (like in a k-way merge-sort but
 * more fiddly because of the offsets).
 *
 * The drawback of this design choice is that it relies heavily on polymorphism:
 * for each mark encountered a reader has to check which kind of mark it is.
 * This is a source of code and time complexity in the reader code and adds a memory overhead to the format since each
 * mark has to carry a tag field to announce what kind of mark it is.
 *
 * 2. `MoveIn` marks in inserted portions of the document are inlined in their corresponding `ProtoField`.
 *
 * If the MoveIn marks were represented in a separate sub-structure (like they are under moved-in portions of the tree)
 * then the representation would forced to describe the path to them (in the form field keys and field offsets) from
 * the root of the inserted portion of the tree.
 * This would have two adverse effects:
 * - It would make the format less terse since this same path information would be redundant (it is already included in
 * the ProtoTree).
 * - It would lead the consumer of the format first build the inserted subtree, then traverse it again from its root to
 * apply the relevant `MoveIn` marks.
 *
 *
 * 3. Modifications of deleted and moved-out nodes are represented using modify marks within `Delete` and `MoveOut`
 * marks.
 * This is in opposition to a structure where the fact that a modified node is being deleted or moved-out would
 * be represented a `Modify` mark like so:
 * ```typescript
 * interface ModifyAndDelete {
 *   type: typeof MarkType.ModifyAndDelete;
 *   fields: FieldMap<PositionedMarks<ModifyDeleted | MoveOut>>;
 * }
 * interface ModifyAndMoveOut {
 *   type: typeof MarkType.ModifyAndMoveOut;
 *   moveId: MoveId;
 *   fields: FieldMap<PositionedMarks<ModifyMovedOut | MoveOut>>;
 * }
 * export interface Delete {
 *   type: typeof MarkType.Delete;
 *   count: number;
 * }
 * export interface MoveOut {
 *   type: typeof MarkType.MoveOut;
 *   count: number;
 *   moveId: MoveId;
 * }
 * ```
 * Note the absence of modify information in `Delete` and `MoveOut` above.
 *
 * The benefit of the chosen representation over the alternative are two-fold:
 * - It leads to less splitting of moved and deleted ranges of nodes.
 * - It makes the format more uniform since modifications to moved-in subtrees must be represented with modifications
 * marks within a `MoveIn` mark.
 *
 * 4. `MoveIn` marks are represented in the location where the content being moved resides in the input context that
 * the delta is applied to, and `MoveOut` marks are represented in the location where the content being moved should
 * reside after the delta is applied.
 *
 * The alternative would be to allow such marks to appear in temporary locations (e.g., in field "bar" for a
 * transaction that moves content from "foo" to "bar" then moves that same content from "bar" to "baz").
 * This makes the format less terse and harder to reason about.
 *
 * 5. MoveIn marks are not inlined within `ProtoField`s.
 *
 * Inlining them would force the consuming code to detect `MoveIn` marks within the `ProtoField` and handle them
 * within the context of the insert.
 * This would be cumbersome because either the code that is responsible for consuming the `ProtoField` would need to
 * be aware of and have the context to handle `MoveIn`, or some caller of that code would need to find and extract such
 * `MoveIn` marks ahead to calling that code.
 */

/**
 * Represents the change made to a document.
 */
export type Root = FieldMarks;
export const empty: Root = new Map();

/**
 * Represents a change being made to a part of the tree.
 */
export type Mark =
    | Skip
    | Modify
    | Delete
    | MoveOut
    | MoveIn
    | Insert
    | ModifyAndDelete
    | ModifyAndMoveOut
    | MoveInAndModify
    | InsertAndModify;

/**
 * Represents a list of changes to some range of nodes. The index of each mark within the range of nodes, before
 * applying any of the changes, is not represented explicitly.
 * It corresponds to the sum of `inputLength(mark)` for all previous marks.
 */
export type MarkList = Mark[];

/**
 * Represents a range of contiguous nodes that is unaffected by changes.
 * The value represents the length of the range.
 */
export type Skip = number;

/**
 * Describes modifications made to a subtree.
 */
export interface Modify {
    type: typeof MarkType.Modify;
    setValue?: Value;
    fields?: FieldMarks;
}

/**
 * Describes the deletion of a contiguous range of node.
 */
export interface Delete {
    type: typeof MarkType.Delete;
    count: number;
}

/**
 * Describes the deletion of a single node.
 * Includes descriptions of the modifications the node.
 */
export interface ModifyAndDelete {
    type: typeof MarkType.ModifyAndDelete;
    fields: FieldMarks;
}

/**
 * Describes the moving out of a contiguous range of node.
 */
export interface MoveOut {
    type: typeof MarkType.MoveOut;
    count: number;
    /**
     * The delta should carry exactly one `MoveIn` mark with the same move ID.
     */
    moveId: MoveId;
}

/**
 * Describes the moving out of a single node.
 * Includes descriptions of the modifications made to the node.
 */
export interface ModifyAndMoveOut {
    type: typeof MarkType.ModifyAndMoveOut;
    /**
     * The delta should carry exactly one `MoveIn` mark with the same move ID.
     */
    moveId: MoveId;
    setValue?: Value;
    fields?: FieldMarks;
}

/**
 * Describes the moving in of a contiguous range of node.
 */
export interface MoveIn {
    type: typeof MarkType.MoveIn;
    /**
     * The delta should carry exactly one `MoveOut` mark with the same move ID.
     */
    moveId: MoveId;
}

/**
 * Describes the moving in of a single node.
 * Includes descriptions of the modifications made to the node.
 */
export interface MoveInAndModify {
    type: typeof MarkType.MoveInAndModify;
    /**
     * The delta should carry exactly one `MoveOut` mark with the same move ID.
     */
    moveId: MoveId;
    fields: FieldMarks;
}

/**
 * Describes the insertion of a contiguous range of node.
 */
export interface Insert {
    type: typeof MarkType.Insert;
    // TODO: use a single cursor with multiple nodes instead of array of cursors.
    content: ProtoNode[];
}

/**
 * Describes the insertion of a single node.
 * Includes descriptions of the modifications made to the nodes.
 */
export interface InsertAndModify {
    type: typeof MarkType.InsertAndModify;
    content: ProtoNode;
    fields: FieldMarks;
}

/**
 * The contents of a subtree to be created.
 *
 * TODO: eventually we should support "pending" data here via using just `ITreeCursor`.
 */
export type ProtoNode = ITreeCursorSynchronous;

/**
 * Uniquely identifies a MoveOut/MoveIn pair within a delta.
 */
export interface MoveId extends Opaque<Brand<number, "delta.MoveId">> {}

export type Offset = number;

export type FieldMap<T> = Map<FieldKey, T>;
export type FieldMarks = FieldMap<MarkList>;

export const MarkType = {
    Modify: 0,
    Insert: 1,
    InsertAndModify: 2,
    MoveIn: 3,
    MoveInAndModify: 4,
    Delete: 5,
    ModifyAndDelete: 6,
    MoveOut: 7,
    ModifyAndMoveOut: 8,
} as const;

/**
 * Returns the number of nodes in the input tree that the mark affects or skips.
 */
export function inputLength(mark: Mark): number {
    if (typeof mark === "number") {
        return mark;
    }
    // Inline into `switch(mark.type)` once we upgrade to TS 4.7
    const type = mark.type;
    switch (type) {
        case MarkType.Delete:
        case MarkType.MoveOut:
            return mark.count;
        case MarkType.Modify:
        case MarkType.ModifyAndDelete:
        case MarkType.ModifyAndMoveOut:
            return 1;
        case MarkType.Insert:
        case MarkType.InsertAndModify:
        case MarkType.MoveIn:
        case MarkType.MoveInAndModify:
            return 0;
        default: unreachableCase(type);
    }
}

/**
 * Converts inserted content into the format expected in Delta instances.
 * This involves applying the following changes:
 *
 * - Updating node values
 *
 * - Inserting new subtrees within the inserted content
 *
 * - Deleting parts of the inserted content
 *
 * The only kind of change that is not applied by this function is MoveIn.
 *
 * @param node - The subtree to apply modifications to. Updated in place.
 * @param modify - The modifications to either apply or collect.
 * @returns The remaining modifications that the consumer of the Delta will apply on the given node.
 * May be empty if all modifications are applied by the function.
 */
 export function applyModifyToInsert(
    node: JsonableTree,
    modify: Modify,
): Map<FieldKey, MarkList> {
    const outFieldsMarks: Map<FieldKey, MarkList> = new Map();
    if (modify.setValue !== undefined) {
        node.value = modify.setValue.value;
    }
    if (modify.fields !== undefined) {
        const protoFields = node.fields ?? {};
        const modifyFields = modify.fields;
        for (const brandedKey of modifyFields.keys()) {
            const key = brandedKey as string;
            const outNodes = protoFields[key] ?? fail("Missing field");
            const outMarks = new OffsetListFactory<Mark>();
            let index = 0;
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            for (const mark of modifyFields.get(brandedKey)!) {
                if (isSkipMark(mark)) {
                    index += mark;
                    outMarks.pushOffset(mark);
                } else {
                    // Inline into `switch(mark.type)` once we upgrade to TS 4.7
                    const type = mark.type;
                    switch (type) {
                        case MarkType.Insert: {
                            outNodes.splice(index, 0, ...mark.content);
                            index += mark.content.length;
                            outMarks.pushOffset(mark.content.length);
                            break;
                        }
                        case MarkType.InsertAndModify: {
                            if (mark.fields.size > 0) {
                                outMarks.pushContent({
                                    type: MarkType.Modify,
                                    fields: mark.fields,
                                });
                            }
                            outNodes.splice(index, 0, mark.content);
                            index += 1;
                            break;
                        }
                        case MarkType.MoveIn:
                        case MarkType.MoveInAndModify:
                            // TODO: convert into a MoveIn/MoveInAndModify
                            fail("Not implemented");
                        case MarkType.Modify: {
                            const clonedFields = applyModifyToInsert(outNodes[index], mark);
                            if (clonedFields.size > 0) {
                                outMarks.pushContent({
                                    type: MarkType.Modify,
                                    fields: clonedFields,
                                });
                            }
                            index += 1;
                            break;
                        }
                        case MarkType.Delete: {
                            outNodes.splice(index, mark.count);
                            break;
                        }
                        case MarkType.ModifyAndDelete: {
                            // TODO: convert move-out of inserted content into insert at the destination
                            fail("Not implemented");
                        }
                        case MarkType.MoveOut:
                        case MarkType.ModifyAndMoveOut:
                            // TODO: convert move-out of inserted content into insert at the destination
                            fail("Not implemented");
                        default: unreachableCase(type);
                    }
                }
            }
            if (outMarks.list.length > 0) {
                outFieldsMarks.set(brandedKey, outMarks.list);
            }
            if (outNodes.length === 0) {
                // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
                delete protoFields[key];
            }
        }
        if (Object.keys(protoFields).length === 0) {
            delete node.fields;
        }
    }

    return outFieldsMarks;
}

function isSkipMark(mark: Mark): mark is Skip {
    return typeof mark === "number";
}
