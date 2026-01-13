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
import { assert } from "@fluidframework/core-utils/internal";
import { createSessionId } from "@fluidframework/id-compressor/internal";
import type {
	ITelemetryLoggerExt,
	MonitoringContext,
} from "@fluidframework/telemetry-utils/internal";
import { createChildMonitoringContext } from "@fluidframework/telemetry-utils/internal";

import type { ClientConnectionId } from "./baseTypes.js";
import type { BroadcastControlSettings } from "./broadcastControls.js";
import type { ExtensionRuntimeProperties, IEphemeralRuntime } from "./internalTypes.js";
import type {
	AttendeesEvents,
	AttendeeId,
	PresenceWithNotifications as Presence,
	PresenceEvents,
} from "./presence.js";
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
 */
export type PresenceExtensionInterface = Required<
	Pick<ContainerExtension<ExtensionRuntimeProperties>, "processSignal">
>;

/**
 * Confirms that the message is from a client and has a clientId
 * versus from the system which specifies `null` for clientId.
 */
function assertMessageIsFromAClient(
	message: InboundExtensionMessage<SignalMessages>,
): asserts message is InboundExtensionMessage<SignalMessages> & {
	clientId: ClientConnectionId;
} {
	assert(message.clientId !== null, 0xa3a /* Presence received signal without clientId */);
}

/**
 * The Presence manager
 */
class PresenceManager implements Presence, PresenceExtensionInterface {
	private joined = false;
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

	public constructor(
		private readonly runtime: IEphemeralRuntime,
		attendeeId: AttendeeId,
	) {
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

		runtime.events.on("disconnected", this.onDisconnected.bind(this));

		const audience = runtime.getAudience();
		// Listen for self add to Audience to indicate join (with a stable
		// audience population).
		audience.on("addMember", this.addClientConnectionId.bind(this));
		audience.on("removeMember", this.removeClientConnectionId.bind(this));

		// Check if already connected (can send signals and complete audience)
		// at the time of construction.
		// If constructed during data store load, the runtime may already be connected
		// and the self-"addMember" event will be raised during completion. With
		// construction delayed we expect that self-"addMember" event has passed.
		// Note: In some manual testing, this does not appear to be enough to
		// always trigger an initial connect.
		const clientId = runtime.getClientId();
		if (
			clientId !== undefined &&
			runtime.getJoinedStatus() !== "disconnected" &&
			audience.getMember(clientId) !== undefined
		) {
			this.onJoin(clientId, /* alternateUpdateProvider */ undefined);
		}
	}

	private addClientConnectionId(clientConnectionId: ClientConnectionId): void {
		// Check specifically for self join that indicates stable audience
		// and is preferred trigger for presence join.
		if (clientConnectionId === this.runtime.getClientId()) {
			this.onJoin(clientConnectionId, /* alternateUpdateProvider */ undefined);
		}
	}

	private removeClientConnectionId(clientConnectionId: ClientConnectionId): void {
		this.systemWorkspace.removeClientConnectionId(clientConnectionId);
	}

	private onJoin(
		clientConnectionId: ClientConnectionId,
		alternateUpdateProvider: ClientConnectionId | undefined,
	): void {
		// System workspace is notified even if already "joined", to handle the
		// audience -> attendee status updates.
		this.systemWorkspace.onConnectionAdded(
			clientConnectionId,
			// audienceOutOfDate - out of date when onJoin is forced by receiving
			// a signal (which calls with alternateUpdateProvider defined).
			alternateUpdateProvider !== undefined,
		);
		if (!this.joined) {
			this.datastoreManager.joinSession(clientConnectionId, alternateUpdateProvider);
			this.joined = true;
		}
	}

	private onDisconnected(): void {
		this.joined = false;
		const currentClientId = this.runtime.getClientId();
		if (currentClientId !== undefined) {
			this.removeClientConnectionId(currentClientId);
		}
		this.datastoreManager.onDisconnected();
	}

	/**
	 * Check for Presence message and process it.
	 *
	 * @param addressChain - Address chain of the message
	 * @param message - Unverified message to be processed
	 * @param local - Whether the message originated locally (`true`) or remotely (`false`)
	 */
	public processSignal(
		addressChain: string[],
		message: InboundExtensionMessage<SignalMessages>,
		local: boolean,
	): void {
		assertMessageIsFromAClient(message);

		// Check for undesired case of receiving a remote presence signal
		// without having been alerted to self audience join that is preferred
		// trigger for join. (Perhaps join signal was dropped.)
		// In practice it is commonly observed that local signals can be
		// returned ahead of audience join notification. So, it is reasonable
		// to expect that audience join notification may be delayed until after
		// other presence signals are received. One is enough to get things
		// rolling.
		if (!local && !this.joined) {
			const selfClientId = this.runtime.getClientId();
			assert(selfClientId !== undefined, 0xcbf /* Received signal without clientId */);
			this.onJoin(selfClientId, /* alternateUpdateProvider */ message.clientId);
		}

		this.datastoreManager.processSignal(
			message,
			local,
			/* optional */ addressChain[0] === "?",
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
 */
export function createPresenceManager(
	runtime: IEphemeralRuntime,
	attendeeId: AttendeeId = createSessionId() as AttendeeId,
): Presence & PresenceExtensionInterface {
	return new PresenceManager(runtime, attendeeId);
}
