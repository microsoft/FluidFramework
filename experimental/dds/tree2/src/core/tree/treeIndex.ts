/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";
import { Brand, NestedMap, brand, fail, setInNestedMap, tryGetFromNestedMap } from "../../util";
import { FieldKey } from "../schema-stored";
import * as Delta from "./delta";

/**
 * ID used to create a detached field key for a removed subtree.
 * @alpha
 *
 * TODO: Move to Forest once forests can support multiple roots.
 */
export type ForestRootId = Brand<number, "tree.ForestRootId">;

export interface Entry {
	field: FieldKey;
	root: ForestRootId;
}

/**
 * The tree index records detached field ids and associates them with a change atom ID.
 */
export class TreeIndex {
	private readonly detachedNodeToField: NestedMap<string | number | undefined, number, Entry> =
		new Map<string | number | undefined, Map<number, Entry>>();

	public constructor(
		private readonly name: string,
		private readonly rootIdAllocator: (count: number) => ForestRootId,
	) {}

	public *entries(): Generator<Entry & { id: Delta.DetachedNodeId }> {
		for (const [major, innerMap] of this.detachedNodeToField) {
			for (const [minor, entry] of innerMap) {
				yield { id: { major, minor }, ...entry };
			}
		}
	}

	/**
	 * Returns a field key for the given ID.
	 * This does not save the field key on the index. To do so, call {@link getOrCreateEntry}.
	 */
	public toFieldKey(id: ForestRootId): FieldKey {
		return brand(`${this.name}-${id}`);
	}

	/**
	 * Returns the FieldKey associated with the given id.
	 * Returns undefined if no such id is known to the index.
	 */
	public tryGetEntry(id: Delta.DetachedNodeId): Entry | undefined {
		return tryGetFromNestedMap(this.detachedNodeToField, id.major, id.minor);
	}

	/**
	 * Returns the FieldKey associated with the given id.
	 * Fails if no such id is known to the index.
	 */
	public getEntry(id: Delta.DetachedNodeId): Entry {
		const key = this.tryGetEntry(id);
		assert(key !== undefined, "Unknown removed node ID");
		return key;
	}

	/**
	 * Retrieves the associated ForestRootId if any.
	 * Otherwise, allocates a new one and associates it with the given DetachedNodeId.
	 */
	public getOrCreateEntry(nodeId: Delta.DetachedNodeId, count: number = 1): Entry {
		return this.tryGetEntry(nodeId) ?? this.createEntry(nodeId);
	}

	/**
	 * Associates the DetachedNodeId with a field key and creates an entry for it in the index.
	 */
	public createEntry(nodeId?: Delta.DetachedNodeId, count: number = 1): Entry {
		const root = this.rootIdAllocator(count);
		const field = this.toFieldKey(root);
		const entry = { field, root };

		if (nodeId !== undefined) {
			setInNestedMap(this.detachedNodeToField, nodeId.major, nodeId.minor, entry);
		}
		return entry;
	}
}
