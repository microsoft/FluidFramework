/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { fail } from "../util";
import {
    FieldSchema, GlobalFieldKey, LocalFieldKey, FieldKind, SchemaRepository, TreeSchema,
    TreeSchemaIdentifier, StoredSchemaRepository, allowsRepoSuperset, isNeverTree,
} from "../schema-stored";

/**
 * APIs for applying `view schema` to documents.
 */

/**
 * How compatible a particular view schema is for some operation on some specific document.
 */
export enum Compatibility {
    Compatible,
    RequiresAdapters,
    Incompatible,
}

export interface TreeAdapter {
    readonly output: TreeSchemaIdentifier;
    readonly input: TreeSchemaIdentifier;

    // TODO: include actual adapter functionality, not just what types it converts
}

export interface MissingFieldAdapter {
    readonly field: GlobalFieldKey;

    // TODO: include actual adapter functionality, not just what types it converts
}

/**
 * Minimal selection of adapters (nothing for general out of schema, field level adjustments etc.).
 * Would be used with schematize and have actual conversion/update functionality.
 *
 * TODO: Support more kinds of adapters
 * TODO: support efficient lookup of adapters
 */
export interface Adapters {
    readonly tree?: readonly TreeAdapter[];
    readonly missingField?: ReadonlyMap<GlobalFieldKey, MissingFieldAdapter>;
}

/**
 * Determines the compatibility of a stored document
 * (based on its stored schema) with a viewer (based on its view schema).
 *
 * Adapters can be provided to handle differences between the two schema.
 * Adapters should only use to types in the `view` SchemaRepository.
 *
 * TODO: this API violates the parse don't validate design philosophy.
 * It should be wrapped with (or replaced by) a parse style API.
 */
export function checkCompatibility(
    stored: SchemaRepository,
    view: SchemaRepository,
    adapters: Adapters,
): {
    read: Compatibility;
    write: Compatibility;
    writeAllowingStoredSchemaUpdates: Compatibility;
} {
    const adapted = adaptRepo(view, adapters);

    // TODO: use adapters
    const read = allowsRepoSuperset(stored, view)
        ? Compatibility.Compatible
        : allowsRepoSuperset(stored, adapted) ? Compatibility.RequiresAdapters : Compatibility.Incompatible;
    // TODO: Extract subset of adapters that are valid to use on stored
    const write = allowsRepoSuperset(view, stored)
        ? Compatibility.Compatible
        : Compatibility.Incompatible;

    // TODO: compute this properly (and maybe include the set of schema changes needed for it?).
    // Maybe updates would happen lazily when needed to store data?
    // When willingness to updates can avoid need for some adapters,
    // how should it be decided if the adapter should be used to avoid the update?
    // TODO: is this case actually bi-variant, making this correct if we did it for each schema independently?
    const writeAllowingStoredSchemaUpdates = Math.min(read, write);

    return { read, write, writeAllowingStoredSchemaUpdates };
}

export function adaptRepo(original: SchemaRepository, adapters: Adapters): SchemaRepository {
    // Sanity check on adapters:
    // it's probably a bug it they use the never types,
    // since there never is a reason to have a never type as an adapter input,
    // and its impossible for an adapter to be correctly implemented if its output type is never
    // (unless its input is also never).
    for (const adapter of adapters?.tree ?? []) {
        if (isNeverTree(original, original.lookupTreeSchema(adapter.input))) {
            fail("tree adapter for input that is never");
        }
        if (isNeverTree(original, original.lookupTreeSchema(adapter.output))) {
            fail("tree adapter with output that is never");
        }
    }

    const adapted = new StoredSchemaRepository();
    for (const [key, schema] of original.globalFieldSchema) {
        const field = adaptField(schema, adapters, adapters.missingField?.has(key) ?? false);
        if (!adapted.tryUpdateFieldSchema(key, field)) {
            fail("error adapting field schema");
        }
    }
    for (const [key, schema] of original.treeSchema) {
        if (!adapted.tryUpdateTreeSchema(key, adaptTree(schema, adapters))) {
            fail("error adapting tree schema");
        }
    }
    return adapted;
}

/**
 * Adapt original such that it allows member types which can be adapted to its specified types.
 */
export function adaptField(original: FieldSchema, adapters: Adapters, allowMissing: boolean): FieldSchema {
    const kind = adaptKind(original.kind, allowMissing);
    if (original.types) {
        const types: Set<TreeSchemaIdentifier> = new Set(original.types);
        for (const adapter of adapters?.tree ?? []) {
            if (original.types.has(adapter.output)) {
                types.add(adapter.input);
            }
        }

        return { ...original, types, kind };
    }
    return { ...original, kind };
}

export function adaptTree(original: TreeSchema, adapters: Adapters): TreeSchema {
    const localFields: Map<LocalFieldKey, FieldSchema> = new Map();
    for (const [key, schema] of original.localFields) {
        // TODO: support missing field adapters for local fields.
        localFields.set(key, adaptField(schema, adapters, false));
    }
    return { ...original, localFields };
}

export function adaptKind(original: FieldKind, allowMissing: boolean): FieldKind {
    if (allowMissing) {
        return original === FieldKind.Value ? FieldKind.Optional : original;
    }
    return original;
}
