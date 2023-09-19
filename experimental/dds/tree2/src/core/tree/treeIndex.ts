/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";
import {
	IGarbageCollectionData,
	ISummaryTreeWithStats,
	ITelemetryContext,
} from "@fluidframework/runtime-definitions";
import { createSingleBlobSummary } from "@fluidframework/shared-object-base";
import { IChannelStorageService } from "@fluidframework/datastore-definitions";
import { bufferToString } from "@fluid-internal/client-utils";
import {
	Brand,
	IdAllocator,
	NestedMap,
	brand,
	decodeNestedMap,
	deleteFromNestedMap,
	encodeNestedMap,
	populateNestedMap,
	setInNestedMap,
	tryGetFromNestedMap,
} from "../../util";
import { FieldKey } from "../schema-stored";
import {
	Summarizable,
	SummaryElementParser,
	SummaryElementStringifier,
} from "../../shared-tree-core";
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
 * The tree index records detached field ids and associates them with a change atom ID.
 */
export class TreeIndex {
	private detachedNodeToField: NestedMap<Major, Minor, Entry> = new Map<
		Major,
		Map<Minor, Entry>
	>();

	public constructor(
		private readonly name: string,
		private readonly rootIdAllocator: IdAllocator<ForestRootId>,
	) {}

	public clone(): TreeIndex {
		const clone = new TreeIndex(this.name, this.rootIdAllocator);
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
		const entry = tryGetFromNestedMap(this.detachedNodeToField, id.major, id.minor);
		// console.log(this.tag, "tryGetEntry", id.major, id.minor, entry);
		return entry;
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
		// console.log(this.tag, "deleteEntry", nodeId.major, nodeId.minor);
		const found = deleteFromNestedMap(this.detachedNodeToField, nodeId.major, nodeId.minor);
		assert(found, "Unable to delete unknown entry");
	}

	/**
	 * Associates the DetachedNodeId with a field key and creates an entry for it in the index.
	 */
	public createEntry(nodeId?: Delta.DetachedNodeId, count: number = 1): Entry {
		const root = this.rootIdAllocator(count);
		const field = this.toFieldKey(root);
		const entry = { field, root };

		if (nodeId !== undefined) {
			// console.log(this.tag, "createEntry", nodeId.major, nodeId.minor, entry);
			setInNestedMap(this.detachedNodeToField, nodeId.major, nodeId.minor, entry);
		}
		return entry;
	}

	public encode(): string {
		return encodeNestedMap(this.detachedNodeToField);
	}

	/**
	 * Loads the tree index from the given string, this overrides any existing data.
	 */
	public loadData(data: string): void {
		this.detachedNodeToField = decodeNestedMap(data);
	}
}

/**
 * The storage key for the blob in the summary containing schema data
 */
const treeIndexBlobKey = "TreeIndexBlob";

/**
 * Provides methods for summarizing and loading a tree index.
 */
export class TreeIndexSummarizer implements Summarizable {
	public readonly key = "TreeIndex";

	public constructor(private readonly treeIndex: TreeIndex) {}

	public getAttachSummary(
		stringify: SummaryElementStringifier,
		fullTree?: boolean,
		trackState?: boolean,
		telemetryContext?: ITelemetryContext,
	): ISummaryTreeWithStats {
		return createSingleBlobSummary(treeIndexBlobKey, this.treeIndex.encode());
	}

	public async summarize(
		stringify: SummaryElementStringifier,
		fullTree?: boolean,
		trackState?: boolean,
		telemetryContext?: ITelemetryContext,
	): Promise<ISummaryTreeWithStats> {
		return createSingleBlobSummary(treeIndexBlobKey, this.treeIndex.encode());
	}

	public getGCData(fullGC?: boolean): IGarbageCollectionData {
		// TODO: Properly implement garbage collection. Right now, garbage collection is performed automatically
		// by the code in SharedObject (from which SharedTreeCore extends). The `runtime.uploadBlob` API delegates
		// to the `BlobManager`, which automatically populates the summary with ISummaryAttachment entries for each
		// blob.
		return {
			gcNodes: {},
		};
	}

	public async load(
		services: IChannelStorageService,
		parse: SummaryElementParser,
	): Promise<void> {
		if (await services.contains(treeIndexBlobKey)) {
			const treeIndexBuffer = await services.readBlob(treeIndexBlobKey);
			const treeBufferString = bufferToString(treeIndexBuffer, "utf8");
			this.treeIndex.loadData(treeBufferString);
		}
	}
}
