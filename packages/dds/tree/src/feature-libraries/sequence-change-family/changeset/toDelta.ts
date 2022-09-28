/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { unreachableCase } from "@fluidframework/common-utils";
import { singleTextCursor } from "../../treeTextCursor";
import { TreeSchemaIdentifier } from "../../../schema-stored";
import { FieldKey, Value, Delta, genericTreeKeys, getGenericTreeField, genericTreeDeleteIfEmpty } from "../../../tree";
import { brand, brandOpaque, clone, fail, makeArray, OffsetListFactory } from "../../../util";
import { ProtoNode, Transposed as T } from "./format";
import { isSkipMark } from "./utils";

/**
 * Converts a Changeset into a Delta.
 * @param changeset - The Changeset to convert
 * @returns A Delta for applying the changes described in the given Changeset.
 */
 export function toDelta(changeset: T.LocalChangeset): Delta.Root {
    // Save result to a constant to work around linter bug:
    // https://github.com/typescript-eslint/typescript-eslint/issues/5014
    const out: Delta.Root = convertFieldMarks(changeset.marks);
    return out;
}

function convertMarkList(marks: T.MarkList): Delta.MarkList {
    const out = new OffsetListFactory<Delta.Mark>();
    for (const mark of marks) {
        if (isSkipMark(mark)) {
            out.pushOffset(mark);
        } else {
            // Inline into `switch(mark.type)` once we upgrade to TS 4.7
            const type = mark.type;
            switch (type) {
                case "Insert": {
                    const insertMark: Delta.Insert = {
                        type: Delta.MarkType.Insert,
                        // TODO: can we skip this clone?
                        content: clone(mark.content).map(singleTextCursor),
                    };
                    out.pushContent(insertMark);
                    break;
                }
                case "MInsert": {
                    const cloned = cloneAndModify(mark);
                    if (cloned.fields.size > 0) {
                        const insertMark: Delta.InsertAndModify = {
                            type: Delta.MarkType.InsertAndModify,
                            ...cloned,
                        };
                        out.pushContent(insertMark);
                    } else {
                        const insertMark: Delta.Insert = {
                            type: Delta.MarkType.Insert,
                            content: [cloned.content],
                        };
                        out.pushContent(insertMark);
                    }
                    break;
                }
                case "MoveIn": {
                    const moveMark: Delta.MoveIn = {
                        type: Delta.MarkType.MoveIn,
                        moveId: brandOpaque<Delta.MoveId>(mark.id),
                    };
                    out.pushContent(moveMark);
                    break;
                }
                case "MMoveIn":
                    fail(ERR_NOT_IMPLEMENTED);
                case "Bounce":
                case "Intake":
                    // These have no impacts on the document state.
                    break;
                case "Modify": {
                    if (mark.tomb === undefined) {
                        out.pushContent({
                            type: Delta.MarkType.Modify,
                            ...convertModify(mark),
                        });
                    }
                    break;
                }
                case "Delete": {
                    const deleteMark: Delta.Delete = {
                        type: Delta.MarkType.Delete,
                        count: mark.count,
                    };
                    out.pushContent(deleteMark);
                    break;
                }
                case "MDelete": {
                    const fields = convertModify(mark).fields;
                    if (fields !== undefined) {
                        const deleteMark: Delta.ModifyAndDelete = {
                            type: Delta.MarkType.ModifyAndDelete,
                            fields,
                        };
                        out.pushContent(deleteMark);
                    } else {
                        const deleteMark: Delta.Delete = {
                            type: Delta.MarkType.Delete,
                            count: 1,
                        };
                        out.pushContent(deleteMark);
                    }
                    break;
                }
                case "MoveOut": {
                    const moveMark: Delta.MoveOut = {
                        type: Delta.MarkType.MoveOut,
                        moveId: brandOpaque<Delta.MoveId>(mark.id),
                        count: mark.count,
                    };
                    out.pushContent(moveMark);
                    break;
                }
                case "Revive": {
                    const insertMark: Delta.Insert = {
                        type: Delta.MarkType.Insert,
                        // TODO: Restore the actual node
                        content: makeArray(mark.count, () => singleTextCursor({ type: DUMMY_REVIVED_NODE_TYPE })),
                    };
                    out.pushContent(insertMark);
                    break;
                }
                case "MRevive": {
                    const insertMark: Delta.Insert = {
                        type: Delta.MarkType.Insert,
                        // TODO: Restore the actual node
                        content: [singleTextCursor({ type: DUMMY_REVIVED_NODE_TYPE })],
                    };
                    out.pushContent(insertMark);
                    break;
                }
                case "MMoveOut":
                case "Return":
                case "MReturn":
                case "Gap":
                    fail(ERR_NOT_IMPLEMENTED);
                case "Tomb": {
                    // These tombs are only used to precisely describe the location of other attaches.
                    // They have no impact on the current state.
                    break;
                }
                default: unreachableCase(type);
            }
        }
    }
    return out.list;
}

const DUMMY_REVIVED_NODE_TYPE: TreeSchemaIdentifier = brand("RevivedNode");

/**
 * Converts inserted content into the format expected in Delta instances.
 * This involves applying all except MoveIn changes.
 *
 * The returned `fields` map may be empty if all modifications are applied by the function.
 */
function cloneAndModify(insert: T.ModifyInsert): DeltaInsertModification {
    // TODO: consider processing modifications at the same time as cloning to avoid unnecessary cloning
    const outNode = clone(insert.content);
    const outModifications = applyOrCollectModifications(outNode, insert);
    return { content: singleTextCursor(outNode), fields: outModifications };
}

/**
 * Modifications to be applied to an inserted tree in a Delta.
 */
interface DeltaInsertModification {
    /**
     * The subtree to be inserted.
     */
    content: Delta.ProtoNode;
    /**
     * The modifications to make to the inserted subtree.
     * May be empty.
     */
    fields: Delta.FieldMarks;
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
 * @returns The remaining modifications that the consumer of the Delta will apply on the given node. May be empty if
 * all modifications are applied by the function.
 */
function applyOrCollectModifications(
    node: ProtoNode,
    modify: ChangesetMods,
): Delta.FieldMarks {
    const outFieldsMarks: Delta.FieldMarks = new Map();
    if (modify.value !== undefined) {
        node.value = modify.value.value;
    }
    for (const key of genericTreeKeys(modify)) {
        const brandedKey: FieldKey = brand(key);
        const outNodes = getGenericTreeField(node, key, true);
        const outMarks = new OffsetListFactory<Delta.Mark>();
        let index = 0;
        for (const mark of getGenericTreeField(modify, key, false)) {
            if (isSkipMark(mark)) {
                index += mark;
                outMarks.pushOffset(mark);
            } else {
                // Inline into `switch(mark.type)` once we upgrade to TS 4.7
                const type = mark.type;
                switch (type) {
                    case "Insert": {
                        // TODO: can we skip this clone?
                        const content = clone(mark.content).map(singleTextCursor);
                        outNodes.splice(index, 0, ...content);
                        index += content.length;
                        outMarks.pushOffset(content.length);
                        break;
                    }
                    case "MInsert": {
                        const cloned = cloneAndModify(mark);
                        if (cloned.fields.size > 0) {
                            outMarks.pushContent({
                                type: Delta.MarkType.Modify,
                                fields: cloned.fields,
                            });
                        }
                        outNodes.splice(index, 0, cloned.content);
                        index += 1;
                        break;
                    }
                    case "MoveIn":
                    case "MMoveIn":
                        // TODO: convert into a Delta.MoveIn/MoveInAndModify
                        fail(ERR_NOT_IMPLEMENTED);
                    case "Bounce":
                        fail(ERR_BOUNCE_ON_INSERT);
                    case "Intake":
                        fail(ERR_INTAKE_ON_INSERT);
                    case "Modify": {
                        if ("tomb" in mark) {
                            continue;
                        }
                        const clonedFields = applyOrCollectModifications(outNodes[index], mark);
                        if (clonedFields.size > 0) {
                            outMarks.pushContent({
                                type: Delta.MarkType.Modify,
                                fields: clonedFields,
                            });
                        }
                        index += 1;
                        break;
                    }
                    case "Delete": {
                        if ("tomb" in mark) {
                            continue;
                        }
                        outNodes.splice(index, mark.count);
                        break;
                    }
                    case "MDelete": {
                        if ("tomb" in mark) {
                            continue;
                        }
                        // TODO: convert move-out of inserted content into insert at the destination
                        fail(ERR_NOT_IMPLEMENTED);
                    }
                    case "MoveOut":
                    case "MMoveOut":
                        // TODO: convert move-out of inserted content into insert at the destination
                        fail(ERR_NOT_IMPLEMENTED);
                    case "Gap":
                        // Gap marks have no effect on the document state
                        break;
                    case "Tomb":
                        fail(ERR_TOMB_IN_INSERT);
                    case "Revive":
                    case "MRevive":
                        fail(ERR_REVIVE_ON_INSERT);
                    case "Return":
                    case "MReturn":
                        fail(ERR_RETURN_ON_INSERT);
                    default: unreachableCase(type);
                }
            }
        }
        if (outMarks.list.length > 0) {
            outFieldsMarks.set(brandedKey, outMarks.list);
        }
        genericTreeDeleteIfEmpty(node, key, true);
    }
    return outFieldsMarks;
}

const ERR_NOT_IMPLEMENTED = "Not implemented";
const ERR_TOMB_IN_INSERT = "Encountered a concurrent deletion in inserted content";
const ERR_BOUNCE_ON_INSERT = "Encountered a Bounce mark in an inserted field";
const ERR_INTAKE_ON_INSERT = "Encountered an Intake mark in an inserted field";
const ERR_REVIVE_ON_INSERT = "Encountered a Revive mark in an inserted field";
const ERR_RETURN_ON_INSERT = "Encountered a Return mark in an inserted field";

/**
 * Modifications to a subtree as described by a Changeset.
 */
interface ChangesetMods {
    value?: T.SetValue;
    fields?: T.FieldMarks;
}

/**
 * Modifications to a subtree as described by a Delta.
 */
 interface DeltaMods {
    fields?: Delta.FieldMarks;
    setValue?: Value;
}

/**
 * Converts tree modifications from the Changeset to the Delta format.
 */
function convertModify(modify: ChangesetMods): DeltaMods {
    const out: DeltaMods = {};
    if (modify.value !== undefined) {
        out.setValue = modify.value.value;
    }
    const fields = modify.fields;
    if (fields !== undefined) {
        out.fields = convertFieldMarks(fields);
    }
    return out;
}

function convertFieldMarks(fields: T.FieldMarks): Delta.FieldMarks {
    const outFields: Delta.FieldMarks = new Map();
    for (const key of Object.keys(fields)) {
        const marks = convertMarkList(fields[key]);
        const brandedKey: FieldKey = brand(key);
        outFields.set(brandedKey, marks);
    }
    return outFields;
}
