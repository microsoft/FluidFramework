/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import type { IExperimentalIncrementalSummaryContext } from "@fluidframework/runtime-definitions/internal";
import {
	getOrCreateInNestedMap,
	setInNestedMap,
	tryGetFromNestedMap,
	type NestedMap,
} from "../../util/index.js";

export const incrementalFieldsTreeKey = "IncrementalFields";

function deleteOlderTrackerMaps<TValue>(
	tracker: NestedMap<number, string, TValue>,
	lastSummarySequenceNumber: number,
): void {
	tracker.forEach((_, sequenceNumber) => {
		if (sequenceNumber < lastSummarySequenceNumber) {
			tracker.delete(sequenceNumber);
		}
	});
}

export class IncrementalSummaryTracker {
	private readonly blobIdToParentIdTracker: NestedMap<number, string, string> = new Map();
	private readonly parentIdToBlobIdsTracker: NestedMap<number, string, Set<string>> =
		new Map();
	private previousSummarySequenceNumber: number | undefined;

	public trackBlob(
		blobId: string,
		parentBlobId: string,
		incrementalSummaryContext?: IExperimentalIncrementalSummaryContext,
	): void {
		const summarySequenceNumber = incrementalSummaryContext?.summarySequenceNumber ?? 0;
		setInNestedMap(this.blobIdToParentIdTracker, summarySequenceNumber, blobId, parentBlobId);
		const blobIds = getOrCreateInNestedMap(
			this.parentIdToBlobIdsTracker,
			summarySequenceNumber,
			parentBlobId,
			(sequenceNumber, parentId) => new Set(),
		);
		blobIds.add(blobId);
	}

	public getSummaryHandlePath(
		blobId: string,
		incrementalSummaryContext: IExperimentalIncrementalSummaryContext,
	): string | undefined {
		const lastSummarySequenceNumber = incrementalSummaryContext.latestSummarySequenceNumber;
		let parentBlobId = tryGetFromNestedMap(
			this.blobIdToParentIdTracker,
			lastSummarySequenceNumber,
			blobId,
		);
		let summaryHandlePath = `${incrementalFieldsTreeKey}/${blobId}`;
		while (parentBlobId !== "") {
			if (parentBlobId === undefined) {
				return undefined;
			}
			summaryHandlePath = `${incrementalFieldsTreeKey}/${parentBlobId}/${summaryHandlePath}`;
			parentBlobId = tryGetFromNestedMap(
				this.blobIdToParentIdTracker,
				lastSummarySequenceNumber,
				parentBlobId,
			);
		}
		return `${incrementalSummaryContext.summaryPath}/${summaryHandlePath}`;
	}

	public getIncrementalBlobLeafPaths(
		incrementalSummaryContext?: IExperimentalIncrementalSummaryContext,
	): string[] {
		const summarySequenceNumber = incrementalSummaryContext?.summarySequenceNumber ?? 0;
		const currentParentIdToBlobIdsMap =
			this.parentIdToBlobIdsTracker.get(summarySequenceNumber);
		assert(
			currentParentIdToBlobIdsMap !== undefined,
			"Current parentIdToBlobIdsMap should be defined",
		);

		const getChildPaths = (parentId: string, currentPath: string): string[] => {
			const childBlobIds = currentParentIdToBlobIdsMap.get(parentId);
			if (childBlobIds === undefined) {
				return [currentPath];
			}
			const childPaths: string[] = [];
			for (const childBlobId of childBlobIds) {
				const childPath = `${currentPath}/${childBlobId}`;
				childPaths.push(...getChildPaths(childBlobId, childPath));
			}
			return childPaths;
		};
		return getChildPaths("", "");
	}

	public summaryComplete(
		incrementalSummaryContext?: IExperimentalIncrementalSummaryContext,
	): void {
		const summarySequenceNumber = incrementalSummaryContext?.summarySequenceNumber ?? 0;
		const currentBlobIdToParentIdMap = this.blobIdToParentIdTracker.get(summarySequenceNumber);
		assert(
			currentBlobIdToParentIdMap !== undefined,
			"Current blobIdToParentIdMap should be defined",
		);
		if (this.previousSummarySequenceNumber !== undefined) {
			const previousParentIdToBlobsIdMap = this.parentIdToBlobIdsTracker.get(
				this.previousSummarySequenceNumber,
			);
			assert(
				previousParentIdToBlobsIdMap !== undefined,
				"Previous parentIdToBlobsIdMap should be defined",
			);
			const blobIds = Array.from(currentBlobIdToParentIdMap.keys());
			let parentBlobId: string | undefined;
			while ((parentBlobId = blobIds.pop()) !== undefined) {
				const previousBlobIds = previousParentIdToBlobsIdMap.get(parentBlobId);
				if (previousBlobIds === undefined) {
					continue;
				}
				for (const previousBlobId of previousBlobIds) {
					this.trackBlob(previousBlobId, parentBlobId, incrementalSummaryContext);
				}
				blobIds.push(...previousBlobIds);
			}
		}

		this.previousSummarySequenceNumber = incrementalSummaryContext?.summarySequenceNumber ?? 0;

		console.log(`--- Blob id -> Parent id ---`);
		currentBlobIdToParentIdMap.forEach((parentId, childId) => {
			console.log(`${childId} -> ${parentId === "" ? "/" : parentId}`);
		});

		console.log(`--- Parent id -> Blob ids ---`);
		const currentParentIdToBlobIdsMap =
			this.parentIdToBlobIdsTracker.get(summarySequenceNumber);
		assert(
			currentParentIdToBlobIdsMap !== undefined,
			"Current parentIdToBlobIdsMap should be defined",
		);
		currentParentIdToBlobIdsMap.forEach((childIds, parentId) => {
			console.log(
				`${parentId === "" ? "/" : parentId} -> ${JSON.stringify(Array.from(childIds))}`,
			);
		});

		if (incrementalSummaryContext !== undefined) {
			deleteOlderTrackerMaps(
				this.blobIdToParentIdTracker,
				incrementalSummaryContext.latestSummarySequenceNumber,
			);
			deleteOlderTrackerMaps(
				this.parentIdToBlobIdsTracker,
				incrementalSummaryContext.latestSummarySequenceNumber,
			);
		}
	}
}

// Implementation with cached inner maps.
//
// function getOrCreateTrackerMap<TValue>(
// 	tracker: NestedMap<number, string, TValue>,
// 	sequenceNumber: number,
// ): Map<string, TValue> {
// 	let trackerMap = tracker.get(sequenceNumber);
// 	if (trackerMap === undefined) {
// 		trackerMap = new Map();
// 		tracker.set(sequenceNumber, trackerMap);
// 	}
// 	return trackerMap;
// }
//
// export class IncrementalSummaryTracker {
// 	private readonly blobIdToParentIdTracker: NestedMap<number, string, string> = new Map();
// 	private readonly parentIdToBlobIdsTracker: NestedMap<number, string, Set<string>> =
// 		new Map();

// 	private currentBlobIdToParentIdMap: Map<string, string> = new Map();
// 	private currentParentIdToBlobIdsMap: Map<string, Set<string>> = new Map();

// 	private lastSummaryBlobIdToParentIdMap: Map<string, string> = new Map();
// 	private lastSummaryPath: string | undefined;

// 	private previousSummarySequenceNumber: number | undefined;

// 	public trackNewSummary(
// 		incrementalSummaryContext?: IExperimentalIncrementalSummaryContext,
// 	): void {
// 		console.log(
// 			`===== Summary for: ${incrementalSummaryContext?.summarySequenceNumber ?? 0} =====`,
// 		);
// 		const summarySequenceNumber = incrementalSummaryContext?.summarySequenceNumber ?? 0;
// 		this.currentBlobIdToParentIdMap = getOrCreateTrackerMap(
// 			this.blobIdToParentIdTracker,
// 			summarySequenceNumber,
// 		);
// 		this.currentParentIdToBlobIdsMap = getOrCreateTrackerMap(
// 			this.parentIdToBlobIdsTracker,
// 			summarySequenceNumber,
// 		);

// 		if (incrementalSummaryContext === undefined) {
// 			return;
// 		}

// 		const lastSummarySequenceNumber = incrementalSummaryContext.latestSummarySequenceNumber;
// 		this.lastSummaryBlobIdToParentIdMap = getOrCreateTrackerMap(
// 			this.blobIdToParentIdTracker,
// 			lastSummarySequenceNumber,
// 		);

// 		deleteOlderTrackerMaps(this.blobIdToParentIdTracker, lastSummarySequenceNumber);
// 		deleteOlderTrackerMaps(this.parentIdToBlobIdsTracker, lastSummarySequenceNumber);

// 		this.lastSummaryPath = incrementalSummaryContext.summaryPath;
// 	}

// 	public trackBlob(blobId: string, parentBlobId: string): void {
// 		this.currentBlobIdToParentIdMap.set(blobId, parentBlobId);
// 		const blobIds = this.currentParentIdToBlobIdsMap.get(parentBlobId) ?? new Set();
// 		blobIds.add(blobId);
// 		this.currentParentIdToBlobIdsMap.set(parentBlobId, blobIds);
// 	}

// 	public getSummaryHandlePath(blobId: string): string | undefined {
// 		assert(this.lastSummaryPath !== undefined, "Latest summary path is not set");
// 		let parentBlobId = this.lastSummaryBlobIdToParentIdMap.get(blobId);
// 		let summaryHandlePath = `${incrementalFieldsTreeKey}/${blobId}`;
// 		while (parentBlobId !== "") {
// 			if (parentBlobId === undefined) {
// 				return undefined;
// 			}
// 			summaryHandlePath = `${incrementalFieldsTreeKey}/${parentBlobId}/${summaryHandlePath}`;
// 			parentBlobId = this.lastSummaryBlobIdToParentIdMap.get(parentBlobId);
// 		}
// 		return `${this.lastSummaryPath}/${summaryHandlePath}`;
// 	}

// 	public summaryComplete(
// 		incrementalSummaryContext?: IExperimentalIncrementalSummaryContext,
// 	): void {
// 		if (this.previousSummarySequenceNumber !== undefined) {
// 			const previousParentIdToBlobsIdMap = this.parentIdToBlobIdsTracker.get(
// 				this.previousSummarySequenceNumber,
// 			);
// 			assert(
// 				previousParentIdToBlobsIdMap !== undefined,
// 				"Previous parentIdToBlobsIdMap should be defined",
// 			);
// 			const blobIds = Array.from(this.currentBlobIdToParentIdMap.keys());
// 			let parentBlobId: string | undefined;
// 			while ((parentBlobId = blobIds.pop()) !== undefined) {
// 				const previousBlobIds = previousParentIdToBlobsIdMap.get(parentBlobId);
// 				if (previousBlobIds === undefined) {
// 					continue;
// 				}
// 				for (const previousBlobId of previousBlobIds) {
// 					this.trackBlob(previousBlobId, parentBlobId);
// 				}
// 				blobIds.push(...previousBlobIds);
// 			}
// 		}

// 		this.previousSummarySequenceNumber = incrementalSummaryContext?.summarySequenceNumber ?? 0;

// 		console.log(`--- Blob id -> Parent id ---`);
// 		this.currentBlobIdToParentIdMap.forEach((parentId, childId) => {
// 			console.log(`${childId} -> ${parentId === "" ? "/" : parentId}`);
// 		});

// 		console.log(`--- Parent id -> Blob ids ---`);
// 		this.currentParentIdToBlobIdsMap.forEach((childIds, parentId) => {
// 			console.log(
// 				`${parentId === "" ? "/" : parentId} -> ${JSON.stringify(Array.from(childIds))}`,
// 			);
// 		});
// 	}
// }
