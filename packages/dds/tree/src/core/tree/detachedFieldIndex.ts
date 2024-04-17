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
	deleteFromRangeMap,
	idAllocatorFromMaxId,
	setInRangeMap,
	type RangeMap,
	mergeRangesWithinMap,
	getFirstEntryFromRangeMap,
	getAllValidEntriesFromMap,
	getFromRangeMap,
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
	// The data structure designed to store a `contiguous` range of detached nodes sharing the same root.
	private readonly detachedNodeRangeMap: Map<Major, RangeMap<ForestRootId>> = new Map();
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
		// populate the rangeMap of detached nodes
		for (const [major, innerRangeMap] of this.detachedNodeRangeMap) {
			const clonedRangeMap: RangeMap<ForestRootId> = [];
			for (const rangeEntry of innerRangeMap) {
				clonedRangeMap.push({ ...rangeEntry });
			}
			clone.detachedNodeRangeMap.set(major, clonedRangeMap);
		}
		return clone;
	}

	/**
	 * Returns the atomic detached node id instead of ranges
	 */
	public *entries(): Generator<{ root: ForestRootId } & { id: Delta.DetachedNodeId }> {
		for (const [major, innerRangeMap] of this.detachedNodeRangeMap) {
			for (const rangeEntry of innerRangeMap) {
				const id =
					major !== undefined
						? { major, minor: rangeEntry.start }
						: { minor: rangeEntry.start };
				for (let offset = 0; offset < rangeEntry.length; offset++) {
					yield { id: { ...id, minor: id.minor + offset }, root: rangeEntry.value };
				}
			}
		}
	}

	/**
	 * Removes all entries from the index.
	 */
	public purge() {
		// this.detachedNodeToField.clear();
		this.detachedNodeRangeMap.clear();
	}

	public updateMajor(current: Major, updated: Major) {
		const innerRangeMap = this.detachedNodeRangeMap.get(current);
		if (innerRangeMap !== undefined) {
			this.detachedNodeRangeMap.delete(current);
			const updatedRangeMap = this.detachedNodeRangeMap.get(updated);
			if (updatedRangeMap === undefined) {
				this.detachedNodeRangeMap.set(updated, innerRangeMap);
			} else {
				for (const rangeEntry of innerRangeMap) {
					const { start, length, value } = rangeEntry;
					setInRangeMap(updatedRangeMap, start, length, value);
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
		const innerRangeMap = this.detachedNodeRangeMap.get(id.major);
		if (innerRangeMap !== undefined) {
			return getFromRangeMap(innerRangeMap, id.minor, 1).value;
		}
		return undefined;
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

	public deleteEntry(nodeId: Delta.DetachedNodeId, count: number = 1): void {
		if (this.detachedNodeRangeMap.has(nodeId.major)) {
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			const innerRangeMap = this.detachedNodeRangeMap.get(nodeId.major)!;
			const found = deleteFromRangeMap(innerRangeMap, nodeId.minor, count);
			assert(found, "Unable to delete an unexisting range");
		}
	}

	/**
	 * Associates the DetachedNodeId with a field key and creates an entry for it in the index.
	 */
	public createEntry(nodeId?: Delta.DetachedNodeId, count: number = 1): ForestRootId {
		const root = this.rootIdAllocator.allocate(count);
		if (nodeId !== undefined) {
			this.setDetachedNodeRange(nodeId, count, root);
		}
		return root;
	}

	private setDetachedNodeRange(
		nodeId: Delta.DetachedNodeId,
		count: number,
		root: ForestRootId,
	): void {
		if (!this.detachedNodeRangeMap.has(nodeId.major)) {
			this.detachedNodeRangeMap.set(nodeId.major, []);
		}
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		const innerRangeMap = this.detachedNodeRangeMap.get(nodeId.major)!;
		assert(
			getFirstEntryFromRangeMap(innerRangeMap, nodeId.minor, count) === undefined,
			"The detached node range already exists in the map",
		);
		setInRangeMap(innerRangeMap, nodeId.minor, count, root);
	}

	/**
	 * Given a query range, find and group all detached nodes within the range according to the following rules:
	 *
	 * 1. If a range entry overlaps with the query range, store the overlapping portion as a new range in the result.
	 * 2. If there is an "empty" space between two consecutive range entries, store the range between the end
	 * of the first entry and the start of the second entry as a new range with an undefined value.
	 *
	 * The function only returns the length and value (root) of the range entry. Since consecutive ranges without gaps
	 * are always returned, there's no need to include the start points of the ranges.
	 */
	public getAllDetachedNodeRanges(
		nodeId: Delta.DetachedNodeId,
		count: number,
	): { length: number; root?: ForestRootId }[] {
		const innerRangeMap = this.detachedNodeRangeMap.get(nodeId.major);
		if (!innerRangeMap) {
			return [{ length: count }];
		}

		const results = [];
		let currentPos = nodeId.minor;
		const validRanges = getAllValidEntriesFromMap(innerRangeMap, nodeId.minor, count);
		for (const range of validRanges) {
			if (currentPos < range.start) {
				results.push({
					length: range.start - currentPos,
				});
			}
			results.push({ length: range.length, root: range.value });
			currentPos = range.start + range.length;
		}

		if (currentPos < nodeId.minor + count) {
			results.push({
				length: nodeId.minor + count - currentPos,
			});
		}
		return results;
	}

	public encode(): JsonCompatibleReadOnly {
		// Since currently the codec only accepts the original NestedMap format data, so break the
		// detached node ranges atomically into single nodeIds, and build a NestedMap from them.
		const detachedNodeToField: NestedMap<Major, Minor, ForestRootId> = new Map();
		for (const [major, rangeMap] of this.detachedNodeRangeMap) {
			const innerMap = new Map();
			for (const rangeEntry of rangeMap) {
				for (let offset = 0; offset < rangeEntry.length; offset++) {
					innerMap.set(rangeEntry.start + offset, rangeEntry.value);
				}
			}
			if (innerMap.size > 0) {
				detachedNodeToField.set(major, innerMap);
			}
		}

		return this.codec.encode({
			data: detachedNodeToField,
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

		// Build the rangeMap for detached nodes according to the nestedMap
		for (const [major, innerMap] of detachedFieldIndex.data) {
			const innerRangeMap = [];
			for (const [minor, entry] of innerMap) {
				innerRangeMap.push({ start: minor, length: 1, value: entry });
			}
			this.detachedNodeRangeMap.set(major, mergeRangesWithinMap(innerRangeMap));
		}
	}
}
