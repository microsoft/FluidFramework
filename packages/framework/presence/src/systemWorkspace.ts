/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IAudience } from "@fluidframework/container-definitions";
import type { IEmitter, Listenable } from "@fluidframework/core-interfaces/internal";
import { assert } from "@fluidframework/core-utils/internal";

import type { ClientConnectionId } from "./baseTypes.js";
import type { InternalTypes } from "./exposedInternalTypes.js";
import type { PostUpdateAction } from "./internalTypes.js";
import { asDeserializedJson, fullySerializableToOpaqueJson } from "./internalUtils.js";
import type { Attendee, AttendeesEvents, AttendeeId, Presence } from "./presence.js";
import { AttendeeStatus } from "./presence.js";
import type { PresenceStatesInternal } from "./presenceStates.js";
import { TimerManager } from "./timerManager.js";
import type { AnyWorkspace, StatesWorkspaceSchema } from "./types.js";

/**
 * The system workspace's datastore structure.
 */
export interface SystemWorkspaceDatastore {
	clientToSessionId: {
		[ConnectionId: ClientConnectionId]: InternalTypes.ValueRequiredState<AttendeeId>;
	};
}

class SessionClient implements Attendee {
	/**
	 * Order is used to track the most recent client connection
	 * during a session.
	 */
	public order: number = 0;

	private connectionStatus: AttendeeStatus = AttendeeStatus.Disconnected;

	public constructor(
		public readonly attendeeId: AttendeeId,
		public connectionId: ClientConnectionId | undefined = undefined,
	) {}

	public getConnectionId(): ClientConnectionId {
		if (this.connectionId === undefined) {
			throw new Error("Client has never been connected");
		}
		return this.connectionId;
	}

	public getConnectionStatus(): AttendeeStatus {
		return this.connectionStatus;
	}

	public setConnected(): void {
		this.connectionStatus = AttendeeStatus.Connected;
	}

	public setDisconnected(): void {
		this.connectionStatus = AttendeeStatus.Disconnected;
	}
}

/**
 * Internal workspace that manages metadata for session attendees.
 */
export interface SystemWorkspace
	// Portion of Presence that is handled by SystemWorkspace along with
	// responsibility for emitting "attendeeConnected" events.
	extends Exclude<Presence["attendees"], never> {
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
	 * An entry is for session ID if the value's `attendeeId` matches the key.
	 */
	private readonly attendees = new Map<ClientConnectionId | AttendeeId, SessionClient>();

	// When local client disconnects, we lose the connectivity status updates for remote attendees in the session.
	// Upon reconnect, we mark all other attendees connections as stale and update their status to disconnected after 30 seconds of inactivity.
	private readonly staleConnectionClients = new Set<SessionClient>();

	private readonly staleConnectionTimer = new TimerManager();

	public constructor(
		attendeeId: AttendeeId,
		private readonly datastore: SystemWorkspaceDatastore,
		public readonly events: Listenable<AttendeesEvents> & IEmitter<AttendeesEvents>,
		private readonly audience: IAudience,
	) {
		this.selfAttendee = new SessionClient(attendeeId);
		this.attendees.set(attendeeId, this.selfAttendee);
	}

	public ensureContent<TSchemaAdditional extends StatesWorkspaceSchema>(
		_content: TSchemaAdditional,
	): never {
		throw new Error("Method not implemented.");
	}

	public processUpdate(
		_received: number,
		_timeModifier: number,
		remoteDatastore: {
			clientToSessionId: {
				[ConnectionId: ClientConnectionId]: InternalTypes.ValueRequiredState<AttendeeId> & {
					ignoreUnmonitored?: true;
				};
			};
		},
		senderConnectionId: ClientConnectionId,
	): PostUpdateAction[] {
		const audienceMembers = this.audience.getMembers();
		const postUpdateActions: PostUpdateAction[] = [];
		for (const [clientConnectionId, value] of Object.entries(
			remoteDatastore.clientToSessionId,
		)) {
			const attendeeId = asDeserializedJson(value.value);
			const { attendee, isJoining } = this.ensureAttendee(
				attendeeId,
				clientConnectionId,
				/* order */ value.rev,
				// If the attendee is present in audience OR if the attendee update is from the sending remote client itself,
				// then the attendee is considered connected.
				/* isConnected */ senderConnectionId === clientConnectionId ||
					audienceMembers.has(clientConnectionId),
			);
			// If the attendee is joining the session, add them to the list of joining attendees to be announced later.
			if (isJoining) {
				postUpdateActions.push(() => this.events.emit("attendeeConnected", attendee));
			}

			const knownSessionId = this.datastore.clientToSessionId[clientConnectionId];
			if (knownSessionId === undefined) {
				this.datastore.clientToSessionId[clientConnectionId] = value;
			} else {
				assert(knownSessionId.value === value.value, 0xa5a /* Mismatched SessionId */);
			}
		}

		return postUpdateActions;
	}

	public onConnectionAdded(clientConnectionId: ClientConnectionId): void {
		assert(
			this.selfAttendee.getConnectionStatus() === AttendeeStatus.Disconnected,
			0xaad /* Local client should be 'Disconnected' before adding new connection. */,
		);

		this.datastore.clientToSessionId[clientConnectionId] = {
			rev: this.selfAttendee.order++,
			timestamp: Date.now(),
			value: fullySerializableToOpaqueJson(this.selfAttendee.attendeeId),
		};

		// Mark 'Connected' remote attendees connections as stale
		for (const staleConnectionClient of this.attendees.values()) {
			if (staleConnectionClient.getConnectionStatus() === AttendeeStatus.Connected) {
				this.staleConnectionClients.add(staleConnectionClient);
			}
		}

		// Update the self attendee
		this.selfAttendee.connectionId = clientConnectionId;
		this.selfAttendee.setConnected();
		this.attendees.set(clientConnectionId, this.selfAttendee);

		this.staleConnectionTimer.setTimeout(() => {
			for (const client of this.staleConnectionClients) {
				client.setDisconnected();
			}
			for (const client of this.staleConnectionClients) {
				this.events.emit("attendeeDisconnected", client);
			}
			this.staleConnectionClients.clear();
		}, 30_000);
	}

	public removeClientConnectionId(clientConnectionId: ClientConnectionId): void {
		const attendee = this.attendees.get(clientConnectionId);
		if (!attendee) {
			return;
		}

		// If the local connection is being removed, clear the stale connection timer
		if (attendee === this.selfAttendee) {
			this.staleConnectionTimer.clearTimeout();
		}

		// If the last known connectionID is different from the connection ID being removed, the attendee has reconnected,
		// therefore we should not change the attendee connection status or emit a disconnect event.
		const attendeeReconnected = attendee.getConnectionId() !== clientConnectionId;
		const connected = attendee.getConnectionStatus() === AttendeeStatus.Connected;
		if (!attendeeReconnected && connected) {
			attendee.setDisconnected();
			this.events.emit("attendeeDisconnected", attendee);
			this.staleConnectionClients.delete(attendee);
		}
	}

	public getAttendees(): ReadonlySet<Attendee> {
		return new Set(this.attendees.values());
	}

	public getAttendee(clientId: ClientConnectionId | AttendeeId): Attendee {
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

	public getMyself(): Attendee {
		return this.selfAttendee;
	}

	/**
	 * Make sure the given client session and connection ID pair are represented
	 * in the attendee map. If not present, SessionClient is created and added
	 * to map. If present, make sure the current connection ID is updated.
	 */
	private ensureAttendee(
		attendeeId: AttendeeId,
		clientConnectionId: ClientConnectionId,
		order: number,
		isConnected: boolean,
	): { attendee: SessionClient; isJoining: boolean } {
		let attendee = this.attendees.get(attendeeId);
		let isJoining = false;

		if (attendee === undefined) {
			// New attendee. Create SessionClient and add session ID based
			// entry to map.
			attendee = new SessionClient(attendeeId, clientConnectionId);
			this.attendees.set(attendeeId, attendee);
			if (isConnected) {
				attendee.setConnected();
				isJoining = true;
			}
		} else if (order > attendee.order) {
			// The given association is newer than the one we have.
			// Update the order and current connection ID.
			attendee.order = order;
			// Known attendee is joining the session if they are currently disconnected
			if (attendee.getConnectionStatus() === AttendeeStatus.Disconnected && isConnected) {
				attendee.setConnected();
				isJoining = true;
			}
			attendee.connectionId = clientConnectionId;
		}

		if (isConnected) {
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
 */
export function createSystemWorkspace(
	attendeeId: AttendeeId,
	datastore: SystemWorkspaceDatastore,
	events: Listenable<AttendeesEvents> & IEmitter<AttendeesEvents>,
	audience: IAudience,
): {
	workspace: SystemWorkspace;
	statesEntry: {
		internal: PresenceStatesInternal;
		public: AnyWorkspace<StatesWorkspaceSchema>;
	};
} {
	const workspace = new SystemWorkspaceImpl(attendeeId, datastore, events, audience);
	return {
		workspace,
		statesEntry: {
			internal: workspace,
			public: undefined as unknown as AnyWorkspace<StatesWorkspaceSchema>,
		},
	};
}
