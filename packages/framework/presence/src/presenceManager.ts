/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { createEmitter } from "@fluid-internal/client-utils";
import type {
	ContainerExtension,
	InboundExtensionMessage,
} from "@fluidframework/container-runtime-definitions/internal";
import type { IEmitter, Listenable } from "@fluidframework/core-interfaces/internal";
import { createSessionId } from "@fluidframework/id-compressor/internal";
import type {
	ITelemetryLoggerExt,
	MonitoringContext,
} from "@fluidframework/telemetry-utils/internal";
import { createChildMonitoringContext } from "@fluidframework/telemetry-utils/internal";

import type { ClientConnectionId } from "./baseTypes.js";
import type { BroadcastControlSettings } from "./broadcastControls.js";
import type { ExtensionRuntimeProperties, IEphemeralRuntime } from "./internalTypes.js";
import type { AttendeesEvents, AttendeeId, Presence, PresenceEvents } from "./presence.js";
import type { PresenceDatastoreManager } from "./presenceDatastoreManager.js";
import { PresenceDatastoreManagerImpl } from "./presenceDatastoreManager.js";
import type { SignalMessages } from "./protocol.js";
import type { SystemWorkspace, SystemWorkspaceDatastore } from "./systemWorkspace.js";
import { createSystemWorkspace } from "./systemWorkspace.js";
import type {
	NotificationsWorkspace,
	NotificationsWorkspaceSchema,
	StatesWorkspace,
	StatesWorkspaceSchema,
	WorkspaceAddress,
} from "./types.js";

/**
 * Portion of the container extension requirements ({@link ContainerExtension}) that are delegated to presence manager.
 *
 * @internal
 */
export type PresenceExtensionInterface = Required<
	Pick<ContainerExtension<ExtensionRuntimeProperties>, "processSignal">
>;

/**
 * The Presence manager
 */
class PresenceManager implements Presence, PresenceExtensionInterface {
	private readonly datastoreManager: PresenceDatastoreManager;
	private readonly systemWorkspace: SystemWorkspace;

	public readonly events = createEmitter<PresenceEvents & AttendeesEvents>();

	public readonly attendees: Presence["attendees"];

	public readonly states = {
		getWorkspace: <TSchema extends StatesWorkspaceSchema>(
			workspaceAddress: WorkspaceAddress,
			requestedContent: TSchema,
			settings?: BroadcastControlSettings,
		): StatesWorkspace<TSchema> =>
			this.datastoreManager.getWorkspace(`s:${workspaceAddress}`, requestedContent, settings),
	};
	public readonly notifications = {
		getWorkspace: <TSchema extends NotificationsWorkspaceSchema>(
			workspaceAddress: WorkspaceAddress,
			requestedContent: TSchema,
		): NotificationsWorkspace<TSchema> =>
			this.datastoreManager.getWorkspace(`n:${workspaceAddress}`, requestedContent),
	};

	private readonly mc: MonitoringContext | undefined = undefined;

	public constructor(runtime: IEphemeralRuntime, attendeeId: AttendeeId) {
		const logger = runtime.logger;
		if (logger) {
			this.mc = createChildMonitoringContext({ logger, namespace: "Presence" });
			this.mc.logger.sendTelemetryEvent({ eventName: "PresenceInstantiated" });
		}

		[this.datastoreManager, this.systemWorkspace] = setupSubComponents(
			attendeeId,
			runtime,
			this.events,
			this.mc?.logger,
			this,
		);
		this.attendees = this.systemWorkspace;

		runtime.events.on("connected", this.onConnect.bind(this));

		runtime.events.on("disconnected", () => {
			const currentClientId = runtime.getClientId();
			if (currentClientId !== undefined) {
				this.removeClientConnectionId(currentClientId);
			}
		});

		runtime.getAudience().on("removeMember", this.removeClientConnectionId.bind(this));

		// Check if already connected at the time of construction.
		// If constructed during data store load, the runtime may already be connected
		// and the "connected" event will be raised during completion. With construction
		// delayed we expect that "connected" event has passed.
		// Note: In some manual testing, this does not appear to be enough to
		// always trigger an initial connect.
		const clientId = runtime.getClientId();
		if (clientId !== undefined && runtime.isConnected()) {
			this.onConnect(clientId);
		}
	}

	private onConnect(clientConnectionId: ClientConnectionId): void {
		this.systemWorkspace.onConnectionAdded(clientConnectionId);
		this.datastoreManager.joinSession(clientConnectionId);
	}

	private removeClientConnectionId(clientConnectionId: ClientConnectionId): void {
		this.systemWorkspace.removeClientConnectionId(clientConnectionId);
	}
	/**
	 * Check for Presence message and process it.
	 *
	 * @param address - Address of the message
	 * @param message - Unverified message to be processed
	 * @param local - Whether the message originated locally (`true`) or remotely (`false`)
	 */
	public processSignal(
		address: string,
		message: InboundExtensionMessage<SignalMessages>,
		local: boolean,
	): void {
		this.datastoreManager.processSignal(
			message,
			local,
			/* optional */ address.startsWith("?"),
		);
	}
}

/**
 * Helper for Presence Manager setup
 *
 * Presence Manager is outermost layer of the presence system and has two main
 * sub-components:
 * 1. PresenceDatastoreManager: Manages the unified general data for states and
 * registry for workspaces.
 * 2. SystemWorkspace: Custom internal workspace for system states including
 * attendee management. It is registered with the PresenceDatastoreManager.
 */
function setupSubComponents(
	attendeeId: AttendeeId,
	runtime: IEphemeralRuntime,
	events: Listenable<PresenceEvents & AttendeesEvents> &
		IEmitter<PresenceEvents & AttendeesEvents>,
	logger: ITelemetryLoggerExt | undefined,
	presence: Presence,
): [PresenceDatastoreManager, SystemWorkspace] {
	const systemWorkspaceDatastore: SystemWorkspaceDatastore = {
		clientToSessionId: {},
	};
	const systemWorkspaceConfig = createSystemWorkspace(
		attendeeId,
		systemWorkspaceDatastore,
		events,
		runtime.getAudience(),
	);
	const datastoreManager = new PresenceDatastoreManagerImpl(
		attendeeId,
		runtime,
		systemWorkspaceConfig.workspace.getAttendee.bind(systemWorkspaceConfig.workspace),
		logger,
		events,
		presence,
		systemWorkspaceDatastore,
		systemWorkspaceConfig.statesEntry,
	);
	return [datastoreManager, systemWorkspaceConfig.workspace];
}

/**
 * Instantiates Presence Manager
 *
 * @internal
 */
export function createPresenceManager(
	runtime: IEphemeralRuntime,
	attendeeId: AttendeeId = createSessionId() as AttendeeId,
): Presence & PresenceExtensionInterface {
	return new PresenceManager(runtime, attendeeId);
}
