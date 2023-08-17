/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { IdCluster, clustersEqual } from "./sessions";
import { FinalCompressedId } from "./identifiers";

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

	public addCluster(newCluster: IdCluster) {
		const lastCluster = this.getLastCluster();
		assert(
			lastCluster === undefined ||
				// eslint-disable-next-line @typescript-eslint/restrict-plus-operands
				newCluster.baseFinalId === lastCluster.baseFinalId + lastCluster.capacity,
			"Cluster insert to final_space is out of order.",
		);
		this.clusterList.push(newCluster);
	}

	/**
	 * @returns the upper bound (exclusive) of final IDs in final space, i.e. one greater than the last final ID in the last cluster.
	 */
	public getFinalIdLimit(): FinalCompressedId {
		if (this.clusterList.length === 0) {
			return 0 as FinalCompressedId;
		}
		const lastCluster = this.clusterList[this.clusterList.length - 1];
		return ((lastCluster.baseFinalId as number) + lastCluster.count) as FinalCompressedId;
	}

	public equals(other: FinalSpace): boolean {
		for (let i = 0; i < this.clusterList.length; i++) {
			if (!clustersEqual(this.clusterList[i], other.clusterList[i])) {
				return false;
			}
		}
		return this.clusterList.length === other.clusterList.length;
	}
}
