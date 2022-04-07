/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { allowsRepoSuperset } from "./Comparison";
import { SchemaRepository } from "./Schema";

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

// TODO: do something with adapters.
export class Adapters {
    protected makeNominal: undefined;
}

/**
 * Determines the compatibility of a stored document
 * (based on its stored schema) with a viewer (based on its view schema).
 *
 * Adapters can be provided to handle differences between the two schema.
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
    // TODO: use adapters
    const read = allowsRepoSuperset(stored, view)
        ? Compatibility.Compatible
        : Compatibility.Incompatible;
    const write = allowsRepoSuperset(view, stored)
        ? Compatibility.Compatible
        : Compatibility.Incompatible;

    // TODO: compute this (and maybe include the set of schema changes needed for it?).
    // Maybe updates would happen lazily when needed to store data?
    // When willingness to updates can avoid need for some adapters,
    // how should it be decided if the adapter should be used to avoid the update?
    const writeAllowingStoredSchemaUpdates = write;

    return { read, write, writeAllowingStoredSchemaUpdates };
}
