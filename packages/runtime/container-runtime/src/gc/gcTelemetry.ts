/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IGarbageCollectionData } from "@fluidframework/runtime-definitions/internal";
import {
	ITelemetryLoggerExt,
	MonitoringContext,
	generateStack,
	tagCodeArtifacts,
	type ITelemetryGenericEventExt,
	type ITelemetryPropertiesExt,
} from "@fluidframework/telemetry-utils/internal";

import { RuntimeHeaderData } from "../containerRuntime.js";
import { ICreateContainerMetadata } from "../summary/index.js";

import {
	GCNodeType,
	IGarbageCollectorConfigs,
	UnreferencedState,
	disableTombstoneKey,
	throwOnTombstoneLoadOverrideKey,
	throwOnTombstoneUsageKey,
} from "./gcDefinitions.js";
import { getGCVersionInEffect } from "./gcHelpers.js";
import { UnreferencedStateTracker } from "./gcUnreferencedStateTracker.js";

type NodeUsageType = "Changed" | "Loaded" | "Revived" | "Realized";

/** Properties passed to nodeUsed function when a node is used. */
interface INodeUsageProps {
	/** The full path (in GC Path format) to the node in question */
	id: string;
	/** Latest timestamp received from the server, as a baseline for computing GC state/age */
	currentReferenceTimestampMs: number;
	/** The package path of the node. Not available if the node hasn't been loaded yet */
	packagePath: readonly string[] | undefined;
	/** How was this node used */
	usageType: NodeUsageType;
	/** How many GC runs have been completed in this session */
	completedGCRuns: number;
	/** Whether the node is tombstoned */
	isTombstoned: boolean;
	/** In case of Revived - what node added the reference? */
	fromId?: string;
	/** In case of Revived - was it revived due to autorecovery? */
	autorecovery?: true;
	/** URL (including query string) if this usage came from a request */
	requestUrl?: string;
	/** The timestamp of the last summary */
	lastSummaryTime?: number;
	/** Original request headers if this usage came from a request or handle.get */
	headers?: RuntimeHeaderData;
	/** Additional properties to log in telemetry */
	additionalProps?: ITelemetryPropertiesExt;
	/** The package path of the node that adds a reference. Not available if the node hasn't been loaded yet */
	fromPackagePath?: readonly string[] | undefined;
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

	private readonly referencesSinceLastRun: Set<string> = new Set();

	constructor(
		private readonly mc: MonitoringContext,
		private readonly configs: IGarbageCollectorConfigs,
		private readonly isSummarizerClient: boolean,
		private readonly createContainerMetadata: ICreateContainerMetadata,
		private readonly getNodeType: (nodeId: string) => GCNodeType,
		private readonly getNodeStateTracker: (
			nodeId: string,
		) => UnreferencedStateTracker | undefined,
	) {}

	/**
	 * Called after every GC run. Clear all references since the last GC run since the unreferenced
	 * state of all nodes would have updated and the references are now stale.
	 */
	public gcRunCompleted() {
		this.referencesSinceLastRun.clear();
	}

	/**
	 * Returns whether an event should be logged for a node that isn't active anymore. This does not apply to
	 * tombstoned nodes for which an event is always logged. Some scenarios where we won't log:
	 * 1. When a DDS is changed. The corresponding data store's event will be logged instead.
	 * 2. An event is logged only once per container instance per event per node.
	 */
	private shouldLogNonActiveEvent(
		nodeType: GCNodeType,
		usageType: NodeUsageType,
		state: UnreferencedState,
		uniqueEventId: string,
	) {
		if (state === UnreferencedState.Active) {
			return false;
		}

		if (nodeType === GCNodeType.Other) {
			return false;
		}

		// For sub data store (DDS) nodes, if they are changed, its data store will also be changed,
		// so skip logging to make the telemetry less noisy.
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
			fromPackagePath,
			id: untaggedId,
			fromId: untaggedFromId,
			isTombstoned,
			headers,
			additionalProps,
			...otherNodeUsageProps
		}: INodeUsageProps,
	) {
		// Note: For SubDataStore Load usage, trackedId will be the DataStore's id, not the full path in question.
		// This is necessary because the SubDataStore path may be unrecognized by GC (if suited for a custom request handler)
		const nodeStateTracker = this.getNodeStateTracker(trackedId);
		const nodeType = this.getNodeType(untaggedId);
		const unrefTime = nodeStateTracker?.unreferencedTimestampMs ?? -1;
		const age =
			nodeStateTracker !== undefined
				? currentReferenceTimestampMs - nodeStateTracker.unreferencedTimestampMs
				: -1;
		const { persistedGcFeatureMatrix, ...configs } = this.configs;
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

		const loggingProps: ITelemetryPropertiesExt = {
			...tagCodeArtifacts({ id: untaggedId, fromId: untaggedFromId }),
			...tagCodeArtifacts({ pkg: packagePath?.join("/") }),
			...tagCodeArtifacts({ fromPkg: fromPackagePath?.join("/") }),
			gcConfigs: { ...configs, ...persistedGcFeatureMatrix },
			details: {
				age,
				unrefTime,
				timeout,
				type: nodeType,
				trackedId,
				isTombstoned,
				...headers,
				...additionalProps,
				...otherNodeUsageProps,
				...this.createContainerMetadata,
			},
		};

		// If the node that is used is tombstoned, log a tombstone telemetry.
		if (isTombstoned) {
			this.logTombstoneUsageTelemetry(
				nodeType,
				usageType,
				loggingProps,
				headers?.allowTombstone,
			);
		}

		// If the node has been referenced before it was used, this usage is not unexpected. Check the trackedId
		// as well for cases where a DDS is used after it's data store is referenced.
		if (
			this.referencesSinceLastRun.has(untaggedId) ||
			this.referencesSinceLastRun.has(trackedId)
		) {
			return;
		}

		// If the node is revived, add it to the list of references since last GC run. This will be used to filter out
		// cases where this node is later.
		if (usageType === "Revived") {
			this.referencesSinceLastRun.add(untaggedId);
		}

		// After logging tombstone telemetry, if the node's unreferenced state is not tracked, there is nothing
		// else to log.
		if (nodeStateTracker === undefined) {
			return;
		}

		const state = nodeStateTracker.state;
		const uniqueEventId = `${state}-${untaggedId}-${usageType}`;

		if (!this.shouldLogNonActiveEvent(nodeType, usageType, state, uniqueEventId)) {
			return;
		}

		// Add the unique event id so that we don't generate a log for this event again in this session.
		this.loggedUnreferencedEvents.add(uniqueEventId);

		if (this.isSummarizerClient || usageType === "Loaded") {
			const event = {
				eventName: `${state}Object_${usageType}`,
				stack: generateStack(),
				...loggingProps,
			};

			// These are logged as generic events and not errors because there can be false positives. The Tombstone
			// and Delete errors are separately logged and are reliable.
			this.mc.logger.sendTelemetryEvent(event);
		}
	}

	private logTombstoneUsageTelemetry(
		nodeType: GCNodeType,
		usageType: NodeUsageType,
		loggingProps: ITelemetryPropertiesExt,
		allowTombstone?: boolean,
	) {
		// This will log the following events:
		// GC_Tombstone_DataStore_Requested, GC_Tombstone_DataStore_Changed, GC_Tombstone_DataStore_Revived
		// GC_Tombstone_SubDataStore_Requested, GC_Tombstone_SubDataStore_Changed, GC_Tombstone_SubDataStore_Revived
		// GC_Tombstone_Blob_Requested, GC_Tombstone_Blob_Changed, GC_Tombstone_Blob_Revived
		const eventUsageName = usageType === "Loaded" ? "Requested" : usageType;
		const event = {
			eventName: `GC_Tombstone_${nodeType}_${eventUsageName}`,
			stack: generateStack(),
			tombstoneFlags: {
				DisableTombstone: this.mc.config.getBoolean(disableTombstoneKey),
				ThrowOnTombstoneUsage: this.mc.config.getBoolean(throwOnTombstoneUsageKey),
				ThrowOnTombstoneLoad: this.mc.config.getBoolean(throwOnTombstoneLoadOverrideKey),
			},
			...loggingProps,
		};

		if (
			(usageType === "Loaded" && this.configs.throwOnTombstoneLoad && !allowTombstone) ||
			(usageType === "Changed" && this.configs.throwOnTombstoneUsage)
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
}

/**
 * Consolidates info / logic for logging when we encounter unexpected usage of GC'd objects. For example, when a
 * tombstoned or deleted object is loaded.
 */
export function sendGCUnexpectedUsageEvent(
	mc: MonitoringContext,
	event: ITelemetryGenericEventExt & {
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
		ThrowOnTombstoneLoad: mc.config.getBoolean(throwOnTombstoneLoadOverrideKey),
	});
	event.gcVersion = getGCVersionInEffect(mc.config);

	mc.logger.sendTelemetryEvent(event, error);
}
