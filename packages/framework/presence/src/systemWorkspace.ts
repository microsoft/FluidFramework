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
 * @internal
 */
export interface SystemWorkspaceDatastore {
	clientToSessionId: {
		[ConnectionId: ClientConnectionId]: InternalTypes.ValueRequiredState<ClientSessionId>;
	};
}

interface SessionClient extends ISessionClient {
	order: number;
}

/**
 * @internal
 */
export interface SystemWorkspace
	extends Pick<IPresence, "getAttendees" | "getAttendee" | "getMyself"> {
	onConnectionAdded(clientConnectionId: ClientConnectionId): void;
}

class SystemWorkspaceImpl implements PresenceStatesInternal, SystemWorkspace {
	private readonly selfAttendee: SessionClient;
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
		for (const [clientConnectionId, value] of Object.entries(
			remoteDatastore.clientToSessionId,
		)) {
			const clientSessionId = value.value;
			const attendee = this.ensureAttendee(clientSessionId, clientConnectionId, value.rev);
			const knownSessionId: InternalTypes.ValueRequiredState<ClientSessionId> | undefined =
				this.datastore.clientToSessionId[clientConnectionId];
			if (knownSessionId === undefined) {
				this.datastore.clientToSessionId[clientConnectionId] = value;
			} else {
				assert(knownSessionId.value === value.value, "Mismatched SessionId");
			}
			if (!(clientSessionId in this.datastore.clientToSessionId)) {
				this.events.emit("attendeeJoined", attendee);
			}
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

		throw new Error("Attendee not found");
	}

	public getMyself(): ISessionClient {
		return this.selfAttendee;
	}

	private ensureAttendee(
		clientSessionId: ClientSessionId,
		clientConnectionId: ClientConnectionId,
		order: number,
	): SessionClient {
		const currentConnectionId = (): ClientConnectionId => clientConnectionId;
		let attendee = this.attendees.get(clientSessionId);
		if (attendee === undefined) {
			attendee = {
				sessionId: clientSessionId,
				order,
				currentConnectionId,
			};
			this.attendees.set(clientSessionId, attendee);
		} else if (order > attendee.order) {
			attendee.order = order;
			attendee.currentConnectionId = currentConnectionId;
		}
		this.attendees.set(clientConnectionId, attendee);
		return attendee;
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
