/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";

import type { ClientConnectionId } from "./baseTypes.js";
import type { InternalTypes } from "./exposedInternalTypes.js";
import type {
	ClientSessionId,
	IPresence,
	ISessionClient,
	PresenceEvents,
} from "./presence.js";
import type { PresenceStatesInternal } from "./presenceStates.js";
import type { PresenceStates, PresenceStatesSchema } from "./types.js";

import type { IEmitter } from "@fluid-experimental/presence/internal/events";

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

/**
 * There is no implementation class for this interface.
 * It is a simple structure. Most complicated aspect is that
 * `currentConnectionId()` member is replaced with a new
 * function when a more recent connection is added.
 *
 * See {@link SystemWorkspaceImpl.ensureAttendee}.
 */
interface SessionClient extends ISessionClient {
	/**
	 * Order is used to track the most recent client connection
	 * during a session.
	 */
	order: number;
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
	 * @param clientConnectionId - The new client connection id.
	 */
	onConnectionAdded(clientConnectionId: ClientConnectionId): void;
}

class SystemWorkspaceImpl implements PresenceStatesInternal, SystemWorkspace {
	private readonly selfAttendee: SessionClient;
	/**
	 * `attendees` is this client's understanding of the attendees in the
	 * session. The map covers entries for both session ids and connection
	 * ids, which are never expected to collide, but if they did for same
	 * client that would be fine.
	 * An entry is for session id if the value's `sessionId` matches the key.
	 */
	private readonly attendees = new Map<ClientConnectionId | ClientSessionId, SessionClient>();

	public constructor(
		clientSessionId: ClientSessionId,
		private readonly datastore: SystemWorkspaceDatastore,
		public readonly events: IEmitter<Pick<PresenceEvents, "attendeeJoined">>,
	) {
		this.selfAttendee = {
			sessionId: clientSessionId,
			order: 0,
			currentConnectionId: () => {
				throw new Error("Client has never been connected");
			},
		};
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
	): void {
		const postUpdateActions: (() => void)[] = [];
		for (const [clientConnectionId, value] of Object.entries(
			remoteDatastore.clientToSessionId,
		)) {
			const clientSessionId = value.value;
			const { attendee, isNew } = this.ensureAttendee(
				clientSessionId,
				clientConnectionId,
				/* order */ value.rev,
			);
			if (isNew) {
				postUpdateActions.push(() => this.events.emit("attendeeJoined", attendee));
			}
			const knownSessionId: InternalTypes.ValueRequiredState<ClientSessionId> | undefined =
				this.datastore.clientToSessionId[clientConnectionId];
			if (knownSessionId === undefined) {
				this.datastore.clientToSessionId[clientConnectionId] = value;
			} else {
				assert(knownSessionId.value === value.value, "Mismatched SessionId");
			}
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

		this.selfAttendee.currentConnectionId = () => clientConnectionId;
		this.attendees.set(clientConnectionId, this.selfAttendee);
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
	 * Make sure the given client session and connection id pair are represented
	 * in the attendee map. If not present, SessionClient is created and added
	 * to map. If present, make sure the current connection id is updated.
	 */
	private ensureAttendee(
		clientSessionId: ClientSessionId,
		clientConnectionId: ClientConnectionId,
		order: number,
	): { attendee: SessionClient; isNew: boolean } {
		const currentConnectionId = (): ClientConnectionId => clientConnectionId;
		let attendee = this.attendees.get(clientSessionId);
		let isNew = false;
		if (attendee === undefined) {
			// New attendee. Create SessionClient and add session id based
			// entry to map.
			attendee = {
				sessionId: clientSessionId,
				order,
				currentConnectionId,
			};
			this.attendees.set(clientSessionId, attendee);
			isNew = true;
		} else if (order > attendee.order) {
			// The given association is newer than the one we have.
			// Update the order and current connection id.
			attendee.order = order;
			attendee.currentConnectionId = currentConnectionId;
		}
		// Always update entry for the connection id. (Okay if already set.)
		this.attendees.set(clientConnectionId, attendee);
		return { attendee, isNew };
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
): {
	workspace: SystemWorkspace;
	statesEntry: {
		internal: PresenceStatesInternal;
		public: PresenceStates<PresenceStatesSchema>;
	};
} {
	const workspace = new SystemWorkspaceImpl(clientSessionId, datastore, events);
	return {
		workspace,
		statesEntry: {
			internal: workspace,
			public: undefined as unknown as PresenceStates<PresenceStatesSchema>,
		},
	};
}
