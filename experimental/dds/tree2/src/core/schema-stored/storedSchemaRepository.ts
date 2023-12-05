/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Dependee, SimpleDependee } from "../dependency-tracking";
import { createEmitter, ISubscribable } from "../../events";
import {
	TreeFieldStoredSchema,
	TreeNodeSchemaIdentifier,
	TreeNodeStoredSchema,
	TreeStoredSchema,
	storedEmptyFieldSchema,
} from "./schema";

/**
 * Events for {@link StoredSchemaRepository}.
 *
 * TODO: consider having before and after events per subtree instead while applying anchor (and this just shows what happens at the root).
 * @alpha
 */
export interface SchemaEvents {
	/**
	 * Schema change is about to be applied.
	 */
	beforeSchemaChange(newSchema: TreeStoredSchema): void;

	/**
	 * Schema change was just applied.
	 */
	afterSchemaChange(newSchema: TreeStoredSchema): void;
}

/**
 * Mutable collection of stored schema.
 *
 * TODO: could implement more fine grained dependency tracking.
 * @alpha
 */
export interface StoredSchemaRepository
	extends Dependee,
		ISubscribable<SchemaEvents>,
		TreeStoredSchema {
	/**
	 * Replaces all schema with the provided schema.
	 * Can over-write preexisting schema, and removes unmentioned schema.
	 */
	update(newSchema: TreeStoredSchema): void;
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
	public constructor(data?: TreeStoredSchema) {
		super("StoredSchemaRepository");
		this.data = cloneSchemaData(data ?? defaultSchemaData);
	}

	public on<K extends keyof SchemaEvents>(eventName: K, listener: SchemaEvents[K]): () => void {
		return this.events.on(eventName, listener);
	}

	public get rootFieldSchema(): TreeFieldStoredSchema {
		return this.data.rootFieldSchema;
	}

	public get nodeSchema(): ReadonlyMap<TreeNodeSchemaIdentifier, TreeNodeStoredSchema> {
		return this.data.nodeSchema;
	}

	public update(newSchema: TreeStoredSchema): void {
		this.events.emit("beforeSchemaChange", newSchema);

		this.data.rootFieldSchema = newSchema.rootFieldSchema;

		this.data.nodeSchema.clear();
		for (const [name, schema] of newSchema.nodeSchema) {
			this.data.nodeSchema.set(name, schema);
		}
		this.invalidateDependents();
		this.events.emit("afterSchemaChange", newSchema);
	}
}

export interface MutableSchemaData extends TreeStoredSchema {
	rootFieldSchema: TreeFieldStoredSchema;
	nodeSchema: Map<TreeNodeSchemaIdentifier, TreeNodeStoredSchema>;
}

export function schemaDataIsEmpty(data: TreeStoredSchema): boolean {
	return data.nodeSchema.size === 0;
}

export const defaultSchemaData: TreeStoredSchema = {
	nodeSchema: new Map(),
	rootFieldSchema: storedEmptyFieldSchema,
};

export function cloneSchemaData(data: TreeStoredSchema): MutableSchemaData {
	return {
		nodeSchema: new Map(data?.nodeSchema ?? []),
		rootFieldSchema: data?.rootFieldSchema ?? storedEmptyFieldSchema,
	};
}
