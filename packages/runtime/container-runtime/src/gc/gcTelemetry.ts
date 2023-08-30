/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryGenericEvent } from "@fluidframework/core-interfaces";
import { IGarbageCollectionData } from "@fluidframework/runtime-definitions";
import {
	generateStack,
	ITelemetryLoggerExt,
	MonitoringContext,
	tagCodeArtifacts,
} from "@fluidframework/telemetry-utils";
import { ICreateContainerMetadata } from "../summary";
import {
	disableSweepLogKey,
	GCNodeType,
	UnreferencedState,
	IGarbageCollectorConfigs,
	disableTombstoneKey,
	throwOnTombstoneUsageKey,
	throwOnTombstoneLoadKey,
	runSweepKey,
} from "./gcDefinitions";
import { UnreferencedStateTracker } from "./gcUnreferencedStateTracker";
// eslint-disable-next-line import/no-deprecated
import { tagAsCodeArtifact } from "./gcHelpers";

type NodeUsageType = "Changed" | "Loaded" | "Revived";

/** Properties that are common to IUnreferencedEventProps and INodeUsageProps */
interface ICommonProps {
	usageType: NodeUsageType;
	completedGCRuns: number;
	isTombstoned: boolean;
	lastSummaryTime?: number;
	viaHandle?: boolean;
}

/** The event that is logged when unreferenced node is used after a certain time. */
interface IUnreferencedEventProps extends ICreateContainerMetadata, ICommonProps {
	state: UnreferencedState;
	id: {
		value: string;
		tag: string;
	};
	type: GCNodeType;
	unrefTime: number;
	age: number;
	timeout?: number;
	fromId?: {
		value: string;
		tag: string;
	};
}

/** Properties passed to nodeUsed function when a node is used. */
interface INodeUsageProps extends ICommonProps {
	id: string;
	currentReferenceTimestampMs: number | undefined;
	packagePath: readonly string[] | undefined;
	fromId?: string;
}

/**
 * Encapsulates the logic that tracks the various telemetry logged by the Garbage Collector. There are 4 types of
 * telemetry logged:
 * 1. inactiveObject telemetry - When an inactive node is used - A node that has been unreferenced for inactiveTimeoutMs.
 * 2. sweepReadyObject telemetry - When a sweep ready node is used - A node that has been unreferenced for sweepTimeoutMs.
 * 3. Tombstone telemetry - When a tombstoned node is used - A node that that has been marked as tombstone.
 * 4. Sweep / deleted telemetry - When a node is detected as sweep ready in the sweep phase.
 * 5. Unknown outbound reference telemetry - When a node is referenced but GC is not explicitly notified of it.
 */
export class GCTelemetryTracker {
	// Keeps track of unreferenced events that are logged for a node. This is used to limit the log generation to one
	// per event per node.
	private readonly loggedUnreferencedEvents: Set<string> = new Set();
	// Queue for unreferenced events that should be logged the next time GC runs.
	private pendingEventsQueue: IUnreferencedEventProps[] = [];

	constructor(
		private readonly mc: MonitoringContext,
		private readonly configs: Pick<
			IGarbageCollectorConfigs,
			"inactiveTimeoutMs" | "sweepTimeoutMs"
		>,
		private readonly isSummarizerClient: boolean,
		private readonly gcTombstoneEnforcementAllowed: boolean,
		private readonly createContainerMetadata: ICreateContainerMetadata,
		private readonly getNodeType: (nodeId: string) => GCNodeType,
		private readonly getNodeStateTracker: (
			nodeId: string,
		) => UnreferencedStateTracker | undefined,
		private readonly getNodePackagePath: (
			nodePath: string,
		) => Promise<readonly string[] | undefined>,
	) {}

	/**
	 * Returns whether an event should be logged for a node that isn't active anymore. Some scenarios where we won't log:
	 * 1. When a DDS is changed or loaded. The corresponding data store's event will be logged instead.
	 * 2. An event is logged only once per container instance per event per node.
	 */
	private shouldLogNonActiveEvent(
		nodeId: string,
		nodeType: GCNodeType,
		usageType: NodeUsageType,
		nodeStateTracker: UnreferencedStateTracker,
		uniqueEventId: string,
	) {
		if (nodeStateTracker.state === UnreferencedState.Active) {
			return false;
		}

		// For sub data store (DDS) nodes, if they are changed or loaded, its data store will also be changed or loaded,
		// so skip logging to make the telemetry less noisy.
		if (nodeType === GCNodeType.SubDataStore && usageType !== "Revived") {
			return false;
		}
		if (nodeType === GCNodeType.Other) {
			return false;
		}

		if (this.loggedUnreferencedEvents.has(uniqueEventId)) {
			return false;
		}
		return true;
	}

	/**
	 * Called when a node is used. If the node is not active, log an event indicating object is used when its not active.
	 */
	public nodeUsed(nodeUsageProps: INodeUsageProps) {
		// If there is no reference timestamp to work with, no ops have been processed after creation. If so, skip
		// logging as nothing interesting would have happened worth logging.
		// If the node is not unreferenced, skip logging.
		const nodeStateTracker = this.getNodeStateTracker(nodeUsageProps.id);
		if (!nodeStateTracker || nodeUsageProps.currentReferenceTimestampMs === undefined) {
			return;
		}

		// We log these events once per event per node. A unique id is generated by joining node state (inactive / sweep ready),
		// node's id and usage (loaded / changed / revived).
		const uniqueEventId = `${nodeStateTracker.state}-${nodeUsageProps.id}-${nodeUsageProps.usageType}`;
		const nodeType = this.getNodeType(nodeUsageProps.id);
		if (
			!this.shouldLogNonActiveEvent(
				nodeUsageProps.id,
				nodeType,
				nodeUsageProps.usageType,
				nodeStateTracker,
				uniqueEventId,
			)
		) {
			return;
		}

		// Add the unique event id so that we don't generate a log for this event again in this session..
		this.loggedUnreferencedEvents.add(uniqueEventId);

		const state = nodeStateTracker.state;
		const { usageType, currentReferenceTimestampMs, packagePath, id, fromId, ...propsToLog } =
			nodeUsageProps;
		const eventProps: Omit<IUnreferencedEventProps, "state" | "usageType"> = {
			type: nodeType,
			unrefTime: nodeStateTracker.unreferencedTimestampMs,
			age:
				nodeUsageProps.currentReferenceTimestampMs -
				nodeStateTracker.unreferencedTimestampMs,
			timeout:
				state === UnreferencedState.Inactive
					? this.configs.inactiveTimeoutMs
					: this.configs.sweepTimeoutMs,
			...tagCodeArtifacts({ id, fromId }),
			...propsToLog,
			...this.createContainerMetadata,
		};

		// This will log the following events:
		// GC_Tombstone_DataStore_Revived, GC_Tombstone_SubDataStore_Revived, GC_Tombstone_Blob_Revived
		if (nodeUsageProps.usageType === "Revived" && nodeUsageProps.isTombstoned) {
			sendGCUnexpectedUsageEvent(
				this.mc,
				{
					eventName: `GC_Tombstone_${nodeType}_Revived`,
					category: "generic",
					// eslint-disable-next-line import/no-deprecated
					url: tagAsCodeArtifact(id),
					gcTombstoneEnforcementAllowed: this.gcTombstoneEnforcementAllowed,
				},
				undefined /* packagePath */,
			);
		}

		// For summarizer client, queue the event so it is logged the next time GC runs if the event is still valid.
		// For non-summarizer client, log the event now since GC won't run on it. This may result in false positives
		// but it's a good signal nonetheless and we can consume it with a grain of salt.
		// Inactive errors are usages of Objects that are unreferenced for at least a period of 7 days.
		// SweepReady errors are usages of Objects that will be deleted by GC Sweep!
		if (this.isSummarizerClient) {
			this.pendingEventsQueue.push({
				...eventProps,
				usageType: nodeUsageProps.usageType,
				state,
			});
		} else {
			// For non-summarizer clients, only log "Loaded" type events since these objects may not be loaded in the
			// summarizer clients if they are based off of user actions (such as scrolling to content for these objects)
			// Events generated:
			// InactiveObject_Loaded, SweepReadyObject_Loaded
			if (nodeUsageProps.usageType === "Loaded") {
				const { id: taggedId, fromId: taggedFromId, ...otherProps } = eventProps;
				const event = {
					eventName: `${state}Object_${nodeUsageProps.usageType}`,
					pkg: tagCodeArtifacts({ pkg: nodeUsageProps.packagePath?.join("/") }).pkg,
					stack: generateStack(),
					id: taggedId,
					fromId: taggedFromId,
					details: JSON.stringify({
						...otherProps,
					}),
				};

				// Do not log the inactive object x events as error events as they are not the best signal for
				// detecting something wrong with GC either from the partner or from the runtime itself.
				if (state === UnreferencedState.Inactive) {
					this.mc.logger.sendTelemetryEvent(event);
				} else {
					this.mc.logger.sendErrorEvent(event);
				}
			}
		}
	}

	/**
	 * Log all new references or outbound routes in the current graph that haven't been explicitly notified to GC.
	 * The principle is that every new reference or outbound route must be notified to GC via the
	 * addedOutboundReference method. It it hasn't, its a bug and we want to identify these scenarios.
	 *
	 * In more simple terms:
	 * Missing Explicit References = Current References - Previous References - Explicitly Added References;
	 *
	 * @param currentGCData - The GC data (reference graph) from the current GC run.
	 * @param previousGCData - The GC data (reference graph) from the previous GC run.
	 * @param explicitReferences - New references added explicity between the previous and the current run.
	 */
	public logIfMissingExplicitReferences(
		currentGCData: IGarbageCollectionData,
		previousGCData: IGarbageCollectionData,
		explicitReferences: Map<string, string[]>,
		logger: ITelemetryLoggerExt,
	) {
		for (const [nodeId, currentOutboundRoutes] of Object.entries(currentGCData.gcNodes)) {
			const previousRoutes = previousGCData.gcNodes[nodeId] ?? [];
			const explicitRoutes = explicitReferences.get(nodeId) ?? [];

			/**
			 * 1. For routes in the current GC data, routes that were not present in previous GC data and did not have
			 * explicit references should be added to missing explicit routes list.
			 * 2. Only include data store and blob routes since GC only works for these two.
			 * Note: Due to a bug with de-duped blobs, only adding data store routes for now.
			 * 3. Ignore DDS routes to their parent datastores since those were added implicitly. So, there won't be
			 * explicit routes to them.
			 */
			const missingExplicitRoutes: string[] = [];
			for (const route of currentOutboundRoutes) {
				const nodeType = this.getNodeType(route);
				if (
					(nodeType === GCNodeType.DataStore || nodeType === GCNodeType.Blob) &&
					!nodeId.startsWith(route) &&
					!previousRoutes.includes(route) &&
					!explicitRoutes.includes(route)
				) {
					missingExplicitRoutes.push(route);
				}
			}

			if (missingExplicitRoutes.length > 0) {
				logger.sendErrorEvent({
					eventName: "gcUnknownOutboundReferences",
					...tagCodeArtifacts({
						id: nodeId,
						routes: JSON.stringify(missingExplicitRoutes),
					}),
				});
			}
		}
	}

	/**
	 * Log events that are pending in pendingEventsQueue. This is called after GC runs in the summarizer client
	 * so that the state of an unreferenced node is updated.
	 */
	public async logPendingEvents(logger: ITelemetryLoggerExt) {
		// Events sent come only from the summarizer client. In between summaries, events are pushed to a queue and at
		// summary time they are then logged.
		// Events generated:
		// InactiveObject_Loaded, InactiveObject_Changed, InactiveObject_Revived
		// SweepReadyObject_Loaded, SweepReadyObject_Changed, SweepReadyObject_Revived
		for (const eventProps of this.pendingEventsQueue) {
			const { usageType, state, id, fromId, ...propsToLog } = eventProps;
			/**
			 * Revived event is logged only if the node is active. If the node is not active, the reference to it was
			 * from another unreferenced node and this scenario is not interesting to log.
			 * Loaded and Changed events are logged only if the node is not active. If the node is active, it was
			 * revived and a Revived event will be logged for it.
			 */
			const nodeStateTracker = this.getNodeStateTracker(eventProps.id.value);
			const active =
				nodeStateTracker === undefined ||
				nodeStateTracker.state === UnreferencedState.Active;
			if ((usageType === "Revived") === active) {
				const pkg = await this.getNodePackagePath(eventProps.id.value);
				const fromPkg = eventProps.fromId
					? await this.getNodePackagePath(eventProps.fromId.value)
					: undefined;
				const event = {
					eventName: `${state}Object_${usageType}`,
					details: JSON.stringify({
						...propsToLog,
					}),
					id,
					fromId,
					...tagCodeArtifacts({
						pkg: pkg?.join("/"),
						fromPkg: fromPkg?.join("/"),
					}),
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

	/**
	 * For nodes that are ready to sweep, log an event for now. Until we start running sweep which deletes objects,
	 * this will give us a view into how much deleted content a container has.
	 */
	public logSweepEvents(
		logger: ITelemetryLoggerExt,
		currentReferenceTimestampMs: number,
		unreferencedNodesState: Map<string, UnreferencedStateTracker>,
		completedGCRuns: number,
		lastSummaryTime?: number,
	) {
		if (
			this.mc.config.getBoolean(disableSweepLogKey) === true ||
			this.configs.sweepTimeoutMs === undefined
		) {
			return;
		}

		const deletedNodeIds: string[] = [];
		for (const [nodeId, nodeStateTracker] of unreferencedNodesState) {
			if (nodeStateTracker.state !== UnreferencedState.SweepReady) {
				return;
			}

			const nodeType = this.getNodeType(nodeId);
			if (nodeType !== GCNodeType.DataStore && nodeType !== GCNodeType.Blob) {
				return;
			}

			// Log deleted event for each node only once to reduce noise in telemetry.
			const uniqueEventId = `Deleted-${nodeId}`;
			if (this.loggedUnreferencedEvents.has(uniqueEventId)) {
				return;
			}
			this.loggedUnreferencedEvents.add(uniqueEventId);
			deletedNodeIds.push(nodeId);
		}

		if (deletedNodeIds.length > 0) {
			logger.sendTelemetryEvent({
				eventName: "GC_SweepReadyObjects_Delete",
				details: JSON.stringify({
					timeout: this.configs.sweepTimeoutMs,
					completedGCRuns,
					lastSummaryTime,
					...this.createContainerMetadata,
				}),
				...tagCodeArtifacts({ id: JSON.stringify(deletedNodeIds) }),
			});
		}
	}
}

/**
 * Consolidates info / logic for logging when we encounter unexpected usage of GC'd objects. For example, when a
 * tombstoned or deleted object is loaded.
 */
export function sendGCUnexpectedUsageEvent(
	mc: MonitoringContext,
	event: ITelemetryGenericEvent & {
		category: "error" | "generic";
		gcTombstoneEnforcementAllowed: boolean | undefined;
	},
	packagePath: readonly string[] | undefined,
	error?: unknown,
) {
	event.pkg = tagCodeArtifacts({ pkg: packagePath?.join("/") })?.pkg;
	event.tombstoneFlags = JSON.stringify({
		DisableTombstone: mc.config.getBoolean(disableTombstoneKey),
		ThrowOnTombstoneUsage: mc.config.getBoolean(throwOnTombstoneUsageKey),
		ThrowOnTombstoneLoad: mc.config.getBoolean(throwOnTombstoneLoadKey),
	});
	event.sweepFlags = JSON.stringify({
		EnableSweepFlag: mc.config.getBoolean(runSweepKey),
	});

	mc.logger.sendTelemetryEvent(event, error);
}
