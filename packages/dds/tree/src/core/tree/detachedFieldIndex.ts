/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";
import { ICodecOptions, IJsonCodec, noopValidator } from "../../codec/index.js";
import {
	Brand,
	IdAllocator,
	JsonCompatibleReadOnly,
	brand,
	idAllocatorFromMaxId,
	populateNestedRangeMap,
	type IRange,
	type NestedRangeMap,
	tryGetFromNestedRangeMap,
	deleteFromNestedRangeMap,
	getFromRangeMap,
	setInRangeMap,
	setInNestedRangeMap,
} from "../../util/index.js";
import { RevisionTagCodec } from "../rebase/index.js";
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
	// TODO: don't store the field key in the index, it can be derived from the root ID
	// private detachedNodeToField: NestedMap<Major, Minor, ForestRootId> = new Map();
	private detachedNodeToField: NestedRangeMap<Major, ForestRootId> = new Map();
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
		populateNestedRangeMap(this.detachedNodeToField, clone.detachedNodeToField);
		return clone;
	}

	public *entries(): Generator<{ root: ForestRootId } & { rangeId: Delta.DetachedNodeRangeId }> {
		for (const [major, innerMap] of this.detachedNodeToField) {
			if (major !== undefined) {
				for (const entry of innerMap) {
					const minor: IRange = { start: entry.start, length: entry.length };
					yield { rangeId: { major, minor }, root: entry.value };
				}
			} else {
				for (const entry of innerMap) {
					const minor: IRange = { start: entry.start, length: entry.length };
					yield { rangeId: { minor }, root: entry.value };
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
				for (const entry of innerCurrent) {
					// TODO: need to think of updating rangeEntry
					assert(
						getFromRangeMap(innerCurrent, entry.start, entry.length)?.value ===
							undefined,
						0x7a9 /* Collision during index update */,
					);
					setInRangeMap(innerUpdated, entry.start, entry.length, entry.value);
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
	public tryGetEntry(
		id: Delta.DetachedNodeRangeId | Delta.DetachedNodeId,
	): ForestRootId | undefined {
		const rangeId = Delta.convertToRangeId(id) as Delta.DetachedNodeRangeId;
		return tryGetFromNestedRangeMap(
			this.detachedNodeToField,
			rangeId.major,
			rangeId.minor.start,
			rangeId.minor.length,
		)?.value;
	}

	/**
	 * Returns the FieldKey associated with the given id.
	 * Fails if no such id is known to the index.
	 */
	public getEntry(id: Delta.DetachedNodeRangeId | Delta.DetachedNodeId): ForestRootId {
		const key = this.tryGetEntry(id);
		assert(key !== undefined, 0x7aa /* Unknown removed node ID */);
		return key;
	}

	public deleteEntry(id: Delta.DetachedNodeRangeId | Delta.DetachedNodeId): void {
		const rangeId = Delta.convertToRangeId(id) as Delta.DetachedNodeRangeId;
		const found = deleteFromNestedRangeMap(
			this.detachedNodeToField,
			rangeId.major,
			rangeId.minor.start,
			rangeId.minor.length,
		);
		assert(found, 0x7ab /* Unable to delete unknown entry */);
	}

	/**
	 * Associates the DetachedNodeId with a field key and creates an entry for it in the index.
	 */
	public createEntry(id?: Delta.DetachedNodeRangeId | Delta.DetachedNodeId): ForestRootId {
		const rangeId = Delta.convertToRangeId(id);
		const count = rangeId?.minor.length ?? 1;
		const root = this.rootIdAllocator.allocate(count);
		// const root = this.rootIdAllocator.allocate(nodeRangeId?.major, (nodeRangeId?.minor.start ?? 0) as ChangesetLocalId, nodeRangeId?.minor.length);
		if (rangeId !== undefined) {
			assert(
				tryGetFromNestedRangeMap(
					this.detachedNodeToField,
					rangeId.major,
					rangeId.minor.start,
					count,
				)?.value === undefined,
				0x7ce /* Detached node ID already exists in index */,
			);
			setInNestedRangeMap(
				this.detachedNodeToField,
				rangeId.major,
				rangeId.minor.start,
				count,
				root,
			);
		}
		return root;
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
