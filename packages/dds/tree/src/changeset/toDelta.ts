/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { unreachableCase } from "@fluidframework/common-utils";
import { brand, fail } from "../util";
import { FieldKey, Value } from "../tree";
import { Delta, ProtoNode, Transposed as T } from ".";

/**
 * Converts a Changeset into a Delta.
 * @param changeset - The Changeset to convert
 * @returns A Delta for applying the changes described in the given Changeset.
 */
export function toDelta(changeset: T.Changeset): Delta.Root {
    return convertPositionedMarks<Delta.OuterMark>(changeset.marks);
}

function convertPositionedMarks<TMarks>(marks: T.PositionedMarks): Delta.PositionedMarks<TMarks> {
    const out: Delta.PositionedMarks<Delta.Mark> = [];
    for (const offsetMark of marks) {
        const offset = offsetMark.offset ?? 0;
        const mark = offsetMark.mark;
        if (Array.isArray(mark)) {
            for (const attach of mark) {
                // Inline into `switch(attach.type)` once we upgrade to TS 4.7
                const type = attach.type;
                switch (type) {
                    case "Insert": {
                        const insertMark: Delta.Insert = {
                            type: Delta.MarkType.Insert,
                            content: cloneTreeContent(attach.content),
                        };
                        out.push({ offset, mark: insertMark });
                        break;
                    }
                    case "MInsert": {
                        const clone = cloneAndModify(attach);
                        if (clone.fields.size > 0) {
                            const insertMark: Delta.InsertAndModify = {
                                type: Delta.MarkType.InsertAndModify,
                                ...clone,
                            };
                            out.push({ offset, mark: insertMark });
                        } else {
                            const insertMark: Delta.Insert = {
                                type: Delta.MarkType.Insert,
                                content: [clone.content],
                            };
                            out.push({ offset, mark: insertMark });
                        }
                        break;
                    }
                    case "MoveIn":
                    case "MMoveIn":
                        fail(ERR_NOT_IMPLEMENTED);
                    case "Bounce":
                    case "Intake":
                        // These have no impacts on the document state.
                        break;
                    default: unreachableCase(type);
                }
            }
        } else {
            // Inline into `switch(mark.type)` once we upgrade to TS 4.7
            const type = mark.type;
            switch (type) {
                case "Modify": {
                    if (mark.tomb === undefined) {
                        out.push({
                            offset,
                            mark: {
                                type: Delta.MarkType.Modify,
                                ...convertModify<Delta.OuterMark>(mark),
                            },
                        });
                    }
                    break;
                }
                case "Delete": {
                    const deleteMark: Delta.Delete = {
                        type: Delta.MarkType.Delete,
                        count: mark.count,
                    };
                    out.push({ offset, mark: deleteMark });
                    break;
                }
                case "MDelete": {
                    const fields = convertModify<Delta.ModifyDeleted | Delta.MoveOut>(mark).fields;
                    if (fields !== undefined) {
                        const deleteMark: Delta.ModifyAndDelete = {
                            type: Delta.MarkType.ModifyAndDelete,
                            fields,
                        };
                        out.push({ offset, mark: deleteMark });
                    } else {
                        const deleteMark: Delta.Delete = {
                            type: Delta.MarkType.Delete,
                            count: 1,
                        };
                        out.push({ offset, mark: deleteMark });
                    }
                    break;
                }
                case "MoveOut":
                case "MMoveOut":
                case "Revive":
                case "MRevive":
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
    // TODO: add runtime checks
    return out as unknown as Delta.PositionedMarks<TMarks>;
}

/**
 * Clones the content described by a Changeset into tree content expected by Delta.
 */
function cloneTreeContent(content: ProtoNode[]): Delta.ProtoNode[] {
    const out: Delta.ProtoNode[] = [];
    for (const node of content) {
        const outNode: Delta.ProtoNode = {
            id: node.id,
            value: node.value,
        };
        if (node.fields !== undefined) {
            const fields: Delta.FieldMap<Delta.ProtoField> = new Map();
            for (const key of Object.keys(node.fields)) {
                fields.set(brand<FieldKey>(key), cloneTreeContent(node.fields[key]));
            }
            if (fields.size > 0) {
                outNode.fields = fields;
            }
        }
        out.push(outNode);
    }
    return out;
}

/**
 * Converts inserted content into the format expected in Delta instances.
 * This involves applying all except MoveIn changes.
 *
 * The returned `fields` map may be empty if all modifications are applied by the function.
 */
function cloneAndModify(insert: T.ModifyInsert): DeltaInsertModification {
    // TODO: consider processing modifications at the same time as cloning to avoid unnecessary cloning
    const outNode = cloneTreeContent([insert.content])[0];
    const outModifications = applyOrCollectModifications(outNode, insert);
    return { content: outNode, fields: outModifications };
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
    fields: Delta.FieldMarks<Delta.ModifyInserted | Delta.MoveIn | Delta.MoveInAndModify>;
}

/**
 * A map of marks to be applied to inserted fields.
 */
type InsertedFieldsMarksMap = Delta.FieldMarks<Delta.ModifyInserted | Delta.MoveIn | Delta.MoveInAndModify>;
type InsertedFieldsMarks = Delta.PositionedMarks<Delta.ModifyInserted | Delta.MoveIn | Delta.MoveInAndModify>;

/**
 * Converts inserted content into the format expected in Delta instances.
 * This involves applying the following changes:
 * - Updating node values
 * - Inserting new subtrees within the inserted content
 * - Deleting parts of the inserted content
 *
 * The only kind of change that is not applied by this function is MoveIn.
 *
 * @param node - The subtree to apply modifications to. Updated in place.
 * @param modify - The modifications to either apply or collect.
 * @returns The remaining modifications that the consumer of the Delta will apply on the given node. May be empty if
 *   all modifications are applied by the function.
 */
function applyOrCollectModifications(
    node: Delta.ProtoNode,
    modify: ChangesetMods,
): InsertedFieldsMarksMap {
    const outFieldsMarks: InsertedFieldsMarksMap = new Map();
    if (modify.value !== undefined) {
        const type = modify.value.type;
        switch (type) {
            case "Set":
                node.value = modify.value.value;
                break;
            case "Revert":
                fail(ERR_REVERT_ON_INSERT);
            default: unreachableCase(type);
        }
    }
    if (modify.fields !== undefined) {
        const protoFields = node.fields ?? new Map();
        const modifyFields = modify.fields;
        for (const key of Object.keys(modifyFields)) {
            const brandedKey = brand<FieldKey>(key);
            const outNodes = protoFields.get(brandedKey) ?? fail(ERR_MOD_ON_MISSING_FIELD);
            const outMarks: InsertedFieldsMarks = [];
            let index = 0;
            let offset = 0;
            for (const markWithOffset of modifyFields[key]) {
                index += markWithOffset.offset ?? 0;
                offset += markWithOffset.offset ?? 0;
                const mark = markWithOffset.mark;
                if (Array.isArray(mark)) {
                    for (const attach of mark) {
                        // Inline into `switch(attach.type)` once we upgrade to TS 4.7
                        const type = attach.type;
                        switch (type) {
                            case "Insert": {
                                const content = cloneTreeContent(attach.content);
                                outNodes.splice(index, 0, ...content);
                                index += content.length;
                                offset += content.length;
                                break;
                            }
                            case "MInsert": {
                                const cloned = cloneAndModify(attach);
                                if (cloned.fields.size > 0) {
                                    outMarks.push({
                                        offset,
                                        mark: {
                                            type: Delta.MarkType.Modify,
                                            fields: cloned.fields,
                                        },
                                    });
                                    offset = 0;
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
                            default: unreachableCase(type);
                        }
                    }
                } else {
                    // Inline into `switch(mark.type)` once we upgrade to TS 4.7
                    const type = mark.type;
                    switch (type) {
                        case "Modify": {
                            if ("tomb" in mark) {
                                continue;
                            }
                            const clonedFields = applyOrCollectModifications(outNodes[index], mark);
                            if (clonedFields.size > 0) {
                                outMarks.push({
                                    offset,
                                    mark: {
                                        type: Delta.MarkType.Modify,
                                        fields: clonedFields,
                                    },
                                });
                                offset = 0;
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
            if (outMarks.length > 0) {
                outFieldsMarks.set(brandedKey, outMarks);
            }
            if (outNodes.length === 0) {
                protoFields.delete(brandedKey);
            }
        }
        if (protoFields.size === 0) {
            delete node.fields;
        }
    }
    return outFieldsMarks;
}

const ERR_NOT_IMPLEMENTED = "Not implemented";
const ERR_TOMB_IN_INSERT = "Encountered a concurrent deletion in inserted content";
const ERR_MOD_ON_MISSING_FIELD = "Encountered a modification that targets a non-existent field on an inserted tree";
const ERR_REVERT_ON_INSERT = "Encountered a revert operation on an inserted node";
const ERR_BOUNCE_ON_INSERT = "Encountered a Bounce mark in an inserted field";
const ERR_INTAKE_ON_INSERT = "Encountered an Intake mark in an inserted field";
const ERR_REVIVE_ON_INSERT = "Encountered a Revive mark in an inserted field";
const ERR_RETURN_ON_INSERT = "Encountered a Return mark in an inserted field";

/**
 * Modifications to a subtree as described by a Changeset.
 */
interface ChangesetMods {
    value?: T.ValueMark;
    fields?: T.FieldMarks;
}

/**
 * Modifications to a subtree as described by a Delta.
 */
 interface DeltaMods<TMark> {
    fields?: Delta.FieldMarks<TMark>;
    setValue?: Value;
}

/**
 * Converts tree modifications from the Changeset to the Delta format.
 */
function convertModify<TMarks>(modify: ChangesetMods): DeltaMods<TMarks> {
    const out: DeltaMods<TMarks> = {};
    if (modify.value !== undefined) {
        const type = modify.value.type;
        switch (type) {
            case "Set":
                out.setValue = modify.value.value;
                break;
            case "Revert":
                fail(ERR_NOT_IMPLEMENTED);
            default: unreachableCase(type);
        }
    }
    const fields = modify.fields;
    if (fields !== undefined) {
        const outFields: Delta.FieldMarks<TMarks> = new Map();
        for (const key of Object.keys(fields)) {
            const marks = convertPositionedMarks<TMarks>(fields[key]);
            const brandedKey = brand<FieldKey>(key);
            outFields.set(brandedKey, marks);
        }
        out.fields = outFields;
    }
    return out;
}
