/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { BTree } from "@tylerbu/sorted-btree-es6";

import type { Listenable } from "@fluidframework/core-interfaces/internal";
import { createEmitter } from "@fluid-internal/client-utils";
import { compareStrings } from "../../util/index.js";

import type { TreeNodeSchemaIdentifier } from "./format.js";
import {
	type StoredSchemaCollection,
	type TreeFieldStoredSchema,
	type TreeNodeStoredSchema,
	type TreeStoredSchema,
	storedEmptyFieldSchema,
} from "./schema.js";

/**
 * Events for {@link TreeStoredSchemaSubscription}.
 *
 * TODO: consider having before and after events per subtree instead while applying anchor (and this just shows what happens at the root).
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
 */
export interface TreeStoredSchemaSubscription extends TreeStoredSchema {
	/**
	 * Events for this schema subscription.
	 */
	readonly events: Listenable<SchemaEvents>;
}

/**
 * Mutable collection of stored schema.
 */
export interface MutableTreeStoredSchema extends TreeStoredSchemaSubscription {
	/**
	 * Mutates the stored schema.
	 * Replaces all schema with the provided schema.
	 * Can over-write preexisting schema, and removes unmentioned schema.
	 */
	apply(newSchema: TreeStoredSchema): void;
}

/**
 * Mutable TreeStoredSchema repository.
 */
export class TreeStoredSchemaRepository implements MutableTreeStoredSchema {
	protected nodeSchemaData: BTree<TreeNodeSchemaIdentifier, TreeNodeStoredSchema>;
	protected rootFieldSchemaData: TreeFieldStoredSchema;
	protected readonly _events = createEmitter<SchemaEvents>();
	public readonly events: Listenable<SchemaEvents> = this._events;

	/**
	 * Copies in the provided schema. If `data` is an TreeStoredSchemaRepository, it will be cheap-cloned.
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
	public constructor(data?: TreeStoredSchema) {
		if (data === undefined) {
			this.rootFieldSchemaData = storedEmptyFieldSchema;
			this.nodeSchemaData = new BTree<TreeNodeSchemaIdentifier, TreeNodeStoredSchema>(
				[],
				compareStrings,
			);
		} else {
			if (data instanceof TreeStoredSchemaRepository) {
				this.rootFieldSchemaData = data.rootFieldSchema;
				this.nodeSchemaData = data.nodeSchemaData.clone();
			} else {
				this.rootFieldSchemaData = data.rootFieldSchema;
				this.nodeSchemaData = cloneNodeSchemaData(data.nodeSchema);
			}
		}
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

	public apply(newSchema: TreeStoredSchema): void {
		this._events.emit("beforeSchemaChange", newSchema);
		const clone = new TreeStoredSchemaRepository(newSchema);
		// In the future, we could use btree's delta functionality to do a more efficient update
		this.rootFieldSchemaData = clone.rootFieldSchemaData;
		this.nodeSchemaData = clone.nodeSchemaData;
		this._events.emit("afterSchemaChange", newSchema);
	}

	public clone(): TreeStoredSchemaRepository {
		return new TreeStoredSchemaRepository(this);
	}
}

export function schemaDataIsEmpty(data: TreeStoredSchema): boolean {
	return data.nodeSchema.size === 0;
}

function cloneNodeSchemaData(
	nodeSchema: StoredSchemaCollection["nodeSchema"],
): BTree<TreeNodeSchemaIdentifier, TreeNodeStoredSchema> {
	// Schema objects are immutable (unlike stored schema repositories), so this shallow copy is fine.
	const entries: [TreeNodeSchemaIdentifier, TreeNodeStoredSchema][] = [
		...nodeSchema.entries(),
	];
	return new BTree<TreeNodeSchemaIdentifier, TreeNodeStoredSchema>(entries, compareStrings);
}
