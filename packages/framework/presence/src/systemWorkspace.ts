/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IAudience } from "@fluidframework/container-definitions";
import type { IEmitter } from "@fluidframework/core-interfaces/internal";
import { assert } from "@fluidframework/core-utils/internal";

import type { ClientConnectionId } from "./baseTypes.js";
import type { InternalTypes } from "./exposedInternalTypes.js";
import type {
	ClientSessionId,
	IPresence,
	ISessionClient,
	PresenceEvents,
} from "./presence.js";
import { SessionClientStatus } from "./presence.js";
import type { PresenceStatesInternal } from "./presenceStates.js";
import { TimerManager } from "./timerManager.js";
import type { PresenceStates, PresenceStatesSchema } from "./types.js";

/**
 * The system workspace's datastore structure.
 *
 * @internal
 */
export interface SystemWorkspaceDatastore {
	clientToSessionId: {
		[ConnectionId: ClientConnectionId]: InternalTypes.ValueRequiredState<ClientSessionId>;
	};
}

class SessionClient implements ISessionClient {
	/**
	 * Order is used to track the most recent client connection
	 * during a session.
	 */
	public order: number = 0;

	private connectionStatus: SessionClientStatus = SessionClientStatus.Disconnected;

	public constructor(
		public readonly sessionId: ClientSessionId,
		public connectionId: ClientConnectionId | undefined = undefined,
	) {}

	public getConnectionId(): ClientConnectionId {
		if (this.connectionId === undefined) {
			throw new Error("Client has never been connected");
		}
		return this.connectionId;
	}

	public getConnectionStatus(): SessionClientStatus {
		return this.connectionStatus;
	}

	public setConnected(): void {
		this.connectionStatus = SessionClientStatus.Connected;
	}

	public setDisconnected(): void {
		this.connectionStatus = SessionClientStatus.Disconnected;
	}
}

/**
 * @internal
 */
export interface SystemWorkspace
	// Portion of IPresence that is handled by SystemWorkspace along with
	// responsiblity for emitting "attendeeJoined" events.
	extends Pick<IPresence, "getAttendees" | "getAttendee" | "getMyself"> {
	/**
	 * Must be called when the current client acquires a new connection.
	 *
	 * @param clientConnectionId - The new client connection ID.
	 */
	onConnectionAdded(clientConnectionId: ClientConnectionId): void;

	/**
	 * Removes the client connection ID from the system workspace.
	 *
	 * @param clientConnectionId - The client connection ID to remove.
	 */
	removeClientConnectionId(clientConnectionId: ClientConnectionId): void;
}

class SystemWorkspaceImpl implements PresenceStatesInternal, SystemWorkspace {
	private readonly selfAttendee: SessionClient;
	/**
	 * `attendees` is this client's understanding of the attendees in the
	 * session. The map covers entries for both session ids and connection
	 * ids, which are never expected to collide, but if they did for same
	 * client that would be fine.
	 * An entry is for session ID if the value's `sessionId` matches the key.
	 */
	private readonly attendees = new Map<ClientConnectionId | ClientSessionId, SessionClient>();

	// When local client disconnects, we lose the connectivity status updates for remote attendees in the session.
	// Upon reconnect, we mark all other attendees connections as stale and update their status to disconnected after 30 seconds of inactivity.
	private readonly staleConnectionClients = new Set<SessionClient>();

	private readonly staleConnectionTimer = new TimerManager();

	public constructor(
		clientSessionId: ClientSessionId,
		private readonly datastore: SystemWorkspaceDatastore,
		private readonly events: IEmitter<
			Pick<PresenceEvents, "attendeeJoined" | "attendeeDisconnected">
		>,
		private readonly audience: IAudience,
	) {
		this.selfAttendee = new SessionClient(clientSessionId);
		this.attendees.set(clientSessionId, this.selfAttendee);
	}

	public ensureContent<TSchemaAdditional extends PresenceStatesSchema>(
		_content: TSchemaAdditional,
	): never {
		throw new Error("Method not implemented.");
	}

	public processUpdate(
		_received: number,
		_timeModifier: number,
		remoteDatastore: {
			clientToSessionId: {
				[
					ConnectionId: ClientConnectionId
				]: InternalTypes.ValueRequiredState<ClientSessionId> & {
					ignoreUnmonitored?: true;
				};
			};
		},
		senderConnectionId: ClientConnectionId,
	): void {
		const postUpdateActions: (() => void)[] = [];
		const audienceMembers = this.audience.getMembers();
		const joiningAttendees = new Set<SessionClient>();
		for (const [clientConnectionId, value] of Object.entries(
			remoteDatastore.clientToSessionId,
		)) {
			const clientSessionId = value.value;
			const { attendee, isJoining } = this.ensureAttendee(
				clientSessionId,
				clientConnectionId,
				/* order */ value.rev,
				// If the attendee is present in audience OR if the attendee update is from the sending remote client itself,
				// then the attendee is considered connected.
				/* isConnected */ senderConnectionId === clientConnectionId ||
					audienceMembers.has(clientConnectionId),
			);
			// If the attendee is joining the session, add them to the list of joining attendees to be announced later.
			if (isJoining) {
				joiningAttendees.add(attendee);
			}

			const knownSessionId: InternalTypes.ValueRequiredState<ClientSessionId> | undefined =
				this.datastore.clientToSessionId[clientConnectionId];
			if (knownSessionId === undefined) {
				this.datastore.clientToSessionId[clientConnectionId] = value;
			} else {
				assert(knownSessionId.value === value.value, 0xa5a /* Mismatched SessionId */);
			}
		}

		for (const announcedAttendee of joiningAttendees) {
			postUpdateActions.push(() => this.events.emit("attendeeJoined", announcedAttendee));
		}

		// TODO: reorganize processUpdate and caller to process actions after all updates are processed.
		for (const action of postUpdateActions) {
			action();
		}
	}

	public onConnectionAdded(clientConnectionId: ClientConnectionId): void {
		this.datastore.clientToSessionId[clientConnectionId] = {
			rev: this.selfAttendee.order++,
			timestamp: Date.now(),
			value: this.selfAttendee.sessionId,
		};

		// Clear the stale connection timer when the local client reconnects
		this.staleConnectionTimer.clearTimeout();

		// Mark 'Connected' remote attendees connections as stale
		for (const staleConnectionClient of this.attendees.values()) {
			if (staleConnecionClient.getConnectionStatus() === SessionClientStatus.Connected) {
				this.staleConnectionClients.add(staleConnecionClient);
			}
		}

		// Update the self attendee
		this.selfAttendee.connectionId = clientConnectionId;
		this.selfAttendee.setConnected();
		this.attendees.set(clientConnectionId, this.selfAttendee);

		// Start the stale connection timer
		this.staleConnectionTimer.setTimeout(() => {
			for (const client of this.staleConnectionClients) {
				// Mark the client as disconnected and remove from the stale connection set
				if (client.getConnectionStatus() === SessionClientStatus.Connected) {
					client.setDisconnected();
					this.events.emit("attendeeDisconnected", client);
				}
				this.staleConnectionClients.delete(client);
			}
		}, 30_000);
	}

	public removeClientConnectionId(clientConnectionId: ClientConnectionId): void {
		const attendee = this.attendees.get(clientConnectionId);
		if (!attendee) {
			return;
		}

		if (attendee === this.selfAttendee) {
			// If the local connection is being removed, clear the stale connection timer
			this.staleConnectionTimer.clearTimeout();
		}

		// If the last known connectionID is different from the connection ID being removed, the attendee has reconnected,
		// therefore we should not change the attendee connection status or emit a disconnect event.
		const attendeeReconnected = attendee.getConnectionId() !== clientConnectionId;
		const connected = attendee.getConnectionStatus() === SessionClientStatus.Connected;
		if (!attendeeReconnected && connected) {
			attendee.setDisconnected();
			this.events.emit("attendeeDisconnected", attendee);
		}
	}

	public getAttendees(): ReadonlySet<ISessionClient> {
		return new Set(this.attendees.values());
	}

	public getAttendee(clientId: ClientConnectionId | ClientSessionId): ISessionClient {
		const attendee = this.attendees.get(clientId);
		if (attendee) {
			return attendee;
		}

		// TODO: Restore option to add attendee on demand to handle internal
		// lookup cases that must come from internal data.
		// There aren't any resiliency mechanisms in place to handle a missed
		// ClientJoin right now.
		throw new Error("Attendee not found");
	}

	public getMyself(): ISessionClient {
		return this.selfAttendee;
	}

	/**
	 * Make sure the given client session and connection ID pair are represented
	 * in the attendee map. If not present, SessionClient is created and added
	 * to map. If present, make sure the current connection ID is updated.
	 */
	private ensureAttendee(
		clientSessionId: ClientSessionId,
		clientConnectionId: ClientConnectionId,
		order: number,
		isConnected: boolean,
	): { attendee: SessionClient; isJoining: boolean } {
		let attendee = this.attendees.get(clientSessionId);
		let isJoining = false;

		if (attendee === undefined) {
			// New attendee. Create SessionClient and add session ID based
			// entry to map.
			attendee = new SessionClient(clientSessionId, clientConnectionId);
			this.attendees.set(clientSessionId, attendee);
			if (isConnected) {
				attendee.setConnected();
				isJoining = true;
			}
		} else if (order > attendee.order) {
			// The given association is newer than the one we have.
			// Update the order and current connection ID.
			attendee.order = order;
			// Known attendee is joining the session if they are currently disconnected
			if (attendee.getConnectionStatus() === SessionClientStatus.Disconnected && isConnected) {
				attendee.setConnected();
				isJoining = true;
			}
			attendee.connectionId = clientConnectionId;
		}

		if (this.staleConnectionClients.has(attendee) && isConnected) {
			// If the attendee is connected, remove them from the stale connection set
			this.staleConnectionClients.delete(attendee);
		}

		// Always update entry for the connection ID. (Okay if already set.)
		this.attendees.set(clientConnectionId, attendee);

		return { attendee, isJoining };
	}
}

/**
 * Instantiates the system workspace.
 *
 * @internal
 */
export function createSystemWorkspace(
	clientSessionId: ClientSessionId,
	datastore: SystemWorkspaceDatastore,
	events: IEmitter<Pick<PresenceEvents, "attendeeJoined">>,
	audience: IAudience,
): {
	workspace: SystemWorkspace;
	statesEntry: {
		internal: PresenceStatesInternal;
		public: PresenceStates<PresenceStatesSchema>;
	};
} {
	const workspace = new SystemWorkspaceImpl(clientSessionId, datastore, events, audience);
	return {
		workspace,
		statesEntry: {
			internal: workspace,
			public: undefined as unknown as PresenceStates<PresenceStatesSchema>,
		},
	};
}
