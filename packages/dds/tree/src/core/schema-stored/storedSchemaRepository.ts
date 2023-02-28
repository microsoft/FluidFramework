/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Dependee, SimpleDependee } from "../dependency-tracking";
import { createEmitter, ISubscribable } from "../../events";
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
 * @alpha
 */
export interface SchemaDataAndPolicy<TPolicy extends SchemaPolicy = SchemaPolicy>
	extends SchemaData {
	/**
	 * Configuration information, including the defaults for schema which have no been added yet.
	 */
	readonly policy: TPolicy;
}

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
 * @alpha
 */
export interface StoredSchemaRepository<TPolicy extends SchemaPolicy = SchemaPolicy>
	extends Dependee,
		ISubscribable<SchemaEvents>,
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
	private readonly events = createEmitter<SchemaEvents>();

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

	public on<K extends keyof SchemaEvents>(eventName: K, listener: SchemaEvents[K]): () => void {
		return this.events.on(eventName, listener);
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

	public update(newSchema: SchemaData): void {
		this.events.emit("beforeSchemaChange", newSchema);
		for (const [name, schema] of newSchema.globalFieldSchema) {
			this.data.globalFieldSchema.set(name, schema);
		}
		for (const [name, schema] of newSchema.treeSchema) {
			this.data.treeSchema.set(name, schema);
		}
		this.invalidateDependents();
		this.events.emit("afterSchemaChange", newSchema);
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
