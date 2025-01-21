/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Tagged } from "@fluidframework/core-interfaces";
import { IGarbageCollectionData } from "@fluidframework/runtime-definitions/internal";
import {
	ITelemetryLoggerExt,
	MonitoringContext,
	generateStack,
	tagCodeArtifacts,
	type ITelemetryPropertiesExt,
} from "@fluidframework/telemetry-utils/internal";

import { RuntimeHeaderData } from "../containerRuntime.js";
// eslint-disable-next-line import/no-deprecated
import { ICreateContainerMetadata } from "../summary/index.js";

import {
	// eslint-disable-next-line import/no-deprecated
	GCFeatureMatrix,
	// eslint-disable-next-line import/no-deprecated
	GCNodeType,
	IGarbageCollectorConfigs,
	UnreferencedState,
} from "./gcDefinitions.js";
import { UnreferencedStateTracker } from "./gcUnreferencedStateTracker.js";

type NodeUsageType = "Changed" | "Loaded" | "Revived" | "Realized";

/**
 * Properties that are common to IUnreferencedEventProps and INodeUsageProps
 */
interface ICommonProps {
	usageType: NodeUsageType;
	completedGCRuns: number;
	isTombstoned: boolean;
	lastSummaryTime?: number;
	headers?: RuntimeHeaderData;
	additionalProps?: ITelemetryPropertiesExt;
}

/**
 * The event that is logged when unreferenced node is used after a certain time.
 */
// eslint-disable-next-line import/no-deprecated
interface IUnreferencedEventProps extends ICreateContainerMetadata, ICommonProps {
	/**
	 * The id that GC uses to track the node. May or may not match id
	 */
	trackedId: string;
	state: UnreferencedState;
	/**
	 * The full path (in GC Path format) to the node in question
	 */
	id: Tagged<string>;
	fromId?: Tagged<string>;
	// eslint-disable-next-line import/no-deprecated
	type: GCNodeType;
	unrefTime: number;
	age: number;
	// Expanding GC feature matrix. Without doing this, the configs cannot be logged in telemetry directly.
	gcConfigs: Omit<IGarbageCollectorConfigs, "persistedGcFeatureMatrix"> & {
		// eslint-disable-next-line import/no-deprecated
		[K in keyof GCFeatureMatrix]: GCFeatureMatrix[K];
	};
	timeout?: number;
}

/**
 * Properties passed to nodeUsed function when a node is used.
 */
interface INodeUsageProps extends ICommonProps {
	/**
	 * The full path (in GC Path format) to the node in question
	 */
	id: string;
	/**
	 * Latest timestamp received from the server, as a baseline for computing GC state/age
	 */
	currentReferenceTimestampMs: number;
	/**
	 * The package path of the node. This may not be available if the node hasn't been loaded yet
	 */
	packagePath: readonly string[] | undefined;
	/**
	 * In case of Revived - what node added the reference?
	 */
	fromId?: string;
	/**
	 * In case of Revived - was it revived due to autorecovery?
	 */
	autorecovery?: true;
	/**
	 * URL (including query string) if this usage came from a request
	 */
	requestUrl?: string;
	/**
	 * Original request headers if this usage came from a request or handle.get
	 */
	requestHeaders?: string;
}

/**
 * Encapsulates the logic that tracks the various telemetry logged by the Garbage Collector.
 *
 * These events are not logged as errors, just generic events, since there can be false positives:
 *
 * 1. inactiveObject telemetry - When an inactive node is used - A node that has been unreferenced for inactiveTimeoutMs.
 * 2. tombstoneReadyObject telemetry - When a tombstone-ready node is used - A node that has been unreferenced for tombstoneTimeoutMs.
 * 3. sweepReadyObject telemetry - When a sweep-ready node is used - A node that has been unreferenced for tombstoneTimeoutMs + sweepGracePeriodMs.
 *
 * These events are logged as errors since they are based on the core GC logic:
 *
 * 1. Tombstone telemetry - When a tombstoned node is used - A node that has been marked as tombstone.
 * 2. Unknown outbound reference telemetry - When a node is referenced but GC was not notified of it when the new reference appeared.
 *
 * Note: The telemetry for a Deleted node being used is logged elsewhere in this package.
 */
export class GCTelemetryTracker {
	// Keeps track of unreferenced events that are logged for a node. This is used to limit the log generation to one
	// per event per node.
	private readonly loggedUnreferencedEvents: Set<string> = new Set();
	// Queue for unreferenced events that should be logged the next time GC runs.
	private pendingEventsQueue: IUnreferencedEventProps[] = [];

	constructor(
		private readonly mc: MonitoringContext,
		private readonly configs: IGarbageCollectorConfigs,
		private readonly isSummarizerClient: boolean,
		// eslint-disable-next-line import/no-deprecated
		private readonly createContainerMetadata: ICreateContainerMetadata,
		// eslint-disable-next-line import/no-deprecated
		private readonly getNodeType: (nodeId: string) => GCNodeType,
		private readonly getNodeStateTracker: (
			nodeId: string,
		) => UnreferencedStateTracker | undefined,
		private readonly getNodePackagePath: (
			nodePath: string,
		) => Promise<readonly string[] | undefined>,
	) {}

	/**
	 * Returns whether an event should be logged for a node that isn't active anymore.
	 *
	 * @remarks
	 * This does not apply to tombstoned nodes for which an event is always logged. Some scenarios where we won't log:
	 *
	 * 1. When a DDS is changed. The corresponding data store's event will be logged instead.
	 *
	 * 2. An event is logged only once per container instance per event per node.
	 */
	private shouldLogNonActiveEvent(
		// eslint-disable-next-line import/no-deprecated
		nodeType: GCNodeType,
		usageType: NodeUsageType,
		nodeStateTracker: UnreferencedStateTracker,
		uniqueEventId: string,
	): boolean {
		if (nodeStateTracker.state === UnreferencedState.Active) {
			return false;
		}

		// eslint-disable-next-line import/no-deprecated
		if (nodeType === GCNodeType.Other) {
			return false;
		}

		// For sub data store (DDS) nodes, if they are changed, its data store will also be changed,
		// so skip logging to make the telemetry less noisy.
		// eslint-disable-next-line import/no-deprecated
		if (nodeType === GCNodeType.SubDataStore && usageType === "Changed") {
			return false;
		}

		// Non-tombstone events are logged once per event per node. A unique id is generated by joining
		// node state (inactive / sweep ready), node's id and usage (loaded / changed / revived).
		if (this.loggedUnreferencedEvents.has(uniqueEventId)) {
			return false;
		}
		return true;
	}

	/**
	 * Called when a node is used. If the node is inactive or tombstoned, log telemetry indicating object is used
	 * when it should not have been.
	 * @param trackedId - The id that GC uses to track the node. For SubDataStore nodes, this should be the DataStore ID.
	 * @param INodeUsageProps - All kind of details about this event to be logged
	 */
	public nodeUsed(
		trackedId: string,
		{
			usageType,
			currentReferenceTimestampMs,
			packagePath,
			id: untaggedId,
			fromId: untaggedFromId,
			isTombstoned,
			...otherNodeUsageProps
		}: INodeUsageProps,
	): void {
		// Note: For SubDataStore Load usage, trackedId will be the DataStore's id, not the full path in question.
		// This is necessary because the SubDataStore path may be unrecognized by GC (if suited for a custom request handler)
		const nodeStateTracker = this.getNodeStateTracker(trackedId);
		const nodeType = this.getNodeType(untaggedId);

		const timeout = (() => {
			switch (nodeStateTracker?.state) {
				case UnreferencedState.Inactive:
					return this.configs.inactiveTimeoutMs;
				case UnreferencedState.TombstoneReady:
					return this.configs.tombstoneTimeoutMs;
				case UnreferencedState.SweepReady:
					return (
						this.configs.tombstoneTimeoutMs &&
						this.configs.tombstoneTimeoutMs + this.configs.sweepGracePeriodMs
					);
				default:
					return undefined;
			}
		})();
		const { persistedGcFeatureMatrix, ...configs } = this.configs;
		const unrefEventProps = {
			trackedId,
			type: nodeType,
			unrefTime: nodeStateTracker?.unreferencedTimestampMs ?? -1,
			age:
				nodeStateTracker !== undefined
					? currentReferenceTimestampMs - nodeStateTracker.unreferencedTimestampMs
					: -1,
			timeout,
			isTombstoned,
			...tagCodeArtifacts({ id: untaggedId, fromId: untaggedFromId }),
			...otherNodeUsageProps,
			...this.createContainerMetadata,
			gcConfigs: { ...configs, ...persistedGcFeatureMatrix },
		} satisfies Omit<IUnreferencedEventProps, "state" | "usageType"> &
			typeof otherNodeUsageProps;

		// If the node that is used is tombstoned, log a tombstone telemetry.
		if (isTombstoned) {
			this.logTombstoneUsageTelemetry(unrefEventProps, nodeType, usageType, packagePath);
		}

		// After logging tombstone telemetry, if the node's unreferenced state is not tracked, there is nothing
		// else to log.
		if (nodeStateTracker === undefined) {
			return;
		}

		const state = nodeStateTracker.state;
		const uniqueEventId = `${state}-${untaggedId}-${usageType}`;

		if (!this.shouldLogNonActiveEvent(nodeType, usageType, nodeStateTracker, uniqueEventId)) {
			return;
		}

		// Add the unique event id so that we don't generate a log for this event again in this session.
		this.loggedUnreferencedEvents.add(uniqueEventId);

		// For summarizer client, queue the event so it is logged the next time GC runs if the event is still valid.
		// For non-summarizer client, log the event now since GC won't run on it. This may result in false positives
		// but it's a good signal nonetheless and we can consume it with a grain of salt.
		// Inactive errors are usages of Objects that are unreferenced for at least a period of 7 days.
		// SweepReady errors are usages of Objects that will be deleted by GC Sweep!
		if (this.isSummarizerClient) {
			this.pendingEventsQueue.push({
				...unrefEventProps, // Note: Contains some properties from INodeUsageProps as well
				usageType,
				state,
			});
		} else {
			// For non-summarizer clients, only log "Loaded" type events since these objects may not be loaded in the
			// summarizer clients if they are based off of user actions (such as scrolling to content for these objects)
			// Events generated:
			// InactiveObject_Loaded, SweepReadyObject_Loaded
			if (usageType === "Loaded") {
				const { id, fromId, headers, gcConfigs, additionalProps, ...detailedProps } =
					unrefEventProps;
				const event = {
					eventName: `${state}Object_${usageType}`,
					...tagCodeArtifacts({ pkg: packagePath?.join("/") }),
					stack: generateStack(),
					id,
					fromId,
					headers: { ...headers },
					details: { ...detailedProps, ...additionalProps },
					gcConfigs,
				};

				// These are logged as generic events and not errors because there can be false positives. The Tombstone
				// and Delete errors are separately logged and are reliable.
				this.mc.logger.sendTelemetryEvent(event);
			}
		}
	}

	/**
	 * Logs telemetry when a tombstoned object is changed, revived or loaded.
	 */
	private logTombstoneUsageTelemetry(
		unrefEventProps: Omit<IUnreferencedEventProps, "state" | "usageType">,
		// eslint-disable-next-line import/no-deprecated
		nodeType: GCNodeType,
		usageType: NodeUsageType,
		packagePath?: readonly string[],
	): void {
		// This will log the following events:
		// GC_Tombstone_DataStore_Requested, GC_Tombstone_DataStore_Changed, GC_Tombstone_DataStore_Revived
		// GC_Tombstone_SubDataStore_Requested, GC_Tombstone_SubDataStore_Changed, GC_Tombstone_SubDataStore_Revived
		// GC_Tombstone_Blob_Requested, GC_Tombstone_Blob_Changed, GC_Tombstone_Blob_Revived
		const { id, fromId, headers, gcConfigs, additionalProps, ...detailedProps } =
			unrefEventProps;
		const eventUsageName = usageType === "Loaded" ? "Requested" : usageType;
		const event = {
			eventName: `GC_Tombstone_${nodeType}_${eventUsageName}`,
			...tagCodeArtifacts({ pkg: packagePath?.join("/") }),
			stack: generateStack(),
			id,
			fromId,
			headers: { ...headers },
			details: { ...detailedProps, ...additionalProps }, // Also includes some properties from INodeUsageProps type
			gcConfigs,
		};

		if (
			usageType === "Loaded" &&
			this.configs.throwOnTombstoneLoad &&
			!headers?.allowTombstone
		) {
			this.mc.logger.sendErrorEvent(event);
		} else {
			this.mc.logger.sendTelemetryEvent(event);
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
	): void {
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
					// eslint-disable-next-line import/no-deprecated
					(nodeType === GCNodeType.DataStore || nodeType === GCNodeType.Blob) &&
					!nodeId.startsWith(route) &&
					!previousRoutes.includes(route) &&
					!explicitRoutes.includes(route)
				) {
					missingExplicitRoutes.push(route);
				}
			}

			if (missingExplicitRoutes.length > 0) {
				// Send as Generic not Error since there are known corner cases where this will fire.
				// E.g. If an old client re-references a node via an attach op (that doesn't include GC Data)
				logger.sendTelemetryEvent({
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
	public async logPendingEvents(logger: ITelemetryLoggerExt): Promise<void> {
		// Events sent come only from the summarizer client. In between summaries, events are pushed to a queue and at
		// summary time they are then logged.
		// Events generated:
		// InactiveObject_Loaded, InactiveObject_Changed, InactiveObject_Revived
		// SweepReadyObject_Loaded, SweepReadyObject_Changed, SweepReadyObject_Revived
		for (const eventProps of this.pendingEventsQueue) {
			const {
				usageType,
				state,
				id,
				fromId,
				headers,
				gcConfigs,
				additionalProps,
				...detailedProps
			} = eventProps;
			/**
			 * Revived event is logged only if the node is active. If the node is not active, the reference to it was
			 * from another unreferenced node and this scenario is not interesting to log.
			 * Loaded and Changed events are logged only if the node is not active. If the node is active, it was
			 * revived and a Revived event will be logged for it.
			 */
			const nodeStateTracker = this.getNodeStateTracker(detailedProps.trackedId); // Note: This is never SubDataStore path
			const active =
				nodeStateTracker === undefined || nodeStateTracker.state === UnreferencedState.Active;
			if ((usageType === "Revived") === active) {
				const pkg = await this.getNodePackagePath(eventProps.id.value);
				const fromPkg = eventProps.fromId
					? await this.getNodePackagePath(eventProps.fromId.value)
					: undefined;
				const event = {
					eventName: `${state}Object_${usageType}`,
					id,
					fromId,
					headers: { ...headers },
					details: { ...detailedProps, ...additionalProps },
					gcConfigs,
					...tagCodeArtifacts({
						pkg: pkg?.join("/"),
						fromPkg: fromPkg?.join("/"),
					}),
				};

				// These are logged as generic events and not errors because there can be false positives. The Tombstone
				// and Delete errors are separately logged and are reliable.
				logger.sendTelemetryEvent(event);
			}
		}
		this.pendingEventsQueue = [];
	}
}
