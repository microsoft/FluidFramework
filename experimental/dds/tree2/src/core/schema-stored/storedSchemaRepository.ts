/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import BTree from "sorted-btree";
import { createEmitter, ISubscribable } from "../../events";
import { compareStrings } from "../../util";
import {
	StoredSchemaCollection,
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
 * A collection of stored schema that fires events in response to changes.
 * @alpha
 */
export interface EditableSchemaRepository extends ISubscribable<SchemaEvents>, TreeStoredSchema {}

/**
 * Mutable collection of stored schema.
 * @alpha
 */
export interface StoredSchemaRepository extends EditableSchemaRepository {
	/**
	 * Replaces all schema with the provided schema.
	 * Can over-write preexisting schema, and removes unmentioned schema.
	 */
	update(newSchema: TreeStoredSchema): void;
}

/**
 * Mutable collection of stored schema.
 * @alpha
 */
export interface MutableStoredSchemaRepository extends EditableSchemaRepository {
	/**
	 * Replaces all schema with the provided schema.
	 * Can over-write preexisting schema, and removes unmentioned schema.
	 */
	apply(newSchema: TreeStoredSchema): void;
}

/**
 * StoredSchemaRepository that follows SharedTree's editing patterns.
 *
 * `update` will result in an invocation of the supplied `changeReceiver`.
 * `apply` will mutate the schema repository.
 */
export class InMemoryStoredSchemaRepository
	implements StoredSchemaRepository, MutableStoredSchemaRepository
{
	protected nodeSchemaData: BTree<TreeNodeSchemaIdentifier, TreeNodeStoredSchema>;
	protected rootFieldSchemaData: TreeFieldStoredSchema;
	protected readonly events = createEmitter<SchemaEvents>();

	/**
	 * Copies in the provided schema. If `data` is an InMemoryStoredSchemaRepository, it will be cheap-cloned.
	 * Otherwise, it will be deep-cloned.
	 *
	 * We might not want to store schema in maps long term, as we might want a way to reserve a
	 * large space of schema IDs within a schema.
	 * The way mapFields has been structured mitigates the need for this, but it still might be useful.
	 *
	 * (ex: someone using data as field identifiers might want to
	 * reserve all fields identifiers starting with "foo." to have a specific schema).
	 * Combined with support for such namespaces in the allowed sets in the schema objects,
	 * that might provide a decent alternative to mapFields (which is a bit odd).
	 */
	public constructor(
		private readonly changeReceiver: (
			oldSchema: TreeStoredSchema,
			newSchema: TreeStoredSchema,
		) => void,
		data?: TreeStoredSchema,
	) {
		if (data === undefined) {
			this.rootFieldSchemaData = storedEmptyFieldSchema;
			this.nodeSchemaData = new BTree<TreeNodeSchemaIdentifier, TreeNodeStoredSchema>(
				[],
				compareStrings,
			);
		} else {
			if (data instanceof InMemoryStoredSchemaRepository) {
				this.rootFieldSchemaData = data.rootFieldSchema;
				this.nodeSchemaData = data.nodeSchemaData.clone();
			} else {
				this.rootFieldSchemaData = cloneFieldSchemaData(data.rootFieldSchema);
				this.nodeSchemaData = cloneNodeSchemaData(data.nodeSchema);
			}
		}
	}

	public on<K extends keyof SchemaEvents>(eventName: K, listener: SchemaEvents[K]): () => void {
		return this.events.on(eventName, listener);
	}

	public get nodeSchema(): ReadonlyMap<TreeNodeSchemaIdentifier, TreeNodeStoredSchema> {
		// Btree implements iterator, but not in a type-safe way
		return this.nodeSchemaData as unknown as ReadonlyMap<
			TreeNodeSchemaIdentifier,
			TreeNodeStoredSchema
		>;
	}

	public get rootFieldSchema(): TreeFieldStoredSchema {
		return this.rootFieldSchemaData;
	}

	public update(newSchema: TreeStoredSchema): void {
		this.changeReceiver(
			// Clone out the data in case the receiver holds onto it to ensure
			// it is not mutated in the subsequent apply call.
			new InMemoryStoredSchemaRepository(this.changeReceiver, this),
			newSchema,
		);
	}

	public apply(newSchema: TreeStoredSchema): void {
		this.events.emit("beforeSchemaChange", newSchema);
		const clone = new InMemoryStoredSchemaRepository(this.changeReceiver, newSchema);
		// In the future, we could use btree's delta functionality to do a more efficient update
		this.rootFieldSchemaData = clone.rootFieldSchemaData;
		this.nodeSchemaData = clone.nodeSchemaData;
		this.events.emit("afterSchemaChange", newSchema);
	}
}

export function schemaDataIsEmpty(data: TreeStoredSchema): boolean {
	return data.nodeSchema.size === 0;
}

function cloneNodeSchemaData(
	nodeSchema: StoredSchemaCollection["nodeSchema"],
): BTree<TreeNodeSchemaIdentifier, TreeNodeStoredSchema> {
	const entries: [TreeNodeSchemaIdentifier, TreeNodeStoredSchema][] = [];
	for (const [name, schema] of nodeSchema.entries()) {
		entries.push([
			name,
			{
				mapFields:
					schema.mapFields === undefined
						? undefined
						: cloneFieldSchemaData(schema.mapFields),
				objectNodeFields: new Map(schema.objectNodeFields),
				leafValue: schema.leafValue,
			},
		]);
	}
	return new BTree<TreeNodeSchemaIdentifier, TreeNodeStoredSchema>(entries, compareStrings);
}

function cloneFieldSchemaData(fieldSchema: TreeFieldStoredSchema): TreeFieldStoredSchema {
	return {
		kind: fieldSchema.kind,
		types: fieldSchema.types === undefined ? undefined : new Set(fieldSchema.types),
	};
}
