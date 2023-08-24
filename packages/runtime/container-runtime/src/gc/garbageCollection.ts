/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Timer } from "@fluidframework/common-utils";
import { LazyPromise } from "@fluidframework/core-utils";
import { IRequest, IRequestHeader } from "@fluidframework/core-interfaces";
import {
	gcTreeKey,
	IGarbageCollectionData,
	IGarbageCollectionDetailsBase,
	ISummarizeResult,
	ITelemetryContext,
} from "@fluidframework/runtime-definitions";
import {
	ReadAndParseBlob,
	createResponseError,
	responseToException,
} from "@fluidframework/runtime-utils";
import {
	createChildLogger,
	createChildMonitoringContext,
	DataProcessingError,
	ITelemetryLoggerExt,
	MonitoringContext,
	PerformanceEvent,
} from "@fluidframework/telemetry-utils";

import {
	AllowInactiveRequestHeaderKey,
	InactiveResponseHeaderKey,
	RuntimeHeaders,
} from "../containerRuntime";
import { ClientSessionExpiredError } from "../error";
import { RefreshSummaryResult } from "../summary";
import { generateGCConfigs } from "./gcConfigs";
import {
	GCNodeType,
	IGarbageCollector,
	IGarbageCollectorCreateParams,
	IGarbageCollectionRuntime,
	IGCResult,
	IGCStats,
	UnreferencedState,
	IGCMetadata,
	IGarbageCollectorConfigs,
} from "./gcDefinitions";
import { cloneGCData, concatGarbageCollectionData, getGCDataFromSnapshot } from "./gcHelpers";
import { runGarbageCollection } from "./gcReferenceGraphAlgorithm";
import { IGarbageCollectionSnapshotData, IGarbageCollectionState } from "./gcSummaryDefinitions";
import { GCSummaryStateTracker } from "./gcSummaryStateTracker";
import { UnreferencedStateTracker } from "./gcUnreferencedStateTracker";
import { GCTelemetryTracker } from "./gcTelemetry";

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

	private readonly mc: MonitoringContext;

	private readonly configs: IGarbageCollectorConfigs;

	public get shouldRunGC(): boolean {
		return this.configs.shouldRunGC;
	}

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

	// The number of times GC has successfully completed on this instance of GarbageCollector.
	private completedRuns = 0;

	private readonly runtime: IGarbageCollectionRuntime;
	private readonly isSummarizerClient: boolean;

	private readonly summaryStateTracker: GCSummaryStateTracker;
	private readonly telemetryTracker: GCTelemetryTracker;

	/** For a given node path, returns the node's package path. */
	private readonly getNodePackagePath: (
		nodePath: string,
	) => Promise<readonly string[] | undefined>;
	/** Returns the timestamp of the last summary generated for this container. */
	private readonly getLastSummaryTimestampMs: () => number | undefined;
	/** Returns true if connection is active, i.e. it's "write" connection and the runtime is connected. */
	private readonly activeConnection: () => boolean;

	public get summaryStateNeedsReset(): boolean {
		return this.summaryStateTracker.doesSummaryStateNeedReset;
	}

	/** Returns the count of data stores whose GC state updated since the last summary. */
	public get updatedDSCountSinceLastSummary(): number {
		return this.summaryStateTracker.updatedDSCountSinceLastSummary;
	}

	protected constructor(createParams: IGarbageCollectorCreateParams) {
		this.runtime = createParams.runtime;
		this.isSummarizerClient = createParams.isSummarizerClient;
		this.getNodePackagePath = createParams.getNodePackagePath;
		this.getLastSummaryTimestampMs = createParams.getLastSummaryTimestampMs;
		this.activeConnection = createParams.activeConnection;

		const baseSnapshot = createParams.baseSnapshot;
		const readAndParseBlob = createParams.readAndParseBlob;

		this.mc = createChildMonitoringContext({
			logger: createParams.baseLogger,
			namespace: "GarbageCollector",
			properties: {
				all: { completedGCRuns: () => this.completedRuns },
			},
		});

		this.configs = generateGCConfigs(this.mc, createParams);

		// If session expiry is enabled, we need to close the container when the session expiry timeout expires.
		if (this.configs.sessionExpiryTimeoutMs !== undefined) {
			// If Test Override config is set, override Session Expiry timeout.
			const overrideSessionExpiryTimeoutMs = this.mc.config.getNumber(
				"Fluid.GarbageCollection.TestOverride.SessionExpiryMs",
			);
			const timeoutMs = overrideSessionExpiryTimeoutMs ?? this.configs.sessionExpiryTimeoutMs;

			this.sessionExpiryTimer = new Timer(timeoutMs, () => {
				this.runtime.closeFn(
					new ClientSessionExpiredError(`Client session expired.`, timeoutMs),
				);
			});
			this.sessionExpiryTimer.start();
		}

		this.summaryStateTracker = new GCSummaryStateTracker(
			this.configs,
			baseSnapshot?.trees[gcTreeKey] !== undefined /* wasGCRunInBaseSnapshot */,
		);

		this.telemetryTracker = new GCTelemetryTracker(
			this.mc,
			this.configs,
			this.isSummarizerClient,
			this.runtime.gcTombstoneEnforcementAllowed,
			createParams.createContainerMetadata,
			(nodeId: string) => this.runtime.getNodeType(nodeId),
			(nodeId: string) => this.unreferencedNodesState.get(nodeId),
			this.getNodePackagePath,
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
					if (gcSnapshotTree === undefined) {
						// back-compat - Older documents get their gc data reset for simplicity as there are few of them
						// incremental gc summary will not work with older gc data as well
						return undefined;
					}

					const snapshotData = await getGCDataFromSnapshot(
						gcSnapshotTree,
						readAndParseBlob,
					);

					// If the GC version in base snapshot does not match the GC version currently in effect, the GC data
					// in the snapshot cannot be interpreted correctly. Set everything to undefined except for
					// deletedNodes because irrespective of GC versions, these nodes have been deleted and cannot be
					// brought back. The deletedNodes info is needed to identify when these nodes are used.
					if (this.configs.gcVersionInEffect !== this.configs.gcVersionInBaseSnapshot) {
						return {
							gcState: undefined,
							tombstones: undefined,
							deletedNodes: snapshotData.deletedNodes,
						};
					}
					return snapshotData;
				} catch (error) {
					const dpe = DataProcessingError.wrapIfUnrecognized(
						error,
						"FailedToInitializeGC",
					);
					dpe.addTelemetryProperties({
						gcConfigs: JSON.stringify(this.configs),
					});
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
			this.summaryStateTracker.initializeBaseState(baseSnapshotData);
		});

		// Get the GC details from the GC state in the base summary. This is returned in getBaseGCDetails which is
		// used to initialize the GC state of all the nodes in the container.
		this.baseGCDetailsP = new LazyPromise<IGarbageCollectionDetailsBase>(async () => {
			const baseSnapshotData = await this.baseSnapshotDataP;
			if (baseSnapshotData?.gcState === undefined) {
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
				gcOptions: JSON.stringify(createParams.gcOptions),
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
		if (this.configs.tombstoneMode && baseSnapshotData.tombstones !== undefined) {
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
		if (this.configs.shouldRunSweep) {
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
		} else if (this.configs.tombstoneMode) {
			// The snapshot may contain more or fewer tombstone nodes than this client. Update tombstone state and
			// notify the runtime to update its state as well.
			this.tombstones = snapshotData?.tombstones ? Array.from(snapshotData.tombstones) : [];
			this.runtime.updateTombstonedRoutes(this.tombstones);
		}

		// If there is no snapshot data, it means this snapshot was generated with GC disabled. Unset all GC state.
		if (snapshotData?.gcState === undefined) {
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
						this.configs.inactiveTimeoutMs,
						currentReferenceTimestampMs,
						this.configs.sweepTimeoutMs,
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
		if (this.activeConnection() && this.configs.shouldRunGC) {
			this.initializeGCStateFromBaseSnapshotP.catch((error) => {});
		}
	}

	/**
	 * Returns a the GC details generated from the base summary. This is used to initialize the GC state of the nodes
	 * in the container.
	 */
	public async getBaseGCDetails(): Promise<IGarbageCollectionDetailsBase> {
		return this.baseGCDetailsP;
	}

	/**
	 * Runs garbage collection and updates the reference / used state of the nodes in the container.
	 * @returns stats of the GC run or undefined if GC did not run.
	 */
	public async collectGarbage(
		options: {
			/** Logger to use for logging GC events */
			logger?: ITelemetryLoggerExt;
			/** True to run GC sweep phase after the mark phase */
			runSweep?: boolean;
			/** True to generate full GC data */
			fullGC?: boolean;
		},
		telemetryContext?: ITelemetryContext,
	): Promise<IGCStats | undefined> {
		const fullGC =
			options.fullGC ??
			(this.configs.runFullGC === true || this.summaryStateTracker.doesSummaryStateNeedReset);

		// Add the options that are used to run GC to the telemetry context.
		telemetryContext?.setMultiple("fluid_GC", "Options", {
			fullGC,
			runSweep: options.runSweep,
		});

		const logger = options.logger
			? createChildLogger({
					logger: options.logger,
					properties: {
						all: { completedGCRuns: () => this.completedRuns },
					},
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

		return PerformanceEvent.timedExecAsync(
			logger,
			{ eventName: "GarbageCollection" },
			async (event) => {
				/** Pre-GC steps */
				// Ensure that state has been initialized from the base snapshot data.
				await this.initializeGCStateFromBaseSnapshotP;
				// Let the runtime update its pending state before GC runs.
				await this.runtime.updateStateBeforeGC();

				/** GC step */
				const gcStats = await this.runGC(fullGC, currentReferenceTimestampMs, logger);
				event.end({ ...gcStats, timestamp: currentReferenceTimestampMs });

				/** Post-GC steps */
				// Log pending unreferenced events such as a node being used after inactive. This is done after GC runs and
				// updates its state so that we don't send false positives based on intermediate state. For example, we may get
				// reference to an unreferenced node from another unreferenced node which means the node wasn't revived.
				await this.telemetryTracker.logPendingEvents(logger);
				// Update the state of summary state tracker from this run's stats.
				this.summaryStateTracker.updateStateFromGCRunStats(gcStats);
				this.newReferencesSinceLastRun.clear();
				this.completedRuns++;

				return gcStats;
			},
			{ end: true, cancel: "error" },
		);
	}

	/**
	 * Runs garbage collection. It does the following:
	 * 1. It generates / analyzes the runtime's reference graph.
	 * 2. Generates stats for the GC run based on previous / current GC state.
	 * 3. Runs Mark phase.
	 * 4. Runs Sweep phase.
	 */
	private async runGC(
		fullGC: boolean,
		currentReferenceTimestampMs: number,
		logger: ITelemetryLoggerExt,
	): Promise<IGCStats> {
		// 1. Generate / analyze the runtime's reference graph.
		// Get the reference graph (gcData) and run GC algorithm to get referenced / unreferenced nodes.
		const gcData = await this.runtime.getGCData(fullGC);
		const gcResult = runGarbageCollection(gcData.gcNodes, ["/"]);
		// Get all referenced nodes - References in this run + references between the previous and current runs.
		const allReferencedNodeIds =
			this.findAllNodesReferencedBetweenGCs(gcData, this.gcDataFromLastRun, logger) ??
			gcResult.referencedNodeIds;

		// 2. Generate stats based on the previous / current GC state.
		// Must happen before running Mark / Sweep phase because previous GC state will be updated in these stages.
		const gcStats = this.generateStats(gcResult);

		// 3. Run the Mark phase.
		// It will mark nodes as referenced / unreferenced and return a list of node ids that are ready to be swept.
		const sweepReadyNodeIds = this.runMarkPhase(
			gcResult,
			allReferencedNodeIds,
			currentReferenceTimestampMs,
		);

		// 4. Run the Sweep phase.
		// It will delete sweep ready nodes and return a list of deleted node ids.
		const deletedNodeIds = this.runSweepPhase(
			gcResult,
			sweepReadyNodeIds,
			currentReferenceTimestampMs,
			logger,
		);

		this.gcDataFromLastRun = cloneGCData(
			gcData,
			(id: string) => deletedNodeIds.includes(id) /* filter out deleted nodes */,
		);
		return gcStats;
	}

	/**
	 * Runs the GC Mark phase. It does the following:
	 * 1. Marks all referenced nodes in this run by clearing tracking for them.
	 * 2. Marks unreferenced nodes in this run by starting tracking for them.
	 * 3. Calls the runtime to update nodes that were marked referenced.
	 *
	 * @param gcResult - The result of the GC run on the gcData.
	 * @param allReferencedNodeIds - Nodes referenced in this GC run + referenced between previous and current GC run.
	 * @param currentReferenceTimestampMs - The timestamp to be used for unreferenced nodes' timestamp.
	 * @returns - A list of sweep ready nodes, i.e., nodes that ready to be deleted.
	 */
	private runMarkPhase(
		gcResult: IGCResult,
		allReferencedNodeIds: string[],
		currentReferenceTimestampMs: number,
	): string[] {
		// 1. Marks all referenced nodes by clearing their unreferenced tracker, if any.
		for (const nodeId of allReferencedNodeIds) {
			const nodeStateTracker = this.unreferencedNodesState.get(nodeId);
			if (nodeStateTracker !== undefined) {
				// Stop tracking so as to clear out any running timers.
				nodeStateTracker.stopTracking();
				// Delete the node as we don't need to track it any more.
				this.unreferencedNodesState.delete(nodeId);
			}
		}

		// 2. Mark unreferenced nodes in this run by starting unreferenced tracking for them.
		const sweepReadyNodeIds: string[] = [];
		for (const nodeId of gcResult.deletedNodeIds) {
			const nodeStateTracker = this.unreferencedNodesState.get(nodeId);
			if (nodeStateTracker === undefined) {
				this.unreferencedNodesState.set(
					nodeId,
					new UnreferencedStateTracker(
						currentReferenceTimestampMs,
						this.configs.inactiveTimeoutMs,
						currentReferenceTimestampMs,
						this.configs.sweepTimeoutMs,
					),
				);
			} else {
				// If a node was already unreferenced, update its tracking information. Since the current reference time
				// is from the ops seen, this will ensure that we keep updating unreferenced state as time moves forward.
				nodeStateTracker.updateTracking(currentReferenceTimestampMs);

				// If a node is sweep ready, store it so it can be returned.
				if (nodeStateTracker.state === UnreferencedState.SweepReady) {
					sweepReadyNodeIds.push(nodeId);
				}
			}
		}

		// 3. Call the runtime to update referenced nodes in this run.
		this.runtime.updateUsedRoutes(gcResult.referencedNodeIds);

		return sweepReadyNodeIds;
	}

	/**
	 * Runs the GC Sweep phase. It does the following:
	 * 1. Calls the runtime to delete nodes that are sweep ready.
	 * 2. Clears tracking for deleted nodes.
	 *
	 * @param gcResult - The result of the GC run on the gcData.
	 * @param sweepReadyNodes - List of nodes that are sweep ready.
	 * @param currentReferenceTimestampMs - The timestamp to be used for unreferenced nodes' timestamp.
	 * @param logger - The logger to be used to log any telemetry.
	 * @returns - A list of nodes that have been deleted.
	 */
	private runSweepPhase(
		gcResult: IGCResult,
		sweepReadyNodes: string[],
		currentReferenceTimestampMs: number,
		logger: ITelemetryLoggerExt,
	): string[] {
		// Log events for objects that are ready to be deleted by sweep. This will give us data on sweep when
		// its not enabled.
		this.telemetryTracker.logSweepEvents(
			logger,
			currentReferenceTimestampMs,
			this.unreferencedNodesState,
			this.completedRuns,
			this.getLastSummaryTimestampMs(),
		);

		/**
		 * Currently, there are 3 modes for sweep:
		 * Test mode - Unreferenced nodes are immediately deleted without waiting for them to be sweep ready.
		 * Tombstone mode - Sweep ready modes are marked as tombstones instead of being deleted.
		 * Sweep mode - Sweep ready modes are deleted.
		 *
		 * These modes serve as staging for applications that want to enable sweep by providing an incremental
		 * way to test and validate sweep works as expected.
		 */
		if (this.configs.testMode) {
			// If we are running in GC test mode, unreferenced nodes (gcResult.deletedNodeIds) are deleted.
			this.runtime.updateUnusedRoutes(gcResult.deletedNodeIds);
			return [];
		}

		if (this.configs.tombstoneMode) {
			this.tombstones = sweepReadyNodes;
			// If we are running in GC tombstone mode, update tombstoned routes. This enables testing scenarios
			// involving access to "deleted" data without actually deleting the data from summaries.
			this.runtime.updateTombstonedRoutes(this.tombstones);
			return [];
		}

		if (!this.configs.shouldRunSweep) {
			return [];
		}

		// 1. Call the runtime to delete sweep ready nodes. The runtime returns a list of nodes it deleted.
		// TODO: GC:Validation - validate that removed routes are not double delete and that the child routes of
		// removed routes are deleted as well.
		const deletedNodeIds = this.runtime.deleteSweepReadyNodes(sweepReadyNodes);

		// 2. Clear unreferenced state tracking for deleted nodes.
		for (const nodeId of deletedNodeIds) {
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
		return deletedNodeIds;
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
		logger: ITelemetryLoggerExt,
	): string[] | undefined {
		// If we haven't run GC before there is nothing to do.
		// No previousGCData, means nothing is unreferenced, and there are no reference state trackers to clear
		if (previousGCData === undefined) {
			return undefined;
		}

		/**
		 * If there are references that were not explicitly notified to GC, log an error because this should never happen.
		 * If it does, this may result in the unreferenced timestamps of these nodes not updated when they were referenced.
		 */
		this.telemetryTracker.logIfMissingExplicitReferences(
			currentGCData,
			previousGCData,
			this.newReferencesSinceLastRun,
			logger,
		);

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
	 * Summarizes the GC data and returns it as a summary tree.
	 * We current write the entire GC state in a single blob. This can be modified later to write multiple
	 * blobs. All the blob keys should start with `gcBlobPrefix`.
	 */
	public summarize(
		fullTree: boolean,
		trackState: boolean,
		telemetryContext?: ITelemetryContext,
	): ISummarizeResult | undefined {
		if (!this.configs.shouldRunGC || this.gcDataFromLastRun === undefined) {
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
			 * If GC is enabled, the GC data is written using the GC version in effect and that is the gcFeature that goes
			 * into the metadata blob. If GC is disabled, the gcFeature is 0.
			 */
			gcFeature: this.configs.gcEnabled ? this.configs.gcVersionInEffect : 0,
			gcFeatureMatrix: this.configs.persistedGcFeatureMatrix,
			sessionExpiryTimeoutMs: this.configs.sessionExpiryTimeoutMs,
			sweepEnabled: false, // DEPRECATED - to be removed
			sweepTimeoutMs: this.configs.sweepTimeoutMs,
		};
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
						gcConfigs: JSON.stringify(this.configs),
					},
				);
			}
			this.updateStateFromSnapshotData(latestSnapshotData, currentReferenceTimestampMs);
		}
	}

	/**
	 * Called when a node with the given id is updated. If the node is inactive, log an error.
	 * @param nodePath - The path of the node that changed.
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
		if (!this.configs.shouldRunGC) {
			return;
		}

		// This will log if appropriate
		this.telemetryTracker.nodeUsed({
			id: nodePath,
			usageType: reason,
			currentReferenceTimestampMs:
				timestampMs ?? this.runtime.getCurrentReferenceTimestampMs(),
			packagePath,
			completedGCRuns: this.completedRuns,
			isTombstoned: this.tombstones.includes(nodePath),
			lastSummaryTime: this.getLastSummaryTimestampMs(),
			viaHandle: requestHeaders?.[RuntimeHeaders.viaHandle],
		});

		// Unless this is a Loaded event, we're done after telemetry tracking
		if (reason !== "Loaded") {
			return;
		}

		// We may throw when loading an Inactive object, depending on these preconditions
		const shouldThrowOnInactiveLoad =
			!this.isSummarizerClient &&
			this.configs.throwOnInactiveLoad === true &&
			requestHeaders?.[AllowInactiveRequestHeaderKey] !== true;
		const state = this.unreferencedNodesState.get(nodePath)?.state;

		if (shouldThrowOnInactiveLoad && state === "Inactive") {
			const request: IRequest = { url: nodePath };
			const error = responseToException(
				createResponseError(404, "Object is inactive", request, {
					[InactiveResponseHeaderKey]: true,
				}),
				request,
			);
			throw error;
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
		if (!this.configs.shouldRunGC) {
			return;
		}

		const outboundRoutes = this.newReferencesSinceLastRun.get(fromNodePath) ?? [];
		outboundRoutes.push(toNodePath);
		this.newReferencesSinceLastRun.set(fromNodePath, outboundRoutes);

		this.telemetryTracker.nodeUsed({
			id: toNodePath,
			usageType: "Revived",
			currentReferenceTimestampMs: this.runtime.getCurrentReferenceTimestampMs(),
			packagePath: undefined,
			completedGCRuns: this.completedRuns,
			isTombstoned: this.tombstones.includes(toNodePath),
			lastSummaryTime: this.getLastSummaryTimestampMs(),
			fromId: fromNodePath,
		});
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
}
