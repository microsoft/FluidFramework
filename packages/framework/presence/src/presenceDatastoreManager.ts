/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IContainerRuntime } from "@fluidframework/container-runtime-definitions/internal";
import { assert } from "@fluidframework/core-utils/internal";
import type { IFluidDataStoreRuntime } from "@fluidframework/datastore-definitions/internal";
import type { IInboundSignalMessage } from "@fluidframework/runtime-definitions/internal";

import type { ClientConnectionId } from "./baseTypes.js";
import type { InternalTypes } from "./exposedInternalTypes.js";
import type { ClientSessionId, IPresence } from "./presence.js";
import type {
	ClientUpdateEntry,
	PresenceStatesInternal,
	ValueElementMap,
} from "./presenceStates.js";
import { createPresenceStates, mergeUntrackedDatastore } from "./presenceStates.js";
import type { PresenceStates, PresenceStatesSchema } from "./types.js";

import type { IRuntimeInternal } from "@fluid-experimental/presence/internal/container-definitions/internal";

interface PresenceStatesEntry<TSchema extends PresenceStatesSchema> {
	public: PresenceStates<TSchema>;
	internal: PresenceStatesInternal;
}

interface SystemDatastore {
	"system:presence": {
		clientToSessionId: {
			[
				ClientConnectionId: ClientConnectionId
			]: InternalTypes.ValueRequiredState<ClientSessionId>;
		};
	};
}

type PresenceDatastore = {
	[WorkspaceAddress: string]: ValueElementMap<PresenceStatesSchema>;
} & SystemDatastore;

interface GeneralDatastoreMessageContent {
	[WorkspaceAddress: string]: {
		[StateValueManagerKey: string]: {
			[ClientSessionId: ClientSessionId]: ClientUpdateEntry;
		};
	};
}

type DatastoreMessageContent = GeneralDatastoreMessageContent & SystemDatastore;

const datastoreUpdateMessageType = "Pres:DatastoreUpdate";
interface DatastoreUpdateMessage extends IInboundSignalMessage {
	type: typeof datastoreUpdateMessageType;
	content: {
		sendTimestamp: number;
		avgLatency: number;
		isComplete?: true;
		data: GeneralDatastoreMessageContent & Partial<SystemDatastore>;
	};
}

const joinMessageType = "Pres:ClientJoin";
interface ClientJoinMessage extends IInboundSignalMessage {
	type: typeof joinMessageType;
	content: {
		updateProviders: ClientConnectionId[];
		sendTimestamp: number;
		avgLatency: number;
		data: DatastoreMessageContent;
	};
}

function isPresenceMessage(
	message: IInboundSignalMessage,
): message is DatastoreUpdateMessage | ClientJoinMessage {
	return message.type.startsWith("Pres:");
}

/**
 * This interface is a subset of (IContainerRuntime & IRuntimeInternal) and (IFluidDataStoreRuntime) that is needed by the PresenceStates.
 *
 * @privateRemarks
 * Replace with non-DataStore based interface.
 *
 * @internal
 */
export type IEphemeralRuntime = Pick<
	(IContainerRuntime & IRuntimeInternal) | IFluidDataStoreRuntime,
	"clientId" | "getQuorum" | "off" | "on" | "submitSignal"
>;

/**
 * @internal
 */
export interface PresenceDatastoreManager {
	getWorkspace<TSchema extends PresenceStatesSchema>(
		internalWorkspaceAddress: string,
		requestedContent: TSchema,
	): PresenceStates<TSchema>;
	processSignal(message: IInboundSignalMessage, local: boolean): void;
}

/**
 * Manages singleton datastore for all Presence.
 */
export class PresenceDatastoreManagerImpl implements PresenceDatastoreManager {
	private readonly datastore: PresenceDatastore = {
		"system:presence": { clientToSessionId: {} },
	};
	private averageLatency = 0;
	private returnedMessages = 0;
	private refreshBroadcastRequested = false;

	private readonly workspaces = new Map<string, PresenceStatesEntry<PresenceStatesSchema>>();

	public constructor(
		private readonly clientSessionId: ClientSessionId,
		private readonly runtime: IEphemeralRuntime,
		private readonly presence: IPresence,
	) {
		runtime.on("connected", this.onConnect.bind(this));
		runtime.on("signal", this.processSignal.bind(this));

		// Check if already connected at the time of construction.
		// If constructed during data store load, the runtime may already be connected
		// and the "connected" event will be raised during completion. With construction
		// delayed we expect that "connected" event has passed.
		// Note: In some manual testing, this does not appear to be enough to
		// always trigger an initial connect.
		const clientId = runtime.clientId;
		if (clientId !== undefined) {
			this.onConnect(clientId);
		}
	}

	private onConnect(clientId: ClientConnectionId): void {
		this.datastore["system:presence"].clientToSessionId[clientId] = {
			rev: 0,
			timestamp: Date.now(),
			value: this.clientSessionId,
		};

		// Broadcast join message to all clients
		const updateProviders = [...this.runtime.getQuorum().getMembers().keys()].filter(
			(quorumClientId) => quorumClientId !== clientId,
		);
		// Limit to three providers to prevent flooding the network.
		// If none respond, others present will (should) after a delay.
		if (updateProviders.length > 3) {
			updateProviders.length = 3;
		}
		this.runtime.submitSignal(joinMessageType, {
			sendTimestamp: Date.now(),
			avgLatency: this.averageLatency,
			data: this.datastore,
			updateProviders,
		} satisfies ClientJoinMessage["content"]);
	}

	public getWorkspace<TSchema extends PresenceStatesSchema>(
		internalWorkspaceAddress: string,
		requestedContent: TSchema,
	): PresenceStates<TSchema> {
		const existing = this.workspaces.get(internalWorkspaceAddress);
		if (existing) {
			return existing.internal.ensureContent(requestedContent);
		}

		let workspaceDatastore = this.datastore[internalWorkspaceAddress];
		if (workspaceDatastore === undefined) {
			workspaceDatastore = this.datastore[internalWorkspaceAddress] = {};
		}

		const localUpdate = (
			states: { [key: string]: ClientUpdateEntry },
			forceBroadcast: boolean,
		): void => {
			// Check for connectivity before sending updates.
			if (this.runtime.clientId === undefined) {
				return;
			}

			const updates: GeneralDatastoreMessageContent[string] = {};
			for (const [key, value] of Object.entries(states)) {
				updates[key] = { [this.clientSessionId]: value };
			}
			this.localUpdate(
				{
					[internalWorkspaceAddress]: updates,
				},
				forceBroadcast,
			);
		};

		const entry = createPresenceStates(
			{
				clientSessionId: this.clientSessionId,
				lookupClient: this.presence.getAttendee.bind(this.presence),
				localUpdate,
			},
			workspaceDatastore,
			requestedContent,
		);

		this.workspaces.set(internalWorkspaceAddress, entry);
		return entry.public;
	}

	private localUpdate(
		data: GeneralDatastoreMessageContent & Partial<SystemDatastore>,
		_forceBroadcast: boolean,
	): void {
		const content = {
			sendTimestamp: Date.now(),
			avgLatency: this.averageLatency,
			// isComplete: false,
			data,
		} satisfies DatastoreUpdateMessage["content"];
		this.runtime.submitSignal(datastoreUpdateMessageType, content);
	}

	private broadcastAllKnownState(): void {
		this.runtime.submitSignal(datastoreUpdateMessageType, {
			sendTimestamp: Date.now(),
			avgLatency: this.averageLatency,
			isComplete: true,
			data: this.datastore,
		} satisfies DatastoreUpdateMessage["content"]);
		this.refreshBroadcastRequested = false;
	}

	public processSignal(
		message: IInboundSignalMessage | DatastoreUpdateMessage | ClientJoinMessage,
		local: boolean,
	): void {
		const received = Date.now();
		assert(message.clientId !== null, "Map received signal without clientId");
		if (!isPresenceMessage(message)) {
			return;
		}
		if (local) {
			const deliveryDelta = received - message.content.sendTimestamp;
			// Limit returnedMessages count to 256 such that newest message
			// always contributes at least 1/256th to the average. Older
			// messages have more weight, but that diminishes as new messages
			// contribute.
			this.returnedMessages = Math.min(this.returnedMessages + 1, 256);
			this.averageLatency =
				(this.averageLatency * (this.returnedMessages - 1) + deliveryDelta) /
				this.returnedMessages;
			return;
		}

		const timeModifier =
			received -
			(this.averageLatency + message.content.avgLatency + message.content.sendTimestamp);

		if (message.type === joinMessageType) {
			const updateProviders = message.content.updateProviders;
			this.refreshBroadcastRequested = true;
			// We must be connected to receive this message, so clientId should be defined.
			// If it isn't then, not really a problem; just won't be in provider or quorum list.
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			const clientId = this.runtime.clientId!;
			if (updateProviders.includes(clientId)) {
				// Send all current state to the new client
				this.broadcastAllKnownState();
			} else {
				// Schedule a broadcast to the new client after a delay only to send if
				// another broadcast hasn't been seen in the meantime. The delay is based
				// on the position in the quorum list. It doesn't have to be a stable
				// list across all clients. We need something to provide suggested order
				// to prevent a flood of broadcasts.
				const quorumMembers = this.runtime.getQuorum().getMembers();
				const indexOfSelf =
					quorumMembers.get(clientId)?.sequenceNumber ??
					// Index past quorum members + arbitrary additional offset up to 10
					quorumMembers.size + Math.random() * 10;
				// These numbers have been chosen arbitrarily to start with.
				// 20 is minimum wait time, 20 is the additional wait time per provider
				// given an chance before us with named providers given more time.
				const waitTime = 20 + 20 * (3 * updateProviders.length + indexOfSelf);
				setTimeout(() => {
					if (this.refreshBroadcastRequested) {
						// TODO: Add telemetry for this attempt to satisfy join
						this.broadcastAllKnownState();
					}
				}, waitTime);
			}
		} else {
			assert(message.type === datastoreUpdateMessageType, "Unexpected message type");
			if (message.content.isComplete) {
				this.refreshBroadcastRequested = false;
			}
		}

		for (const [workspaceAddress, remoteDatastore] of Object.entries(message.content.data)) {
			// Direct to the appropriate Presence Workspace, if present.
			const workspace = this.workspaces.get(workspaceAddress);
			if (workspace) {
				workspace.internal.processUpdate(received, timeModifier, remoteDatastore);
			} else {
				// All broadcast state is kept even if not currently registered, unless a value
				// notes itself to be ignored.
				let workspaceDatastore = this.datastore[workspaceAddress];
				if (workspaceDatastore === undefined) {
					workspaceDatastore = this.datastore[workspaceAddress] = {};
					if (!workspaceAddress.startsWith("system:")) {
						// TODO: Emit workspaceActivated event for PresenceEvents
					}
				}
				for (const [key, remoteAllKnownState] of Object.entries(remoteDatastore)) {
					mergeUntrackedDatastore(key, remoteAllKnownState, workspaceDatastore, timeModifier);
				}
			}
		}
	}
}
