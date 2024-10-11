/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { createSessionId } from "@fluidframework/id-compressor/internal";
import type {
	ITelemetryLoggerExt,
	MonitoringContext,
} from "@fluidframework/telemetry-utils/internal";
import { createChildMonitoringContext } from "@fluidframework/telemetry-utils/internal";

import type { ClientConnectionId } from "./baseTypes.js";
import type { IEphemeralRuntime } from "./internalTypes.js";
import type {
	ClientSessionId,
	IPresence,
	ISessionClient,
	PresenceEvents,
} from "./presence.js";
import type { PresenceDatastoreManager } from "./presenceDatastoreManager.js";
import { PresenceDatastoreManagerImpl } from "./presenceDatastoreManager.js";
import type { SystemWorkspace, SystemWorkspaceDatastore } from "./systemWorkspace.js";
import { createSystemWorkspace } from "./systemWorkspace.js";
import type {
	PresenceStates,
	PresenceWorkspaceAddress,
	PresenceStatesSchema,
} from "./types.js";

import type {
	IContainerExtension,
	IExtensionMessage,
} from "@fluid-experimental/presence/internal/container-definitions/internal";
import type { IEmitter } from "@fluid-experimental/presence/internal/events";
import { createEmitter } from "@fluid-experimental/presence/internal/events";

/**
 * Portion of the container extension requirements ({@link IContainerExtension}) that are delegated to presence manager.
 *
 * @internal
 */
export type PresenceExtensionInterface = Required<
	Pick<IContainerExtension<never>, "processSignal">
>;

/**
 * The Presence manager
 */
class PresenceManager implements IPresence, PresenceExtensionInterface {
	private readonly datastoreManager: PresenceDatastoreManager;
	private readonly systemWorkspace: SystemWorkspace;

	public readonly events = createEmitter<PresenceEvents>();

	private readonly mc: MonitoringContext | undefined = undefined;

	public constructor(runtime: IEphemeralRuntime, clientSessionId: ClientSessionId) {
		const logger = runtime.logger;
		if (logger) {
			this.mc = createChildMonitoringContext({ logger, namespace: "Presence" });
			this.mc.logger.sendTelemetryEvent({ eventName: "PresenceInstantiated" });
		}

		[this.datastoreManager, this.systemWorkspace] = setupSubComponents(
			clientSessionId,
			runtime,
			this.events,
			this.mc?.logger,
		);

		runtime.on("connected", this.onConnect.bind(this));

		// Check if already connected at the time of construction.
		// If constructed during data store load, the runtime may already be connected
		// and the "connected" event will be raised during completion. With construction
		// delayed we expect that "connected" event has passed.
		// Note: In some manual testing, this does not appear to be enough to
		// always trigger an initial connect.
		const clientId = runtime.clientId;
		if (clientId !== undefined && runtime.connected) {
			this.onConnect(clientId);
		}
	}

	private onConnect(clientConnectionId: ClientConnectionId): void {
		this.systemWorkspace.onConnectionAdded(clientConnectionId);
		this.datastoreManager.joinSession(clientConnectionId);
	}

	public getAttendees(): ReadonlySet<ISessionClient> {
		return this.systemWorkspace.getAttendees();
	}

	public getAttendee(clientId: ClientConnectionId | ClientSessionId): ISessionClient {
		return this.systemWorkspace.getAttendee(clientId);
	}

	public getMyself(): ISessionClient {
		return this.systemWorkspace.getMyself();
	}

	public getStates<TSchema extends PresenceStatesSchema>(
		workspaceAddress: PresenceWorkspaceAddress,
		requestedContent: TSchema,
	): PresenceStates<TSchema> {
		return this.datastoreManager.getWorkspace(`s:${workspaceAddress}`, requestedContent);
	}

	public getNotifications<TSchema extends PresenceStatesSchema>(
		workspaceAddress: PresenceWorkspaceAddress,
		requestedContent: TSchema,
	): PresenceStates<TSchema> {
		return this.datastoreManager.getWorkspace(`n:${workspaceAddress}`, requestedContent);
	}

	/**
	 * Check for Presence message and process it.
	 *
	 * @param address - Address of the message
	 * @param message - Message to be processed
	 * @param local - Whether the message originated locally (`true`) or remotely (`false`)
	 */
	public processSignal(address: string, message: IExtensionMessage, local: boolean): void {
		this.datastoreManager.processSignal(message, local);
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
	clientSessionId: ClientSessionId,
	runtime: IEphemeralRuntime,
	events: IEmitter<PresenceEvents>,
	logger: ITelemetryLoggerExt | undefined,
): [PresenceDatastoreManager, SystemWorkspace] {
	const systemWorkspaceDatastore: SystemWorkspaceDatastore = {
		clientToSessionId: {},
	};
	const systemWorkspaceConfig = createSystemWorkspace(
		clientSessionId,
		systemWorkspaceDatastore,
		events,
	);
	const datastoreManager = new PresenceDatastoreManagerImpl(
		clientSessionId,
		runtime,
		systemWorkspaceConfig.workspace.getAttendee.bind(systemWorkspaceConfig.workspace),
		logger,
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
	clientSessionId: ClientSessionId = createSessionId() as ClientSessionId,
): IPresence & PresenceExtensionInterface {
	return new PresenceManager(runtime, clientSessionId);
}
