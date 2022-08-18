/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { SimpleDependee } from "../dependency-tracking";
import {
    GlobalFieldKey,
    FieldSchema,
    TreeSchemaIdentifier,
    TreeSchema,
    SchemaDataReader,
    SchemaPolicy,
} from "./schema";

/**
 * Example in memory SchemaRepository showing how stored schema could work.
 *
 * Actual version for use with Fluid would probably need to either be copy on write, support clone,
 * have rollback/rebase of updates to handle local changes before they are sequenced.
 *
 * New instances default to permitting only empty documents.
 * Assuming a conventional `FieldSchemaIdentifier` use for the document root,
 * this default state can be incrementally updated permitting more and more possible documents.
 *
 * All states which were ever permitted (including the empty document) will remain valid for all time.
 * This means that updating the schema can be done without access to the document contents.
 * As long as the document content edits keep it in schema with the current (or any past) schema,
 * it will always be in schema for all future schema this StoredSchemaRepository might contain.
 *
 * This approach means that stored schema can be updated
 * to permit data in new formats without having to look at any document content.
 * This is valuable for large document scenarios where no user has the entire document loaded,
 * but still need to add some new types to the document.
 *
 * The ergonomics issues caused by the stored schema permitting all old
 * date-formats can be addressed be using a schema on read system (schematize)
 * to apply a more restricted "view schema" when reading document content.
 *
 * The above design pattern (combining stored and view schema this way to support
 * partial checkouts with stored schema that can be updated)
 * is the intended usage pattern for typical users, but other configurations of these systems are possible:
 * Systems which have access to the document content could permit additional kinds of schema changes.
 * For example, a system which keeps the whole document in memory,
 * or is willing to page through all the data when doing the change could permit:
 * - arbitrary schema changes as long as all the data currently complies
 * - schema changes coupled with instructions for how to updated old data
 * While this is possible,
 * it is not the focus of this design since such users have strictly less implementation constraints.
 *
 * TODO: could implement more fine grained dependency tracking.
 */
export class StoredSchemaRepository<TPolicy extends SchemaPolicy = SchemaPolicy>
    extends SimpleDependee implements SchemaData {
    readonly computationName: string = "StoredSchemaRepository";
    protected readonly data = {
        treeSchema: new Map<TreeSchemaIdentifier, TreeSchema>(),
        globalFieldSchema: new Map<GlobalFieldKey, FieldSchema>(),
    };
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
    public constructor(
        public readonly policy: TPolicy,
        data?: SchemaData,
    ) {
        super();
        if (data !== undefined) {
            this.data = {
                treeSchema: new Map(this.data.treeSchema),
                globalFieldSchema: new Map(this.data.globalFieldSchema),
            };
        }
    }

    public clone(): StoredSchemaRepository {
        return new StoredSchemaRepository(
            this.policy,
            this.data,
        );
    }

    public get globalFieldSchema(): ReadonlyMap<GlobalFieldKey, FieldSchema> {
        return this.data.globalFieldSchema;
    }

    public get treeSchema(): ReadonlyMap<TreeSchemaIdentifier, TreeSchema> {
        return this.data.treeSchema;
    }

    public lookupGlobalFieldSchema(identifier: GlobalFieldKey): FieldSchema {
        return this.globalFieldSchema.get(identifier) ?? this.policy.defaultGlobalFieldSchema;
    }

    public lookupTreeSchema(identifier: TreeSchemaIdentifier): TreeSchema {
        return this.treeSchema.get(identifier) ?? this.policy.defaultTreeSchema;
    }

    /**
     * Updates the specified schema.
     */
    public updateFieldSchema(
        identifier: GlobalFieldKey,
        schema: FieldSchema,
    ): void {
        this.data.globalFieldSchema.set(identifier, schema);
        this.invalidateDependents();
    }

    /**
     * Updates the specified schema.
     */
    public updateTreeSchema(
        identifier: TreeSchemaIdentifier,
        schema: TreeSchema,
    ): void {
        this.data.treeSchema.set(identifier, schema);
        this.invalidateDependents();
    }
}

/**
 * Schema data that can be stored in a document.
 */
export interface SchemaData extends SchemaDataReader {
    readonly globalFieldSchema: ReadonlyMap<GlobalFieldKey, FieldSchema>;
    readonly treeSchema: ReadonlyMap<TreeSchemaIdentifier, TreeSchema>;
}
