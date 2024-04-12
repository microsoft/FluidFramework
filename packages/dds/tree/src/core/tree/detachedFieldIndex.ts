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
	deleteFromRangeMap,
	idAllocatorFromMaxId,
	populateNestedMap,
	setInNestedMap,
	setInRangeMap,
	tryGetFromNestedMap,
	type RangeMap,
	mergeRangesWithinMap,
	getFirstEntryFromRangeMap,
	getAllEntriesFromMap,
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
	private detachedNodeToField: NestedMap<Major, Minor, ForestRootId> = new Map();
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
		this.detachedNodeRangeMap.clear();
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
		// Update the detached node ranges accordingly
		const currentRangeMap = this.detachedNodeRangeMap.get(current);
		if (currentRangeMap !== undefined) {
			this.detachedNodeRangeMap.delete(current);
			const updatedRangeMap = this.detachedNodeRangeMap.get(updated);
			if (updatedRangeMap === undefined) {
				this.detachedNodeRangeMap.set(updated, currentRangeMap);
			} else {
				for (const rangeEntry of currentRangeMap) {
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

	public deleteEntry(nodeId: Delta.DetachedNodeId, count: number = 1): void {
		for (let i = 0; i < count; ++i) {
			const found = deleteFromNestedMap(
				this.detachedNodeToField,
				nodeId.major,
				nodeId.minor + i,
			);
			assert(found, 0x7ab /* Unable to delete unknown entry */);
		}
		// Delete the detached node ranges accordingly
		if (this.detachedNodeRangeMap.has(nodeId.major)) {
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			const rangeMap = this.detachedNodeRangeMap.get(nodeId.major)!;
			const foundRange = deleteFromRangeMap(rangeMap, nodeId.minor, count);
			assert(foundRange, "Unable to delete an unexisting range");
		}
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
				setInNestedMap(this.detachedNodeToField, nodeId.major, nodeId.minor + i, root);
			}
			// Update the detached node ranges accordingly
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
		const rangeMap = this.detachedNodeRangeMap.get(nodeId.major)!;
		assert(
			getFirstEntryFromRangeMap(rangeMap, nodeId.minor, count) === undefined,
			"The detached node range already exists in the map",
		);
		setInRangeMap(rangeMap, nodeId.minor, count, root);
	}

	/**
	 * Given a query range, find and group all detached nodes within the range according to the following rules:
	 *
	 * 1. If a range entry overlaps with the query range, store the overlapping portion as a new range in the result.
	 * 2. If there is an "empty" space between two consecutive range entries, store the range between the end
	 * of the first entry and the start of the second entry as a new range with an undefined value.
	 */
	public getAllDetachedNodeRanges(
		nodeId: Delta.DetachedNodeId,
		count: number,
	): { root: ForestRootId | undefined; start: number; length: number }[] {
		const rangeMap = this.detachedNodeRangeMap.get(nodeId.major);
		if (!rangeMap) {
			return [];
		}

		const results = [];
		let currentPos = nodeId.minor;
		const validRanges = getAllEntriesFromMap(rangeMap, nodeId.minor, count);
		for (const range of validRanges) {
			if (currentPos < range.start) {
				results.push({
					root: undefined,
					start: currentPos,
					length: range.start - currentPos,
				});
			}
			results.push({ root: range.value, start: range.start, length: range.length });
			currentPos = range.start + range.length;
		}

		if (currentPos < nodeId.minor + count) {
			results.push({
				root: undefined,
				start: currentPos,
				length: nodeId.minor + count - currentPos,
			});
		}
		return results;
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

		// Build the detached node range accordingly
		for (const [major, innerMap] of this.detachedNodeToField) {
			const rangeEntries = [];
			for (const [minor, entry] of innerMap) {
				rangeEntries.push({ start: minor, length: 1, value: entry });
			}
			this.detachedNodeRangeMap.set(major, mergeRangesWithinMap(rangeEntries));
		}
	}
}
