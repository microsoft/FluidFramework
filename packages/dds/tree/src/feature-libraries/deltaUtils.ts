/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { unreachableCase } from "@fluidframework/common-utils";
import { Delta, FieldKey, getMapTreeField, MapTree } from "../tree";
import { fail, OffsetListFactory } from "../util";
import { mapTreeFromCursor } from "./mapTreeCursor";

/**
 * Converts a `Delta.FieldMarks` whose tree content is represented with by `TIn` instances
 * into a `Delta.FieldMarks`whose tree content is represented with by `TOut` instances.
 *
 * This function is useful for converting `Delta`s that represent tree content with cursors
 * into `Delta`s that represent tree content with a deep-comparable representation of the content.
 * See {@link assertDeltaEqual}.
 * @param fields - The Map of fields to convert. Not mutated. 
 * @param func - The functions used to map tree content.
 */
export function mapFieldMarks<TIn, TOut>(
    fields: Delta.FieldMarks<TIn>,
    func: (tree: TIn) => TOut,
): Delta.FieldMarks<TOut> {
    const out: Delta.FieldMarks<TOut> = new Map();
    for (const [k, v] of fields) {
        out.set(k, mapMarkList(v, func));
    }
    return out;
}

/**
 * Converts a `Delta.MarkList` whose tree content is represented with by `TIn` instances
 * into a `Delta.MarkList`whose tree content is represented with by `TOut` instances.
 *
 * This function is useful for converting `Delta`s that represent tree content with cursors
 * into `Delta`s that represent tree content with a deep-comparable representation of the content.
 * See {@link assertMarkListEqual}.
 * @param list - The list of marks to convert. Not mutated. 
 * @param func - The functions used to map tree content.
 */
export function mapMarkList<TIn, TOut>(
    list: Delta.MarkList<TIn>,
    func: (tree: TIn) => TOut,
): Delta.MarkList<TOut> {
    return list.map((mark: Delta.Mark<TIn>) => mapMark(mark, func));
}

/**
 * Converts a `Delta.Mark` whose tree content is represented with by `TIn` instances
 * into a `Delta.Mark`whose tree content is represented with by `TOut` instances.
 *
 * This function is useful for converting `Delta`s that represent tree content with cursors
 * into `Delta`s that represent tree content with a deep-comparable representation of the content.
 * See {@link assertMarkListEqual}.
 * @param mark - The mark to convert. Not mutated. 
 * @param func - The functions used to map tree content.
 */
export function mapMark<TIn, TOut>(
    mark: Delta.Mark<TIn>,
    func: (tree: TIn) => TOut,
): Delta.Mark<TOut> {
    if (Delta.isSkipMark(mark)) {
        return mark;
    }
    const type = mark.type;
    switch (type) {
        case Delta.MarkType.Modify: {
            if (mark.fields === undefined && mark.setValue === undefined) {
                return { type: Delta.MarkType.Modify };
            }
            return mark.fields === undefined ? {
                type: Delta.MarkType.Modify,
                setValue: mark.setValue,
            } : {
                ...mark,
                fields: mapFieldMarks(mark.fields, func),
            };
        }
        case Delta.MarkType.ModifyAndMoveOut: {
            if (mark.fields === undefined && mark.setValue === undefined) {
                return {
                    type: Delta.MarkType.ModifyAndMoveOut,
                    moveId: mark.moveId,
                };
            }
            return mark.fields === undefined ? {
                type: Delta.MarkType.ModifyAndMoveOut,
                moveId: mark.moveId,
                setValue: mark.setValue,
            } : {
                ...mark,
                fields: mapFieldMarks(mark.fields, func),
            };
        }
        case Delta.MarkType.MoveInAndModify:
        case Delta.MarkType.ModifyAndDelete: {
            return {
                ...mark,
                fields: mapFieldMarks(mark.fields, func),
            };
        }
        case Delta.MarkType.Insert: {
            return {
                type: Delta.MarkType.Insert,
                content: mark.content.map(func),
            };
        }
        case Delta.MarkType.InsertAndModify: {
            return {
                type: Delta.MarkType.InsertAndModify,
                content: func(mark.content),
                fields: mapFieldMarks(mark.fields, func),
            };
        }
        case Delta.MarkType.Delete:
        case Delta.MarkType.MoveIn:
        case Delta.MarkType.MoveOut:
            return mark;
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
 * @param tree - The subtree to apply modifications to. Updated in place.
 * @param modify - The modifications to either apply or collect.
 * @returns The remaining modifications that the consumer of the Delta will apply on the given node.
 * May be empty if all modifications are applied by the function.
 */
 export function applyModifyToTree(
    tree: MapTree,
    modify: Delta.Modify,
): Map<FieldKey, Delta.MarkList> {
    const outFieldsMarks: Map<FieldKey, Delta.MarkList> = new Map();
    // Use `hasOwnProperty` to detect when setValue is set to `undefined`.
    if (Object.prototype.hasOwnProperty.call(modify, "setValue")) {
        tree.value = modify.setValue;
    }
    if (modify.fields !== undefined) {
        const modifyFields = modify.fields;
        for (const key of modifyFields.keys()) {
            // Modifications to inserted trees may include changes to empty fields
            const outNodes = getMapTreeField(tree, key, true);
            const outMarks = new OffsetListFactory<Delta.Mark>();
            let index = 0;
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            for (const mark of modifyFields.get(key)!) {
                if (Delta.isSkipMark(mark)) {
                    index += mark;
                    outMarks.pushOffset(mark);
                } else {
                    // Inline into `switch(mark.type)` once we upgrade to TS 4.7
                    const type = mark.type;
                    switch (type) {
                        case Delta.MarkType.Insert: {
                            const mapTreeContent: MapTree[] = mark.content.map(mapTreeFromCursor);
                            outNodes.splice(index, 0, ...mapTreeContent);
                            index += mark.content.length;
                            outMarks.pushOffset(mark.content.length);
                            break;
                        }
                        case Delta.MarkType.InsertAndModify: {
                            if (mark.fields.size > 0) {
                                outMarks.pushContent({
                                    type: Delta.MarkType.Modify,
                                    fields: mark.fields,
                                });
                            }
                            outNodes.splice(index, 0, mapTreeFromCursor(mark.content));
                            index += 1;
                            break;
                        }
                        case Delta.MarkType.MoveIn:
                        case Delta.MarkType.MoveInAndModify:
                            // TODO: convert into a MoveIn/MoveInAndModify
                            fail("Not implemented");
                        case Delta.MarkType.Modify: {
                            const clonedFields = applyModifyToTree(outNodes[index], mark);
                            if (clonedFields.size > 0) {
                                outMarks.pushContent({
                                    type: Delta.MarkType.Modify,
                                    fields: clonedFields,
                                });
                            }
                            index += 1;
                            break;
                        }
                        case Delta.MarkType.Delete: {
                            outNodes.splice(index, mark.count);
                            break;
                        }
                        case Delta.MarkType.ModifyAndDelete: {
                            // TODO: convert move-out of inserted content into insert at the destination
                            fail("Not implemented");
                        }
                        case Delta.MarkType.MoveOut:
                        case Delta.MarkType.ModifyAndMoveOut:
                            // TODO: convert move-out of inserted content into insert at the destination
                            fail("Not implemented");
                        default: unreachableCase(type);
                    }
                }
            }
            if (outMarks.list.length > 0) {
                outFieldsMarks.set(key, outMarks.list);
            }
            if (outNodes.length === 0) {
                tree.fields.delete(key);
            }
        }
    }

    return outFieldsMarks;
}
