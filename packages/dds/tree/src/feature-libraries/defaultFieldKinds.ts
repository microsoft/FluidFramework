/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, IsoBuffer } from "@fluidframework/common-utils";
import { ChangeEncoder } from "../change-family";
import { ITreeCursor } from "../forest";
import { FieldKindIdentifier } from "../schema-stored";
import { AnchorSet, Delta, JsonableTree } from "../tree";
import { brand, fail, JsonCompatible, JsonCompatibleReadOnly } from "../util";
import { singleTextCursor } from "./treeTextCursor";
import {
    FieldKind,
    Multiplicity,
    allowsTreeSchemaIdentifierSuperset,
    ToDelta,
    FieldChangeRebaser,
    FieldChangeHandler,
    NodeChangeComposer,
    NodeChangeInverter,
    NodeChangeRebaser,
    NodeChangeset,
    FieldChangeEncoder,
    NodeChangeDecoder,
    NodeChangeEncoder,
    FieldEditor,
} from "./modular-schema";
import { jsonableTreeFromCursor } from "./treeTextCursorLegacy";
import { mapTreeFromCursor, singleMapTreeCursor } from "./mapTreeCursor";
import { applyModifyToTree } from "./deltaUtils";
import { sequenceFieldChangeHandler, SequenceFieldEditor } from "./sequence-field";

/**
 * Encoder for changesets which carry no information.
 *
 * @sealed
 */
export class UnitEncoder extends ChangeEncoder<0> {
    public encodeForJson(formatVersion: number, change: 0): JsonCompatible {
        return 0;
    }

    public encodeBinary(formatVersion: number, change: 0): IsoBuffer {
        return IsoBuffer.from("");
    }

    public decodeJson(formatVersion: number, change: JsonCompatible): 0 {
        return 0;
    }

    public decodeBinary(formatVersion: number, change: IsoBuffer): 0 {
        return 0;
    }
}

/**
 * Encoder for changesets which are just a json compatible value.
 *
 * @sealed
 */
export class ValueEncoder<T extends JsonCompatibleReadOnly> extends ChangeEncoder<T> {
    public encodeForJson(formatVersion: number, change: T): JsonCompatibleReadOnly {
        return change;
    }

    public decodeJson(formatVersion: number, change: JsonCompatibleReadOnly): T {
        return change as T;
    }
}

/**
 * @returns a ChangeRebaser that assumes all the changes commute, meaning that order does not matter.
 */
function commutativeRebaser<TChange>(data: {
    compose: (changes: TChange[]) => TChange;
    invert: (changes: TChange) => TChange;
    rebaseAnchors: (anchor: AnchorSet, over: TChange) => void;
}): FieldChangeRebaser<TChange> {
    return {
        rebase: (change: TChange, over: TChange) => change,
        ...data,
    };
}

/**
 * Picks the last value written.
 *
 * TODO: it seems impossible for this to obey the desired axioms.
 * Specifically inverse needs to cancel, restoring the value from the previous change which was discarded.
 */
export function lastWriteWinsRebaser<TChange>(data: {
    noop: TChange;
    invert: (changes: TChange) => TChange;
}): FieldChangeRebaser<TChange> {
    return {
        rebase: (change: TChange, over: TChange) => change,
        compose: (changes: TChange[]) =>
            changes.length >= 0 ? changes[changes.length - 1] : data.noop,
        invert: data.invert,
    };
}

export interface Replacement<T> {
    old: T;
    new: T;
}

export type ReplaceOp<T> = Replacement<T> | 0;

/**
 * Picks the last value written.
 *
 * Consistent if used on valid paths with correct old states.
 */
export function replaceRebaser<T>(): FieldChangeRebaser<ReplaceOp<T>> {
    return {
        rebase: (change: ReplaceOp<T>, over: ReplaceOp<T>, rebaseChild: NodeChangeRebaser) => {
            if (change === 0) {
                return 0;
            }
            if (over === 0) {
                return change;
            }
            return { old: over.new, new: change.new };
        },
        compose: (changes: ReplaceOp<T>[], composeChild: NodeChangeComposer) => {
            const f = changes.filter((c): c is Replacement<T> => c !== 0);
            if (f.length === 0) {
                return 0;
            }
            for (let index = 1; index < f.length; index++) {
                assert(f[index - 1].new === f[index].old, 0x3a4 /* adjacent replaces must match */);
            }
            return { old: f[0].old, new: f[f.length - 1].new };
        },
        invert: (changes: ReplaceOp<T>, invertChild: NodeChangeInverter) => {
            return changes === 0 ? 0 : { old: changes.new, new: changes.old };
        },
    };
}

/**
 * ChangeHandler that only handles no-op / identity changes.
 */
export const noChangeHandle: FieldChangeHandler<0> = {
    rebaser: {
        compose: (changes: 0[], composeChild: NodeChangeComposer) => 0,
        invert: (changes: 0, invertChild: NodeChangeInverter) => 0,
        rebase: (change: 0, over: 0, rebaseChild: NodeChangeRebaser) => 0,
    },
    encoder: new UnitEncoder(),
    editor: { buildChildChange: (index, change) => fail("Child changes not supported") },
    intoDelta: (change: 0, deltaFromChild: ToDelta): Delta.MarkList => [],
};

/**
 * ChangeHandler that does not support any changes.
 *
 * TODO: Due to floating point precision compose is not quite associative.
 * This may violate our requirements.
 * This could be fixed by making this integer only
 * and handling values past Number.MAX_SAFE_INTEGER (ex: via an arbitrarily large integer library)
 * or via modular arithmetic.
 */
export const counterHandle: FieldChangeHandler<number> = {
    rebaser: commutativeRebaser({
        compose: (changes: number[]) => changes.reduce((a, b) => a + b, 0),
        invert: (change: number) => -change,
        rebaseAnchors: (anchor: AnchorSet, over: number) => {},
    }),
    encoder: new ValueEncoder<number>(),
    editor: { buildChildChange: (index, change) => fail("Child changes not supported") },
    intoDelta: (change: number, deltaFromChild: ToDelta): Delta.MarkList => [
        {
            type: Delta.MarkType.Modify,
            setValue: change,
        },
    ],
};

/**
 * Field kind for counters.
 * Stores a single value which corresponds to number which can be added to.
 *
 * This is an example of a few interesting things:
 *
 * - A field kind with some constraints on what can be under it type wise.
 * Other possible examples which would do this include sets, maps (for their keys),
 * or any domain specific specialized kinds.
 *
 * - A field kind with commutative edits.
 *
 * TODO:
 * What should the subtrees under this look like?
 * How does it prevent / interact with direct edits to the subtree (ex: set value)?
 * How should it use its type set?
 * How should it handle lack of associative addition due to precision and overflow?
 */
export const counter: FieldKind = new FieldKind(
    brand("Counter"),
    Multiplicity.Value,
    counterHandle,
    (types, other) => other.kind === counter.identifier,
    new Set(),
);

export interface ValueChangeset {
    value?: JsonableTree;
    changes?: NodeChangeset;
}

const valueRebaser: FieldChangeRebaser<ValueChangeset> = {
    compose: (changes: ValueChangeset[], composeChildren: NodeChangeComposer): ValueChangeset => {
        if (changes.length === 0) {
            return {};
        }
        let newValue: JsonableTree | undefined;
        const childChanges: NodeChangeset[] = [];
        for (const change of changes) {
            if (change.value !== undefined) {
                newValue = change.value;

                // The previous changes applied to a different value, so we discard them.
                // TODO: Consider if we should represent muted changes
                childChanges.length = 0;
            }

            if (change.changes !== undefined) {
                childChanges.push(change.changes);
            }
        }

        const composed: ValueChangeset = {};
        if (newValue !== undefined) {
            composed.value = newValue;
        }

        if (childChanges.length > 0) {
            composed.changes = composeChildren(childChanges);
        }

        return composed;
    },

    invert: (change: ValueChangeset, invertChild: NodeChangeInverter): ValueChangeset => {
        // TODO: Handle the value inverse
        const inverse: ValueChangeset = {};
        if (change.changes !== undefined) {
            inverse.changes = invertChild(change.changes);
        }
        return inverse;
    },

    rebase: (
        change: ValueChangeset,
        over: ValueChangeset,
        rebaseChild: NodeChangeRebaser,
    ): ValueChangeset => {
        if (change.changes === undefined || over.changes === undefined) {
            return change;
        }
        return { ...change, changes: rebaseChild(change.changes, over.changes) };
    },
};

interface EncodedValueChangeset {
    value?: JsonableTree;
    changes?: JsonCompatibleReadOnly;
}

const valueFieldEncoder: FieldChangeEncoder<ValueChangeset> = {
    encodeForJson: (
        formatVersion: number,
        change: ValueChangeset,
        encodeChild: NodeChangeEncoder,
    ) => {
        const encoded: EncodedValueChangeset & JsonCompatibleReadOnly = {};
        if (change.value !== undefined) {
            encoded.value = change.value;
        }

        if (change.changes !== undefined) {
            encoded.changes = encodeChild(change.changes);
        }

        return encoded;
    },

    decodeJson: (
        formatVersion: number,
        change: JsonCompatibleReadOnly,
        decodeChild: NodeChangeDecoder,
    ) => {
        const encoded = change as EncodedValueChangeset;
        const decoded: ValueChangeset = {};
        if (encoded.value !== undefined) {
            decoded.value = encoded.value;
        }

        if (encoded.changes !== undefined) {
            decoded.changes = decodeChild(encoded.changes);
        }

        return decoded;
    },
};

export interface ValueFieldEditor extends FieldEditor<ValueChangeset> {
    /**
     * Creates a change which replaces the current value of the field with `newValue`.
     */
    set(newValue: ITreeCursor): ValueChangeset;
}

const valueFieldEditor: ValueFieldEditor = {
    buildChildChange: (index, change) => {
        assert(index === 0, 0x3b6 /* Value fields only support a single child node */);
        return { changes: change };
    },

    set: (newValue: ITreeCursor) => ({ value: jsonableTreeFromCursor(newValue) }),
};

const valueChangeHandler: FieldChangeHandler<ValueChangeset, ValueFieldEditor> = {
    rebaser: valueRebaser,
    encoder: valueFieldEncoder,
    editor: valueFieldEditor,

    intoDelta: (change: ValueChangeset, deltaFromChild: ToDelta) => {
        if (change.value !== undefined) {
            let mark: Delta.Mark;
            if (change.changes === undefined) {
                mark = { type: Delta.MarkType.Insert, content: [singleTextCursor(change.value)] };
            } else {
                const modify = deltaFromChild(change.changes);
                const cursor = singleTextCursor(change.value);
                const mutableTree = mapTreeFromCursor(cursor);
                const fields = applyModifyToTree(mutableTree, modify);
                mark =
                    fields.size === 0
                        ? {
                              type: Delta.MarkType.Insert,
                              content: [singleMapTreeCursor(mutableTree)],
                          }
                        : {
                              type: Delta.MarkType.InsertAndModify,
                              content: singleMapTreeCursor(mutableTree),
                              fields,
                          };
            }

            return [{ type: Delta.MarkType.Delete, count: 1 }, mark];
        }

        return change.changes === undefined ? [] : [deltaFromChild(change.changes)];
    },
};

/**
 * Exactly one item.
 */
export const value: FieldKind<ValueFieldEditor> = new FieldKind(
    brand("Value"),
    Multiplicity.Value,
    valueChangeHandler,
    (types, other) =>
        (other.kind === sequence.identifier ||
            other.kind === value.identifier ||
            other.kind === optional.identifier) &&
        allowsTreeSchemaIdentifierSuperset(types, other.types),
    new Set(),
);

export interface OptionalFieldChange {
    /**
     * The new content for the trait. If undefined, the trait will be cleared.
     */
    newContent?: JsonableTree;

    /**
     * Whether the field was empty in the state this change is based on.
     */
    wasEmpty: boolean;
}

export interface OptionalChangeset {
    /**
     * If defined, specifies the new content for the field.
     */
    fieldChange?: OptionalFieldChange;

    /**
     * Changes to the node which will be in the field after this changeset is applied.
     */
    childChange?: NodeChangeset;
}

const optionalChangeRebaser: FieldChangeRebaser<OptionalChangeset> = {
    compose: (
        changes: OptionalChangeset[],
        composeChild: NodeChangeComposer,
    ): OptionalChangeset => {
        let fieldChange: OptionalFieldChange | undefined;
        const childChanges: NodeChangeset[] = [];
        for (const change of changes) {
            if (change.fieldChange !== undefined) {
                if (fieldChange === undefined) {
                    fieldChange = { wasEmpty: change.fieldChange.wasEmpty };
                }

                if (change.fieldChange.newContent !== undefined) {
                    fieldChange.newContent = change.fieldChange.newContent;
                } else {
                    delete fieldChange.newContent;
                }

                // The previous changes applied to a different value, so we discard them.
                // TODO: Represent muted changes
                childChanges.length = 0;
            }
            if (change.childChange !== undefined) {
                childChanges.push(change.childChange);
            }
        }

        const composed: OptionalChangeset = {};
        if (fieldChange !== undefined) {
            composed.fieldChange = fieldChange;
        }

        if (childChanges.length > 0) {
            composed.childChange = composeChild(childChanges);
        }

        return composed;
    },

    invert: (change: OptionalChangeset, invertChild: NodeChangeInverter): OptionalChangeset => {
        const inverse: OptionalChangeset = {};

        if (change.fieldChange !== undefined) {
            // TODO: Invert the content in the fieldChange
            inverse.fieldChange = { wasEmpty: change.fieldChange.newContent === undefined };
        }

        if (change.childChange !== undefined) {
            inverse.childChange = invertChild(change.childChange);
        }

        return inverse;
    },

    rebase: (
        change: OptionalChangeset,
        over: OptionalChangeset,
        rebaseChild: NodeChangeRebaser,
    ): OptionalChangeset => {
        if (change.fieldChange !== undefined) {
            if (over.fieldChange !== undefined) {
                const wasEmpty = over.fieldChange.newContent === undefined;

                // We don't have to rebase the child changes, since the other child changes don't apply to the same node
                return {
                    ...change,
                    fieldChange: { ...change.fieldChange, wasEmpty },
                };
            }

            return change;
        }

        if (change.childChange !== undefined) {
            if (over.fieldChange !== undefined) {
                // The node the child changes applied to no longer exists so we drop the changes.
                // TODO: Represent muted changes
                return {};
            }

            if (over.childChange !== undefined) {
                return { childChange: rebaseChild(change.childChange, over.childChange) };
            }
        }

        return change;
    },
};

export interface OptionalFieldEditor extends FieldEditor<OptionalChangeset> {
    /**
     * Creates a change which replaces the field with `newContent`
     * @param newContent - the new content for the field
     * @param wasEmpty - whether the field is empty when creating this change
     */
    set(newContent: ITreeCursor | undefined, wasEmpty: boolean): OptionalChangeset;
}

const optionalFieldEditor: OptionalFieldEditor = {
    set: (newContent: ITreeCursor | undefined, wasEmpty: boolean): OptionalChangeset => ({
        fieldChange: { newContent, wasEmpty },
    }),

    buildChildChange: (index: number, childChange: NodeChangeset): OptionalChangeset => {
        assert(index === 0, 0x404 /* Optional fields only support a single child node */);
        return { childChange };
    },
};

interface EncodedOptionalChangeset {
    fieldChange?: OptionalFieldChange;
    childChange?: JsonCompatibleReadOnly;
}

const optionalFieldEncoder: FieldChangeEncoder<OptionalChangeset> = {
    encodeForJson: (
        formatVersion: number,
        change: OptionalChangeset,
        encodeChild: NodeChangeEncoder,
    ) => {
        const encoded: EncodedOptionalChangeset & JsonCompatibleReadOnly = {};
        if (change.fieldChange !== undefined) {
            encoded.fieldChange = change.fieldChange;
        }

        if (change.childChange !== undefined) {
            encoded.childChange = encodeChild(change.childChange);
        }

        return encoded;
    },

    decodeJson: (
        formatVersion: number,
        change: JsonCompatibleReadOnly,
        decodeChild: NodeChangeDecoder,
    ) => {
        const encoded = change as EncodedOptionalChangeset;
        const decoded: OptionalChangeset = {};
        if (encoded.fieldChange !== undefined) {
            decoded.fieldChange = encoded.fieldChange;
        }

        if (encoded.childChange !== undefined) {
            decoded.childChange = decodeChild(encoded.childChange);
        }

        return decoded;
    },
};

function deltaFromInsertAndChange(
    insertedContent: JsonableTree | undefined,
    nodeChange: NodeChangeset | undefined,
    deltaFromNode: ToDelta,
): Delta.Mark[] {
    if (insertedContent !== undefined) {
        const content = mapTreeFromCursor(singleTextCursor(insertedContent));
        if (nodeChange !== undefined) {
            const nodeDelta = deltaFromNode(nodeChange);
            const fields = applyModifyToTree(content, nodeDelta);
            if (fields.size > 0) {
                return [
                    {
                        type: Delta.MarkType.InsertAndModify,
                        content: singleMapTreeCursor(content),
                        fields,
                    },
                ];
            }
        }
        return [{ type: Delta.MarkType.Insert, content: [singleMapTreeCursor(content)] }];
    }

    if (nodeChange !== undefined) {
        return [deltaFromNode(nodeChange)];
    }

    return [];
}

/**
 * 0 or 1 items.
 */
export const optional: FieldKind<OptionalFieldEditor> = new FieldKind(
    brand("Optional"),
    Multiplicity.Optional,
    {
        rebaser: optionalChangeRebaser,
        encoder: optionalFieldEncoder,
        editor: optionalFieldEditor,

        intoDelta: (change: OptionalChangeset, deltaFromChild: ToDelta) => {
            const insertDelta = deltaFromInsertAndChange(
                change.fieldChange?.newContent,
                change.childChange,
                deltaFromChild,
            );

            if (change.fieldChange !== undefined && !change.fieldChange.wasEmpty) {
                return [{ type: Delta.MarkType.Delete, count: 1 }, ...insertDelta];
            }

            return insertDelta;
        },
    },
    (types, other) =>
        (other.kind === sequence.identifier || other.kind === optional.identifier) &&
        allowsTreeSchemaIdentifierSuperset(types, other.types),
    new Set([value.identifier]),
);

/**
 * 0 or more items.
 */
export const sequence: FieldKind<SequenceFieldEditor> = new FieldKind(
    brand("Sequence"),
    Multiplicity.Sequence,
    sequenceFieldChangeHandler,
    (types, other) =>
        other.kind === sequence.identifier &&
        allowsTreeSchemaIdentifierSuperset(types, other.types),
    // TODO: add normalizer/importers for handling ops from other kinds.
    new Set([]),
);

/**
 * Exactly 0 items.
 *
 * Using Forbidden makes what types are listed for allowed in a field irrelevant
 * since the field will never have values in it.
 *
 * Using Forbidden is equivalent to picking a kind that permits empty (like sequence or optional)
 * and having no allowed types (or only never types).
 * Because of this, its possible to express everything constraint wise without Forbidden,
 * but using Forbidden can be more semantically clear than optional with no allowed types.
 *
 * For view schema, this can be useful if you need to:
 * - run a specific out of schema handler when a field is present,
 * but otherwise are ignoring or tolerating (ex: via extra fields) unmentioned fields.
 * - prevent a specific field from being used as an extra field
 * (perhaps for some past of future compatibility reason)
 * - keep a field in a schema for metadata purposes
 * (ex: for improved error messaging, error handling or documentation)
 * that is not used in this specific version of the schema (ex: to document what it was or will be used for).
 *
 * For stored schema, this can be useful if you need to:
 * - have a field which can have its schema updated to Optional or Sequence of any type.
 * - to exclude a field from extra fields
 * - for the schema system to use as a default for fields which aren't declared
 * (ex: when updating a field that did not exist into one that does)
 *
 * See {@link emptyField} for a constant, reusable field using Forbidden.
 */
export const forbidden: FieldKind = new FieldKind(
    brand("Forbidden"),
    Multiplicity.Forbidden,
    noChangeHandle,
    // All multiplicities other than Value support empty.
    (types, other) => fieldKinds.get(other.kind)?.multiplicity !== Multiplicity.Value,
    new Set(),
);

/**
 * Default field kinds by identifier
 */
export const fieldKinds: ReadonlyMap<FieldKindIdentifier, FieldKind> = new Map(
    [value, optional, sequence, forbidden, counter].map((s) => [s.identifier, s]),
);
