/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

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

type RemovedNodeKey = string | number | undefined;

export type Entry = { field: FieldKey; root: ForestRootId };
/**
 * The tree index records detached field ids and associates them with a change atom ID.
 */
export class TreeIndex {
	private readonly detachedNodeToField: NestedMap<RemovedNodeKey, RemovedNodeKey, Entry> =
		new Map<RemovedNodeKey, Map<RemovedNodeKey, Entry>>();

	public constructor(
		private readonly name: string,
		private readonly rootIdAllocator: () => ForestRootId,
	) {}

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
		const key = tryGetFromNestedMap(this.detachedNodeToField, id.major, id.minor);
		return key ?? fail("Unknown removed node ID");
	}

	/**
	 * Retrieves the associated ForestRootId if any.
	 * Otherwise, allocates a new one and associates it with the given DetachedNodeId.
	 */
	public getOrCreateEntry(nodeId: Delta.DetachedNodeId): Entry {
		return this.tryGetEntry(nodeId) ?? this.createEntry(nodeId);
	}

	/**
	 * Associates the DetachedNodeId with a field key and creates an entry for it in the index.
	 */
	public createEntry(nodeId?: Delta.DetachedNodeId): Entry {
		const root = this.rootIdAllocator();
		const field = this.toFieldKey(root);
		const entry = { field, root };

		if (nodeId !== undefined) {
			setInNestedMap(this.detachedNodeToField, nodeId.major, nodeId.minor, entry);
		}
		return entry;
	}
}
