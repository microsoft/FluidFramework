/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ICriticalContainerError } from "@fluidframework/container-definitions";
import { IRequest } from "@fluidframework/core-interfaces";
import { ISnapshotTree } from "@fluidframework/driver-definitions/internal";
import {
	ITelemetryContext,
	IGarbageCollectionData,
	IGarbageCollectionDetailsBase,
	ISummarizeResult,
} from "@fluidframework/runtime-definitions/internal";
import { ReadAndParseBlob } from "@fluidframework/runtime-utils/internal";
import {
	ITelemetryLoggerExt,
	type ITelemetryPropertiesExt,
} from "@fluidframework/telemetry-utils/internal";

import { RuntimeHeaderData } from "../containerRuntime.js";
import { ContainerRuntimeGCMessage } from "../messageTypes.js";
import {
	// eslint-disable-next-line import/no-deprecated
	IContainerRuntimeMetadata,
	// eslint-disable-next-line import/no-deprecated
	ICreateContainerMetadata,
	IRefreshSummaryResult,
} from "../summary/index.js";

/**
 * @legacy
 * @alpha
 * @deprecated - This type will be moved to internal in 2.30. External usage is not necessary or supported.
 */

export type GCVersion = number;

/**
 * The stable/default version of GC Data
 */

export const stableGCVersion: GCVersion = 3;
/**
 * The next version of GC Data, to bump to in case we need to regenerate all GC Data across all files.
 */

export const nextGCVersion: GCVersion = 4;

/**
 * This undocumented GC Option (on ContainerRuntime Options) allows configuring which documents can have Sweep enabled.
 * This provides a way to disable both Tombstone Enforcement and Sweep.
 *
 * If unset, Tombstone Enforcement + Sweep will operate as otherwise configured.
 * Otherwise, the Sweep Phase will be disabled for documents where persisted value doesn't match what is passed into this session.
 * This provides a way to disallow Sweep for old documents that may be too difficult for an app to repair,
 * in case a bug is found that violates GC's assumptions.
 *
 * @see GCFeatureMatrix (gcGeneration)
 */
export const gcGenerationOptionName = "gcGeneration";

/**
 * Config key to turn GC test mode on / off.
 */
export const gcTestModeKey = "Fluid.GarbageCollection.GCTestMode";
/**
 * Config key to expire a session after a set period of time. Defaults to true.
 */
export const runSessionExpiryKey = "Fluid.GarbageCollection.RunSessionExpiry";
/**
 * Config key to disable throwing an error when tombstone object is loaded (requested).
 */
export const disableThrowOnTombstoneLoadKey =
	"Fluid.GarbageCollection.DisableThrowOnTombstoneLoad";
/**
 * Config key to enable GC version upgrade.
 */

export const gcVersionUpgradeToV4Key = "Fluid.GarbageCollection.GCVersionUpgradeToV4";

// One day in milliseconds.
export const oneDayMs = 1 * 24 * 60 * 60 * 1000;

/**
 * The maximum snapshot cache expiry in the driver. This is used to calculate the tombstone timeout.
 * Tombstone timeout = session expiry timeout + snapshot cache expiry timeout + a buffer.
 * The snapshot cache expiry timeout cannot be known precisely but the upper bound is 5 days, i.e., any snapshot
 * in cache will be invalidated before 5 days.
 */
export const maxSnapshotCacheExpiryMs = 5 * oneDayMs;

export const defaultInactiveTimeoutMs = 7 * oneDayMs; // 7 days
export const defaultSessionExpiryDurationMs = 30 * oneDayMs; // 30 days
export const defaultSweepGracePeriodMs = 1 * oneDayMs; // 1 day

/**
 * // eslint-disable-next-line import/no-deprecated
 * @see IGCMetadata.gcFeatureMatrix and @see gcGenerationOptionName
 * @legacy
 * @alpha
 * @deprecated - This type will be moved to internal in 2.30. External usage is not necessary or supported.
 */

export type GCFeatureMatrix =
	| {
			/**
			 * The GC Generation value in effect when this file was created.
			 * Gives a way for an app to disqualify old files from GC Sweep.
			 * Provided via Container Runtime Options.
			 */
			gcGeneration?: number;
			/**
			 * Deprecated property from legacy type. Will not be set concurrently with gcGeneration
			 */
			tombstoneGeneration?: undefined;
	  }
	| {
			/**
			 * The Tombstone Generation value in effect when this file was created.
			 * Legacy - new containers would get gcGeneration instead (if anything)
			 */
			tombstoneGeneration: number;
	  };

/**
 * Deprecated properties formerly included in @see IGCMetadata.
 * These may be found in old snapshots, so we need to support them for backwards compatibility.
 */

export interface IGCMetadata_Deprecated {
	/**
	 * How long to wait after an object is unreferenced before deleting it via GC Sweep
	 *
	 * // eslint-disable-next-line import/no-deprecated
	 * @deprecated Replaced by @see IGCMetadata.tombstoneTimeoutMs
	 */
	readonly sweepTimeoutMs?: number;
}

/**
 * GC-specific metadata to be written into the summary.
 *
 * @legacy
 * @alpha
 * @deprecated - This type will be moved to internal in 2.30. External usage is not necessary or supported.
 */

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
	 *
	 * // eslint-disable-next-line import/no-deprecated
	 * @deprecated use GCFeatureMatrix.gcGeneration instead. @see GCFeatureMatrix.gcGeneration
	 */
	readonly sweepEnabled?: boolean;
	/**
	 * If this is present, the session for this container will expire after this time and the container will close
	 */
	readonly sessionExpiryTimeoutMs?: number;
	/**
	 * How long to wait after an object is unreferenced before it becomes a Tombstone.
	 *
	 * After this point, there's a grace period before the object is deleted.
	 * @see IGCRuntimeOptions.sweepGracePeriodMs
	 *
	 * So the full sweep timeout in a session is tombstoneTimeoutMs + sweepGracePeriodMs.
	 */
	readonly tombstoneTimeoutMs?: number;
}

/**
 * The statistics of the system state after a garbage collection mark phase run.
 * @legacy
 * @alpha
 * @deprecated - This type will be moved to internal in 2.30. External usage is not necessary or supported.
 */

export interface IMarkPhaseStats {
	/**
	 * The number of nodes in the container.
	 */
	nodeCount: number;
	/**
	 * The number of data stores in the container.
	 */
	dataStoreCount: number;
	/**
	 * The number of attachment blobs in the container.
	 */
	attachmentBlobCount: number;
	/**
	 * The number of unreferenced nodes in the container.
	 */
	unrefNodeCount: number;
	/**
	 * The number of unreferenced data stores in the container.
	 */
	unrefDataStoreCount: number;
	/**
	 * The number of unreferenced attachment blobs in the container.
	 */
	unrefAttachmentBlobCount: number;
	/**
	 * The number of nodes whose reference state updated since last GC run.
	 */
	updatedNodeCount: number;
	/**
	 * The number of data stores whose reference state updated since last GC run.
	 */
	updatedDataStoreCount: number;
	/**
	 * The number of attachment blobs whose reference state updated since last GC run.
	 */
	updatedAttachmentBlobCount: number;
}

/**
 * The statistics of the system state after a garbage collection sweep phase run.
 * @legacy
 * @alpha
 * @deprecated - This type will be moved to internal in 2.30. External usage is not necessary or supported.
 */

export interface ISweepPhaseStats {
	/**
	 * The number of nodes in the lifetime of the container.
	 */
	lifetimeNodeCount: number;
	/**
	 * The number of data stores in the lifetime of the container.
	 */
	lifetimeDataStoreCount: number;
	/**
	 * The number of attachment blobs in the lifetime of the container.
	 */
	lifetimeAttachmentBlobCount: number;
	/**
	 * The number of deleted nodes in the container.
	 */
	deletedNodeCount: number;
	/**
	 * The number of deleted data stores in the container.
	 */
	deletedDataStoreCount: number;
	/**
	 * The number of deleted attachment blobs in the container.
	 */
	deletedAttachmentBlobCount: number;
}

/**
 * The statistics of the system state after a garbage collection run.
 * @legacy
 * @alpha
 * @deprecated - This type will be moved to internal in 2.30. External usage is not necessary or supported.
 */

export interface IGCStats extends IMarkPhaseStats, ISweepPhaseStats {}

/**
 * The types of GC nodes in the GC reference graph.
 * @legacy
 * @alpha
 * @deprecated - This type will be moved to internal in 2.30. External usage is not necessary or supported.
 */
export const GCNodeType = {
	// Nodes that are for data stores.
	DataStore: "DataStore",
	// Nodes that are within a data store. For example, DDS nodes.
	SubDataStore: "SubDataStore",
	// Nodes that are for attachment blobs, i.e., blobs uploaded via BlobManager.
	Blob: "Blob",
	// Nodes that are neither of the above. For example, root node.
	Other: "Other",
} as const;

/**
 * @legacy
 * @alpha
 * @deprecated - This type will be moved to internal in 2.30. External usage is not necessary or supported.
 */
export type GCNodeType = (typeof GCNodeType)[keyof typeof GCNodeType];

/**
 * The type of a garbage collection message.
 * @internal
 */
export const GarbageCollectionMessageType = {
	/**
	 * Message sent directing GC to delete the given nodes
	 */
	Sweep: "Sweep",
	/**
	 * Message sent notifying GC that a Tombstoned object was Loaded
	 */
	TombstoneLoaded: "TombstoneLoaded",
} as const;

/**
 * @internal
 */
export type GarbageCollectionMessageType =
	(typeof GarbageCollectionMessageType)[keyof typeof GarbageCollectionMessageType];

/**
 * The garbage collection sweep message.
 * @internal
 */
export interface ISweepMessage {
	/**
	 * @see GarbageCollectionMessageType.Sweep
	 */
	type: typeof GarbageCollectionMessageType.Sweep;
	/**
	 * The ids of nodes that are deleted.
	 */
	deletedNodeIds: string[];
}

/**
 * The GC TombstoneLoaded message.
 * @internal
 */
export interface ITombstoneLoadedMessage {
	/**
	 * @see GarbageCollectionMessageType.TombstoneLoaded
	 */
	type: typeof GarbageCollectionMessageType.TombstoneLoaded;
	/**
	 * The id of Tombstoned node that was loaded.
	 */
	nodePath: string;
}

/**
 * Type for a message to be used for sending / received garbage collection messages.
 * @internal
 */
export type GarbageCollectionMessage = ISweepMessage | ITombstoneLoadedMessage;

/**
 * Defines the APIs for the runtime object to be passed to the garbage collector.
 */
export interface IGarbageCollectionRuntime {
	/**
	 * Returns the garbage collection data of the runtime.
	 */
	getGCData(fullGC?: boolean): Promise<IGarbageCollectionData>;
	/**
	 * After GC has run, called to notify the runtime of routes that are used in it.
	 */
	updateUsedRoutes(usedRoutes: readonly string[]): void;
	/**
	 * After GC has run and identified nodes that are sweep ready, called to delete the sweep ready nodes. The runtime
	 * should return the routes of nodes that were deleted.
	 * @param sweepReadyRoutes - The routes of nodes that are sweep ready and should be deleted.
	 */
	deleteSweepReadyNodes(sweepReadyRoutes: readonly string[]): readonly string[];
	/**
	 * Called to notify the runtime of routes that are tombstones.
	 */
	updateTombstonedRoutes(tombstoneRoutes: readonly string[]): void;
	/**
	 * Returns a referenced timestamp to be used to track unreferenced nodes.
	 */
	getCurrentReferenceTimestampMs(): number | undefined;
	/**
	 * Returns the type of the GC node.
	 */
	getNodeType(nodePath: string): GCNodeType;
	/**
	 * Called when the runtime should close because of an error.
	 */
	closeFn: (error?: ICriticalContainerError) => void;
}

/**
 * Defines the contract for the garbage collector.
 */
export interface IGarbageCollector {
	/**
	 * Tells the time at which session expiry timer started in a previous container.
	 * This is only set when loading from a stashed container and will be equal to the
	 * original container's local client time when it was loaded (and started the session expiry timer).
	 */
	readonly sessionExpiryTimerStarted: number | undefined;
	/**
	 * Tells whether GC should run or not.
	 */
	readonly shouldRunGC: boolean;
	/**
	 * The count of data stores whose GC state updated since the last summary.
	 */
	readonly updatedDSCountSinceLastSummary: number;
	/**
	 * Initialize the state from the base snapshot after its creation.
	 */
	initializeBaseState(): Promise<void>;
	/**
	 * Run garbage collection and update the reference / used state of the system.
	 */
	collectGarbage(
		options: {
			logger?: ITelemetryLoggerExt;
			runSweep?: boolean;
			fullGC?: boolean;
		},
		telemetryContext?: ITelemetryContext,
	): Promise<IGCStats | undefined>;
	/**
	 * Summarizes the GC data and returns it as a summary tree.
	 */
	summarize(
		fullTree: boolean,
		trackState: boolean,
		telemetryContext?: ITelemetryContext,
	): ISummarizeResult | undefined;
	/**
	 * Returns the garbage collector specific metadata to be written into the summary.
	 */

	getMetadata(): IGCMetadata;
	/**
	 * Returns the GC details generated from the base snapshot.
	 */
	getBaseGCDetails(): Promise<IGarbageCollectionDetailsBase>;
	/**
	 * Called when the latest summary of the system has been refreshed.
	 */
	refreshLatestSummary(result: IRefreshSummaryResult): Promise<void>;
	/**
	 * Called when a node with the given path is updated. If the node is inactive or tombstoned, this will log an error
	 * or throw an error if failing on incorrect usage is configured.
	 */
	nodeUpdated(props: IGCNodeUpdatedProps): void;
	/**
	 * Called when a reference is added to a node. Used to identify nodes that were referenced between summaries.
	 */
	addedOutboundReference(
		fromNodePath: string,
		toNodePath: string,
		timestampMs: number,
		autorecovery?: true,
	): void;
	/**
	 * Called to process garbage collection messages
	 */
	processMessages(
		messageContents: GarbageCollectionMessage[],
		messageTimestampMs: number,
		local: boolean,
	): void;
	/**
	 * Returns true if this node has been deleted by GC during sweep phase.
	 */
	isNodeDeleted(nodePath: string): boolean;
	setConnectionState(connected: boolean, clientId?: string): void;
	dispose(): void;
}

/**
 * Info needed by GC when notified that a node was updated (loaded or changed)
 * @internal
 */
export interface IGCNodeUpdatedProps {
	/**
	 * Type and path of the updated node
	 */
	node: { type: (typeof GCNodeType)["DataStore" | "Blob"]; path: string };
	/**
	 * Whether the node (or a subpath) was loaded or changed.
	 */
	reason: "Loaded" | "Changed" | "Realized";
	/**
	 * The op-based timestamp when the node changed. If the update is from receiving an op, this should
	 * be the timestamp of the op. If not, this should be the timestamp of the last op processed.
	 */
	timestampMs: number | undefined;
	/**
	 * The package path of the node. This may not be available if the node hasn't been loaded yet
	 */
	packagePath?: readonly string[];
	/**
	 * The original request for loads to preserve it in telemetry
	 */
	request?: IRequest;
	/**
	 * If the node was loaded via request path, the header data. May be modified from the original request
	 */
	headerData?: RuntimeHeaderData;
	/**
	 * Any other properties to be logged.
	 */
	additionalProps?: ITelemetryPropertiesExt;
}

/**
 * Parameters necessary for creating a GarbageCollector.
 */
export interface IGarbageCollectorCreateParams {
	readonly runtime: IGarbageCollectionRuntime;
	readonly gcOptions: IGCRuntimeOptions;
	readonly baseLogger: ITelemetryLoggerExt;
	readonly existing: boolean;
	// eslint-disable-next-line import/no-deprecated
	readonly metadata: IContainerRuntimeMetadata | undefined;
	// eslint-disable-next-line import/no-deprecated
	readonly createContainerMetadata: ICreateContainerMetadata;
	readonly baseSnapshot: ISnapshotTree | undefined;
	readonly isSummarizerClient: boolean;
	readonly getNodePackagePath: (nodePath: string) => Promise<readonly string[] | undefined>;
	readonly getLastSummaryTimestampMs: () => number | undefined;
	readonly readAndParseBlob: ReadAndParseBlob;
	readonly submitMessage: (message: ContainerRuntimeGCMessage) => void;
	readonly sessionExpiryTimerStarted?: number | undefined;
}

/**
 * @legacy
 * @alpha
 */
export interface IGCRuntimeOptions {
	/**
	 * Flag that if true, will enable the full Sweep Phase of garbage collection for this session,
	 * where Tombstoned objects are permanently deleted from the container.
	 *
	 * IMPORTANT: This only applies if this document is allowed to run Sweep Phase.
	 *
	 * Current default behavior is for Sweep Phase not to delete Tombstoned objects,
	 * but merely to prevent them from being loaded.
	 */
	enableGCSweep?: true;

	/**
	 * Flag that will bypass optimizations and generate GC data for all nodes irrespective of whether a node
	 * changed or not.
	 */
	runFullGC?: boolean;

	/**
	 * Maximum session duration for a new container. If not present, a default value will be used.
	 *
	 * Note: This setting is persisted in the container's summary and cannot be changed.
	 */
	sessionExpiryTimeoutMs?: number;

	/**
	 * Delay between when Tombstone should run and when the object should be deleted.
	 * This grace period gives a chance to intervene to recover if needed, before Sweep deletes the object.
	 * If not present, a default (non-zero) value will be used.
	 */
	sweepGracePeriodMs?: number;

	/**
	 * Allows additional GC options to be passed.
	 */
	// TODO: Use unknown (breaking change)
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	[key: string]: any;
}

/**
 * The configurations for Garbage Collector that determines what runs and how.
 */
export interface IGarbageCollectorConfigs {
	/**
	 * Tracks if GC is allowed for this document. GC may not be allowed for old documents created pre-GC.
	 * If GC is allowed for a document, it will always be enabled. It cannot be disabled per session.
	 */
	readonly gcAllowed: boolean;
	/**
	 * Tracks whether sweep phase is allowed for this document. Sweep can be disabled per session via the sweepEnabled
	 * flag defined below.
	 */
	readonly sweepAllowed: boolean;
	/**
	 * Tracks if sweep phase is enabled to run in this session or not
	 */
	readonly sweepEnabled: boolean;
	/**
	 * If true, bypass optimizations and generate GC data for all nodes irrespective of whether a node changed or not.
	 */
	readonly runFullGC: boolean | undefined;
	/**
	 * The time in ms to expire a session for a client for gc.
	 */
	readonly sessionExpiryTimeoutMs: number | undefined;
	/**
	 * The time after which an unreferenced node can be Tombstoned - i.e. GC knows it can't be referenced again (revived).
	 */
	readonly tombstoneTimeoutMs: number | undefined;
	/**
	 * The delay between tombstone and sweep. Not persisted, so concurrent sessions may use different values.
	 * Sweep is implemented in an eventually-consistent way so this is acceptable.
	 */
	readonly sweepGracePeriodMs: number;
	/**
	 * The time after which an unreferenced node is inactive.
	 */
	readonly inactiveTimeoutMs: number;
	/**
	 * Tracks whether GC should run in test mode. In this mode, unreferenced objects are deleted immediately.
	 */
	readonly testMode: boolean;
	/**
	 * // eslint-disable-next-line import/no-deprecated
	 * @see GCFeatureMatrix.
	 */

	readonly persistedGcFeatureMatrix: GCFeatureMatrix | undefined;
	/**
	 * The version of GC in the base snapshot.
	 */

	readonly gcVersionInBaseSnapshot: GCVersion | undefined;
	/**
	 * The current version of GC data in the running code
	 */

	readonly gcVersionInEffect: GCVersion;
	/**
	 * If true, throw an error when a tombstone data store is retrieved
	 */
	readonly throwOnTombstoneLoad: boolean;
}

/**
 * The state of node that is unreferenced.
 */
export const UnreferencedState = {
	/**
	 * The node is active, i.e., it can become referenced again.
	 */
	Active: "Active",
	/**
	 * The node is inactive, i.e., it should not become referenced.
	 */
	Inactive: "Inactive",
	/**
	 * The node is ready to be tombstoned
	 */
	TombstoneReady: "TombstoneReady",
	/**
	 * The node is ready to be deleted by the sweep phase.
	 */
	SweepReady: "SweepReady",
} as const;
export type UnreferencedState = (typeof UnreferencedState)[keyof typeof UnreferencedState];

/**
 * Represents the result of a GC run.
 */
export interface IGCResult {
	/**
	 * The ids of nodes that are referenced in the referenced graph
	 */
	referencedNodeIds: string[];
	/**
	 * The ids of nodes that are not-referenced or deleted in the referenced graph
	 */
	deletedNodeIds: string[];
}
