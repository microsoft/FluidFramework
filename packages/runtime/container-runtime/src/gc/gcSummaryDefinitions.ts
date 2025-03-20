/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IGarbageCollectionData } from "@fluidframework/runtime-definitions/internal";

/**
 * The garbage collection data of each node in the reference graph. Each node's GC data is written in the summary
 * in this format.
 */
export interface IGarbageCollectionNodeData {
	/**
	 * The set of routes to other nodes in the graph.
	 */
	outboundRoutes: string[];
	/**
	 * If the node is unreferenced, the timestamp of when it was marked unreferenced.
	 */
	unreferencedTimestampMs?: number;
}

/**
 * The garbage collection state of the reference graph. It contains a list of all the nodes in the graph and their
 * GC data. The GC data is written in the summary in this format.
 */
export interface IGarbageCollectionState {
	gcNodes: { [id: string]: IGarbageCollectionNodeData };
}

/**
 * The GC data that is read from a snapshot. It contains the Garbage CollectionState state and tombstone state.
 */
export interface IGarbageCollectionSnapshotData {
	/**
	 * The garbage collection state. It is a list of nodes in the container and their GC data.
	 */
	gcState: IGarbageCollectionState | undefined;
	/**
	 * A list of nodes that have been tombstoned by GC.
	 */
	tombstones: string[] | undefined;
	/**
	 * A list of nodes that have been deleted by GC.
	 */
	deletedNodes: string[] | undefined;
}

/**
 * @deprecated IGarbageCollectionState is written in the root of the summary now.
 * Legacy GC details from when the GC details were written at the data store's summary tree.
 */
export interface IGarbageCollectionSummaryDetailsLegacy {
	/**
	 * A list of routes to Fluid objects that are used in this node.
	 */
	usedRoutes?: string[];
	/**
	 * The GC data of this node.
	 */
	gcData?: IGarbageCollectionData;
	/**
	 * If this node is unreferenced, the time when it was marked as such.
	 */
	unrefTimestamp?: number;
}
