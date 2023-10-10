/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";
import {
	Brand,
	IdAllocator,
	NestedMap,
	brand,
	decodeNestedMap,
	deleteFromNestedMap,
	encodeNestedMap,
	idAllocatorFromMaxId,
	populateNestedMap,
	setInNestedMap,
	tryGetFromNestedMap,
} from "../../util";
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

type Major = string | number | undefined;
type Minor = number;

/**
 * The tree index records detached field IDs and associates them with a change atom ID.
 */
export class DetachedFieldIndex {
	// TODO: don't store the field key in the index, it can be derived from the root ID
	private detachedNodeToField: NestedMap<Major, Minor, Entry> = new Map();

	/**
	 * @param name - A name for the index, used as a prefix for the generated field keys.
	 * @param rootIdAllocator - An ID allocator used to generate unique field keys.
	 */
	public constructor(
		private readonly name: string,
		private rootIdAllocator: IdAllocator<ForestRootId>,
	) {}

	public clone(): DetachedFieldIndex {
		const clone = new DetachedFieldIndex(this.name, this.rootIdAllocator);
		populateNestedMap(this.detachedNodeToField, clone.detachedNodeToField);
		return clone;
	}

	public *entries(): Generator<Entry & { id: Delta.DetachedNodeId }> {
		for (const [major, innerMap] of this.detachedNodeToField) {
			if (major !== undefined) {
				for (const [minor, entry] of innerMap) {
					yield { id: { major, minor }, ...entry };
				}
			} else {
				for (const [minor, entry] of innerMap) {
					yield { id: { minor }, ...entry };
				}
			}
		}
	}

	public updateMajor(current: Major, updated: Major) {
		const innerCurrent = this.detachedNodeToField.get(current);
		if (innerCurrent !== undefined) {
			this.detachedNodeToField.delete(current);
			const innerUpdated = this.detachedNodeToField.get(updated);
			if (innerUpdated === undefined) {
				this.detachedNodeToField.set(updated, innerCurrent);
			} else {
				for (const [minor, entry] of innerCurrent) {
					assert(innerUpdated.get(minor) === undefined, "Collision during index update");
					innerUpdated.set(minor, entry);
				}
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

	public deleteEntry(nodeId: Delta.DetachedNodeId): void {
		const found = deleteFromNestedMap(this.detachedNodeToField, nodeId.major, nodeId.minor);
		assert(found, "Unable to delete unknown entry");
	}

	/**
	 * Associates the DetachedNodeId with a field key and creates an entry for it in the index.
	 */
	public createEntry(nodeId?: Delta.DetachedNodeId, count: number = 1): Entry {
		const root = this.rootIdAllocator.allocate(count);
		const field = this.toFieldKey(root);
		const entry = { field, root };

		if (nodeId !== undefined) {
			setInNestedMap(this.detachedNodeToField, nodeId.major, nodeId.minor, entry);
		}
		return entry;
	}

	public encode(): string {
		return JSON.stringify({
			data: encodeNestedMap(this.detachedNodeToField),
			id: this.rootIdAllocator.getNextId(),
		});
	}

	/**
	 * Loads the tree index from the given string, this overrides any existing data.
	 */
	public loadData(data: string): void {
		const detachedFieldIndex: { data: string; id: number } = JSON.parse(data);
		this.detachedNodeToField = decodeNestedMap(detachedFieldIndex.data);
		this.rootIdAllocator = idAllocatorFromMaxId(
			detachedFieldIndex.id,
		) as IdAllocator<ForestRootId>;
	}
}
