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
	private detachedNodeToField: NestedMap<Major, Minor, ForestRootId> = new Map();
	private readonly detachedFieldToRevision: Map<ForestRootId, Major> = new Map();
	private readonly revisionToDetachedFields: Map<Major, Set<ForestRootId>> = new Map();
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
		return clone;
	}

	public *entries(): Generator<{ root: ForestRootId } & { id: Delta.DetachedNodeId }> {
		for (const [major, innerMap] of this.detachedNodeToField) {
			if (major !== undefined) {
				for (const [minor, entry] of innerMap) {
					yield { id: { major, minor }, root: entry };
				}
			} else {
				for (const [minor, entry] of innerMap) {
					yield { id: { minor }, root: entry };
				}
			}
		}
	}

	/**
	 * Removes all entries from the index.
	 */
	public purge() {
		this.detachedNodeToField.clear();
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
					assert(
						innerUpdated.get(minor) === undefined,
						0x7a9 /* Collision during index update */,
					);
					innerUpdated.set(minor, entry);
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
		return tryGetFromNestedMap(this.detachedNodeToField, id.major, id.minor);
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
	 * Returns all entries associated with the given revision.
	 */
	public getRoots(revision: Major): ForestRootId[] {
		return Array.from(this.detachedNodeToField.get(revision)?.values() ?? []);
	}

	/**
	 * Removes all entries associated with the given revision.
	 */
	public deleteRevision(revision: Major) {
		this.detachedNodeToField.delete(revision);
	}

	public deleteEntry(nodeId: Delta.DetachedNodeId): void {
		const found = deleteFromNestedMap(this.detachedNodeToField, nodeId.major, nodeId.minor);
		assert(found, 0x7ab /* Unable to delete unknown entry */);
	}

	/**
	 * Associates the DetachedNodeId with a field key and creates an entry for it in the index.
	 */
	public createEntry(nodeId?: Delta.DetachedNodeId, count: number = 1): ForestRootId {
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
				setInNestedMap(this.detachedNodeToField, nodeId.major, nodeId.minor + i, root + i);
			}
		}
		return root;
	}

	/**
	 * Updates the latest revision that is relevant to the provided root
	 */
	public updateLatestRevision(root: ForestRootId, revision: RevisionTag | undefined) {
		const previousRevision = this.detachedFieldToRevision.get(root);

		// If there is a previous revision, remove this root from its set of roots
		if (previousRevision !== undefined) {
			const previousRevisionRoots = this.revisionToDetachedFields.get(previousRevision);
			previousRevisionRoots?.delete(root);
			if (previousRevisionRoots?.size === 0) {
				this.revisionToDetachedFields.delete(previousRevision);
			}
		}

		const latestRevisionRoots = getOrAddInMap(
			this.revisionToDetachedFields,
			revision,
			new Set(),
		);
		latestRevisionRoots.add(root);
		this.detachedFieldToRevision.set(root, revision);
	}

	public encode(): JsonCompatibleReadOnly {
		return this.codec.encode({
			data: this.detachedNodeToField,
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
		this.detachedNodeToField = detachedFieldIndex.data;
	}
}
