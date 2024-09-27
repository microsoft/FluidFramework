/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";

import type { ClientConnectionId } from "./baseTypes.js";
import type { InternalTypes } from "./exposedInternalTypes.js";
import type { ClientSessionId } from "./presence.js";
import type { PresenceStatesInternal } from "./presenceStates.js";
import type { PresenceStates, PresenceStatesSchema } from "./types.js";

import {
	createEmitter,
	type ISubscribable,
} from "@fluid-experimental/presence/internal/events";

/**
 * @internal
 */
export interface SystemWorkspaceDatastore {
	clientToSessionId: {
		[ConnectionId: ClientConnectionId]: InternalTypes.ValueRequiredState<ClientSessionId>;
	};
}

interface SystemWorkspace {}

class SystemWorkspaceImpl implements PresenceStatesInternal, SystemWorkspace {
	public constructor(private readonly datastore: SystemWorkspaceDatastore) {}

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
			const knownSessionId: InternalTypes.ValueRequiredState<ClientSessionId> | undefined =
				this.datastore.clientToSessionId[clientConnectionId];
			if (knownSessionId === undefined) {
				this.datastore.clientToSessionId[clientConnectionId] = value;
			} else {
				assert(knownSessionId.value === value.value, "Mismatched SessionId");
			}
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
	datastore: SystemWorkspaceDatastore,
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
	}
}

/**
 * Instantiates the system workspace.
 *
 * @internal
 */
export function createSystemWorkspace(datastore: SystemWorkspaceDatastore): {
	workspace: SystemWorkspace;
	statesEntry: {
		internal: PresenceStatesInternal;
		public: PresenceStates<PresenceStatesSchema>;
	};
} {
	const workspace = new SystemWorkspaceImpl(datastore);
	return {
		workspace,
		statesEntry: {
			internal: workspace,
			public: undefined as unknown as PresenceStates<PresenceStatesSchema>,
		},
	};
}
