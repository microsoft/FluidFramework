/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Dependee, SimpleDependee } from "../dependency-tracking";
import { createEmitter, ISubscribable } from "../../events";
import {
	FieldStoredSchema,
	TreeSchemaIdentifier,
	TreeStoredSchema,
	SchemaData,
	storedEmptyFieldSchema,
} from "./schema";

/**
 * Events for {@link StoredSchemaRepository}.
 *
 * TODO: consider having before and after events per subtree instead while applying anchor (and this just shows what happens at the root).
 * @public
 */
export interface SchemaEvents {
	/**
	 * Schema change is about to be applied.
	 */
	beforeSchemaChange(newSchema: SchemaData): void;

	/**
	 * Schema change was just applied.
	 */
	afterSchemaChange(newSchema: SchemaData): void;
}

/**
 * Mutable collection of stored schema.
 *
 * TODO: could implement more fine grained dependency tracking.
 * @public
 */
export interface StoredSchemaRepository extends Dependee, ISubscribable<SchemaEvents>, SchemaData {
	/**
	 * Replaces all schema with the provided schema.
	 * Can over-write preexisting schema, and removes unmentioned schema.
	 */
	update(newSchema: SchemaData): void;
}

/**
 * StoredSchemaRepository for in memory use:
 * not hooked up to Fluid (does not create Fluid ops when editing).
 */
export class InMemoryStoredSchemaRepository
	extends SimpleDependee
	implements StoredSchemaRepository
{
	protected readonly data: MutableSchemaData;
	private readonly events = createEmitter<SchemaEvents>();

	/**
	 * For now, the schema are just scored in maps.
	 * There are a couple reasons we might not want this simple solution long term:
	 * 1. We might want an easy/fast copy.
	 * 2. We might want a way to reserve a large namespace of schema with the same schema.
	 * The way mapFields has been structured mitigates the need for this, but it still might be useful.
	 *
	 * (ex: someone using data as field identifiers might want to
	 * reserve all fields identifiers starting with "foo." to have a specific schema).
	 * Combined with support for such namespaces in the allowed sets in the schema objects,
	 * that might provide a decent alternative to mapFields (which is a bit odd).
	 */
	public constructor(data?: SchemaData) {
		super("StoredSchemaRepository");
		this.data = cloneSchemaData(data ?? defaultSchemaData);
	}

	public on<K extends keyof SchemaEvents>(eventName: K, listener: SchemaEvents[K]): () => void {
		return this.events.on(eventName, listener);
	}

	public get rootFieldSchema(): FieldStoredSchema {
		return this.data.rootFieldSchema;
	}

	public get treeSchema(): ReadonlyMap<TreeSchemaIdentifier, TreeStoredSchema> {
		return this.data.treeSchema;
	}

	public update(newSchema: SchemaData): void {
		this.events.emit("beforeSchemaChange", newSchema);

		this.data.rootFieldSchema = newSchema.rootFieldSchema;

		this.data.treeSchema.clear();
		for (const [name, schema] of newSchema.treeSchema) {
			this.data.treeSchema.set(name, schema);
		}
		this.invalidateDependents();
		this.events.emit("afterSchemaChange", newSchema);
	}
}

export interface MutableSchemaData extends SchemaData {
	rootFieldSchema: FieldStoredSchema;
	treeSchema: Map<TreeSchemaIdentifier, TreeStoredSchema>;
}

export function schemaDataIsEmpty(data: SchemaData): boolean {
	return data.treeSchema.size === 0;
}

export const defaultSchemaData: SchemaData = {
	treeSchema: new Map(),
	rootFieldSchema: storedEmptyFieldSchema,
};

export function cloneSchemaData(data: SchemaData): MutableSchemaData {
	return {
		treeSchema: new Map(data?.treeSchema ?? []),
		rootFieldSchema: data?.rootFieldSchema ?? storedEmptyFieldSchema,
	};
}
