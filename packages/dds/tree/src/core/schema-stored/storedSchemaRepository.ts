/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Dependee, SimpleDependee } from "../dependency-tracking";
import {
    GlobalFieldKey,
    FieldSchema,
    TreeSchemaIdentifier,
    TreeSchema,
    SchemaData,
    SchemaPolicy,
} from "./schema";

/**
 * A {@link SchemaData} with a {@link SchemaPolicy}.
 */
export interface SchemaDataAndPolicy<TPolicy extends SchemaPolicy = SchemaPolicy>
    extends SchemaData {
    /**
     * Configuration information, including the defaults for schema which have no been added yet.
     */
    readonly policy: TPolicy;
}

/**
 * Mutable collection of stored schema.
 *
 * TODO: could implement more fine grained dependency tracking.
 */
export interface StoredSchemaRepository<TPolicy extends SchemaPolicy = SchemaPolicy>
    extends Dependee,
        SchemaDataAndPolicy<TPolicy> {
    /**
     * Add the provided schema, possibly over-writing preexisting schema.
     */
    update(newSchema: SchemaData): void;
}

/**
 * StoredSchemaRepository for in memory use:
 * not hooked up to Fluid (does not create Fluid ops when editing).
 */
export class InMemoryStoredSchemaRepository<TPolicy extends SchemaPolicy = SchemaPolicy>
    extends SimpleDependee
    implements StoredSchemaRepository<TPolicy>
{
    readonly computationName: string = "StoredSchemaRepository";
    protected readonly data: MutableSchemaData;
    /**
     * For now, the schema are just scored in maps.
     * There are a couple reasons we might not want this simple solution long term:
     * 1. We might want an easy/fast copy.
     * 2. We might want a way to reserve a large namespace of schema with the same schema.
     * The way extraFields has been structured mitigates the need for this, but it still might be useful.
     *
     * (ex: someone using data as field identifiers might want to
     * reserve all fields identifiers starting with "foo." to have a specific schema).
     * Combined with support for such namespaces in the allowed sets in the schema objects,
     * that might provide a decent alternative to extraFields (which is a bit odd).
     */
    public constructor(public readonly policy: TPolicy, data?: SchemaData) {
        super();
        this.data = {
            treeSchema: new Map(data?.treeSchema ?? []),
            globalFieldSchema: new Map(data?.globalFieldSchema ?? []),
        };
    }

    public clone(): InMemoryStoredSchemaRepository {
        return new InMemoryStoredSchemaRepository(this.policy, this.data);
    }

    public get globalFieldSchema(): ReadonlyMap<GlobalFieldKey, FieldSchema> {
        return this.data.globalFieldSchema;
    }

    public get treeSchema(): ReadonlyMap<TreeSchemaIdentifier, TreeSchema> {
        return this.data.treeSchema;
    }

    /**
     * Updates the specified schema.
     */
    public updateFieldSchema(identifier: GlobalFieldKey, schema: FieldSchema): void {
        this.data.globalFieldSchema.set(identifier, schema);
        this.invalidateDependents();
    }

    /**
     * Updates the specified schema.
     */
    public updateTreeSchema(identifier: TreeSchemaIdentifier, schema: TreeSchema): void {
        this.data.treeSchema.set(identifier, schema);
        this.invalidateDependents();
    }

    public update(newSchema: SchemaData): void {
        for (const [name, schema] of newSchema.globalFieldSchema) {
            this.data.globalFieldSchema.set(name, schema);
        }
        for (const [name, schema] of newSchema.treeSchema) {
            this.data.treeSchema.set(name, schema);
        }
        this.invalidateDependents();
    }
}

interface MutableSchemaData extends SchemaData {
    globalFieldSchema: Map<GlobalFieldKey, FieldSchema>;
    treeSchema: Map<TreeSchemaIdentifier, TreeSchema>;
}

export function lookupGlobalFieldSchema(
    data: SchemaDataAndPolicy,
    identifier: GlobalFieldKey,
): FieldSchema {
    return data.globalFieldSchema.get(identifier) ?? data.policy.defaultGlobalFieldSchema;
}

export function lookupTreeSchema(
    data: SchemaDataAndPolicy,
    identifier: TreeSchemaIdentifier,
): TreeSchema {
    return data.treeSchema.get(identifier) ?? data.policy.defaultTreeSchema;
}

export function schemaDataIsEmpty(data: SchemaData): boolean {
    return data.treeSchema.size === 0 && data.globalFieldSchema.size === 0;
}
