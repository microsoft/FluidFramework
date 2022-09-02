/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, IsoBuffer } from "@fluidframework/common-utils";
import { ChangeEncoder, JsonCompatible, JsonCompatibleReadOnly } from "../change-family";
import { FieldKindIdentifier } from "../schema-stored";
import { AnchorSet, Delta, JsonableTree } from "../tree";
import { brand } from "../util";
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
} from "./modular-schema";

/**
 * Encoder for changesets which carry no information.
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
        compose: (changes: TChange[]) => changes.length >= 0 ? changes[changes.length - 1] : data.noop,
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
                assert(f[index - 1].new === f[index].old, "adjacent replaces must match");
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
    intoDelta: (change: number, deltaFromChild: ToDelta): Delta.MarkList => [{
        type: Delta.MarkType.Modify,
        setValue: change,
    }],
};

/**
 * Field kind for counters.
 * Stores a single value which corresponds to number which can be added to.
 *
 * This is an example of a few interesting things:
 * - A field kind with some constraints on what can be under it type wise.
 *      Other possible examples which would do this include sets, maps (for their keys),
 *      or any domain specific specialized kinds.
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

/**
* Exactly one item.
*/
export const value: FieldKind = new FieldKind(
    brand("Value"),
    Multiplicity.Value,
    {
        rebaser: replaceRebaser<JsonableTree>(),
        encoder: new ValueEncoder<JsonableTree & JsonCompatibleReadOnly>(),
        intoDelta: (change: JsonableTree, deltaFromChild: ToDelta) => { throw new Error("Not implemented"); },
    },
    (types, other) =>
        (other.kind === sequence.identifier || other.kind === value.identifier || other.kind === optional.identifier)
        && allowsTreeSchemaIdentifierSuperset(types, other.types),
    new Set(),
);

/**
* 0 or 1 items.
*/
export const optional: FieldKind = new FieldKind(
    brand("Optional"),
    Multiplicity.Optional,
    {
        rebaser: replaceRebaser<JsonableTree | 0>(),
        encoder: new ValueEncoder<(JsonableTree | 0) & JsonCompatibleReadOnly>(),
        intoDelta: (change: JsonableTree, deltaFromChild: ToDelta) => { throw new Error("Not implemented"); },
    },
    (types, other) =>
        (other.kind === sequence.identifier || other.kind === optional.identifier)
        && allowsTreeSchemaIdentifierSuperset(types, other.types),
    new Set([value.identifier]),
);

/**
 * 0 or more items.
 */
export const sequence: FieldKind = new FieldKind(
    brand("Sequence"),
    Multiplicity.Sequence,
    {
        rebaser: replaceRebaser<JsonableTree[]>(),
        encoder: new ValueEncoder<(JsonableTree[]) & JsonCompatibleReadOnly>(),
        intoDelta: (change: JsonableTree, deltaFromChild: ToDelta) => { throw new Error("Not implemented"); },
    },
    // TODO: is order correct?
    (types, other) =>
        (other.kind === sequence.identifier)
        && allowsTreeSchemaIdentifierSuperset(types, other.types),
    // TODO: add normalizer/importers for handling ops from other kinds.
    new Set([value.identifier, optional.identifier]),
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
    [value, optional, sequence, forbidden, counter].map((s) => [s.identifier, s]));
