/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";

import { type ICodecOptions, type IJsonCodec, noopValidator } from "../../codec/index.js";
import {
	type IdAllocator,
	type JsonCompatibleReadOnly,
	type NestedMap,
	brand,
	deleteFromNestedMap,
	forEachInNestedMap,
	idAllocatorFromMaxId,
	populateNestedMap,
	setInNestedMap,
	tryGetFromNestedMap,
} from "../../util/index.js";
import type { RevisionTag, RevisionTagCodec } from "../rebase/index.js";
import type { FieldKey } from "../schema-stored/index.js";

import type * as Delta from "./delta.js";
import { makeDetachedNodeToFieldCodec } from "./detachedFieldIndexCodec.js";
import type { Format } from "./detachedFieldIndexFormat.js";
import type {
	DetachedField,
	DetachedFieldSummaryData,
	ForestRootId,
	Major,
	Minor,
} from "./detachedFieldIndexTypes.js";
import type { IIdCompressor } from "@fluidframework/id-compressor";

/**
 * The tree index records detached field IDs and associates them with a change atom ID.
 */
export class DetachedFieldIndex {
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

	private readonly codec: IJsonCodec<DetachedFieldSummaryData, Format>;
	private readonly options: ICodecOptions;

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
	 * @param name - A name for the index, used as a prefix for the generated field keys.
	 * @param rootIdAllocator - An ID allocator used to generate unique field keys.
	 */
	public constructor(
		private readonly name: string,
		private rootIdAllocator: IdAllocator<ForestRootId>,
		private readonly revisionTagCodec: RevisionTagCodec,
		private readonly idCompressor: IIdCompressor,
		options?: ICodecOptions,
	) {
		this.options = options ?? { jsonValidator: noopValidator };
		this.codec = makeDetachedNodeToFieldCodec(revisionTagCodec, this.options, idCompressor);
	}

	public clone(): DetachedFieldIndex {
		const clone = new DetachedFieldIndex(
			this.name,
			idAllocatorFromMaxId(this.rootIdAllocator.getMaxId()) as IdAllocator<ForestRootId>,
			this.revisionTagCodec,
			this.idCompressor,
			this.options,
		);
		populateNestedMap(this.detachedNodeToField, clone.detachedNodeToField, true);
		populateNestedMap(
			this.latestRelevantRevisionToFields,
			clone.latestRelevantRevisionToFields,
			true,
		);
		return clone;
	}

	public *entries(): Generator<{
		root: ForestRootId;
		latestRelevantRevision?: RevisionTag;
		id: Delta.DetachedNodeId;
	}> {
		for (const [major, innerMap] of this.detachedNodeToField) {
			if (major !== undefined) {
				for (const [minor, { root, latestRelevantRevision }] of innerMap) {
					yield latestRelevantRevision !== undefined
						? { id: { major, minor }, root, latestRelevantRevision }
						: { id: { major, minor }, root };
				}
			} else {
				for (const [minor, { root, latestRelevantRevision }] of innerMap) {
					yield latestRelevantRevision !== undefined
						? { id: { minor }, root, latestRelevantRevision }
						: { id: { minor }, root };
				}
			}
		}
	}

	/**
	 * Removes all entries from the index.
	 */
	public purge(): void {
		this.detachedNodeToField.clear();
		this.latestRelevantRevisionToFields.clear();
	}

	public updateMajor(current: Major, updated: Major): void {
		// Update latestRelevantRevision information corresponding to `current`
		{
			const inner = this.latestRelevantRevisionToFields.get(current);
			if (inner !== undefined) {
				for (const nodeId of inner.values()) {
					const entry = tryGetFromNestedMap(
						this.detachedNodeToField,
						nodeId.major,
						nodeId.minor,
					);
					assert(
						entry !== undefined,
						0x9b8 /* Inconsistent data: missing detached node entry */,
					);
					setInNestedMap(this.detachedNodeToField, nodeId.major, nodeId.minor, {
						...entry,
						latestRelevantRevision: updated,
					});
				}
				this.latestRelevantRevisionToFields.delete(current);

				const updatedInner = this.latestRelevantRevisionToFields.get(updated);
				if (updatedInner !== undefined) {
					for (const [root, nodeId] of inner) {
						updatedInner.set(root, nodeId);
					}
				} else {
					this.latestRelevantRevisionToFields.set(updated, inner);
				}
			}
		}

		// Update the major keys corresponding to `current`
		{
			const innerCurrent = this.detachedNodeToField.get(current);
			if (innerCurrent !== undefined) {
				this.detachedNodeToField.delete(current);
				const innerUpdated = this.detachedNodeToField.get(updated);
				if (innerUpdated === undefined) {
					this.detachedNodeToField.set(updated, innerCurrent);
				} else {
					for (const [minor, entry] of innerCurrent) {
						assert(
							innerUpdated.get(minor) === undefined,
							0x7a9 /* Collision during index update */,
						);
						innerUpdated.set(minor, entry);
					}
				}

				for (const [minor, entry] of innerCurrent) {
					const entryInLatest = this.latestRelevantRevisionToFields.get(
						entry.latestRelevantRevision,
					);
					assert(
						entryInLatest !== undefined,
						0x9b9 /* Inconsistent data: missing node entry in latestRelevantRevision */,
					);
					entryInLatest.set(entry.root, { major: updated, minor });
				}
			}
		}
	}

	/**
	 * Returns a field key for the given ID.
	 * This does not save the field key on the index. To do so, call {@link createEntry}.
	 */
	public toFieldKey(id: ForestRootId): FieldKey {
		return brand(`${this.name}-${id}`);
	}

	/**
	 * Returns the FieldKey associated with the given id.
	 * Returns undefined if no such id is known to the index.
	 */
	public tryGetEntry(id: Delta.DetachedNodeId): ForestRootId | undefined {
		return tryGetFromNestedMap(this.detachedNodeToField, id.major, id.minor)?.root;
	}

	/**
	 * Returns the FieldKey associated with the given id.
	 * Fails if no such id is known to the index.
	 */
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

		this.latestRelevantRevisionToFields.delete(revision);
		for (const detachedNodeId of entries.values()) {
			const found = deleteFromNestedMap(
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
		deleteFromNestedMap(this.detachedNodeToField, nodeId.major, nodeId.minor);
		deleteFromNestedMap(
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
				setInNestedMap(this.detachedNodeToField, nodeId.major, nodeId.minor + i, {
					root: brand<ForestRootId>(root + i),
					latestRelevantRevision: revision,
				});
				setInNestedMap(this.latestRelevantRevisionToFields, revision, root, nodeId);
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
		deleteFromNestedMap(this.latestRelevantRevisionToFields, previousRevision, root);

		// add this root to the set of roots for the new latest revision
		setInNestedMap(this.latestRelevantRevisionToFields, revision, root, id);
		setInNestedMap(this.detachedNodeToField, id.major, id.minor, {
			root,
			latestRelevantRevision: revision,
		});
	}

	public encode(): JsonCompatibleReadOnly {
		return this.codec.encode({
			data: this.detachedNodeToField,
			maxId: this.rootIdAllocator.getMaxId(),
		});
	}

	/**
	 * Loads the tree index from the given string, this overrides any existing data.
	 */
	public loadData(data: JsonCompatibleReadOnly): void {
		const detachedFieldIndex: DetachedFieldSummaryData = this.codec.decode(data as Format);

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
