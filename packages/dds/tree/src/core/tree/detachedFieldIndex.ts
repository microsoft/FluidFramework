/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, oob } from "@fluidframework/core-utils/internal";
import {
	type IdAllocator,
	type NestedMap,
	brand,
	deleteFromNestedMap,
	forEachInNestedMap,
	idAllocatorFromMaxId,
	populateNestedMap,
	setInNestedMap,
	tryGetFromNestedMap,
} from "../../util/index.js";
import type { RevisionTag } from "../rebase/index.js";
import type { FieldKey } from "../schema-stored/index.js";

import type * as Delta from "./delta.js";
import type {
	DetachedField,
	DetachedFieldSummaryData,
	ForestRootId,
	Major,
	Minor,
} from "./detachedFieldIndexTypes.js";

/**
 * Readonly interface for {@link DetachedFieldIndex}.
 */
export interface ReadOnlyDetachedFieldIndex {
	/**
	 * Creates a deep clone of this `DetachedFieldIndex`.
	 */
	clone(): DetachedFieldIndex;

	/**
	 * Returns a field key for the given ID.
	 * This does not save the field key on the index. To do so, call {@link createEntry}.
	 */
	toFieldKey(id: ForestRootId): FieldKey;

	/**
	 * Returns the `ForestRootId` associated with the given id.
	 * Returns undefined if no such id is known to the index.
	 */
	tryGetEntry(id: Delta.DetachedNodeId): ForestRootId | undefined;

	/**
	 * Returns the `ForestRootId` associated with the given id.
	 * Fails if no such id is known to the index.
	 */
	getEntry(id: Delta.DetachedNodeId): ForestRootId;
}

/**
 * Restores the originating DetachedFieldIndex to the state it was in when the checkpoint was created.
 * Can be invoked multiple times.
 */
export type DetachedFieldIndexCheckpoint = () => void;

/**
 * A point a {@link DetachedFieldIndex} can be restored to, made by {@link DetachedFieldIndex.createRestorePoint}.
 * @remarks
 * Restore points form a stack: each must be released, and restored at most when it is the newest open one.
 */
export interface DetachedFieldIndexRestorePoint {
	/**
	 * Restores the index to the state it was in when this restore point was created.
	 * This restore point stays open, and can be restored again.
	 */
	restore(): void;
	/**
	 * Closes this restore point. It can no longer be restored.
	 */
	release(): void;
}

/**
 * The tree index records detached field IDs and associates them with a change atom ID.
 */
export class DetachedFieldIndex implements ReadOnlyDetachedFieldIndex {
	/**
	 * A mapping from detached node ids to detached fields.
	 */
	private detachedNodeToField: NestedMap<Major, Minor, DetachedField> = new Map();
	/**
	 * A map from revisions to all detached fields for which the revision is the latest relevant revision.
	 * See {@link DetachedField.latestRelevantRevision}.
	 *
	 * @remarks
	 * undefined revisions are tolerated but any roots not associated with a revision must be disposed manually
	 */
	private latestRelevantRevisionToFields: NestedMap<
		RevisionTag | undefined,
		ForestRootId,
		Delta.DetachedNodeId
	> = new Map();

	/**
	 * The process for loading `DetachedFieldIndex` data from a summary is split into two steps:
	 * 1. Call {@link loadData}
	 * 2. Call {@link setRevisionsForLoadedData}
	 *
	 * This flag is only set to `false` after calling `loadData` and is set back to `true` after calling `setRevisionsForLoadedData`.
	 * This helps ensure that `setRevisionsForLoadedData` is only called after `loadData` and only called once.
	 */
	private isFullyLoaded = true;

	/**
	 * Records which undo the changes made to the index since the oldest open restore point, oldest first,
	 * or undefined if no restore point is open (see {@link DetachedFieldIndex.createRestorePoint}).
	 */
	#undoLog: (() => void)[] | undefined;

	/**
	 * The number of open restore points.
	 */
	#openRestorePoints = 0;

	/**
	 * @param name - A name for the index, used as a prefix for the generated field keys.
	 * @param rootIdAllocator - An ID allocator used to generate unique field keys.
	 */
	public constructor(
		private readonly name: string,
		private rootIdAllocator: IdAllocator<ForestRootId>,
	) {}

	public clone(): DetachedFieldIndex {
		const clone = new DetachedFieldIndex(
			this.name,
			idAllocatorFromMaxId(this.rootIdAllocator.getMaxId()) as IdAllocator<ForestRootId>,
		);
		populateNestedMap(this.detachedNodeToField, clone.detachedNodeToField, true);
		populateNestedMap(
			this.latestRelevantRevisionToFields,
			clone.latestRelevantRevisionToFields,
			true,
		);
		return clone;
	}

	/**
	 * Creates a restorable checkpoint of the current state of the DetachedFieldIndex.
	 */
	public createCheckpoint(): DetachedFieldIndexCheckpoint {
		const clone = this.clone();
		return () => {
			this.purge();
			populateNestedMap(clone.detachedNodeToField, this.detachedNodeToField, true);
			populateNestedMap(
				clone.latestRelevantRevisionToFields,
				this.latestRelevantRevisionToFields,
				true,
			);
			this.rootIdAllocator = idAllocatorFromMaxId(
				clone.rootIdAllocator.getMaxId(),
			) as IdAllocator<ForestRootId>;
		};
	}

	/**
	 * Creates a point which the index can be restored to, which must be released when no longer needed.
	 * @remarks
	 * Unlike {@link DetachedFieldIndex.createCheckpoint}, this does not copy the index:
	 * while a restore point is open, each change to the index records how to undo it,
	 * so the cost is proportional to the changes made, not to the size of the index.
	 * Restore points form a stack (see {@link DetachedFieldIndexRestorePoint}).
	 */
	public createRestorePoint(): DetachedFieldIndexRestorePoint {
		const log = (this.#undoLog ??= []);
		const start = log.length;
		const maxId = this.rootIdAllocator.getMaxId();
		this.#openRestorePoints++;
		let open = true;
		return {
			restore: () => {
				assert(open, "A released restore point cannot be restored");
				const current = this.#undoLog;
				assert(
					current !== undefined && current.length >= start,
					"Restore points must be restored in the reverse order of their creation",
				);
				for (let index = current.length - 1; index >= start; index--) {
					(current[index] ?? oob())();
				}
				current.length = start;
				this.rootIdAllocator = idAllocatorFromMaxId(maxId) as IdAllocator<ForestRootId>;
			},
			release: () => {
				assert(open, "A restore point can only be released once");
				open = false;
				this.#openRestorePoints--;
				if (this.#openRestorePoints === 0) {
					this.#undoLog = undefined;
				}
			},
		};
	}

	/**
	 * {@link setInNestedMap}, recording how to undo it while a restore point is open.
	 */
	#setInNestedMap<K1, K2, V>(map: NestedMap<K1, K2, V>, key1: K1, key2: K2, value: V): void {
		const log = this.#undoLog;
		if (log !== undefined) {
			const inner = map.get(key1);
			if (inner === undefined) {
				log.push(() => map.delete(key1));
			} else if (inner.has(key2)) {
				const previous = inner.get(key2) as V;
				log.push(() => inner.set(key2, previous));
			} else {
				log.push(() => inner.delete(key2));
			}
		}
		setInNestedMap(map, key1, key2, value);
	}

	/**
	 * {@link deleteFromNestedMap}, recording how to undo it while a restore point is open.
	 * @remarks
	 * Undoing restores the iteration order of both levels of the map, which summaries depend on.
	 */
	#deleteFromNestedMap<K1, K2, V>(map: NestedMap<K1, K2, V>, key1: K1, key2: K2): boolean {
		const log = this.#undoLog;
		const inner = map.get(key1);
		if (log !== undefined && inner?.has(key2) === true) {
			const entries = [...inner];
			if (inner.size === 1) {
				// The inner map is removed from `map`, so its position in `map` must be restored too.
				log.push(restoreMapOrder(map, key1, inner));
			}
			log.push(() => {
				inner.clear();
				for (const [key, value] of entries) {
					inner.set(key, value);
				}
			});
		}
		return deleteFromNestedMap(map, key1, key2);
	}

	/**
	 * Records how to undo a change to the index which replaces or clears its maps, while a restore point is open.
	 */
	#recordWholeIndexChange(): void {
		const log = this.#undoLog;
		if (log === undefined) {
			return;
		}
		const detachedNodeToField = this.detachedNodeToField;
		const latestRelevantRevisionToFields = this.latestRelevantRevisionToFields;
		const detachedNodeToFieldCopy: NestedMap<Major, Minor, DetachedField> = new Map();
		populateNestedMap(detachedNodeToField, detachedNodeToFieldCopy, true);
		const latestRelevantRevisionToFieldsCopy: typeof latestRelevantRevisionToFields =
			new Map();
		populateNestedMap(
			latestRelevantRevisionToFields,
			latestRelevantRevisionToFieldsCopy,
			true,
		);
		const isFullyLoaded = this.isFullyLoaded;
		log.push(() => {
			detachedNodeToField.clear();
			populateNestedMap(detachedNodeToFieldCopy, detachedNodeToField, true);
			latestRelevantRevisionToFields.clear();
			populateNestedMap(
				latestRelevantRevisionToFieldsCopy,
				latestRelevantRevisionToFields,
				true,
			);
			this.detachedNodeToField = detachedNodeToField;
			this.latestRelevantRevisionToFields = latestRelevantRevisionToFields;
			this.isFullyLoaded = isFullyLoaded;
		});
	}
	public *entries(): Generator<{
		root: ForestRootId;
		latestRelevantRevision?: RevisionTag;
		id: Delta.DetachedNodeId;
	}> {
		for (const [major, innerMap] of this.detachedNodeToField) {
			if (major === undefined) {
				for (const [minor, { root, latestRelevantRevision }] of innerMap) {
					yield latestRelevantRevision === undefined
						? { id: { minor }, root }
						: { id: { minor }, root, latestRelevantRevision };
				}
			} else {
				for (const [minor, { root, latestRelevantRevision }] of innerMap) {
					yield latestRelevantRevision === undefined
						? { id: { major, minor }, root }
						: { id: { major, minor }, root, latestRelevantRevision };
				}
			}
		}
	}

	/**
	 * Removes all entries from the index.
	 */
	public purge(): void {
		this.#recordWholeIndexChange();
		this.detachedNodeToField.clear();
		this.latestRelevantRevisionToFields.clear();
	}

	public toFieldKey(id: ForestRootId): FieldKey {
		return brand(`${this.name}-${id}`);
	}

	public tryGetEntry(id: Delta.DetachedNodeId): ForestRootId | undefined {
		return tryGetFromNestedMap(this.detachedNodeToField, id.major, id.minor)?.root;
	}

	public getEntry(id: Delta.DetachedNodeId): ForestRootId {
		const key = this.tryGetEntry(id);
		assert(key !== undefined, 0x7aa /* Unknown removed node ID */);
		return key;
	}

	/**
	 * Returns the detached root IDs for all the trees that were detached or last modified by the given revision.
	 */
	public *getRootsLastTouchedByRevision(revision: RevisionTag): Iterable<ForestRootId> {
		const roots = this.latestRelevantRevisionToFields.get(revision);
		if (roots !== undefined) {
			yield* roots.keys();
		}
	}

	/**
	 * Removes the detached roots for all the trees that were detached or last modified by the given revision.
	 */
	public deleteRootsLastTouchedByRevision(revision: RevisionTag): void {
		const entries = this.latestRelevantRevisionToFields.get(revision);
		if (entries === undefined) {
			return;
		}

		this.#undoLog?.push(
			restoreMapOrder(this.latestRelevantRevisionToFields, revision, entries),
		);
		this.latestRelevantRevisionToFields.delete(revision);
		for (const detachedNodeId of entries.values()) {
			const found = this.#deleteFromNestedMap(
				this.detachedNodeToField,
				detachedNodeId.major,
				detachedNodeId.minor,
			);
			assert(found, 0x9ba /* Unable to delete unknown entry */);
		}
	}

	public deleteEntry(nodeId: Delta.DetachedNodeId): void {
		const entry = tryGetFromNestedMap(this.detachedNodeToField, nodeId.major, nodeId.minor);
		assert(entry !== undefined, 0x9bb /* Unable to delete unknown entry */);
		this.#deleteFromNestedMap(this.detachedNodeToField, nodeId.major, nodeId.minor);
		this.#deleteFromNestedMap(
			this.latestRelevantRevisionToFields,
			entry.latestRelevantRevision,
			entry.root,
		);
	}

	/**
	 * Associates the DetachedNodeId with a field key and creates an entry for it in the index.
	 * @param nodeId - The ID of the detached node.
	 * @param revision - The revision that last detached the root.
	 * See {@link DetachedField.latestRelevantRevision} for details.
	 * @param count - The number of entries to create. These entries will have consecutive minor IDs.
	 * @returns The atomic ID that the `DetachedFieldIndex` uses to uniquely identify the first root.
	 */
	public createEntry(
		nodeId?: Delta.DetachedNodeId,
		revision?: RevisionTag,
		count: number = 1,
	): ForestRootId {
		const root = this.rootIdAllocator.allocate(count);
		if (nodeId !== undefined) {
			for (let i = 0; i < count; i++) {
				assert(
					tryGetFromNestedMap(this.detachedNodeToField, nodeId.major, nodeId.minor + i) ===
						undefined,
					0x7ce /* Detached node ID already exists in index */,
				);
				this.#setInNestedMap(this.detachedNodeToField, nodeId.major, nodeId.minor + i, {
					root: brand<ForestRootId>(root + i),
					latestRelevantRevision: revision,
				});
				this.#setInNestedMap(this.latestRelevantRevisionToFields, revision, root + i, {
					major: nodeId.major,
					minor: nodeId.minor + i,
				});
			}
		}
		return root;
	}

	/**
	 * Updates the latest revision that is relevant to the provided root
	 */
	public updateLatestRevision(
		id: Delta.DetachedNodeId,
		revision: RevisionTag | undefined,
	): void {
		const fieldEntry = tryGetFromNestedMap(this.detachedNodeToField, id.major, id.minor);
		assert(
			fieldEntry !== undefined,
			0x9bc /* detached node id does not exist in the detached field index */,
		);
		const { root, latestRelevantRevision: previousRevision } = fieldEntry;

		// remove this root from the set of roots for the previous latest revision
		this.#deleteFromNestedMap(this.latestRelevantRevisionToFields, previousRevision, root);

		// add this root to the set of roots for the new latest revision
		this.#setInNestedMap(this.latestRelevantRevisionToFields, revision, root, id);
		this.#setInNestedMap(this.detachedNodeToField, id.major, id.minor, {
			root,
			latestRelevantRevision: revision,
		});
	}

	public getSummaryData(): DetachedFieldSummaryData {
		return {
			data: this.detachedNodeToField,
			maxId: this.rootIdAllocator.getMaxId(),
		};
	}

	/**
	 * Loads the tree index from summary data, this overrides any existing data.
	 */
	public loadData(detachedFieldIndex: DetachedFieldSummaryData): void {
		this.#recordWholeIndexChange();
		this.rootIdAllocator = idAllocatorFromMaxId(
			detachedFieldIndex.maxId,
		) as IdAllocator<ForestRootId>;

		this.detachedNodeToField = new Map();
		this.latestRelevantRevisionToFields = new Map();
		this.isFullyLoaded = false;
		const rootMap = new Map<ForestRootId, Delta.DetachedNodeId>();
		forEachInNestedMap(detachedFieldIndex.data, ({ root }, major, minor) => {
			setInNestedMap(this.detachedNodeToField, major, minor, { root });
			rootMap.set(root, { major, minor });
		});

		this.latestRelevantRevisionToFields.set(undefined, rootMap);
	}

	/**
	 * Sets the latest relevant revision for any roots that have an undefined latest relevant revision.
	 * This occurs when the detached field index is loaded from a summary and can only be called once after
	 * the summary has been loaded.
	 */
	public setRevisionsForLoadedData(latestRevision: RevisionTag): void {
		assert(
			!this.isFullyLoaded,
			0x9bd /* revisions should only be set once using this function after loading data from a summary */,
		);
		this.#recordWholeIndexChange();

		const newDetachedNodeToField: NestedMap<Major, Minor, DetachedField> = new Map();
		const rootMap = new Map();
		forEachInNestedMap(this.detachedNodeToField, ({ root }, major, minor) => {
			setInNestedMap(newDetachedNodeToField, major, minor, {
				root,
				latestRelevantRevision: latestRevision,
			});
			rootMap.set(root, { major, minor });
		});

		this.detachedNodeToField = newDetachedNodeToField;
		this.latestRelevantRevisionToFields.delete(undefined);
		this.latestRelevantRevisionToFields.set(latestRevision, rootMap);
		this.isFullyLoaded = true;
	}
}

/**
 * Returns a function which puts `inner` back under `key` in `map`, at the position `key` has now,
 * for undoing the removal of `key` from `map` after this is called.
 */
function restoreMapOrder<K, V>(map: Map<K, V>, key: K, inner: V): () => void {
	const keys = [...map.keys()];
	return () => {
		const current = new Map(map);
		map.clear();
		for (const k of keys) {
			map.set(k, k === key ? inner : (current.get(k) as V));
		}
	};
}
