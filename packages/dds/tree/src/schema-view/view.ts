/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { fail } from "../util";
import {
    FieldSchema, GlobalFieldKey, LocalFieldKey, TreeSchema,
    TreeSchemaIdentifier, StoredSchemaRepository, allowsRepoSuperset,
    SchemaPolicy, SchemaData, FieldKind, FieldKindIdentifier,
} from "../schema-stored";
import { ObservingDependent, recordDependency } from "../dependency-tracking";

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

// TODO: Separate this from TreeSchema, adding more data.
export interface TreeViewSchema extends TreeSchema {}

/**
 * All policy for a specific field kind,
 * including functionality that does not have to be kept consistent across versions or deterministic.
 *
 * This can include policy for how to use this schema for "view" purposes, and well as how to expose editing APIs.
 */
 export class FieldTypeView<Kind extends FieldKind = FieldKind> implements FieldSchema {
    public readonly types?: ReadonlySet<TreeSchemaIdentifier>;

    get kind(): FieldKindIdentifier {
        return this.fieldKind.identifier;
    }

    public constructor(public readonly fieldKind: Kind, types?: Iterable<TreeSchemaIdentifier>) {
        this.types = types === undefined ? undefined : new Set(types);
    }
}

/**
 * Schema data that can be stored in a document.
 */
export interface ViewSchemaCollection {
    readonly globalFieldSchema: ReadonlyMap<GlobalFieldKey, FieldTypeView>;
    readonly treeSchema: ReadonlyMap<TreeSchemaIdentifier, TreeViewSchema>;
}

/**
 * A collection of View information for schema, including policy.
 */
export class ViewSchemaData {
    public constructor(
        public readonly policy: SchemaPolicy,
        public readonly adapters: Adapters,
        public readonly schema: ViewSchemaCollection,
    ) {}

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
    public checkCompatibility(
        stored: SchemaData,
    ): {
        read: Compatibility;
        write: Compatibility;
        writeAllowingStoredSchemaUpdates: Compatibility;
    } {
        const adapted = this.adaptRepo(stored, this.adapters);
        const storedRepo = new StoredSchemaRepository(this.policy);

        // TODO: use adapters
        const read = allowsRepoSuperset(storedRepo, adapted.repo)
            ? Compatibility.Compatible
            : allowsRepoSuperset(storedRepo, adapted.repo)
            ? Compatibility.RequiresAdapters
            : Compatibility.Incompatible;
        // TODO: Extract subset of adapters that are valid to use on stored
        const write = allowsRepoSuperset(adapted.repo, storedRepo)
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

    public adaptRepo(original: SchemaData, adapters: Adapters): AdaptedViewSchema {
        // Sanity check on adapters:
        // it's probably a bug it they use the never types,
        // since there never is a reason to have a never type as an adapter input,
        // and its impossible for an adapter to be correctly implemented if its output type is never
        // (unless its input is also never).
        // TODO: Update/replace this sanity check with one that works.
        // for (const adapter of adapters?.tree ?? []) {
        //     if (
        //         isNeverTree(original, original.lookupTreeSchema(adapter.input))
        //     ) {
        //         fail("tree adapter for input that is never");
        //     }
        //     if (
        //         isNeverTree(original, original.lookupTreeSchema(adapter.output))
        //     ) {
        //         fail("tree adapter with output that is never");
        //     }
        // }

        const adapted = new StoredSchemaRepository(this.policy);
        for (const [key, schema] of original.globalFieldSchema) {
            const field = this.adaptField(
                schema,
                adapters,
                adapters.missingField?.has(key) ?? false,
            );
            if (!adapted.tryUpdateFieldSchema(key, field)) {
                fail("error adapting field schema");
            }
        }
        for (const [key, schema] of original.treeSchema) {
            if (
                !adapted.tryUpdateTreeSchema(key, this.adaptTree(schema, adapters))
            ) {
                fail("error adapting tree schema");
            }
        }
        // TODO: should this include the modified or original repo? Probably original.
        return new AdaptedViewSchema(this, new StoredSchemaRepository(this.policy));
    }

    /**
     * Adapt original such that it allows member types which can be adapted to its specified types.
     */
    adaptField(
        original: FieldSchema,
        adapters: Adapters,
        allowMissing: boolean,
    ): FieldSchema {
        const kind = this.adaptKind(this.policy.fieldKinds.get(original.kind) ?? fail("missing kind"), allowMissing);
        if (original.types) {
            const types: Set<TreeSchemaIdentifier> = new Set(original.types);
            for (const adapter of adapters?.tree ?? []) {
                if (original.types.has(adapter.output)) {
                    types.add(adapter.input);
                }
            }

            return { ...original, types, kind: kind.identifier };
        }
        return { ...original, kind: kind.identifier };
    }

    adaptTree(original: TreeSchema, adapters: Adapters): TreeSchema {
        const localFields: Map<LocalFieldKey, FieldSchema> = new Map();
        for (const [key, schema] of original.localFields) {
            // TODO: support missing field adapters for local fields.
            localFields.set(key, this.adaptField(schema, adapters, false));
        }
        return { ...original, localFields };
    }

    adaptKind(original: FieldKind, allowMissing: boolean): FieldKind {
        // TODO: implement this properly.
        // if (allowMissing) {
        //     return original === FieldKinds.value
        //         ? FieldKindView.Optional
        //         : original;
        // }
        return original;
    }
}

/**
 * A collection of View information for schema, including policy.
 */
export class AdaptedViewSchema {
    public constructor(
        public readonly data: ViewSchemaData,
        public readonly repo: StoredSchemaRepository,
    ) {}

    // TODO: present some information about the reconciled resulting schema.
    public getInfo(observer?: ObservingDependent): unknown {
        recordDependency(observer, this.repo);
        fail("not implemented");
    }
}
