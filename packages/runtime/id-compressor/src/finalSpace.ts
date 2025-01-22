/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";

import { FinalCompressedId } from "./identifiers.js";
import {
	IdCluster,
	clustersEqual,
	lastAllocatedFinal,
	lastFinalizedFinal,
} from "./sessions.js";

/**
 * All IDs that have been finalized (acked), grouped into clusters sorted by their base final IDs.
 * These clusters span the positive integer space and are not sparse, meaning a cluster's base final
 * ID will always be one greater than the last final ID in the previous cluster (or 0 if there is not one).
 */
export class FinalSpace {
	private readonly clusterList: IdCluster[] = [];

	public get clusters(): readonly IdCluster[] {
		return this.clusterList;
	}

	public getLastCluster(): IdCluster | undefined {
		return this.clusterList[this.clusterList.length - 1];
	}

	public addCluster(newCluster: IdCluster): void {
		const lastCluster = this.getLastCluster();
		assert(
			lastCluster === undefined ||
				newCluster.baseFinalId === lastCluster.baseFinalId + lastCluster.capacity,
			0x753 /* Cluster insert to final_space is out of order. */,
		);
		this.clusterList.push(newCluster);
	}

	/**
	 * Gets the upper bound (exclusive) of finalized IDs in final space, i.e. one greater than the last final ID in the last cluster.
	 * Note: this does not include allocated but unfinalized space in clusters.
	 */
	public getFinalizedIdLimit(): FinalCompressedId {
		const lastCluster = this.getLastCluster();
		return lastCluster === undefined
			? (0 as FinalCompressedId)
			: (((lastFinalizedFinal(lastCluster) as number) + 1) as FinalCompressedId);
	}

	/**
	 * Gets the upper bound (exclusive) of allocated IDs in final space, i.e. one greater than the last final ID in the last cluster.
	 * Note: this does includes all allocated IDs in clusters.
	 */
	public getAllocatedIdLimit(): FinalCompressedId {
		const lastCluster = this.getLastCluster();
		return lastCluster === undefined
			? (0 as FinalCompressedId)
			: (((lastAllocatedFinal(lastCluster) as number) + 1) as FinalCompressedId);
	}

	public equals(other: FinalSpace): boolean {
		for (let i = 0; i < this.clusterList.length; i++) {
			const cluster = this.clusterList[i] as IdCluster;
			if (!clustersEqual(cluster, other.clusterList[i] as IdCluster)) {
				return false;
			}
		}

		return this.clusterList.length === other.clusterList.length;
	}
}
