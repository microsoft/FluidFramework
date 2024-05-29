/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";

import { ICodecOptions, IJsonCodec, noopValidator } from "../../codec/index.js";
import {
	Brand,
	IdAllocator,
	JsonCompatibleReadOnly,
	NestedMap,
	brand,
	deleteFromNestedMap,
	fail,
	forEachInNestedMap,
	getOrAddInMap,
	idAllocatorFromMaxId,
	populateNestedMap,
	setInNestedMap,
	tryGetFromNestedMap,
} from "../../util/index.js";
import { RevisionTag, RevisionTagCodec } from "../rebase/index.js";
import { FieldKey } from "../schema-stored/index.js";

import * as Delta from "./delta.js";
import { makeDetachedNodeToFieldCodec } from "./detachedFieldIndexCodec.js";
import { Format } from "./detachedFieldIndexFormat.js";
import { DetachedFieldSummaryData, Major, Minor } from "./detachedFieldIndexTypes.js";

/**
 * ID used to create a detached field key for a removed subtree.
 *
 * TODO: Move to Forest once forests can support multiple roots.
 * @internal
 */
export type ForestRootId = Brand<number, "tree.ForestRootId">;

/**
 * The tree index records detached field IDs and associates them with a change atom ID.
 */
export class DetachedFieldIndex {
	/**
	 * A mapping from detached node ids to forest root ids and the revision that last created or modified the root.
	 *
	 * @remarks
	 * The latest relevant revision is only undefined in the case where the detached field index is loaded from a summary
	 * and {@link setRevisionsForLoadedData} has yet to be called
	 */
	private detachedNodeToField: NestedMap<
		Major,
		Minor,
		{ root: ForestRootId; latestRelevantRevision: RevisionTag | undefined }
	> = new Map();
	/**
	 * A map between revisions and all roots for which the revision is the latest relevant revision.
	 *
	 * @remarks
	 * The revision is only undefined in the case where the detached field index is loaded from a summary
	 * and {@link setRevisionsForLoadedData} has yet to be called
	 */
	private latestRelevantRevisionToFields: Map<
		RevisionTag | undefined,
		Map<ForestRootId, Delta.DetachedNodeId>
	> = new Map();

	private readonly codec: IJsonCodec<DetachedFieldSummaryData, Format>;
	private readonly options: ICodecOptions;

	/**
	 * @param name - A name for the index, used as a prefix for the generated field keys.
	 * @param rootIdAllocator - An ID allocator used to generate unique field keys.
	 */
	public constructor(
		private readonly name: string,
		private rootIdAllocator: IdAllocator<ForestRootId>,
		private readonly revisionTagCodec: RevisionTagCodec,
		options?: ICodecOptions,
	) {
		this.options = options ?? { jsonValidator: noopValidator };
		this.codec = makeDetachedNodeToFieldCodec(revisionTagCodec, this.options);
	}

	public clone(): DetachedFieldIndex {
		const clone = new DetachedFieldIndex(
			this.name,
			idAllocatorFromMaxId(this.rootIdAllocator.getMaxId()) as IdAllocator<ForestRootId>,
			this.revisionTagCodec,
			this.options,
		);
		populateNestedMap(this.detachedNodeToField, clone.detachedNodeToField, true);
		this.latestRelevantRevisionToFields.forEach((set, key) =>
			clone.latestRelevantRevisionToFields.set(key, new Map(set)),
		);
		return clone;
	}

	public *entries(): Generator<{ root: ForestRootId } & { id: Delta.DetachedNodeId }> {
		for (const [major, innerMap] of this.detachedNodeToField) {
			if (major !== undefined) {
				for (const [minor, { root }] of innerMap) {
					yield { id: { major, minor }, root };
				}
			} else {
				for (const [minor, { root }] of innerMap) {
					yield { id: { minor }, root };
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
					this.latestRelevantRevisionToFields
						.get(entry.latestRelevantRevision)
						?.set(entry.root, { major: updated, minor });
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
	 * Returns all entries last created or used by the given revision.
	 */
	public getLatestRelevantRoots(revision: RevisionTag): ForestRootId[] {
		return Array.from(this.latestRelevantRevisionToFields.get(revision)?.keys() ?? []);
	}

	/**
	 * Returns all entries created by the given revision.
	 */
	public getRoots(revision: RevisionTag): ForestRootId[] {
		return Array.from(this.detachedNodeToField.get(revision)?.values() ?? []).map(
			({ root }) => root,
		);
	}

	/**
	 * Removes all entries created by the given revision, no matter what their latest
	 * relevant revision is.
	 */
	public deleteRoots(revision: RevisionTag): void {
		const entries = this.detachedNodeToField.get(revision);
		assert(entries !== undefined, "no entries created by the given revision");
		for (const [_, { root, latestRelevantRevision }] of entries.entries()) {
			this.deleteRootFromLatestRelevantRevisionsMap(root, latestRelevantRevision);
		}
		this.detachedNodeToField.delete(revision);
	}

	/**
	 * Removes all entries last created or used by the given revision.
	 */
	public deleteLatestRelevantRoots(revision: RevisionTag): void {
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
			assert(found, "Unable to delete unknown entry");
		}
	}

	public deleteEntry(nodeId: Delta.DetachedNodeId): void {
		const errorMessage = "Unable to delete unknown entry";
		const { root, latestRelevantRevision } =
			tryGetFromNestedMap(this.detachedNodeToField, nodeId.major, nodeId.minor) ??
			fail(errorMessage);
		assert(
			deleteFromNestedMap(this.detachedNodeToField, nodeId.major, nodeId.minor),
			errorMessage,
		);
		this.deleteRootFromLatestRelevantRevisionsMap(root, latestRelevantRevision);
	}

	private deleteRootFromLatestRelevantRevisionsMap(
		root: ForestRootId,
		latestRelevantRevision: RevisionTag | undefined,
	): void {
		const revisionRoots =
			this.latestRelevantRevisionToFields.get(latestRelevantRevision) ??
			fail("Unable to delete unknown entry");
		revisionRoots.delete(root);
		if (revisionRoots.size === 0) {
			this.latestRelevantRevisionToFields.delete(latestRelevantRevision);
		}
	}

	/**
	 * Associates the DetachedNodeId with a field key and creates an entry for it in the index.
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
					tryGetFromNestedMap(
						this.detachedNodeToField,
						nodeId.major,
						nodeId.minor + i,
					) === undefined,
					0x7ce /* Detached node ID already exists in index */,
				);
				setInNestedMap(this.detachedNodeToField, nodeId.major, nodeId.minor + i, {
					root: root + i,
					latestRelevantRevision: revision,
				});
				this.updateLatestRevision(
					{ major: nodeId.major, minor: nodeId.minor + i },
					revision,
				);
			}
		}
		return root;
	}

	/**
	 * Updates the latest revision that is relevant to the provided root
	 */
	public updateLatestRevision(id: Delta.DetachedNodeId, revision: RevisionTag | undefined): void {
		const fieldEntry =
			tryGetFromNestedMap(this.detachedNodeToField, id.major, id.minor) ??
			fail("detached node id does not exist in the detached field index");
		const { root, latestRelevantRevision: previousRevision } = fieldEntry;

		// remove this root from the set of roots for the previous latest revision
		const previousRevisionRoots = this.latestRelevantRevisionToFields.get(previousRevision);
		if (previousRevisionRoots !== undefined) {
			previousRevisionRoots.delete(root);
			if (previousRevisionRoots?.size === 0) {
				this.latestRelevantRevisionToFields.delete(previousRevision);
			}
		}

		// add this root from the set of roots for the new latest revision
		const latestRevisionRoots = getOrAddInMap(
			this.latestRelevantRevisionToFields,
			revision,
			new Map(),
		);
		latestRevisionRoots.set(root, id);
		fieldEntry.latestRelevantRevision = revision;
	}

	public encode(): JsonCompatibleReadOnly {
		const data: NestedMap<Major, Minor, ForestRootId> = new Map();
		forEachInNestedMap(this.detachedNodeToField, ({ root }, major, minor) => {
			setInNestedMap(data, major, minor, root);
		});
		return this.codec.encode({
			data,
			maxId: this.rootIdAllocator.getMaxId(),
		}) as JsonCompatibleReadOnly;
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
		const rootMap = new Map<ForestRootId, Delta.DetachedNodeId>();
		forEachInNestedMap(detachedFieldIndex.data, (root, major, minor) => {
			setInNestedMap(this.detachedNodeToField, major, minor, {
				root,
				latestRelevantRevision: undefined,
			});
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
		// todo throw if already called

		const rootMap = new Map();
		forEachInNestedMap(this.detachedNodeToField, (entry, major, minor) => {
			if (entry.latestRelevantRevision === undefined) {
				entry.latestRelevantRevision = latestRevision;
				rootMap.set(entry.root, { major, minor });
			}
		});

		// todo do we care enough to validate the entries in here?
		this.latestRelevantRevisionToFields.delete(undefined);
		this.latestRelevantRevisionToFields.set(latestRevision, rootMap);
	}

	/**
	 * copies the data from another index into this index
	 */
	public loadIndex(index: DetachedFieldIndex): void {
		this.rootIdAllocator = idAllocatorFromMaxId(
			index.rootIdAllocator.getMaxId(),
		) as IdAllocator<ForestRootId>;

		this.detachedNodeToField = new Map();
		populateNestedMap(index.detachedNodeToField, this.detachedNodeToField, true);
		this.latestRelevantRevisionToFields = new Map();
		index.latestRelevantRevisionToFields.forEach((innerMap, key) => {
			const newInner = new Map();
			innerMap.forEach(({ major, minor }, root) => {
				newInner.set(root, { major, minor });
			});
			this.latestRelevantRevisionToFields.set(key, newInner);
		});
	}
}
