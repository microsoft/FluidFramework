/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ICriticalContainerError } from "@fluidframework/container-definitions";
import { IRequestHeader } from "@fluidframework/core-interfaces";
import { ISnapshotTree } from "@fluidframework/protocol-definitions";
import {
	IGarbageCollectionData,
	IGarbageCollectionDetailsBase,
	ISummarizeResult,
	ITelemetryContext,
} from "@fluidframework/runtime-definitions";
import { ReadAndParseBlob, RefreshSummaryResult } from "@fluidframework/runtime-utils";
import { ITelemetryLogger } from "@fluidframework/common-definitions";
import { IGCRuntimeOptions } from "../containerRuntime";
import { IContainerRuntimeMetadata, ICreateContainerMetadata } from "../summary";

export type GCVersion = number;

/** The stable version of garbage collection in production. */
export const stableGCVersion: GCVersion = 1;
/** The current version of garbage collection. */
export const currentGCVersion: GCVersion = 2;

/** This undocumented GC Option (on ContainerRuntime Options) allows an app to disable enforcing GC on old documents by incrementing this value */
export const gcTombstoneGenerationOptionName = "gcTombstoneGeneration";

// Feature gate key to turn GC on / off.
export const runGCKey = "Fluid.GarbageCollection.RunGC";
// Feature gate key to turn GC sweep on / off.
export const runSweepKey = "Fluid.GarbageCollection.RunSweep";
// Feature gate key to turn GC test mode on / off.
export const gcTestModeKey = "Fluid.GarbageCollection.GCTestMode";
// Feature gate key to expire a session after a set period of time.
export const runSessionExpiryKey = "Fluid.GarbageCollection.RunSessionExpiry";
// Feature gate key to write the gc blob as a handle if the data is the same.
export const trackGCStateKey = "Fluid.GarbageCollection.TrackGCState";
// Feature gate key to turn GC sweep log off.
export const disableSweepLogKey = "Fluid.GarbageCollection.DisableSweepLog";
// Feature gate key to disable the tombstone feature, i.e., tombstone information is not read / written into summary.
export const disableTombstoneKey = "Fluid.GarbageCollection.DisableTombstone";
// Feature gate to enable throwing an error when tombstone object is loaded (requested).
export const throwOnTombstoneLoadKey = "Fluid.GarbageCollection.ThrowOnTombstoneLoad";
// Feature gate to enable throwing an error when tombstone object is used (e.g. outgoing or incoming ops).
export const throwOnTombstoneUsageKey = "Fluid.GarbageCollection.ThrowOnTombstoneUsage";
// Feature gate to enable GC version upgrade.
export const gcVersionUpgradeToV2Key = "Fluid.GarbageCollection.GCVersionUpgradeToV2";
// Feature gate to enable GC sweep for datastores.
// TODO: Remove Test from the flag when we are confident to turn on sweep
export const sweepDatastoresKey = "Fluid.GarbageCollection.Test.SweepDataStores";
// Feature gate to enable GC sweep for attachment blobs.
export const sweepAttachmentBlobsKey = "Fluid.GarbageCollection.Test.SweepAttachmentBlobs";

// One day in milliseconds.
export const oneDayMs = 1 * 24 * 60 * 60 * 1000;

export const defaultInactiveTimeoutMs = 7 * oneDayMs; // 7 days
export const defaultSessionExpiryDurationMs = 30 * oneDayMs; // 30 days

/** @see IGCMetadata.gcFeatureMatrix */
export interface GCFeatureMatrix {
	/**
	 * The Tombstone Generation value in effect when this file was created.
	 * Gives a way for an app to disqualify old files from GC Tombstone enforcement
	 * Provided via Container Runtime Options
	 */
	tombstoneGeneration?: number;
}

export interface IGCMetadata {
	/**
	 * The version of the GC code that was run to generate the GC data that is written in the summary.
	 * If the persisted value doesn't match the current value in the code, saved GC data will be discarded and regenerated from scratch.
	 * Also, used to determine whether GC is enabled for this container or not:
	 * - A value of 0 or undefined means GC is disabled.
	 * - A value greater than 0 means GC is enabled.
	 */
	readonly gcFeature?: GCVersion;

	/**
	 * A collection of different numerical "Generations" for different features,
	 * used to determine feature availability over time.
	 * This info may come from multiple sources (FF code, config service, app via Container Runtime Options),
	 * and pertains to aspects of the document that may be fixed for its lifetime.
	 *
	 * For each dimension, if the persisted value doesn't match the currently provided value,
	 * then this file does not support the corresponding feature as currently implemented.
	 *
	 * Guidance is that if no value is provided at runtime, it should result in the current default behavior.
	 */
	readonly gcFeatureMatrix?: GCFeatureMatrix;
	/**
	 * Tells whether the GC sweep phase is enabled for this container.
	 * - True means sweep phase is enabled.
	 * - False means sweep phase is disabled. If GC is disabled as per gcFeature, sweep is also disabled.
	 */
	readonly sweepEnabled?: boolean;
	/** If this is present, the session for this container will expire after this time and the container will close */
	readonly sessionExpiryTimeoutMs?: number;
	/** How long to wait after an object is unreferenced before deleting it via GC Sweep */
	readonly sweepTimeoutMs?: number;
}

/** The statistics of the system state after a garbage collection run. */
export interface IGCStats {
	/** The number of nodes in the container. */
	nodeCount: number;
	/** The number of data stores in the container. */
	dataStoreCount: number;
	/** The number of attachment blobs in the container. */
	attachmentBlobCount: number;
	/** The number of unreferenced nodes in the container. */
	unrefNodeCount: number;
	/** The number of unreferenced data stores in the container. */
	unrefDataStoreCount: number;
	/** The number of unreferenced attachment blobs in the container. */
	unrefAttachmentBlobCount: number;
	/** The number of nodes whose reference state updated since last GC run. */
	updatedNodeCount: number;
	/** The number of data stores whose reference state updated since last GC run. */
	updatedDataStoreCount: number;
	/** The number of attachment blobs whose reference state updated since last GC run. */
	updatedAttachmentBlobCount: number;
}

/** The types of GC nodes in the GC reference graph. */
export const GCNodeType = {
	// Nodes that are for data stores.
	DataStore: "DataStore",
	// Nodes that are within a data store. For example, DDS nodes.
	SubDataStore: "SubDataStore",
	// Nodes that are for attachment blobs, i.e., blobs uploaded via BlobManager.
	Blob: "Blob",
	// Nodes that are neither of the above. For example, root node.
	Other: "Other",
};
export type GCNodeType = typeof GCNodeType[keyof typeof GCNodeType];

/** Defines the APIs for the runtime object to be passed to the garbage collector. */
export interface IGarbageCollectionRuntime {
	/** Before GC runs, called to notify the runtime to update any pending GC state. */
	updateStateBeforeGC(): Promise<void>;
	/** Returns the garbage collection data of the runtime. */
	getGCData(fullGC?: boolean): Promise<IGarbageCollectionData>;
	/** After GC has run, called to notify the runtime of routes that are used in it. */
	updateUsedRoutes(usedRoutes: string[]): void;
	/** After GC has run, called to notify the runtime of routes that are unused in it. */
	updateUnusedRoutes(unusedRoutes: string[]): void;
	/**
	 * After GC has run and identified nodes that are sweep ready, called to delete the sweep ready nodes. The runtime
	 * should return the routes of nodes that were deleted.
	 * @param sweepReadyRoutes - The routes of nodes that are sweep ready and should be deleted.
	 */
	deleteSweepReadyNodes(sweepReadyRoutes: string[]): string[];
	/** Called to notify the runtime of routes that are tombstones. */
	updateTombstonedRoutes(tombstoneRoutes: string[]): void;
	/** Returns a referenced timestamp to be used to track unreferenced nodes. */
	getCurrentReferenceTimestampMs(): number | undefined;
	/** Returns the type of the GC node. */
	getNodeType(nodePath: string): GCNodeType;
	/** Called when the runtime should close because of an error. */
	closeFn: (error?: ICriticalContainerError) => void;
	/** If false, loading or using a Tombstoned object should merely log, not fail */
	gcTombstoneEnforcementAllowed: boolean;
}

/** Defines the contract for the garbage collector. */
export interface IGarbageCollector {
	/** Tells whether GC should run or not. */
	readonly shouldRunGC: boolean;
	/** Tells whether the GC state in summary needs to be reset in the next summary. */
	readonly summaryStateNeedsReset: boolean;
	/** Initialize the state from the base snapshot after its creation. */
	initializeBaseState(): Promise<void>;
	/** Run garbage collection and update the reference / used state of the system. */
	collectGarbage(
		options: {
			logger?: ITelemetryLogger;
			runSweep?: boolean;
			fullGC?: boolean;
		},
		telemetryContext?: ITelemetryContext,
	): Promise<IGCStats | undefined>;
	/** Summarizes the GC data and returns it as a summary tree. */
	summarize(
		fullTree: boolean,
		trackState: boolean,
		telemetryContext?: ITelemetryContext,
	): ISummarizeResult | undefined;
	/** Returns the garbage collector specific metadata to be written into the summary. */
	getMetadata(): IGCMetadata;
	/** Returns the GC details generated from the base snapshot. */
	getBaseGCDetails(): Promise<IGarbageCollectionDetailsBase>;
	/** Called when the latest summary of the system has been refreshed. */
	refreshLatestSummary(
		proposalHandle: string | undefined,
		result: RefreshSummaryResult,
		readAndParseBlob: ReadAndParseBlob,
	): Promise<void>;
	/** Called when a node is updated. Used to detect and log when an inactive node is changed or loaded. */
	nodeUpdated(
		nodePath: string,
		reason: "Loaded" | "Changed",
		timestampMs?: number,
		packagePath?: readonly string[],
		requestHeaders?: IRequestHeader,
	): void;
	/** Called when a reference is added to a node. Used to identify nodes that were referenced between summaries. */
	addedOutboundReference(fromNodePath: string, toNodePath: string): void;
	/** Returns true if this node has been deleted by GC during sweep phase. */
	isNodeDeleted(nodePath: string): boolean;
	setConnectionState(connected: boolean, clientId?: string): void;
	dispose(): void;
}

/** Parameters necessary for creating a GarbageCollector. */
export interface IGarbageCollectorCreateParams {
	readonly runtime: IGarbageCollectionRuntime;
	readonly gcOptions: IGCRuntimeOptions;
	readonly baseLogger: ITelemetryLogger;
	readonly existing: boolean;
	readonly metadata: IContainerRuntimeMetadata | undefined;
	readonly createContainerMetadata: ICreateContainerMetadata;
	readonly baseSnapshot: ISnapshotTree | undefined;
	readonly isSummarizerClient: boolean;
	readonly getNodePackagePath: (nodePath: string) => Promise<readonly string[] | undefined>;
	readonly getLastSummaryTimestampMs: () => number | undefined;
	readonly readAndParseBlob: ReadAndParseBlob;
	readonly activeConnection: () => boolean;
	readonly getContainerDiagnosticId: () => string;
}

/** The state of node that is unreferenced. */
export const UnreferencedState = {
	/** The node is active, i.e., it can become referenced again. */
	Active: "Active",
	/** The node is inactive, i.e., it should not become referenced. */
	Inactive: "Inactive",
	/** The node is ready to be deleted by the sweep phase. */
	SweepReady: "SweepReady",
} as const;
export type UnreferencedState = typeof UnreferencedState[keyof typeof UnreferencedState];
