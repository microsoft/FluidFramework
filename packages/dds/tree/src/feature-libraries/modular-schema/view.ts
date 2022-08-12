/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { fail } from "../../util";
import {
    FieldSchema, LocalFieldKey, TreeSchema,
    TreeSchemaIdentifier, StoredSchemaRepository,
    SchemaData,
    FieldKindIdentifier,
    GlobalFieldKey,
} from "../../schema-stored";
import { Adapters, ViewSchemaData, AdaptedViewSchema, Compatibility } from "../../schema-view";
import { FieldKind, FullSchemaPolicy } from "./fieldKind";
import { allowsFieldSuperset, allowsRepoSuperset, allowsTreeSuperset, isNeverTree } from "./comparison";

/**
 * A collection of View information for schema, including policy.
 */
export class ViewSchema extends ViewSchemaData<FullSchemaPolicy> {
    public constructor(
        policy: FullSchemaPolicy,
        adapters: Adapters,
        public readonly schema: ViewSchemaCollection,
    ) {
        super(policy, adapters);
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
     public checkCompatibility(
        stored: SchemaData,
    ): {
        read: Compatibility;
        write: Compatibility;
        writeAllowingStoredSchemaUpdates: Compatibility;
    } {
        const adapted = this.adaptRepo(stored);
        const adaptedRepo = new StoredSchemaRepository(this.policy, adapted.adaptedForViewSchema);
        const storedRepo = new StoredSchemaRepository(this.policy, stored);
        const viewRepo = new StoredSchemaRepository(this.policy, stored);

        // TODO: use adapters
        const read = allowsRepoSuperset(storedRepo, viewRepo)
            ? Compatibility.Compatible
            : allowsRepoSuperset(adaptedRepo, viewRepo)
            ? Compatibility.RequiresAdapters
            : Compatibility.Incompatible;
        // TODO: Extract subset of adapters that are valid to use on stored
        // TODO: separate adapters from schema updates
        const write = allowsRepoSuperset(viewRepo, storedRepo)
            ? Compatibility.Compatible
            : allowsRepoSuperset(storedRepo, viewRepo)
            ? Compatibility.RequiresAdapters // Requires schema updates. TODO: consider adapters that can update writes.
            : Compatibility.Incompatible;

        // TODO: compute this properly (and maybe include the set of schema changes needed for it?).
        // Maybe updates would happen lazily when needed to store data?
        // When willingness to updates can avoid need for some adapters,
        // how should it be decided if the adapter should be used to avoid the update?
        // TODO: is this case actually bi-variant, making this correct if we did it for each schema independently?
        let writeAllowingStoredSchemaUpdates =
            // TODO: This should consider just the updates needed
            // (ex: when view covers a subset of stored after stored has a update to that subset).
            allowsRepoSuperset(storedRepo, viewRepo)
            ? Compatibility.Compatible
            // TODO: this assumes adapters can translate in both directions. In general this will not be true.
            // TODO: this also assumes that schema updates to the adapted repo would translate to
            // updates on the stored schema, which is also likely untrue.
            : allowsRepoSuperset(adaptedRepo, viewRepo)
            ? Compatibility.RequiresAdapters // Requires schema updates. TODO: consider adapters that can update writes.
            : Compatibility.Incompatible;

        // Since the above does not consider partial updates,
        // we can improve the tolerance a bit by considering the op-op update:
        writeAllowingStoredSchemaUpdates = Math.max(writeAllowingStoredSchemaUpdates, write);

        return { read, write, writeAllowingStoredSchemaUpdates };
    }

    /**
     * Compute a schema that `original` could be viewed as using adapters as needed.
     *
     * TODO: have a way for callers to get invalidated on schema updates.
     * Maybe pass in StoredSchemaRepository and optional ObservingDependent?
     */
    public adaptRepo(storedData: SchemaData): AdaptedViewSchema {
        const view = new StoredSchemaRepository(this.policy, this.schema);
        const stored = new StoredSchemaRepository(this.policy, storedData);
        // Sanity check on adapters:
        // it's probably a bug it they use the never types,
        // since there never is a reason to have a never type as an adapter input,
        // and its impossible for an adapter to be correctly implemented if its output type is never
        // (unless its input is also never).
        for (const adapter of this.adapters?.tree ?? []) {
            if (
                isNeverTree(stored, stored.lookupTreeSchema(adapter.input))
            ) {
                fail("tree adapter for stored that is never");
            }
            if (
                isNeverTree(view, view.lookupTreeSchema(adapter.output))
            ) {
                fail("tree adapter with view that is never");
            }
        }
        const adapted = new StoredSchemaRepository(this.policy);
        for (const [key, schema] of this.schema.globalFieldSchema) {
            const field = this.adaptField(
                schema,
                this.adapters,
                this.adapters.missingField?.has(key) ?? false,
            );
            const adapatedField = adapted.lookupGlobalFieldSchema(key);
            if (!allowsFieldSuperset(adapted, field, adapatedField)) {
                fail("error adapting field schema");
            }
            adapted.updateFieldSchema(key, adapatedField);
        }
        for (const [key, schema] of stored.treeSchema) {
            const adapatedTree = adapted.lookupTreeSchema(key);
            if (
                !allowsTreeSuperset(adapted, schema, adapatedTree)
            ) {
                fail("error adapting tree schema");
            }
            adapted.updateTreeSchema(key, adapatedTree);
        }

        // TODO: subset these adapters to the ones that were needed/used.
        return new AdaptedViewSchema(this.adapters, adapted);
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
