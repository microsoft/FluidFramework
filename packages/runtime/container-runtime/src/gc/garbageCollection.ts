/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryLogger } from "@fluidframework/common-definitions";
import { assert, LazyPromise, Timer } from "@fluidframework/common-utils";
import {
	ClientSessionExpiredError,
	DataProcessingError,
	UsageError,
} from "@fluidframework/container-utils";
import { IRequestHeader } from "@fluidframework/core-interfaces";
import {
	cloneGCData,
	concatGarbageCollectionData,
	getGCDataFromSnapshot,
	IGCResult,
	runGarbageCollection,
	trimLeadingSlashes,
} from "@fluidframework/garbage-collector";
import {
	gcTreeKey,
	IGarbageCollectionData,
	IGarbageCollectionDetailsBase,
	IGarbageCollectionSnapshotData,
	IGarbageCollectionState,
	ISummarizeResult,
	ITelemetryContext,
	IGarbageCollectionSummaryDetailsLegacy,
} from "@fluidframework/runtime-definitions";
import {
	packagePathToTelemetryProperty,
	ReadAndParseBlob,
	RefreshSummaryResult,
} from "@fluidframework/runtime-utils";
import {
	ChildLogger,
	generateStack,
	loggerToMonitoringContext,
	MonitoringContext,
	PerformanceEvent,
	TelemetryDataTag,
} from "@fluidframework/telemetry-utils";

import { IGCRuntimeOptions, RuntimeHeaders } from "../containerRuntime";
import { getSummaryForDatastores } from "../dataStores";
import {
	ReadFluidDataStoreAttributes,
	dataStoreAttributesBlobName,
	ICreateContainerMetadata,
} from "../summary";
import {
	defaultInactiveTimeoutMs,
	defaultSessionExpiryDurationMs,
	disableSweepLogKey,
	disableTombstoneKey,
	GCNodeType,
	gcTestModeKey,
	IGarbageCollector,
	IGarbageCollectorCreateParams,
	IGarbageCollectionRuntime,
	IGCStats,
	oneDayMs,
	runGCKey,
	runSessionExpiryKey,
	runSweepKey,
	trackGCStateKey,
	gcTombstoneGenerationOptionName,
	UnreferencedState,
	GCFeatureMatrix,
	IGCMetadata,
} from "./gcDefinitions";
import { getGCVersion, sendGCUnexpectedUsageEvent } from "./gcHelpers";
import { GCSummaryStateTracker } from "./gcSummaryStateTracker";
import { SweepReadyUsageDetectionHandler } from "./gcSweepReadyUsageDetection";
import { UnreferencedStateTracker } from "./gcUnreferencedStateTracker";

/** The event that is logged when unreferenced node is used after a certain time. */
interface IUnreferencedEventProps {
	usageType: "Changed" | "Loaded" | "Revived";
	state: UnreferencedState;
	id: string;
	type: GCNodeType;
	unrefTime: number;
	age: number;
	completedGCRuns: number;
	fromId?: string;
	timeout?: number;
	lastSummaryTime?: number;
	viaHandle?: boolean;
}

/**
 * The garbage collector for the container runtime. It consolidates the garbage collection functionality and maintains
 * its state across summaries.
 *
 * Node - represented as nodeId, it's a node on the GC graph
 *
 * Outbound Route - a path from one node to another node, think `nodeA` -\> `nodeB`
 *
 * Graph - all nodes with their respective routes
 *
 * ```
 *			 GC Graph
 *
 *			   Node
 *		NodeId = "datastore1"
 *		   /			 \\
 *	OutboundRoute   OutboundRoute
 *		 /				 \\
 *	   Node			   Node
 *  NodeId = "dds1"	 NodeId = "dds2"
 * ```
 */
export class GarbageCollector implements IGarbageCollector {
	public static create(createParams: IGarbageCollectorCreateParams): IGarbageCollector {
		return new GarbageCollector(createParams);
	}

	/**
	 * Tracks if GC is enabled for this document. This is specified during document creation and doesn't change
	 * throughout its lifetime.
	 */
	private readonly gcEnabled: boolean;
	/**
	 * Tracks if sweep phase is enabled for this document. This is specified during document creation and doesn't change
	 * throughout its lifetime.
	 */
	private readonly sweepEnabled: boolean;

	/**
	 * Tracks if GC should run or not. Even if GC is enabled for a document (see gcEnabled), it can be explicitly
	 * disabled via runtime options or feature flags.
	 */
	public readonly shouldRunGC: boolean;
	/**
	 * Tracks if sweep phase should run or not. Even if the sweep phase is enabled for a document (see sweepEnabled), it
	 * can be explicitly disabled via feature flags. It also won't run if session expiry is not enabled.
	 */
	private readonly shouldRunSweep: boolean;

	public readonly trackGCState: boolean;

	private readonly testMode: boolean;
	private readonly tombstoneMode: boolean;
	private readonly mc: MonitoringContext;

	// Feature Support info persisted to this container's summary
	private readonly persistedGcFeatureMatrix: GCFeatureMatrix | undefined;

	// Keeps track of the GC state from the last run.
	private gcDataFromLastRun: IGarbageCollectionData | undefined;
	// Keeps a list of references (edges in the GC graph) between GC runs. Each entry has a node id and a list of
	// outbound routes from that node.
	private readonly newReferencesSinceLastRun: Map<string, string[]> = new Map();
	// A list of nodes that have been tombstoned.
	private tombstones: string[] = [];
	// A list of nodes that have been deleted during sweep phase.
	private deletedNodes: Set<string> = new Set();

	// Promise when resolved returns the GC data data in the base snapshot.
	private readonly baseSnapshotDataP: Promise<IGarbageCollectionSnapshotData | undefined>;
	// Promise when resolved initializes the GC state from the data in the base snapshot.
	private readonly initializeGCStateFromBaseSnapshotP: Promise<void>;
	// The GC details generated from the base snapshot.
	private readonly baseGCDetailsP: Promise<IGarbageCollectionDetailsBase>;
	// Map of node ids to their unreferenced state tracker.
	private readonly unreferencedNodesState: Map<string, UnreferencedStateTracker> = new Map();
	// The Timer responsible for closing the container when the session has expired
	private sessionExpiryTimer: Timer | undefined;

	// Keeps track of unreferenced events that are logged for a node. This is used to limit the log generation to one
	// per event per node.
	private readonly loggedUnreferencedEvents: Set<string> = new Set();
	// Queue for unreferenced events that should be logged the next time GC runs.
	private pendingEventsQueue: IUnreferencedEventProps[] = [];

	// The number of times GC has successfully completed on this instance of GarbageCollector.
	private completedRuns = 0;

	private readonly runtime: IGarbageCollectionRuntime;
	private readonly createContainerMetadata: ICreateContainerMetadata;
	private readonly gcOptions: IGCRuntimeOptions;
	private readonly isSummarizerClient: boolean;

	/** The time in ms to expire a session for a client for gc. */
	private readonly sessionExpiryTimeoutMs: number | undefined;
	/** The time after which an unreferenced node is inactive. */
	private readonly inactiveTimeoutMs: number;
	/** The time after which an unreferenced node is ready to be swept. */
	private readonly sweepTimeoutMs: number | undefined;

	private readonly summaryStateTracker: GCSummaryStateTracker;

	/** For a given node path, returns the node's package path. */
	private readonly getNodePackagePath: (
		nodePath: string,
	) => Promise<readonly string[] | undefined>;
	/** Returns the timestamp of the last summary generated for this container. */
	private readonly getLastSummaryTimestampMs: () => number | undefined;
	/** Returns true if connection is active, i.e. it's "write" connection and the runtime is connected. */
	private readonly activeConnection: () => boolean;

	/** Returns a list of all the configurations for garbage collection. */
	private get configs() {
		return {
			gcEnabled: this.gcEnabled,
			sweepEnabled: this.sweepEnabled,
			runGC: this.shouldRunGC,
			runSweep: this.shouldRunSweep,
			testMode: this.testMode,
			tombstoneMode: this.tombstoneMode,
			sessionExpiry: this.sessionExpiryTimeoutMs,
			sweepTimeout: this.sweepTimeoutMs,
			inactiveTimeout: this.inactiveTimeoutMs,
			trackGCState: this.trackGCState,
			...this.gcOptions,
		};
	}

	public get summaryStateNeedsReset(): boolean {
		return this.summaryStateTracker.doesSummaryStateNeedReset();
	}

	/** Handler to respond to when a SweepReady object is used */
	private readonly sweepReadyUsageHandler: SweepReadyUsageDetectionHandler;

	protected constructor(createParams: IGarbageCollectorCreateParams) {
		this.runtime = createParams.runtime;
		this.isSummarizerClient = createParams.isSummarizerClient;
		this.gcOptions = createParams.gcOptions;
		this.createContainerMetadata = createParams.createContainerMetadata;
		this.getNodePackagePath = createParams.getNodePackagePath;
		this.getLastSummaryTimestampMs = createParams.getLastSummaryTimestampMs;
		this.activeConnection = createParams.activeConnection;

		const baseSnapshot = createParams.baseSnapshot;
		const metadata = createParams.metadata;
		const readAndParseBlob = createParams.readAndParseBlob;

		this.mc = loggerToMonitoringContext(
			ChildLogger.create(createParams.baseLogger, "GarbageCollector", {
				all: { completedGCRuns: () => this.completedRuns },
			}),
		);

		this.sweepReadyUsageHandler = new SweepReadyUsageDetectionHandler(
			createParams.getContainerDiagnosticId(),
			this.mc,
			this.runtime.closeFn,
		);

		let gcVersionInBaseSnapshot: number | undefined;

		/**
		 * Sweep timeout is the time after which unreferenced content can be swept.
		 * Sweep timeout = session expiry timeout + snapshot cache expiry timeout + one day buffer.
		 *
		 * The snapshot cache expiry timeout cannot be known precisely but the upper bound is 5 days.
		 * The buffer is added to account for any clock skew or other edge cases.
		 * We use server timestamps throughout so the skew should be minimal but make it 1 day to be safe.
		 */
		function computeSweepTimeout(sessionExpiryTimeoutMs: number | undefined) {
			const maxSnapshotCacheExpiryMs = 5 * oneDayMs;
			const bufferMs = oneDayMs;
			return (
				sessionExpiryTimeoutMs &&
				sessionExpiryTimeoutMs + maxSnapshotCacheExpiryMs + bufferMs
			);
		}

		/**
		 * The following GC state is enabled during container creation and cannot be changed throughout its lifetime:
		 * 1. Whether running GC mark phase is allowed or not.
		 * 2. Whether running GC sweep phase is allowed or not.
		 * 3. Whether GC session expiry is enabled or not.
		 * For existing containers, we get this information from the metadata blob of its summary.
		 */
		if (createParams.existing) {
			gcVersionInBaseSnapshot = getGCVersion(metadata);
			// Existing documents which did not have metadata blob or had GC disabled have version as 0. For all
			// other existing documents, GC is enabled.
			this.gcEnabled = gcVersionInBaseSnapshot > 0;
			this.sweepEnabled = metadata?.sweepEnabled ?? false;
			this.sessionExpiryTimeoutMs = metadata?.sessionExpiryTimeoutMs;
			this.sweepTimeoutMs =
				metadata?.sweepTimeoutMs ?? computeSweepTimeout(this.sessionExpiryTimeoutMs); // Backfill old documents that didn't persist this
			this.persistedGcFeatureMatrix = metadata?.gcFeatureMatrix;
		} else {
			// Sweep should not be enabled without enabling GC mark phase. We could silently disable sweep in this
			// scenario but explicitly failing makes it clearer and promotes correct usage.
			if (this.gcOptions.sweepAllowed && this.gcOptions.gcAllowed === false) {
				throw new UsageError(
					"GC sweep phase cannot be enabled without enabling GC mark phase",
				);
			}

			// This Test Override only applies for new containers
			const testOverrideSweepTimeoutMs = this.mc.config.getNumber(
				"Fluid.GarbageCollection.TestOverride.SweepTimeoutMs",
			);

			// For new documents, GC is enabled by default. It can be explicitly disabled by setting the gcAllowed
			// flag in GC options to false.
			this.gcEnabled = this.gcOptions.gcAllowed !== false;
			// The sweep phase has to be explicitly enabled by setting the sweepAllowed flag in GC options to true.
			this.sweepEnabled = this.gcOptions.sweepAllowed === true;

			// Set the Session Expiry only if the flag is enabled and GC is enabled.
			if (this.mc.config.getBoolean(runSessionExpiryKey) && this.gcEnabled) {
				this.sessionExpiryTimeoutMs =
					this.gcOptions.sessionExpiryTimeoutMs ?? defaultSessionExpiryDurationMs;
			}
			this.sweepTimeoutMs =
				testOverrideSweepTimeoutMs ?? computeSweepTimeout(this.sessionExpiryTimeoutMs);
			if (this.gcOptions[gcTombstoneGenerationOptionName] !== undefined) {
				this.persistedGcFeatureMatrix = {
					tombstoneGeneration: this.gcOptions[gcTombstoneGenerationOptionName],
				};
			}
		}

		// If session expiry is enabled, we need to close the container when the session expiry timeout expires.
		if (this.sessionExpiryTimeoutMs !== undefined) {
			// If Test Override config is set, override Session Expiry timeout.
			const overrideSessionExpiryTimeoutMs = this.mc.config.getNumber(
				"Fluid.GarbageCollection.TestOverride.SessionExpiryMs",
			);
			const timeoutMs = overrideSessionExpiryTimeoutMs ?? this.sessionExpiryTimeoutMs;

			this.sessionExpiryTimer = new Timer(timeoutMs, () => {
				this.runtime.closeFn(
					new ClientSessionExpiredError(`Client session expired.`, timeoutMs),
				);
			});
			this.sessionExpiryTimer.start();
		}

		/**
		 * Whether GC should run or not. The following conditions have to be met to run sweep:
		 *
		 * 1. GC should be enabled for this container.
		 *
		 * 2. GC should not be disabled via disableGC GC option.
		 *
		 * These conditions can be overridden via runGCKey feature flag.
		 */
		this.shouldRunGC =
			this.mc.config.getBoolean(runGCKey) ??
			// GC must be enabled for the document.
			(this.gcEnabled &&
				// GC must not be disabled via GC options.
				!this.gcOptions.disableGC);

		/**
		 * Whether sweep should run or not. The following conditions have to be met to run sweep:
		 *
		 * 1. Overall GC or mark phase must be enabled (this.shouldRunGC).
		 * 2. Sweep timeout should be available. Without this, we wouldn't know when an object should be deleted.
		 * 3. The driver must implement the policy limiting the age of snapshots used for loading. Otherwise
		 * the Sweep Timeout calculation is not valid. We use the persisted value to ensure consistency over time.
		 * 4. Sweep should be enabled for this container (this.sweepEnabled). This can be overridden via runSweep
		 * feature flag.
		 */
		this.shouldRunSweep =
			this.shouldRunGC &&
			this.sweepTimeoutMs !== undefined &&
			(this.mc.config.getBoolean(runSweepKey) ?? this.sweepEnabled);

		this.trackGCState = this.mc.config.getBoolean(trackGCStateKey) === true;

		// Override inactive timeout if test config or gc options to override it is set.
		this.inactiveTimeoutMs =
			this.mc.config.getNumber("Fluid.GarbageCollection.TestOverride.InactiveTimeoutMs") ??
			this.gcOptions.inactiveTimeoutMs ??
			defaultInactiveTimeoutMs;

		// Inactive timeout must be greater than sweep timeout since a node goes from active -> inactive -> sweep ready.
		if (this.sweepTimeoutMs !== undefined && this.inactiveTimeoutMs > this.sweepTimeoutMs) {
			throw new UsageError("inactive timeout should not be greater than the sweep timeout");
		}

		// Whether we are running in test mode. In this mode, unreferenced nodes are immediately deleted.
		this.testMode =
			this.mc.config.getBoolean(gcTestModeKey) ?? this.gcOptions.runGCInTestMode === true;
		// Whether we are running in tombstone mode. This is enabled by default if sweep won't run. It can be disabled
		// via feature flags.
		this.tombstoneMode =
			!this.shouldRunSweep && this.mc.config.getBoolean(disableTombstoneKey) !== true;

		this.summaryStateTracker = new GCSummaryStateTracker(
			this.shouldRunGC,
			this.trackGCState,
			this.tombstoneMode,
			this.mc,
			baseSnapshot?.trees[gcTreeKey] !== undefined /* wasGCRunInBaseSnapshot */,
			gcVersionInBaseSnapshot,
		);

		// Get the GC data from the base snapshot. Use LazyPromise because we only want to do this once since it
		// it involves fetching blobs from storage which is expensive.
		this.baseSnapshotDataP = new LazyPromise<IGarbageCollectionSnapshotData | undefined>(
			async () => {
				if (baseSnapshot === undefined) {
					return undefined;
				}

				try {
					// For newer documents, GC data should be present in the GC tree in the root of the snapshot.
					const gcSnapshotTree = baseSnapshot.trees[gcTreeKey];
					if (gcSnapshotTree !== undefined) {
						return getGCDataFromSnapshot(gcSnapshotTree, readAndParseBlob);
					}

					// back-compat - Older documents will have the GC blobs in each data store's summary tree. Get them and
					// consolidate into IGarbageCollectionState format.
					// Add a node for the root node that is not present in older snapshot format.
					const gcState: IGarbageCollectionState = {
						gcNodes: { "/": { outboundRoutes: [] } },
					};
					const dataStoreSnapshotTree = getSummaryForDatastores(baseSnapshot, metadata);
					assert(
						dataStoreSnapshotTree !== undefined,
						0x2a8 /* "Expected data store snapshot tree in base snapshot" */,
					);
					for (const [dsId, dsSnapshotTree] of Object.entries(
						dataStoreSnapshotTree.trees,
					)) {
						const blobId = dsSnapshotTree.blobs[gcTreeKey];
						if (blobId === undefined) {
							continue;
						}

						const gcSummaryDetails =
							await readAndParseBlob<IGarbageCollectionSummaryDetailsLegacy>(blobId);
						// If there are no nodes for this data store, skip it.
						if (gcSummaryDetails.gcData?.gcNodes === undefined) {
							continue;
						}

						const dsRootId = `/${dsId}`;
						// Since we used to write GC data at data store level, we won't have an entry for the root ("/").
						// Construct that entry by adding root data store ids to its outbound routes.
						const initialSnapshotDetails =
							await readAndParseBlob<ReadFluidDataStoreAttributes>(
								dsSnapshotTree.blobs[dataStoreAttributesBlobName],
							);
						if (initialSnapshotDetails.isRootDataStore) {
							gcState.gcNodes["/"].outboundRoutes.push(dsRootId);
						}

						for (const [id, outboundRoutes] of Object.entries(
							gcSummaryDetails.gcData.gcNodes,
						)) {
							// Prefix the data store id to the GC node ids to make them relative to the root from being
							// relative to the data store. Similar to how its done in DataStore::getGCData.
							const rootId = id === "/" ? dsRootId : `${dsRootId}${id}`;
							gcState.gcNodes[rootId] = {
								outboundRoutes: Array.from(outboundRoutes),
							};
						}
						assert(
							gcState.gcNodes[dsRootId] !== undefined,
							0x2a9 /* GC nodes for data store not in GC blob */,
						);
						gcState.gcNodes[dsRootId].unreferencedTimestampMs =
							gcSummaryDetails.unrefTimestamp;
					}
					// If there is only one node (root node just added above), either GC is disabled or we are loading from
					// the first summary generated by detached container. In both cases, GC was not run - return undefined.
					return Object.keys(gcState.gcNodes).length === 1
						? undefined
						: { gcState, tombstones: undefined, deletedNodes: undefined };
				} catch (error) {
					const dpe = DataProcessingError.wrapIfUnrecognized(
						error,
						"FailedToInitializeGC",
					);
					dpe.addTelemetryProperties({ gcConfigs: JSON.stringify(this.configs) });
					throw dpe;
				}
			},
		);

		/**
		 * Set up the initializer which initializes the GC state from the data in base snapshot. This is done when
		 * connected in write mode or when GC runs the first time. It sets up all unreferenced nodes from the base
		 * GC state and updates their inactive or sweep ready state.
		 */
		this.initializeGCStateFromBaseSnapshotP = new LazyPromise<void>(async () => {
			/**
			 * If there is no current reference timestamp, skip initialization. We need the current timestamp to track
			 * how long objects have been unreferenced and if they can be deleted.
			 *
			 * Note that the only scenario where there is no reference timestamp is when no ops have ever been processed
			 * for this container and it is in read mode. In this scenario, there is no point in running GC anyway
			 * because references in the container do not change without any ops, i.e., there is nothing to collect.
			 */
			const currentReferenceTimestampMs = this.runtime.getCurrentReferenceTimestampMs();
			if (currentReferenceTimestampMs === undefined) {
				// Log an event so we can evaluate how often we run into this scenario.
				this.mc.logger.sendErrorEvent({
					eventName: "GarbageCollectorInitializedWithoutTimestamp",
					gcConfigs: JSON.stringify(this.configs),
				});
				return;
			}
			/**
			 * The base snapshot data will not be present if the container is loaded from:
			 * 1. The first summary created by the detached container.
			 * 2. A summary that was generated with GC disabled.
			 * 3. A summary that was generated before GC even existed.
			 */
			const baseSnapshotData = await this.baseSnapshotDataP;
			if (baseSnapshotData === undefined) {
				return;
			}
			this.updateStateFromSnapshotData(baseSnapshotData, currentReferenceTimestampMs);
		});

		// Get the GC details from the GC state in the base summary. This is returned in getBaseGCDetails which is
		// used to initialize the GC state of all the nodes in the container.
		this.baseGCDetailsP = new LazyPromise<IGarbageCollectionDetailsBase>(async () => {
			const baseSnapshotData = await this.baseSnapshotDataP;
			if (baseSnapshotData === undefined) {
				return {};
			}

			const gcNodes: { [id: string]: string[] } = {};
			for (const [nodeId, nodeData] of Object.entries(baseSnapshotData.gcState.gcNodes)) {
				gcNodes[nodeId] = Array.from(nodeData.outboundRoutes);
			}
			// Run GC on the nodes in the base summary to get the routes used in each node in the container.
			// This is an optimization for space (vs performance) wherein we don't need to store the used routes of
			// each node in the summary.
			const usedRoutes = runGarbageCollection(gcNodes, ["/"]).referencedNodeIds;

			return { gcData: { gcNodes }, usedRoutes };
		});

		// Log all the GC options and the state determined by the garbage collector. This is interesting only for the
		// summarizer client since it is the only one that runs GC. It also helps keep the telemetry less noisy.
		if (this.isSummarizerClient) {
			this.mc.logger.sendTelemetryEvent({
				eventName: "GarbageCollectorLoaded",
				gcConfigs: JSON.stringify(this.configs),
			});
		}
	}

	/**
	 * Called during container initialization. Initialize from the tombstone state in the base snapshot. This is done
	 * during initialization so that deleted or tombstoned objects are marked as such before they are loaded or used.
	 */
	public async initializeBaseState(): Promise<void> {
		const baseSnapshotData = await this.baseSnapshotDataP;
		/**
		 * The base snapshot data will not be present if the container is loaded from:
		 * 1. The first summary created by the detached container.
		 * 2. A summary that was generated with GC disabled.
		 * 3. A summary that was generated before GC even existed.
		 */
		if (baseSnapshotData === undefined) {
			return;
		}

		// Initialize the deleted nodes from the snapshot. This is done irrespective of whether sweep is enabled or not
		// to identify deleted nodes' usage.
		if (baseSnapshotData.deletedNodes !== undefined) {
			this.deletedNodes = new Set(baseSnapshotData.deletedNodes);
		}

		// If running in tombstone mode, initialize the tombstone state from the snapshot. Also, notify the runtime of
		// tombstone routes.
		if (this.tombstoneMode && baseSnapshotData.tombstones !== undefined) {
			// Create a copy since we are writing from a source we don't control
			this.tombstones = Array.from(baseSnapshotData.tombstones);
			this.runtime.updateTombstonedRoutes(this.tombstones);
		}
	}

	/**
	 * Update state from the given snapshot data. This is done during load and during refreshing state from a snapshot.
	 * All current tracking is reset and updated from the data in the snapshot.
	 * @param snapshotData - The snapshot data to update state from. If this is undefined, all GC state and tracking
	 * is reset.
	 * @param currentReferenceTimestampMs - The current reference timestamp for marking unreferenced nodes' unreferenced
	 * timestamp.
	 */
	private updateStateFromSnapshotData(
		snapshotData: IGarbageCollectionSnapshotData | undefined,
		currentReferenceTimestampMs: number,
	) {
		/**
		 * Note: "newReferencesSinceLastRun" is not reset here. This is done because there may be references since the
		 * snapshot that we are updating state from. For example, this client may have processed ops till seq#1000 and
		 * its refreshing state from a summary that happened at seq#900. In this case, there may be references between
		 * seq#901 and seq#1000 that we don't want to reset.
		 * Unfortunately, there is no way to track the seq# of ops that add references, so we choose to not reset any
		 * references here. This should be fine because, in the worst case, we may end up updating the unreferenced
		 * timestamp of a node which will delay its deletion. Although not ideal, this will only happen in rare
		 * scenarios, so it should be okay.
		 */

		// Clear all existing unreferenced state tracking.
		for (const [, nodeStateTracker] of this.unreferencedNodesState) {
			nodeStateTracker.stopTracking();
		}
		this.unreferencedNodesState.clear();

		// If running sweep, the tombstone state represents the list of nodes that have been deleted during sweep.
		// If running in tombstone mode, the tombstone state represents the list of nodes that have been marked as
		// tombstones.
		// If this call is because we are refreshing from a snapshot due to an ack, it is likely that the GC state
		// in the snapshot is newer than this client's. And so, the deleted / tombstone nodes need to be updated.
		if (this.shouldRunSweep) {
			const snapshotDeletedNodes = snapshotData?.deletedNodes
				? new Set(snapshotData.deletedNodes)
				: undefined;
			// If the snapshot contains deleted nodes that are not yet deleted by this client, ask the runtime to
			// delete them.
			if (snapshotDeletedNodes !== undefined) {
				const newDeletedNodes: string[] = [];
				for (const nodeId of snapshotDeletedNodes) {
					if (!this.deletedNodes.has(nodeId)) {
						newDeletedNodes.push(nodeId);
					}
				}
				if (newDeletedNodes.length > 0) {
					// Call container runtime to delete these nodes and add deleted nodes to this.deletedNodes.
				}
			}
		} else if (this.tombstoneMode) {
			// The snapshot may contain more or fewer tombstone nodes than this client. Update tombstone state and
			// notify the runtime to update its state as well.
			this.tombstones = snapshotData?.tombstones ? Array.from(snapshotData.tombstones) : [];
			this.runtime.updateTombstonedRoutes(this.tombstones);
		}

		// Update the summary state tracker's state from this snapshot.
		this.summaryStateTracker.updateStateFromSnapshotData(snapshotData);

		// If there is no snapshot data, it means this snapshot was generated with GC disabled. Unset all GC state.
		if (snapshotData === undefined) {
			this.gcDataFromLastRun = undefined;
			return;
		}

		// Update unreferenced state tracking as per the GC state in the snapshot data and update gcDataFromLastRun
		// to the GC data from the snapshot data.
		const gcNodes: { [id: string]: string[] } = {};
		for (const [nodeId, nodeData] of Object.entries(snapshotData.gcState.gcNodes)) {
			if (nodeData.unreferencedTimestampMs !== undefined) {
				this.unreferencedNodesState.set(
					nodeId,
					new UnreferencedStateTracker(
						nodeData.unreferencedTimestampMs,
						this.inactiveTimeoutMs,
						currentReferenceTimestampMs,
						this.sweepTimeoutMs,
					),
				);
			}
			gcNodes[nodeId] = Array.from(nodeData.outboundRoutes);
		}
		this.gcDataFromLastRun = { gcNodes };
	}

	/**
	 * Called when the connection state of the runtime changes, i.e., it connects or disconnects. GC subscribes to this
	 * to initialize the base state for non-summarizer clients so that they can track inactive / sweep ready nodes.
	 * @param connected - Whether the runtime connected / disconnected.
	 * @param clientId - The clientId of this runtime.
	 */
	public setConnectionState(connected: boolean, clientId?: string | undefined): void {
		/**
		 * For all clients, initialize the base state when the container becomes active, i.e., it transitions
		 * to "write" mode. This will ensure that the container's own join op is processed and there is a recent
		 * reference timestamp that will be used to update the state of unreferenced nodes. Also, all trailing ops which
		 * could affect the GC state will have been processed.
		 *
		 * If GC is up-to-date for the client and the summarizing client, there will be an doubling of both
		 * InactiveObject_Loaded and SweepReady_Loaded errors, as there will be one from the sending client and one from
		 * the receiving summarizer client.
		 *
		 * Ideally, this initialization should only be done for summarizer client. However, we are currently rolling out
		 * sweep in phases and we want to track when inactive and sweep ready objects are used in any client.
		 */
		if (this.activeConnection() && this.shouldRunGC) {
			this.initializeGCStateFromBaseSnapshotP.catch((error) => {});
		}
	}

	/**
	 * Runs garbage collection and updates the reference / used state of the nodes in the container.
	 * @returns stats of the GC run or undefined if GC did not run.
	 */
	public async collectGarbage(
		options: {
			/** Logger to use for logging GC events */
			logger?: ITelemetryLogger;
			/** True to run GC sweep phase after the mark phase */
			runSweep?: boolean;
			/** True to generate full GC data */
			fullGC?: boolean;
		},
		telemetryContext?: ITelemetryContext,
	): Promise<IGCStats | undefined> {
		const fullGC =
			options.fullGC ??
			(this.gcOptions.runFullGC === true ||
				this.summaryStateTracker.doesSummaryStateNeedReset());
		const logger = options.logger
			? ChildLogger.create(options.logger, undefined, {
					all: { completedGCRuns: () => this.completedRuns },
			  })
			: this.mc.logger;

		/**
		 * If there is no current reference timestamp, skip running GC. We need the current timestamp to track
		 * how long objects have been unreferenced and if they should be deleted.
		 *
		 * Note that the only scenario where GC is called and there is no reference timestamp is when no ops have ever
		 * been processed for this container and it is in read mode. In this scenario, there is no point in running GC
		 * anyway because references in the container do not change without any ops, i.e., there is nothing to collect.
		 */
		const currentReferenceTimestampMs = this.runtime.getCurrentReferenceTimestampMs();
		if (currentReferenceTimestampMs === undefined) {
			// Log an event so we can evaluate how often we run into this scenario.
			logger.sendErrorEvent({
				eventName: "CollectGarbageCalledWithoutTimestamp",
				gcConfigs: JSON.stringify(this.configs),
			});
			return undefined;
		}

		// Add the options that are used to run GC to the telemetry context.
		telemetryContext?.setMultiple("fluid_GC", "Options", {
			fullGC,
			runSweep: options.runSweep,
		});

		return PerformanceEvent.timedExecAsync(
			logger,
			{ eventName: "GarbageCollection" },
			async (event) => {
				await this.runPreGCSteps();

				// Get the runtime's GC data and run GC on the reference graph in it.
				const gcData = await this.runtime.getGCData(fullGC);
				const gcResult = runGarbageCollection(gcData.gcNodes, ["/"]);

				const gcStats = await this.runPostGCSteps(
					gcData,
					gcResult,
					logger,
					currentReferenceTimestampMs,
				);
				event.end({ ...gcStats, timestamp: currentReferenceTimestampMs });
				this.completedRuns++;
				return gcStats;
			},
			{ end: true, cancel: "error" },
		);
	}

	private async runPreGCSteps() {
		// Ensure that state has been initialized from the base snapshot data.
		await this.initializeGCStateFromBaseSnapshotP;
		// Let the runtime update its pending state before GC runs.
		await this.runtime.updateStateBeforeGC();
	}

	private async runPostGCSteps(
		gcData: IGarbageCollectionData,
		gcResult: IGCResult,
		logger: ITelemetryLogger,
		currentReferenceTimestampMs: number,
	): Promise<IGCStats> {
		// Generate statistics from the current run. This is done before updating the current state because it
		// generates some of its data based on previous state of the system.
		const gcStats = this.generateStats(gcResult);

		// Update the current mark state and update the runtime of all used routes or ids that used as per the GC run.
		const sweepReadyNodes = this.updateMarkPhase(
			gcData,
			gcResult,
			currentReferenceTimestampMs,
			logger,
		);
		this.runtime.updateUsedRoutes(gcResult.referencedNodeIds);

		// Log events for objects that are ready to be deleted by sweep. When we have sweep enabled, we will
		// delete these objects here instead.
		this.logSweepEvents(logger, currentReferenceTimestampMs);

		let updatedGCData: IGarbageCollectionData = gcData;

		if (this.shouldRunSweep) {
			updatedGCData = this.runSweepPhase(sweepReadyNodes, gcData);
		} else if (this.testMode) {
			// If we are running in GC test mode, delete objects for unused routes. This enables testing scenarios
			// involving access to deleted data.
			this.runtime.updateUnusedRoutes(gcResult.deletedNodeIds);
		} else if (this.tombstoneMode) {
			this.tombstones = sweepReadyNodes;
			// If we are running in GC tombstone mode, update tombstoned routes. This enables testing scenarios
			// involving access to "deleted" data without actually deleting the data from summaries.
			// Note: we will not tombstone in test mode.
			this.runtime.updateTombstonedRoutes(this.tombstones);
		}

		this.gcDataFromLastRun = cloneGCData(updatedGCData);

		// Log pending unreferenced events such as a node being used after inactive. This is done after GC runs and
		// updates its state so that we don't send false positives based on intermediate state. For example, we may get
		// reference to an unreferenced node from another unreferenced node which means the node wasn't revived.
		await this.logUnreferencedEvents(logger);

		return gcStats;
	}

	/**
	 * Summarizes the GC data and returns it as a summary tree.
	 * We current write the entire GC state in a single blob. This can be modified later to write multiple
	 * blobs. All the blob keys should start with `gcBlobPrefix`.
	 */
	public summarize(
		fullTree: boolean,
		trackState: boolean,
		telemetryContext?: ITelemetryContext,
	): ISummarizeResult | undefined {
		if (!this.shouldRunGC || this.gcDataFromLastRun === undefined) {
			return;
		}

		const gcState: IGarbageCollectionState = { gcNodes: {} };
		for (const [nodeId, outboundRoutes] of Object.entries(this.gcDataFromLastRun.gcNodes)) {
			gcState.gcNodes[nodeId] = {
				outboundRoutes,
				unreferencedTimestampMs:
					this.unreferencedNodesState.get(nodeId)?.unreferencedTimestampMs,
			};
		}

		return this.summaryStateTracker.summarize(
			fullTree,
			trackState,
			gcState,
			this.deletedNodes,
			this.tombstones,
		);
	}

	public getMetadata(): IGCMetadata {
		return {
			/**
			 * If GC is enabled, the GC data is written using the current GC version and that is the gcFeature that goes
			 * into the metadata blob. If GC is disabled, the gcFeature is 0.
			 */
			gcFeature: this.gcEnabled ? this.summaryStateTracker.currentGCVersion : 0,
			gcFeatureMatrix: this.persistedGcFeatureMatrix,
			sessionExpiryTimeoutMs: this.sessionExpiryTimeoutMs,
			sweepEnabled: this.sweepEnabled,
			sweepTimeoutMs: this.sweepTimeoutMs,
		};
	}

	/**
	 * Returns a the GC details generated from the base summary. This is used to initialize the GC state of the nodes
	 * in the container.
	 */
	public async getBaseGCDetails(): Promise<IGarbageCollectionDetailsBase> {
		return this.baseGCDetailsP;
	}

	/**
	 * Called to refresh the latest summary state. This happens when either a pending summary is acked or a snapshot
	 * is downloaded and should be used to update the state.
	 */
	public async refreshLatestSummary(
		proposalHandle: string | undefined,
		result: RefreshSummaryResult,
		readAndParseBlob: ReadAndParseBlob,
	): Promise<void> {
		const latestSnapshotData = await this.summaryStateTracker.refreshLatestSummary(
			proposalHandle,
			result,
			readAndParseBlob,
		);

		// If the latest summary was updated but it was not tracked by this client, our state needs to be updated from
		// this snapshot data.
		if (this.shouldRunGC && result.latestSummaryUpdated && !result.wasSummaryTracked) {
			// The current reference timestamp should be available if we are refreshing state from a snapshot. There has
			// to be at least one op (summary op / ack, if nothing else) if a snapshot was taken.
			const currentReferenceTimestampMs = this.runtime.getCurrentReferenceTimestampMs();
			if (currentReferenceTimestampMs === undefined) {
				throw DataProcessingError.create(
					"No reference timestamp when updating GC state from snapshot",
					"refreshLatestSummary",
					undefined,
					{
						proposalHandle,
						summaryRefSeq: result.summaryRefSeq,
						details: JSON.stringify(this.configs),
					},
				);
			}
			this.updateStateFromSnapshotData(latestSnapshotData, currentReferenceTimestampMs);
		}
	}

	/**
	 * Called when a node with the given id is updated. If the node is inactive, log an error.
	 * @param nodePath - The id of the node that changed.
	 * @param reason - Whether the node was loaded or changed.
	 * @param timestampMs - The timestamp when the node changed.
	 * @param packagePath - The package path of the node. This may not be available if the node hasn't been loaded yet.
	 * @param requestHeaders - If the node was loaded via request path, the headers in the request.
	 */
	public nodeUpdated(
		nodePath: string,
		reason: "Loaded" | "Changed",
		timestampMs?: number,
		packagePath?: readonly string[],
		requestHeaders?: IRequestHeader,
	) {
		if (!this.shouldRunGC) {
			return;
		}

		const nodeStateTracker = this.unreferencedNodesState.get(nodePath);
		if (nodeStateTracker && nodeStateTracker.state !== UnreferencedState.Active) {
			this.inactiveNodeUsed(
				reason,
				nodePath,
				nodeStateTracker,
				undefined /* fromNodeId */,
				packagePath,
				timestampMs,
				requestHeaders,
			);
		}
	}

	/**
	 * Called when an outbound reference is added to a node. This is used to identify all nodes that have been
	 * referenced between summaries so that their unreferenced timestamp can be reset.
	 *
	 * @param fromNodePath - The node from which the reference is added.
	 * @param toNodePath - The node to which the reference is added.
	 */
	public addedOutboundReference(fromNodePath: string, toNodePath: string) {
		if (!this.shouldRunGC) {
			return;
		}

		const outboundRoutes = this.newReferencesSinceLastRun.get(fromNodePath) ?? [];
		outboundRoutes.push(toNodePath);
		this.newReferencesSinceLastRun.set(fromNodePath, outboundRoutes);

		const nodeStateTracker = this.unreferencedNodesState.get(toNodePath);
		if (nodeStateTracker && nodeStateTracker.state !== UnreferencedState.Active) {
			this.inactiveNodeUsed("Revived", toNodePath, nodeStateTracker, fromNodePath);
		}

		if (this.tombstones.includes(toNodePath)) {
			const nodeType = this.runtime.getNodeType(toNodePath);

			let eventName = "GC_Tombstone_SubDatastore_Revived";
			if (nodeType === GCNodeType.DataStore) {
				eventName = "GC_Tombstone_Datastore_Revived";
			} else if (nodeType === GCNodeType.Blob) {
				eventName = "GC_Tombstone_Blob_Revived";
			}

			sendGCUnexpectedUsageEvent(
				this.mc,
				{
					eventName,
					category: "generic",
					url: trimLeadingSlashes(toNodePath),
					nodeType,
					gcTombstoneEnforcementAllowed: this.runtime.gcTombstoneEnforcementAllowed,
				},
				undefined /* packagePath */,
			);
		}
	}

	/**
	 * Returns whether a node with the given path has been deleted or not. This can be used by the runtime to identify
	 * cases where objects are used after they are deleted and throw / log errors accordingly.
	 */
	public isNodeDeleted(nodePath: string): boolean {
		return this.deletedNodes.has(nodePath);
	}

	public dispose(): void {
		this.sessionExpiryTimer?.clear();
		this.sessionExpiryTimer = undefined;
	}

	/**
	 * Updates the state of the system as per the current GC run. It does the following:
	 * 1. Sets up the current GC state as per the gcData.
	 * 2. Starts tracking for nodes that have become unreferenced in this run.
	 * 3. Clears tracking for nodes that were unreferenced but became referenced in this run.
	 * @param gcData - The data representing the reference graph on which GC is run.
	 * @param gcResult - The result of the GC run on the gcData.
	 * @param currentReferenceTimestampMs - The timestamp to be used for unreferenced nodes' timestamp.
	 * @returns - A list of sweep ready nodes. (Nodes ready to be deleted)
	 */
	private updateMarkPhase(
		gcData: IGarbageCollectionData,
		gcResult: IGCResult,
		currentReferenceTimestampMs: number,
		logger: ITelemetryLogger,
	) {
		// Get references from the current GC run + references between previous and current run and then update each
		// node's state
		const allNodesReferencedBetweenGCs =
			this.findAllNodesReferencedBetweenGCs(gcData, this.gcDataFromLastRun, logger) ??
			gcResult.referencedNodeIds;
		this.newReferencesSinceLastRun.clear();

		// Iterate through the referenced nodes and stop tracking if they were unreferenced before.
		for (const nodeId of allNodesReferencedBetweenGCs) {
			const nodeStateTracker = this.unreferencedNodesState.get(nodeId);
			if (nodeStateTracker !== undefined) {
				// Stop tracking so as to clear out any running timers.
				nodeStateTracker.stopTracking();
				// Delete the node as we don't need to track it any more.
				this.unreferencedNodesState.delete(nodeId);
			}
		}

		/**
		 * If a node became unreferenced in this run, start tracking it.
		 * If a node was already unreferenced, update its tracking information. Since the current reference time is
		 * from the ops seen, this will ensure that we keep updating the unreferenced state as time moves forward.
		 *
		 * If a node is sweep ready, store and then return it.
		 */
		const sweepReadyNodes: string[] = [];
		for (const nodeId of gcResult.deletedNodeIds) {
			const nodeStateTracker = this.unreferencedNodesState.get(nodeId);
			if (nodeStateTracker === undefined) {
				this.unreferencedNodesState.set(
					nodeId,
					new UnreferencedStateTracker(
						currentReferenceTimestampMs,
						this.inactiveTimeoutMs,
						currentReferenceTimestampMs,
						this.sweepTimeoutMs,
					),
				);
			} else {
				nodeStateTracker.updateTracking(currentReferenceTimestampMs);
				if (nodeStateTracker.state === UnreferencedState.SweepReady) {
					sweepReadyNodes.push(nodeId);
				}
			}
		}

		return sweepReadyNodes;
	}

	/**
	 * Deletes nodes from both the runtime and garbage collection
	 * @param sweepReadyNodes - nodes that are ready to be deleted
	 */
	private runSweepPhase(sweepReadyNodes: string[], gcData: IGarbageCollectionData) {
		// TODO: GC:Validation - validate that removed routes are not double deleted
		// TODO: GC:Validation - validate that the child routes of removed routes are deleted as well
		const sweptRoutes = this.runtime.deleteSweepReadyNodes(sweepReadyNodes);
		const updatedGCData = this.deleteSweptRoutes(sweptRoutes, gcData);

		for (const nodeId of sweptRoutes) {
			const nodeStateTracker = this.unreferencedNodesState.get(nodeId);
			// TODO: GC:Validation - assert that the nodeStateTracker is defined
			if (nodeStateTracker !== undefined) {
				// Stop tracking so as to clear out any running timers.
				nodeStateTracker.stopTracking();
				// Delete the node as we don't need to track it any more.
				this.unreferencedNodesState.delete(nodeId);
			}
			// TODO: GC:Validation - assert that the deleted node is not a duplicate
			this.deletedNodes.add(nodeId);
		}

		return updatedGCData;
	}

	/**
	 * @returns IGarbageCollectionData after deleting the sweptRoutes from the gcData
	 */
	private deleteSweptRoutes(
		sweptRoutes: string[],
		gcData: IGarbageCollectionData,
	): IGarbageCollectionData {
		const sweptRoutesSet = new Set<string>(sweptRoutes);
		const gcNodes: { [id: string]: string[] } = {};
		for (const [id, outboundRoutes] of Object.entries(gcData.gcNodes)) {
			if (!sweptRoutesSet.has(id)) {
				gcNodes[id] = Array.from(outboundRoutes);
			}
		}

		// TODO: GC:Validation - assert that the nodeId is in gcData

		return {
			gcNodes,
		};
	}

	/**
	 * Since GC runs periodically, the GC data that is generated only tells us the state of the world at that point in
	 * time. There can be nodes that were referenced in between two runs and their unreferenced state needs to be
	 * updated. For example, in the following scenarios not updating the unreferenced timestamp can lead to deletion of
	 * these objects while there can be in-memory referenced to it:
	 * 1. A node transitions from `unreferenced -> referenced -> unreferenced` between two runs. When the reference is
	 * added, the object may have been accessed and in-memory reference to it added.
	 * 2. A reference is added from one unreferenced node to one or more unreferenced nodes. Even though the node[s] were
	 * unreferenced, they could have been accessed and in-memory reference to them added.
	 *
	 * This function identifies nodes that were referenced since the last run.
	 * If these nodes are currently unreferenced, they will be assigned new unreferenced state by the current run.
	 *
	 * @returns - a list of all nodes referenced from the last local summary until now.
	 */
	private findAllNodesReferencedBetweenGCs(
		currentGCData: IGarbageCollectionData,
		previousGCData: IGarbageCollectionData | undefined,
		logger: ITelemetryLogger,
	): string[] | undefined {
		// If we haven't run GC before there is nothing to do.
		// No previousGCData, means nothing is unreferenced, and there are no reference state trackers to clear
		if (previousGCData === undefined) {
			return undefined;
		}

		// Find any references that haven't been identified correctly.
		const missingExplicitReferences = this.findMissingExplicitReferences(
			currentGCData,
			previousGCData,
			this.newReferencesSinceLastRun,
		);

		if (missingExplicitReferences.length > 0) {
			missingExplicitReferences.forEach((missingExplicitReference) => {
				logger.sendErrorEvent({
					eventName: "gcUnknownOutboundReferences",
					gcNodeId: missingExplicitReference[0],
					gcRoutes: JSON.stringify(missingExplicitReference[1]),
				});
			});
		}

		// No references were added since the last run so we don't have to update reference states of any unreferenced
		// nodes. There is no in between state at this point.
		if (this.newReferencesSinceLastRun.size === 0) {
			return undefined;
		}

		/**
		 * Generate a super set of the GC data that contains the nodes and edges from last run, plus any new node and
		 * edges that have been added since then. To do this, combine the GC data from the last run and the current
		 * run, and then add the references since last run.
		 *
		 * Note on why we need to combine the data from previous run, current run and all references in between -
		 * 1. We need data from last run because some of its references may have been deleted since then. If those
		 * references added new outbound references before they were deleted, we need to detect them.
		 *
		 * 2. We need new outbound references since last run because some of them may have been deleted later. If those
		 * references added new outbound references before they were deleted, we need to detect them.
		 *
		 * 3. We need data from the current run because currently we may not detect when DDSes are referenced:
		 * - We don't require DDSes handles to be stored in a referenced DDS.
		 * - A new data store may have "root" DDSes already created and we don't detect them today.
		 */
		const gcDataSuperSet = concatGarbageCollectionData(previousGCData, currentGCData);
		const newOutboundRoutesSinceLastRun: string[] = [];
		this.newReferencesSinceLastRun.forEach((outboundRoutes: string[], sourceNodeId: string) => {
			if (gcDataSuperSet.gcNodes[sourceNodeId] === undefined) {
				gcDataSuperSet.gcNodes[sourceNodeId] = outboundRoutes;
			} else {
				gcDataSuperSet.gcNodes[sourceNodeId].push(...outboundRoutes);
			}
			newOutboundRoutesSinceLastRun.push(...outboundRoutes);
		});

		/**
		 * Run GC on the above reference graph starting with root and all new outbound routes. This will generate a
		 * list of all nodes that could have been referenced since the last run. If any of these nodes are unreferenced,
		 * unreferenced, stop tracking them and remove from unreferenced list.
		 * Note that some of these nodes may be unreferenced now and if so, the current run will mark them as
		 * unreferenced and add unreferenced state.
		 */
		const gcResult = runGarbageCollection(gcDataSuperSet.gcNodes, [
			"/",
			...newOutboundRoutesSinceLastRun,
		]);
		return gcResult.referencedNodeIds;
	}

	/**
	 * Finds all new references or outbound routes in the current graph that haven't been explicitly notified to GC.
	 * The principle is that every new reference or outbound route must be notified to GC via the
	 * addedOutboundReference method. It it hasn't, its a bug and we want to identify these scenarios.
	 *
	 * In more simple terms:
	 * Missing Explicit References = Current References - Previous References - Explicitly Added References;
	 *
	 * @param currentGCData - The GC data (reference graph) from the current GC run.
	 * @param previousGCData - The GC data (reference graph) from the previous GC run.
	 * @param explicitReferences - New references added explicity between the previous and the current run.
	 * @returns - a list of missing explicit references
	 */
	private findMissingExplicitReferences(
		currentGCData: IGarbageCollectionData,
		previousGCData: IGarbageCollectionData,
		explicitReferences: Map<string, string[]>,
	): [string, string[]][] {
		assert(
			previousGCData !== undefined,
			0x2b7 /* "Can't validate correctness without GC data from last run" */,
		);

		const currentGraph = Object.entries(currentGCData.gcNodes);
		const missingExplicitReferences: [string, string[]][] = [];
		currentGraph.forEach(([nodeId, currentOutboundRoutes]) => {
			const previousRoutes = previousGCData.gcNodes[nodeId] ?? [];
			const explicitRoutes = explicitReferences.get(nodeId) ?? [];
			const missingExplicitRoutes: string[] = [];

			/**
			 * 1. For routes in the current GC data, routes that were not present in previous GC data and did not have
			 * explicit references should be added to missing explicit routes list.
			 * 2. Only include data store and blob routes since GC only works for these two.
			 * Note: Due to a bug with de-duped blobs, only adding data store routes for now.
			 * 3. Ignore DDS routes to their parent datastores since those were added implicitly. So, there won't be
			 * explicit routes to them.
			 */
			currentOutboundRoutes.forEach((route) => {
				const nodeType = this.runtime.getNodeType(route);
				if (
					(nodeType === GCNodeType.DataStore || nodeType === GCNodeType.Blob) &&
					!nodeId.startsWith(route) &&
					!previousRoutes.includes(route) &&
					!explicitRoutes.includes(route)
				) {
					missingExplicitRoutes.push(route);
				}
			});
			if (missingExplicitRoutes.length > 0) {
				missingExplicitReferences.push([nodeId, missingExplicitRoutes]);
			}
		});

		// Ideally missingExplicitReferences should always have a size 0
		return missingExplicitReferences;
	}

	/**
	 * Generates the stats of a garbage collection run from the given results of the run.
	 * @param gcResult - The result of a GC run.
	 * @returns the GC stats of the GC run.
	 */
	private generateStats(gcResult: IGCResult): IGCStats {
		const gcStats: IGCStats = {
			nodeCount: 0,
			dataStoreCount: 0,
			attachmentBlobCount: 0,
			unrefNodeCount: 0,
			unrefDataStoreCount: 0,
			unrefAttachmentBlobCount: 0,
			updatedNodeCount: 0,
			updatedDataStoreCount: 0,
			updatedAttachmentBlobCount: 0,
		};

		const updateNodeStats = (nodeId: string, referenced: boolean) => {
			gcStats.nodeCount++;
			// If there is no previous GC data, every node's state is generated and is considered as updated.
			// Otherwise, find out if any node went from referenced to unreferenced or vice-versa.
			const stateUpdated =
				this.gcDataFromLastRun === undefined ||
				this.unreferencedNodesState.has(nodeId) === referenced;
			if (stateUpdated) {
				gcStats.updatedNodeCount++;
			}
			if (!referenced) {
				gcStats.unrefNodeCount++;
			}

			if (this.runtime.getNodeType(nodeId) === GCNodeType.DataStore) {
				gcStats.dataStoreCount++;
				if (stateUpdated) {
					gcStats.updatedDataStoreCount++;
				}
				if (!referenced) {
					gcStats.unrefDataStoreCount++;
				}
			}
			if (this.runtime.getNodeType(nodeId) === GCNodeType.Blob) {
				gcStats.attachmentBlobCount++;
				if (stateUpdated) {
					gcStats.updatedAttachmentBlobCount++;
				}
				if (!referenced) {
					gcStats.unrefAttachmentBlobCount++;
				}
			}
		};

		for (const nodeId of gcResult.referencedNodeIds) {
			updateNodeStats(nodeId, true /* referenced */);
		}

		for (const nodeId of gcResult.deletedNodeIds) {
			updateNodeStats(nodeId, false /* referenced */);
		}

		return gcStats;
	}

	/**
	 * For nodes that are ready to sweep, log an event for now. Until we start running sweep which deletes objects,
	 * this will give us a view into how much deleted content a container has.
	 */
	private logSweepEvents(logger: ITelemetryLogger, currentReferenceTimestampMs: number) {
		if (
			this.mc.config.getBoolean(disableSweepLogKey) === true ||
			this.sweepTimeoutMs === undefined
		) {
			return;
		}

		this.unreferencedNodesState.forEach((nodeStateTracker, nodeId) => {
			if (nodeStateTracker.state !== UnreferencedState.SweepReady) {
				return;
			}

			const nodeType = this.runtime.getNodeType(nodeId);
			if (nodeType !== GCNodeType.DataStore && nodeType !== GCNodeType.Blob) {
				return;
			}

			// Log deleted event for each node only once to reduce noise in telemetry.
			const uniqueEventId = `Deleted-${nodeId}`;
			if (this.loggedUnreferencedEvents.has(uniqueEventId)) {
				return;
			}
			this.loggedUnreferencedEvents.add(uniqueEventId);
			logger.sendTelemetryEvent({
				eventName: "GCObjectDeleted",
				id: nodeId,
				type: nodeType,
				age: currentReferenceTimestampMs - nodeStateTracker.unreferencedTimestampMs,
				timeout: this.sweepTimeoutMs,
				completedGCRuns: this.completedRuns,
				lastSummaryTime: this.getLastSummaryTimestampMs(),
			});
		});
	}

	/**
	 * Called when an inactive node is used after. Queue up an event that will be logged next time GC runs.
	 */
	private inactiveNodeUsed(
		usageType: "Changed" | "Loaded" | "Revived",
		nodeId: string,
		nodeStateTracker: UnreferencedStateTracker,
		fromNodeId?: string,
		packagePath?: readonly string[],
		currentReferenceTimestampMs = this.runtime.getCurrentReferenceTimestampMs(),
		requestHeaders?: IRequestHeader,
	) {
		// If there is no reference timestamp to work with, no ops have been processed after creation. If so, skip
		// logging as nothing interesting would have happened worth logging.
		// If the node is active, skip logging.
		if (
			currentReferenceTimestampMs === undefined ||
			nodeStateTracker.state === UnreferencedState.Active
		) {
			return;
		}

		// We only care about data stores and attachment blobs for this telemetry since GC only marks these objects
		// as unreferenced. Also, if an inactive DDS is used, the corresponding data store store will also be used.
		const nodeType = this.runtime.getNodeType(nodeId);
		if (nodeType !== GCNodeType.DataStore && nodeType !== GCNodeType.Blob) {
			return;
		}

		const state = nodeStateTracker.state;
		const uniqueEventId = `${state}-${nodeId}-${usageType}`;
		if (this.loggedUnreferencedEvents.has(uniqueEventId)) {
			return;
		}
		this.loggedUnreferencedEvents.add(uniqueEventId);

		const propsToLog = {
			id: nodeId,
			type: nodeType,
			unrefTime: nodeStateTracker.unreferencedTimestampMs,
			age: currentReferenceTimestampMs - nodeStateTracker.unreferencedTimestampMs,
			timeout:
				nodeStateTracker.state === UnreferencedState.Inactive
					? this.inactiveTimeoutMs
					: this.sweepTimeoutMs,
			completedGCRuns: this.completedRuns,
			lastSummaryTime: this.getLastSummaryTimestampMs(),
			...this.createContainerMetadata,
			viaHandle: requestHeaders?.[RuntimeHeaders.viaHandle],
			fromId: fromNodeId,
		};

		// For summarizer client, queue the event so it is logged the next time GC runs if the event is still valid.
		// For non-summarizer client, log the event now since GC won't run on it. This may result in false positives
		// but it's a good signal nonetheless and we can consume it with a grain of salt.
		// Inactive errors are usages of Objects that are unreferenced for at least a period of 7 days.
		// SweepReady errors are usages of Objects that will be deleted by GC Sweep!
		if (this.isSummarizerClient) {
			this.pendingEventsQueue.push({ ...propsToLog, usageType, state });
		} else {
			// For non-summarizer clients, only log "Loaded" type events since these objects may not be loaded in the
			// summarizer clients if they are based off of user actions (such as scrolling to content for these objects)
			// Events generated:
			// InactiveObject_Loaded, SweepReadyObject_Loaded
			if (usageType === "Loaded") {
				const event = {
					...propsToLog,
					eventName: `${state}Object_${usageType}`,
					pkg: packagePathToTelemetryProperty(packagePath),
					stack: generateStack(),
				};

				// Do not log the inactive object x events as error events as they are not the best signal for
				// detecting something wrong with GC either from the partner or from the runtime itself.
				if (state === UnreferencedState.Inactive) {
					this.mc.logger.sendTelemetryEvent(event);
				} else {
					this.mc.logger.sendErrorEvent(event);
				}
			}

			// If SweepReady Usage Detection is enabled, the handler may close the interactive container.
			// Once Sweep is fully implemented, this will be removed since the objects will be gone
			// and errors will arise elsewhere in the runtime
			if (state === UnreferencedState.SweepReady) {
				this.sweepReadyUsageHandler.usageDetectedInInteractiveClient({
					...propsToLog,
					usageType,
				});
			}
		}
	}

	private async logUnreferencedEvents(logger: ITelemetryLogger) {
		// Events sent come only from the summarizer client. In between summaries, events are pushed to a queue and at
		// summary time they are then logged.
		// Events generated:
		// InactiveObject_Loaded, InactiveObject_Changed, InactiveObject_Revived
		// SweepReadyObject_Loaded, SweepReadyObject_Changed, SweepReadyObject_Revived
		for (const eventProps of this.pendingEventsQueue) {
			const { usageType, state, ...propsToLog } = eventProps;
			/**
			 * Revived event is logged only if the node is active. If the node is not active, the reference to it was
			 * from another unreferenced node and this scenario is not interesting to log.
			 * Loaded and Changed events are logged only if the node is not active. If the node is active, it was
			 * revived and a Revived event will be logged for it.
			 */
			const nodeStateTracker = this.unreferencedNodesState.get(eventProps.id);
			const active =
				nodeStateTracker === undefined ||
				nodeStateTracker.state === UnreferencedState.Active;
			if ((usageType === "Revived") === active) {
				const pkg = await this.getNodePackagePath(eventProps.id);
				const fromPkg = eventProps.fromId
					? await this.getNodePackagePath(eventProps.fromId)
					: undefined;
				const event = {
					...propsToLog,
					eventName: `${state}Object_${usageType}`,
					pkg: pkg
						? { value: pkg.join("/"), tag: TelemetryDataTag.CodeArtifact }
						: undefined,
					fromPkg: fromPkg
						? { value: fromPkg.join("/"), tag: TelemetryDataTag.CodeArtifact }
						: undefined,
				};

				if (state === UnreferencedState.Inactive) {
					logger.sendTelemetryEvent(event);
				} else {
					logger.sendErrorEvent(event);
				}
			}
		}
		this.pendingEventsQueue = [];
	}
}
