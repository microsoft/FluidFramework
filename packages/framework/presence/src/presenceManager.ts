/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { createSessionId } from "@fluidframework/id-compressor/internal";

import type { ClientConnectionId } from "./baseTypes.js";
import type { IEphemeralRuntime, PresenceManagerInternal } from "./internalTypes.js";
import type {
	ClientSessionId,
	IPresence,
	ISessionClient,
	PresenceEvents,
} from "./presence.js";
import type { PresenceDatastoreManager } from "./presenceDatastoreManager.js";
import { PresenceDatastoreManagerImpl } from "./presenceDatastoreManager.js";
import type {
	PresenceStates,
	PresenceWorkspaceAddress,
	PresenceStatesSchema,
} from "./types.js";

import type {
	IContainerExtension,
	IExtensionMessage,
} from "@fluid-experimental/presence/internal/container-definitions/internal";
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
class PresenceManager
	implements IPresence, PresenceExtensionInterface, PresenceManagerInternal
{
	private readonly datastoreManager: PresenceDatastoreManager;
	private readonly selfAttendee: ISessionClient = {
		sessionId: createSessionId() as ClientSessionId,
		currentConnectionId: () => {
			throw new Error("Client has never been connected");
		},
	};
	private readonly attendees = new Map<ClientConnectionId | ClientSessionId, ISessionClient>([
		[this.selfAttendee.sessionId, this.selfAttendee],
	]);

	public constructor(runtime: IEphemeralRuntime) {
		// If already connected (now or in the past), populate self and attendees.
		const originalClientId = runtime.clientId;
		if (originalClientId !== undefined) {
			this.selfAttendee.currentConnectionId = () => originalClientId;
			this.attendees.set(originalClientId, this.selfAttendee);
		}

		// Watch for connected event that will produce new (or first) clientId.
		// This event is added before instantiating the datastore manager so
		// that self can be given a proper clientId before datastore manager
		// might possibly try to use it. (Datastore manager is expected to
		// use connected clientId more directly and no order dependence should
		// be relied upon, but helps with debugging consistency.)
		runtime.on("connected", (clientId: ClientConnectionId) => {
			this.selfAttendee.currentConnectionId = () => clientId;
			this.attendees.set(clientId, this.selfAttendee);
		});

		this.datastoreManager = new PresenceDatastoreManagerImpl(
			this.selfAttendee.sessionId,
			runtime,
			this,
		);
	}

	public readonly events = createEmitter<PresenceEvents>();

	public getAttendees(): ReadonlySet<ISessionClient> {
		return new Set(this.attendees.values());
	}

	public getAttendee(clientId: ClientConnectionId | ClientSessionId): ISessionClient {
		const attendee = this.attendees.get(clientId);
		if (attendee) {
			return attendee;
		}
		// This is a major hack to enable basic operation.
		// Missing attendees should be rejected.
		const newAttendee = {
			sessionId: clientId as ClientSessionId,
			currentConnectionId: () => clientId,
		} satisfies ISessionClient;
		this.attendees.set(clientId, newAttendee);
		return newAttendee;
	}

	public getMyself(): ISessionClient {
		return this.selfAttendee;
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
 * Instantiates Presence Manager
 *
 * @internal
 */
export function createPresenceManager(
	runtime: IEphemeralRuntime,
): IPresence & PresenceExtensionInterface {
	return new PresenceManager(runtime);
}
