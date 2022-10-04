/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { fail } from "../../util";
import {
    FieldSchema, LocalFieldKey, TreeSchema,
    TreeSchemaIdentifier,
    SchemaData,
    FieldKindIdentifier,
    GlobalFieldKey,
    InMemoryStoredSchemaRepository,
} from "../../schema-stored";
import { Adapters, ViewSchemaData, AdaptedViewSchema, Compatibility, FieldAdapter } from "../../schema-view";
import { FieldKind, FullSchemaPolicy } from "./fieldKind";
import { allowsRepoSuperset, isNeverTree } from "./comparison";

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

        const read = allowsRepoSuperset(this.policy, stored, this.schema)
            ? Compatibility.Compatible
            : allowsRepoSuperset(this.policy, adapted.adaptedForViewSchema, this.schema)
            ? Compatibility.RequiresAdapters
            : Compatibility.Incompatible;
        // TODO: Extract subset of adapters that are valid to use on stored
        // TODO: separate adapters from schema updates
        const write = allowsRepoSuperset(this.policy, this.schema, stored)
            ? Compatibility.Compatible
            : allowsRepoSuperset(this.policy, this.schema, adapted.adaptedForViewSchema)
            // TODO: IThis assumes adapters are bidirectional.
            ? Compatibility.RequiresAdapters
            : Compatibility.Incompatible;

        // TODO: compute this properly (and maybe include the set of schema changes needed for it?).
        // Maybe updates would happen lazily when needed to store data?
        // When willingness to updates can avoid need for some adapters,
        // how should it be decided if the adapter should be used to avoid the update?
        // TODO: is this case actually bi-variant, making this correct if we did it for each schema independently?
        let writeAllowingStoredSchemaUpdates =
            // TODO: This should consider just the updates needed
            // (ex: when view covers a subset of stored after stored has a update to that subset).
            allowsRepoSuperset(this.policy, stored, this.schema)
            ? Compatibility.Compatible
            // TODO: this assumes adapters can translate in both directions. In general this will not be true.
            // TODO: this also assumes that schema updates to the adapted repo would translate to
            // updates on the stored schema, which is also likely untrue.
            : allowsRepoSuperset(this.policy, adapted.adaptedForViewSchema, this.schema)
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
    public adaptRepo(stored: SchemaData): AdaptedViewSchema {
        // Sanity check on adapters:
        // it's probably a bug it they use the never types,
        // since there never is a reason to have a never type as an adapter input,
        // and its impossible for an adapter to be correctly implemented if its output type is never
        // (unless its input is also never).
        for (const adapter of this.adapters?.tree ?? []) {
            if (
                isNeverTree(
                    this.policy,
                    this.schema,
                    this.schema.treeSchema.get(adapter.output) ?? this.policy.defaultTreeSchema)
            ) {
                fail(`tree adapter for stored ${adapter.output} should not be never`);
            }
        }
        const adapted = new InMemoryStoredSchemaRepository(this.policy);
        for (const [key, schema] of stored.globalFieldSchema) {
            const adaptedField = this.adaptField(schema, this.adapters.fieldAdapters?.get(key));
            adapted.updateFieldSchema(key, adaptedField);
        }
        for (const [key, schema] of stored.treeSchema) {
            const adapatedTree = this.adaptTree(schema);
            adapted.updateTreeSchema(key, adapatedTree);
        }

        // TODO: subset these adapters to the ones that were needed/used.
        return new AdaptedViewSchema(this.adapters, adapted);
    }

    /**
     * Adapt original such that it allows member types which can be adapted to its specified types.
     */
    private adaptField(
        original: FieldSchema,
        adapter: FieldAdapter | undefined,
    ): FieldSchema {
        if (original.types) {
            const types: Set<TreeSchemaIdentifier> = new Set(original.types);
            for (const treeAdapter of this.adapters?.tree ?? []) {
                if (original.types.has(treeAdapter.input)) {
                    types.delete(treeAdapter.input);
                    types.add(treeAdapter.output);
                }
            }

            return adapter?.convert?.({ kind: original.kind, types }) ?? { kind: original.kind, types };
        }
        return adapter?.convert?.(original) ?? original;
    }

    private adaptTree(original: TreeSchema): TreeSchema {
        const localFields: Map<LocalFieldKey, FieldSchema> = new Map();
        for (const [key, schema] of original.localFields) {
            // TODO: support missing field adapters for local fields.
            localFields.set(key, this.adaptField(schema, undefined));
        }
        return { ...original, localFields };
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
