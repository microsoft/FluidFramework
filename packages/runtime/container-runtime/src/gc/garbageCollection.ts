/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IRequest } from "@fluidframework/core-interfaces";
import { assert, LazyPromise, Timer } from "@fluidframework/core-utils/internal";
import {
	IGarbageCollectionDetailsBase,
	ISummarizeResult,
	gcTreeKey,
	type IGarbageCollectionData,
	type ITelemetryContext,
} from "@fluidframework/runtime-definitions/internal";
import {
	createResponseError,
	responseToException,
} from "@fluidframework/runtime-utils/internal";
import {
	ITelemetryLoggerExt,
	DataProcessingError,
	MonitoringContext,
	PerformanceEvent,
	createChildLogger,
	createChildMonitoringContext,
	tagCodeArtifacts,
} from "@fluidframework/telemetry-utils/internal";

import { blobManagerBasePath } from "../blobManager/index.js";
import { TombstoneResponseHeaderKey } from "../containerRuntime.js";
import { ClientSessionExpiredError } from "../error.js";
import { ContainerMessageType, ContainerRuntimeGCMessage } from "../messageTypes.js";
import { IRefreshSummaryResult } from "../summary/index.js";

import { generateGCConfigs } from "./gcConfigs.js";
import {
	GCNodeType,
	GarbageCollectionMessage,
	GarbageCollectionMessageType,
	IGCMetadata,
	IGCResult,
	IGCStats,
	IGarbageCollectionRuntime,
	IGarbageCollector,
	IGarbageCollectorConfigs,
	IGarbageCollectorCreateParams,
	IMarkPhaseStats,
	ISweepPhaseStats,
	UnreferencedState,
	type IGCNodeUpdatedProps,
} from "./gcDefinitions.js";
import {
	cloneGCData,
	concatGarbageCollectionData,
	dataStoreNodePathOnly,
	getGCDataFromSnapshot,
	urlToGCNodePath,
} from "./gcHelpers.js";
import { runGarbageCollection } from "./gcReferenceGraphAlgorithm.js";
import {
	IGarbageCollectionSnapshotData,
	IGarbageCollectionState,
} from "./gcSummaryDefinitions.js";
import { GCSummaryStateTracker } from "./gcSummaryStateTracker.js";
import { GCTelemetryTracker } from "./gcTelemetry.js";
import {
	UnreferencedStateTracker,
	UnreferencedStateTrackerMap,
} from "./gcUnreferencedStateTracker.js";

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
		return this.configs.gcAllowed;
	}

	public readonly sessionExpiryTimerStarted: number | undefined;
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

	/**
	 * Map of node ids to their unreferenced state tracker
	 * NOTE: The set of keys in this map is considered as the set of unreferenced nodes
	 * as of the last GC run. So in between runs, nothing should be added or removed.
	 */
	private readonly unreferencedNodesState: UnreferencedStateTrackerMap =
		new UnreferencedStateTrackerMap();

	// The Timer responsible for closing the container when the session has expired
	private sessionExpiryTimer: Timer | undefined;

	// The number of times GC has successfully completed on this instance of GarbageCollector.
	private completedRuns = 0;

	private readonly runtime: IGarbageCollectionRuntime;
	private readonly isSummarizerClient: boolean;

	private readonly summaryStateTracker: GCSummaryStateTracker;
	private readonly telemetryTracker: GCTelemetryTracker;

	/**
	 * For a given node path, returns the node's package path.
	 */
	private readonly getNodePackagePath: (
		nodePath: string,
	) => Promise<readonly string[] | undefined>;
	/**
	 * Returns the timestamp of the last summary generated for this container.
	 */
	private readonly getLastSummaryTimestampMs: () => number | undefined;

	private readonly submitMessage: (message: ContainerRuntimeGCMessage) => void;

	/**
	 * Returns the count of data stores whose GC state updated since the last summary.
	 */
	public get updatedDSCountSinceLastSummary(): number {
		return this.summaryStateTracker.updatedDSCountSinceLastSummary;
	}

	protected constructor(createParams: IGarbageCollectorCreateParams) {
		this.runtime = createParams.runtime;
		this.isSummarizerClient = createParams.isSummarizerClient;
		this.getNodePackagePath = createParams.getNodePackagePath;
		this.getLastSummaryTimestampMs = createParams.getLastSummaryTimestampMs;
		this.submitMessage = createParams.submitMessage;

		const baseSnapshot = createParams.baseSnapshot;
		const readAndParseBlob = createParams.readAndParseBlob;
		const pendingSessionExpiryTimerStarted = createParams.sessionExpiryTimerStarted;

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
			let timeoutMs = this.configs.sessionExpiryTimeoutMs;

			if (pendingSessionExpiryTimerStarted) {
				// NOTE: This assumes the client clock hasn't been tampered with since the original session
				const timeLapsedSincePendingTimer = Date.now() - pendingSessionExpiryTimerStarted;
				timeoutMs -= timeLapsedSincePendingTimer;
			}
			timeoutMs = overrideSessionExpiryTimeoutMs ?? timeoutMs;
			if (timeoutMs <= 0) {
				this.runtime.closeFn(
					new ClientSessionExpiredError(`Client session expired.`, timeoutMs),
				);
			}
			this.sessionExpiryTimer = new Timer(timeoutMs, () => {
				this.runtime.closeFn(
					new ClientSessionExpiredError(`Client session expired.`, timeoutMs),
				);
			});
			this.sessionExpiryTimer.start();
			this.sessionExpiryTimerStarted = Date.now();
		}

		this.summaryStateTracker = new GCSummaryStateTracker(this.configs);

		this.telemetryTracker = new GCTelemetryTracker(
			this.mc,
			this.configs,
			this.isSummarizerClient,
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

					const snapshotData = await getGCDataFromSnapshot(gcSnapshotTree, readAndParseBlob);

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
					const dpe = DataProcessingError.wrapIfUnrecognized(error, "FailedToInitializeGC");
					dpe.addTelemetryProperties({
						gcConfigs: JSON.stringify(this.configs),
					});
					throw dpe;
				}
			},
		);

		/**
		 * Set up the initializer which initializes the GC state from the data in base snapshot. It sets up GC data
		 * from the base GC state and starts tracking the state of unreferenced nodes.
		 *
		 * Must only be called if there is a current reference timestamp.
		 */
		this.initializeGCStateFromBaseSnapshotP = new LazyPromise<void>(async () => {
			const currentReferenceTimestampMs = this.runtime.getCurrentReferenceTimestampMs();
			assert(
				currentReferenceTimestampMs !== undefined,
				0x8a4 /* Trying to initialize GC state without current timestamp */,
			);

			/**
			 * The base snapshot data will not be present if the container is loaded from:
			 * 1. The first summary created by the detached container.
			 * 2. A summary that was generated with GC disabled.
			 * 3. A summary that was generated before GC even existed.
			 */
			const baseSnapshotData = await this.baseSnapshotDataP;
			this.summaryStateTracker.initializeBaseState(baseSnapshotData);

			if (baseSnapshotData?.gcState === undefined) {
				return;
			}

			// Update unreferenced state tracking as per the GC state in the snapshot data and update gcDataFromLastRun
			// to the GC data from the snapshot data.
			const gcNodes: { [id: string]: string[] } = {};
			for (const [nodeId, nodeData] of Object.entries(baseSnapshotData.gcState.gcNodes)) {
				if (nodeData.unreferencedTimestampMs !== undefined) {
					this.unreferencedNodesState.set(
						nodeId,
						new UnreferencedStateTracker(
							nodeData.unreferencedTimestampMs,
							this.configs.inactiveTimeoutMs,
							currentReferenceTimestampMs,
							this.configs.tombstoneTimeoutMs,
							this.configs.sweepGracePeriodMs,
						),
					);
				}
				gcNodes[nodeId] = Array.from(nodeData.outboundRoutes);
			}
			this.gcDataFromLastRun = { gcNodes };
		});

		// Get the GC details from the GC state in the base summary. This is returned in getBaseGCDetails which is
		// used to initialize the GC state of all the nodes in the container.
		this.baseGCDetailsP = new LazyPromise<IGarbageCollectionDetailsBase>(async () => {
			const baseSnapshotData = await this.baseSnapshotDataP;
			if (baseSnapshotData?.gcState === undefined) {
				return {};
			}

			// Note that the base GC details are returned even if GC is disabled. This is to handle the special scenario
			// where GC is disabled but GC state exists in base snapshot. In this scenario, the nodes which get the GC
			// state will re-summarize to reset any GC specific state in their summaries (like unreferenced flag).

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

		// Log all the GC options and the state determined by the garbage collector.
		// This is useful even for interactive clients since they track unreferenced nodes and log errors.
		this.mc.logger.sendTelemetryEvent({
			eventName: "GarbageCollectorLoaded",
			gcConfigs: JSON.stringify(this.configs),
			gcOptions: JSON.stringify(createParams.gcOptions),
			...createParams.createContainerMetadata,
		});
	}

	/**
	 * API for ensuring the correct auto-recovery mitigations
	 */
	private readonly autoRecovery = (() => {
		// This uses a hidden state machine for forcing fullGC as part of autorecovery,
		// to regenerate the GC data for each node.
		//
		// Once fullGC has been requested, we need to wait until GC has run and the summary has been acked before clearing the state.
		//
		// States:
		// - undefined: No need to run fullGC now.
		// - "requested": FullGC requested, but GC has not yet run. Keep using fullGC until back to undefined.
		// - "ran": FullGC ran, but the following summary has not yet been acked. Keep using fullGC until back to undefined.
		//
		// Transitions:
		// - autoRecovery.requestFullGCOnNextRun :: [anything] --> "requested"
		// - autoRecovery.onCompletedGCRun       :: "requested" --> "ran"
		// - autoRecovery.onSummaryAck           :: "ran" --> undefined
		let state: "requested" | "ran" | undefined;
		return {
			requestFullGCOnNextRun: () => {
				state = "requested";
			},
			onCompletedGCRun: () => {
				if (state === "requested") {
					state = "ran";
				}
			},
			onSummaryAck: () => {
				if (state === "ran") {
					state = undefined;
				}
			},
			useFullGC: () => {
				return state !== undefined;
			},
		};
	})();

	/**
	 * Called during container initialization. Initializes the tombstone and deleted nodes state from the base snapshot.
	 * Also, initializes the GC state including unreferenced nodes tracking if a current reference timestamp exists.
	 * Note that if there is any GC state in the base snapshot, then there will definitely be a reference timestamp
	 * to work with - The GC state would have been generated using a timestamp which is part of the snapshot.
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

		// Initialize the deleted nodes from the snapshot. This is done irrespective of whether GC / sweep is enabled
		// to identify deleted nodes' usage.
		if (baseSnapshotData.deletedNodes !== undefined) {
			this.deletedNodes = new Set(baseSnapshotData.deletedNodes);
		}

		// Initialize the tombstone state from the snapshot. Also, notify the runtime of tombstone routes.
		if (baseSnapshotData.tombstones !== undefined) {
			// Create a copy since we are writing from a source we don't control
			this.tombstones = Array.from(baseSnapshotData.tombstones);
			this.runtime.updateTombstonedRoutes(this.tombstones);
		}

		await this.initializeOrUpdateGCState();
	}

	/**
	 * Initialize the GC state if not already initialized. If GC state is already initialized, update the unreferenced
	 * state tracking as per the current reference timestamp.
	 */
	private async initializeOrUpdateGCState(): Promise<void> {
		const currentReferenceTimestampMs = this.runtime.getCurrentReferenceTimestampMs();
		if (currentReferenceTimestampMs === undefined) {
			return;
		}

		const initialized = this.gcDataFromLastRun !== undefined;
		await PerformanceEvent.timedExecAsync(
			this.mc.logger,
			{
				eventName: "InitializeOrUpdateGCState",
			},
			async (event) => {
				// If the GC state hasn't been initialized yet, initialize it and return.
				if (!initialized) {
					await this.initializeGCStateFromBaseSnapshotP;
				} else {
					// If the GC state has been initialized, update the tracking of unreferenced nodes as per the current
					// reference timestamp.
					for (const [, nodeStateTracker] of this.unreferencedNodesState) {
						nodeStateTracker.updateTracking(currentReferenceTimestampMs);
					}
				}
				event.end({
					details: { initialized, unrefNodeCount: this.unreferencedNodesState.size },
				});
			},
		);
	}

	/**
	 * Called when the connection state of the runtime changes, i.e., it connects or disconnects. GC subscribes to this
	 * to initialize or update the unreference state tracking.
	 * @param connected - Whether the runtime connected / disconnected.
	 * @param clientId - The clientId of this runtime.
	 */
	public setConnectionState(connected: boolean, clientId?: string | undefined): void {
		/**
		 * When the client connects (or reconnects), attempt to initialize or update the GC state. This will keep
		 * the unreferenced state tracking updated as per the reference timestamp at the time of connection.
		 *
		 * During GC initialization and during connections in read mode, it is possible that either no ops are
		 * processed or only trailing ops are processed. This means that the GC state is not initialized or initialized
		 * with an older reference timestamp. So, doing this on every connection will keep the unreferenced state
		 * tracking up-to-date.
		 */
		if (connected && this.shouldRunGC) {
			this.initializeOrUpdateGCState().catch((error) => {
				this.mc.logger.sendErrorEvent(
					{
						eventName: "GCInitializationOrUpdateFailed",
						gcConfigs: JSON.stringify(this.configs),
						clientId,
					},
					error,
				);
			});
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
			/**
			 * Logger to use for logging GC events
			 */
			logger?: ITelemetryLoggerExt;
			/**
			 * True to run GC sweep phase after the mark phase
			 */
			runSweep?: boolean;
			/**
			 * True to generate full GC data
			 */
			fullGC?: boolean;
		},
		telemetryContext?: ITelemetryContext,
	): Promise<IGCStats | undefined> {
		const fullGC =
			options.fullGC ?? (this.configs.runFullGC === true || this.autoRecovery.useFullGC());

		// Add the options that are used to run GC to the telemetry context.
		telemetryContext?.setMultiple("fluid_GC", "Options", {
			fullGC,
			runSweep: options.runSweep,
		});

		const logger = createChildLogger({
			logger: options.logger ?? this.mc.logger,
			properties: {
				all: { completedGCRuns: this.completedRuns, fullGC },
			},
		});

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
				// #region Pre-GC steps

				// Ensure that state has been initialized from the base snapshot data.
				await this.initializeGCStateFromBaseSnapshotP;

				// #endregion

				// #region GC step

				const gcStats = await this.runGC(fullGC, currentReferenceTimestampMs, logger);
				event.end({
					...gcStats,
					details: {
						timestamp: currentReferenceTimestampMs,
						sweep: this.configs.sweepEnabled,
						tombstone: this.configs.throwOnTombstoneLoad,
					},
				});

				// #endregion

				// #region Post-GC steps

				// Log pending unreferenced events such as a node being used after inactive. This is done after GC runs and
				// updates its state so that we don't send false positives based on intermediate state. For example, we may get
				// reference to an unreferenced node from another unreferenced node which means the node wasn't revived.
				await this.telemetryTracker.logPendingEvents(logger);
				// Update the state of summary state tracker from this run's stats.
				this.summaryStateTracker.updateStateFromGCRunStats(gcStats);
				this.autoRecovery.onCompletedGCRun();
				this.newReferencesSinceLastRun.clear();
				this.completedRuns++;

				// #endregion

				return gcStats;
			},
			{ end: true, cancel: "error" },
		);
	}

	/**
	 * Runs garbage collection. It does the following:
	 *
	 * 1. It generates / analyzes the runtime's reference graph.
	 *
	 * 2. Generates mark phase stats.
	 *
	 * 3. Runs Mark phase.
	 *
	 * 4. Runs Sweep phase.
	 *
	 * 5. Generates sweep phase stats.
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

		// 2. Get the mark phase stats based on the previous / current GC state.
		// This is done before running mark phase because we need the previous GC state before it is updated.
		const markPhaseStats = this.getMarkPhaseStats(gcResult);

		// 3. Run the Mark phase.
		// It will mark nodes as referenced / unreferenced and return lists of tombstone-ready and sweep-ready nodes.
		const { tombstoneReadyNodeIds, sweepReadyNodeIds } = this.runMarkPhase(
			gcResult,
			allReferencedNodeIds,
			currentReferenceTimestampMs,
		);

		// 4. Run the Sweep phase.
		// It will initiate the deletion (sending the GC Sweep op) of any sweep-ready nodes that are
		// allowed to be deleted per config, and tombstone the rest along with the tombstone-ready nodes.
		// Note that no nodes will be deleted until the GC Sweep op is processed.
		this.runSweepPhase(gcResult, tombstoneReadyNodeIds, sweepReadyNodeIds);

		this.gcDataFromLastRun = cloneGCData(gcData);

		// 5. Get the sweep phase stats.
		const sweepPhaseStats = this.getSweepPhaseStats(
			this.deletedNodes,
			sweepReadyNodeIds,
			markPhaseStats,
		);

		return { ...markPhaseStats, ...sweepPhaseStats };
	}

	/**
	 * Runs the GC Mark phase. It does the following:
	 *
	 * 1. Marks all referenced nodes in this run by clearing tracking for them.
	 *
	 * 2. Marks unreferenced nodes in this run by starting tracking for them.
	 *
	 * 3. Calls the runtime to update nodes that were marked referenced.
	 *
	 * @param gcResult - The result of the GC run on the gcData.
	 * @param allReferencedNodeIds - Nodes referenced in this GC run + referenced between previous and current GC run.
	 * @param currentReferenceTimestampMs - The timestamp to be used for unreferenced nodes' timestamp.
	 * @returns The sets of tombstone-ready and sweep-ready nodes, i.e., nodes that ready to be tombstoned or deleted.
	 */
	private runMarkPhase(
		gcResult: IGCResult,
		allReferencedNodeIds: string[],
		currentReferenceTimestampMs: number,
	): { tombstoneReadyNodeIds: Set<string>; sweepReadyNodeIds: Set<string> } {
		// 1. Marks all referenced nodes by clearing their unreferenced tracker, if any.
		for (const nodeId of allReferencedNodeIds) {
			this.unreferencedNodesState.delete(nodeId);
		}

		// 2. Mark unreferenced nodes in this run by starting or updating unreferenced tracking for them.
		const tombstoneReadyNodeIds: Set<string> = new Set();
		const sweepReadyNodeIds: Set<string> = new Set();
		for (const nodeId of gcResult.deletedNodeIds) {
			const nodeStateTracker = this.unreferencedNodesState.get(nodeId);
			if (nodeStateTracker === undefined) {
				this.unreferencedNodesState.set(
					nodeId,
					new UnreferencedStateTracker(
						currentReferenceTimestampMs,
						this.configs.inactiveTimeoutMs,
						currentReferenceTimestampMs,
						this.configs.tombstoneTimeoutMs,
						this.configs.sweepGracePeriodMs,
					),
				);
			} else {
				// If a node was already unreferenced, update its tracking information. Since the current reference time
				// is from the ops seen, this will ensure that we keep updating unreferenced state as time moves forward.
				nodeStateTracker.updateTracking(currentReferenceTimestampMs);

				// If a node is tombstone or sweep-ready, store it so it can be returned.
				if (nodeStateTracker.state === UnreferencedState.TombstoneReady) {
					tombstoneReadyNodeIds.add(nodeId);
				}
				if (nodeStateTracker.state === UnreferencedState.SweepReady) {
					sweepReadyNodeIds.add(nodeId);
				}
			}
		}

		// 3. Call the runtime to update referenced nodes in this run.
		this.runtime.updateUsedRoutes(gcResult.referencedNodeIds);

		return { tombstoneReadyNodeIds, sweepReadyNodeIds };
	}

	/**
	 * Runs the GC Sweep phase. It does the following:
	 *
	 * 1. Marks tombstone-ready nodes as tombstones.
	 *
	 * 2. Sends a sweep op to delete nodes that are sweep-ready. Once the op is ack'd, these nodes will be deleted.
	 *
	 * @param gcResult - The result of the GC run on the gcData.
	 * @param tombstoneReadyNodes - List of nodes that are tombstone-ready.
	 * @param sweepReadyNodes - List of nodes that are sweep-ready.
	 */
	private runSweepPhase(
		gcResult: IGCResult,
		tombstoneReadyNodes: Set<string>,
		sweepReadyNodes: Set<string>,
	): void {
		/**
		 * Under "Test Mode", unreferenced nodes are immediately deleted without waiting for them to be sweep-ready.
		 *
		 * Otherwise, depending on how long it's been since the node was unreferenced, it will either be
		 * marked as Tombstone, or deleted by Sweep.
		 */

		if (this.configs.testMode) {
			// If we are running in GC test mode, unreferenced nodes (gcResult.deletedNodeIds) are deleted immediately.
			this.runtime.deleteSweepReadyNodes(gcResult.deletedNodeIds);
			return;
		}

		// We'll build up the lists of nodes to be either Tombstoned or Deleted
		// based on the configuration and the nodes' current state.
		// We must Tombstone any sweep-ready node that Sweep won't run for.
		// This is important because a container may never load during a node's Sweep Grace Period,
		// so that node would directly become sweep-ready skipping over tombstone-ready state,
		// but should be Tombstoned since Sweep is disabled.
		const { nodesToTombstone, nodesToDelete } = this.configs.sweepEnabled
			? {
					nodesToDelete: [...sweepReadyNodes],
					nodesToTombstone: [...tombstoneReadyNodes],
				}
			: {
					nodesToDelete: [],
					nodesToTombstone: [...tombstoneReadyNodes, ...sweepReadyNodes],
				};

		this.tombstones = nodesToTombstone;
		this.runtime.updateTombstonedRoutes(this.tombstones);

		if (nodesToDelete.length > 0) {
			// Do not send DDS node ids in the GC op. This is an optimization to reduce its size. Since GC applies to
			// to data store only, all its DDSes are deleted along with it. The DDS ids will be retrieved from the
			// local state when processing the op.
			const sweepReadyDSAndBlobs = nodesToDelete.filter((nodeId) => {
				const nodeType = this.runtime.getNodeType(nodeId);
				return nodeType === GCNodeType.DataStore || nodeType === GCNodeType.Blob;
			});
			const contents: GarbageCollectionMessage = {
				type: GarbageCollectionMessageType.Sweep,
				deletedNodeIds: sweepReadyDSAndBlobs,
			};

			const containerGCMessage: ContainerRuntimeGCMessage = {
				type: ContainerMessageType.GC,
				contents,
			};
			this.submitMessage(containerGCMessage);
			return;
		}
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
	 * @returns A list of all nodes referenced from the last local summary until now.
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
		this.newReferencesSinceLastRun.forEach(
			(outboundRoutes: string[], sourceNodeId: string) => {
				if (gcDataSuperSet.gcNodes[sourceNodeId] === undefined) {
					gcDataSuperSet.gcNodes[sourceNodeId] = outboundRoutes;
				} else {
					gcDataSuperSet.gcNodes[sourceNodeId].push(...outboundRoutes);
				}
				newOutboundRoutesSinceLastRun.push(...outboundRoutes);
			},
		);

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
			trackState && !fullTree,
			gcState,
			this.deletedNodes,
			this.tombstones,
		);
	}

	public getMetadata(): IGCMetadata {
		return {
			/**
			 * If GC is allowed, the GC data is written using the GC version in effect and that is the gcFeature that goes
			 * into the metadata blob. If GC is disabled, the gcFeature is 0.
			 */
			gcFeature: this.configs.gcAllowed ? this.configs.gcVersionInEffect : 0,
			gcFeatureMatrix: this.configs.persistedGcFeatureMatrix,
			sessionExpiryTimeoutMs: this.configs.sessionExpiryTimeoutMs,
			sweepEnabled: false, // DEPRECATED - to be removed
			tombstoneTimeoutMs: this.configs.tombstoneTimeoutMs,
		};
	}

	/**
	 * Called to refresh the latest summary state. This happens when either a pending summary is acked.
	 */
	public async refreshLatestSummary(result: IRefreshSummaryResult): Promise<void> {
		this.autoRecovery.onSummaryAck();
		return this.summaryStateTracker.refreshLatestSummary(result);
	}

	/**
	 * Process GC messages.
	 * @param messageContents - The contents of the messages.
	 * @param messageTimestampMs - The timestamp of the messages.
	 * @param local - Whether it was send by this client.
	 */
	public processMessages(
		messageContents: GarbageCollectionMessage[],
		messageTimestampMs: number,
		local: boolean,
	): void {
		for (const gcMessage of messageContents) {
			const gcMessageType = gcMessage.type;
			switch (gcMessageType) {
				case GarbageCollectionMessageType.Sweep: {
					// Delete the nodes whose ids are present in the contents.
					this.deleteSweepReadyNodes(gcMessage.deletedNodeIds);
					break;
				}
				case GarbageCollectionMessageType.TombstoneLoaded: {
					// Mark the node as referenced to ensure it isn't Swept
					const tombstonedNodePath = gcMessage.nodePath;
					this.addedOutboundReference(
						"/",
						tombstonedNodePath,
						messageTimestampMs,
						true /* autorecovery */,
					);

					// In case the cause of the TombstoneLoaded event is incorrect GC Data (i.e. the object is actually reachable),
					// do fullGC on the next run to get a chance to repair (in the likely case the bug is not deterministic)
					this.autoRecovery.requestFullGCOnNextRun();
					break;
				}
				default:
					throw DataProcessingError.create(
						`Garbage collection message of unknown type ${gcMessageType}`,
						"processMessage",
					);
			}
		}
	}

	/**
	 * Delete nodes that are sweep-ready. Call the runtime to delete these nodes and clear the unreferenced state
	 * tracking for nodes that are actually deleted by the runtime.
	 *
	 * Note that this doesn't check any configuration around whether Sweep is enabled.
	 * That happens before the op is submitted, and from that point, any client should execute the delete.
	 *
	 * @param sweepReadyNodeIds - The ids of nodes that are ready to be deleted.
	 */
	private deleteSweepReadyNodes(sweepReadyNodeIds: readonly string[]): void {
		// Use a set for lookup because its much faster than array or map.
		const sweepReadyNodesSet: Set<string> = new Set(sweepReadyNodeIds);

		// The ids in the sweep-ready nodes do not contain DDS node ids. This is an optimization to reduce the size
		// of the GC op. Since GC applies to data store only, all its DDSes are deleted along with it. So, get the
		// DDS nodes ID from the unreferenced nodes state.
		const allSweepReadyNodeIds = Array.from(sweepReadyNodeIds);
		for (const [id] of this.unreferencedNodesState) {
			// Ignore data store nodes since they would already be in the list.
			const pathParts = id.split("/");
			if (pathParts.length <= 2) {
				continue;
			}

			// Get the data store id part. Note that this may include blobs but that's okay since the part would just
			// be "_blobs" and it won't be found.
			const dsId = `/${pathParts[1]}`;
			if (sweepReadyNodesSet.has(dsId)) {
				allSweepReadyNodeIds.push(id);
			}
		}
		const deletedNodeIds = this.runtime.deleteSweepReadyNodes(allSweepReadyNodeIds);

		// Clear unreferenced state tracking for deleted nodes.
		for (const nodeId of deletedNodeIds) {
			// Usually we avoid modifying the set of unreferencedNodesState keys in between GC runs,
			// but this is ok since this node won't exist at all in the next GC run.
			this.unreferencedNodesState.delete(nodeId);
			this.deletedNodes.add(nodeId);
		}
	}

	/**
	 * Called when a node with the given id is updated. If the node is inactive or tombstoned, this will log an error
	 * or throw an error if failing on incorrect usage is configured.
	 * @param IGCNodeUpdatedProps - Details about the node and how it was updated
	 */
	public nodeUpdated({
		node,
		reason,
		timestampMs,
		packagePath,
		request,
		headerData,
		additionalProps,
	}: IGCNodeUpdatedProps): void {
		// If there is no reference timestamp to work with, no ops have been processed after creation. If so, skip
		// logging as nothing interesting would have happened worth logging.
		if (!this.shouldRunGC || timestampMs === undefined) {
			return;
		}

		// trackedId will be either DataStore or Blob ID (not sub-DataStore ID, since some of those are unrecognized by GC)
		const trackedId = node.path;
		const isTombstoned = this.tombstones.includes(trackedId);
		const fullPath = request !== undefined ? urlToGCNodePath(request.url) : trackedId;

		// This will log if appropriate
		this.telemetryTracker.nodeUsed(trackedId, {
			id: fullPath,
			usageType: reason,
			currentReferenceTimestampMs: timestampMs,
			packagePath,
			completedGCRuns: this.completedRuns,
			isTombstoned,
			lastSummaryTime: this.getLastSummaryTimestampMs(),
			headers: headerData,
			requestUrl: request?.url,
			requestHeaders: JSON.stringify(request?.headers),
			additionalProps,
		});

		// Any time we log a Tombstone Loaded error (via Telemetry Tracker),
		// we want to also trigger autorecovery to avoid the object being deleted
		// Note: We don't need to trigger on "Changed" because any change will cause the object
		// to be loaded by the Summarizer, and auto-recovery will be triggered then.
		if (isTombstoned && reason === "Loaded") {
			// Note that when a DataStore and its DDS are all loaded, each will trigger AutoRecovery for itself.
			this.triggerAutoRecovery(fullPath);
		}

		const nodeType = this.runtime.getNodeType(fullPath);

		// Unless this is a Loaded event for a Blob or DataStore, we're done after telemetry tracking
		const loadedBlobOrDataStore =
			reason === "Loaded" &&
			(nodeType === GCNodeType.Blob || nodeType === GCNodeType.DataStore);
		if (!loadedBlobOrDataStore) {
			return;
		}

		const errorRequest: IRequest = request ?? { url: fullPath };
		if (
			isTombstoned &&
			this.configs.throwOnTombstoneLoad &&
			headerData?.allowTombstone !== true
		) {
			// The requested data store is removed by gc. Create a 404 gc response exception.
			throw responseToException(
				createResponseError(404, `${nodeType} was tombstoned`, errorRequest, {
					[TombstoneResponseHeaderKey]: true,
				}),
				errorRequest,
			);
		}
	}

	/**
	 * The given node should have its unreferenced state reset in the next GC,
	 * even if the true GC graph shows it is unreferenced. This will
	 * prevent it from being deleted by Sweep (after the Grace Period).
	 *
	 * Submit a GC op indicating that the Tombstone with the given path has been loaded.
	 * Broadcasting this information in the op stream allows the Summarizer to reset unreferenced state
	 * before running GC next.
	 */
	private triggerAutoRecovery(nodePath: string): void {
		// If sweep isn't enabled, auto-recovery isn't needed since its purpose is to prevent this object from being
		// deleted. It also would end up sending a GC op which can break clients running FF version 1.x.
		if (!this.configs.sweepEnabled) {
			return;
		}

		const containerGCMessage: ContainerRuntimeGCMessage = {
			type: ContainerMessageType.GC,
			contents: {
				type: GarbageCollectionMessageType.TombstoneLoaded,
				nodePath,
			},
		};
		this.submitMessage(containerGCMessage);
	}

	/**
	 * Called when an outbound reference is added to a node. This is used to identify all nodes that have been
	 * referenced between summaries so that their unreferenced timestamp can be reset.
	 *
	 * @param fromNodePath - The node from which the reference is added.
	 * @param toNodePath - The node to which the reference is added.
	 * @param timestampMs - The timestamp of the message that added the reference.
	 * @param autorecovery - This reference is added artificially, for autorecovery. Used for logging.
	 */
	public addedOutboundReference(
		fromNodePath: string,
		toNodePath: string,
		timestampMs: number,
		autorecovery?: true,
	): void {
		if (!this.shouldRunGC) {
			return;
		}

		if (!toNodePath.startsWith("/")) {
			// A long time ago we stored handles with relatives paths. We don't expect to see these cases though
			// because GC was enabled only after we made the switch to always using absolute paths.
			this.mc.logger.sendErrorEvent({
				eventName: "InvalidRelativeOutboundRoute",
				...tagCodeArtifacts({ fromId: fromNodePath, id: toNodePath }),
			});
			return;
		}

		assert(fromNodePath.startsWith("/"), 0x8a5 /* fromNodePath must be an absolute path */);

		const outboundRoutes = this.newReferencesSinceLastRun.get(fromNodePath) ?? [];
		outboundRoutes.push(toNodePath);
		this.newReferencesSinceLastRun.set(fromNodePath, outboundRoutes);

		// GC won't recognize some subDataStore paths that we encounter (e.g. a path suited for a custom request handler)
		// So for subDataStore paths we need to check the parent dataStore for current tombstone/inactive status.
		const trackedId =
			this.runtime.getNodeType(toNodePath) === "SubDataStore"
				? dataStoreNodePathOnly(toNodePath)
				: toNodePath;
		this.telemetryTracker.nodeUsed(trackedId, {
			id: toNodePath,
			fromId: fromNodePath,
			usageType: "Revived",
			currentReferenceTimestampMs: timestampMs,
			packagePath: undefined,
			completedGCRuns: this.completedRuns,
			isTombstoned: this.tombstones.includes(trackedId),
			lastSummaryTime: this.getLastSummaryTimestampMs(),
			autorecovery,
		});

		// This node is referenced - Clear its unreferenced state if present
		// But don't delete the node id from the map yet.
		// When generating GC stats, the set of nodes in here is used as the baseline for
		// what was unreferenced in the last GC run.
		// NOTE: We use toNodePath not trackedId even though it may be an unrecognized subDataStore route (hence no-op),
		// because a reference to such a path is not sufficient to consider the DataStore referenced.
		this.unreferencedNodesState.get(toNodePath)?.stopTracking();
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
	 * Generates the stats of a garbage collection mark phase run.
	 * @param gcResult - The result of the current GC run.
	 * @returns the stats of the mark phase run.
	 */
	private getMarkPhaseStats(gcResult: IGCResult): IMarkPhaseStats {
		const markPhaseStats: IMarkPhaseStats = {
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

		const updateNodeStats = (nodeId: string, isReferenced: boolean): void => {
			markPhaseStats.nodeCount++;
			// If there is no previous GC data, every node's state is generated and is considered as updated.
			// Otherwise, find out if any node went from referenced to unreferenced or vice-versa.
			const wasNotReferenced = this.unreferencedNodesState.has(nodeId);
			const stateUpdated =
				this.gcDataFromLastRun === undefined || wasNotReferenced === isReferenced;
			if (stateUpdated) {
				markPhaseStats.updatedNodeCount++;
			}
			if (!isReferenced) {
				markPhaseStats.unrefNodeCount++;
			}

			if (this.runtime.getNodeType(nodeId) === GCNodeType.DataStore) {
				markPhaseStats.dataStoreCount++;
				if (stateUpdated) {
					markPhaseStats.updatedDataStoreCount++;
				}
				if (!isReferenced) {
					markPhaseStats.unrefDataStoreCount++;
				}
			}
			if (this.runtime.getNodeType(nodeId) === GCNodeType.Blob) {
				markPhaseStats.attachmentBlobCount++;
				if (stateUpdated) {
					markPhaseStats.updatedAttachmentBlobCount++;
				}
				if (!isReferenced) {
					markPhaseStats.unrefAttachmentBlobCount++;
				}
			}
		};

		for (const nodeId of gcResult.referencedNodeIds) {
			updateNodeStats(nodeId, true /* referenced */);
		}

		for (const nodeId of gcResult.deletedNodeIds) {
			updateNodeStats(nodeId, false /* referenced */);
		}

		return markPhaseStats;
	}

	/**
	 * Generates the stats of a garbage collection sweep phase run.
	 * @param deletedNodes - The nodes that have already been deleted even before this run.
	 * @param sweepReadyNodes - The nodes that are sweep-ready in this GC run. These will be deleted but are not deleted yet,
	 * due to either sweep not being enabled or the Sweep Op needing to roundtrip before the delete is executed.
	 * @param markPhaseStats - The stats of the mark phase run.
	 * @returns the stats of the sweep phase run.
	 */
	private getSweepPhaseStats(
		deletedNodes: Set<string>,
		sweepReadyNodes: Set<string>,
		markPhaseStats: IMarkPhaseStats,
	): ISweepPhaseStats {
		// Initialize the life time node counts to the mark phase node counts. If sweep is not enabled,
		// these will be the life time node count for this container.
		const sweepPhaseStats: ISweepPhaseStats = {
			lifetimeNodeCount: markPhaseStats.nodeCount,
			lifetimeDataStoreCount: markPhaseStats.dataStoreCount,
			lifetimeAttachmentBlobCount: markPhaseStats.attachmentBlobCount,
			deletedNodeCount: 0,
			deletedDataStoreCount: 0,
			deletedAttachmentBlobCount: 0,
		};

		// The runtime can't reliably identify the type of deleted nodes. So, get the type here. This should
		// be good enough because the only types that participate in GC today are data stores, DDSes and blobs.
		const getDeletedNodeType = (nodeId: string): GCNodeType => {
			const pathParts = nodeId.split("/");
			if (pathParts[1] === blobManagerBasePath) {
				return GCNodeType.Blob;
			}
			if (pathParts.length === 2) {
				return GCNodeType.DataStore;
			}
			if (pathParts.length === 3) {
				return GCNodeType.SubDataStore;
			}
			return GCNodeType.Other;
		};

		for (const nodeId of deletedNodes) {
			sweepPhaseStats.deletedNodeCount++;
			const nodeType = getDeletedNodeType(nodeId);
			if (nodeType === GCNodeType.DataStore) {
				sweepPhaseStats.deletedDataStoreCount++;
			} else if (nodeType === GCNodeType.Blob) {
				sweepPhaseStats.deletedAttachmentBlobCount++;
			}
		}

		// The counts from the mark phase stats do not include nodes that were
		// deleted in previous runs. So, add the deleted node counts to life time stats.
		sweepPhaseStats.lifetimeNodeCount += sweepPhaseStats.deletedNodeCount;
		sweepPhaseStats.lifetimeDataStoreCount += sweepPhaseStats.deletedDataStoreCount;
		sweepPhaseStats.lifetimeAttachmentBlobCount += sweepPhaseStats.deletedAttachmentBlobCount;

		// These stats are used to estimate the impact of GC in terms of how much garbage is/will be cleaned up.
		// So we include the current sweep-ready node stats since these nodes will be deleted eventually.
		// - If sweep is enabled, this will happen in the run after the GC op round trips back
		//   (they'll be in deletedNodes that time).
		// - If sweep is not enabled, we still want to include these nodes since they
		//   _will be_ deleted once it is enabled.
		for (const nodeId of sweepReadyNodes) {
			sweepPhaseStats.deletedNodeCount++;
			const nodeType = this.runtime.getNodeType(nodeId);
			if (nodeType === GCNodeType.DataStore) {
				sweepPhaseStats.deletedDataStoreCount++;
			} else if (nodeType === GCNodeType.Blob) {
				sweepPhaseStats.deletedAttachmentBlobCount++;
			}
		}

		return sweepPhaseStats;
	}
}
