/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IContainerRuntime } from "@fluidframework/container-runtime-definitions/internal";
import { assert } from "@fluidframework/core-utils/internal";
import type { IFluidDataStoreRuntime } from "@fluidframework/datastore-definitions/internal";
import type { IInboundSignalMessage } from "@fluidframework/runtime-definitions/internal";

import type { ConnectedClientId } from "./baseTypes.js";
import type { InternalTypes } from "./exposedInternalTypes.js";
import type { IPresence } from "./presence.js";
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
		priorClientIds: {
			[ClientId: ConnectedClientId]: InternalTypes.ValueRequiredState<ConnectedClientId[]>;
		};
	};
}

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
type PresenceDatastore = {
	[WorkspaceAddress: string]: ValueElementMap<PresenceStatesSchema>;
} & SystemDatastore;

interface GeneralDatastoreMessageContent {
	[WorkspaceAddress: string]: {
		[StateValueManagerKey: string]: {
			[ClientId: ConnectedClientId]: ClientUpdateEntry;
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
		updateProviders: ConnectedClientId[];
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
	"clientId" | "getAudience" | "off" | "on" | "submitSignal"
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
		"system:presence": { priorClientIds: {} },
	};
	private averageLatency = 0;
	private returnedMessages = 0;
	private refreshBroadcastRequested = false;

	private readonly workspaces = new Map<string, PresenceStatesEntry<PresenceStatesSchema>>();

	public constructor(
		private readonly runtime: IEphemeralRuntime,
		private readonly presence: IPresence,
	) {
		runtime.on("disconnected", () => {
			const { clientId } = this.runtime;
			assert(clientId !== undefined, "Disconnected without local clientId");
			for (const [_address, allKnownWorkspaceState] of Object.entries(this.datastore)) {
				for (const [_key, allKnownState] of Object.entries(allKnownWorkspaceState)) {
					// eslint-disable-next-line @typescript-eslint/no-dynamic-delete
					delete allKnownState[clientId];
				}
			}
			// TODO: Consider caching prior (current) clientId to broadcast when reconnecting so others may remap state.
		});
		runtime.on("connected", () => {
			const { clientId } = this.runtime;
			assert(clientId !== undefined, "Connected without local clientId");
			for (const [address, _allKnownWorkspaceState] of Object.entries(this.datastore)) {
				const workspace = this.workspaces.get(address);
				if (workspace) {
					workspace.internal.onConnect(clientId);
				} else {
					// A client may not send state without creating a workspace.
					// Once a workspace is created, it is never removed. So there
					// should never be an unmanaged workspace with this client's
					// clientId in it.
					// TODO: Consider asserting there is no representation of this
					// client in held state -- search for past client ids.
				}
			}

			// Broadcast join message to all clients
			const updateProviders = [...this.runtime.getAudience().getMembers().keys()].filter(
				(audienceClientId) => audienceClientId !== clientId,
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
		});
		runtime.on("signal", this.processSignal.bind(this));
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
			stateKey: string,
			value: ClientUpdateEntry,
			forceBroadcast: boolean,
		): void => {
			const clientId = this.runtime.clientId;
			if (clientId === undefined) {
				return;
			}

			this.localUpdate(
				{
					[internalWorkspaceAddress]: {
						[stateKey]: { [clientId]: value },
					},
				},
				forceBroadcast,
			);
		};

		const entry = createPresenceStates(
			{
				clientId: () => this.runtime.clientId,
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
			// If it isn't then, not really a problem; just won't be in provider list.
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			if (updateProviders.includes(this.runtime.clientId!)) {
				// Send all current state to the new client
				this.broadcastAllKnownState();
			} else {
				// Schedule a broadcast to the new client after a delay only to send if
				// another broadcast hasn't been seen in the meantime. The delay is based
				// on the position in the audience list. It doesn't have to be a stable
				// list across all clients. We need something to provide suggested order
				// to prevent a flood of broadcasts.
				let indexOfSelf = 0;
				for (const clientId of this.runtime.getAudience().getMembers().keys()) {
					if (clientId === this.runtime.clientId) {
						break;
					}
					indexOfSelf += 1;
				}
				const waitTime = indexOfSelf * 20 + 200;
				setTimeout(() => {
					if (this.refreshBroadcastRequested) {
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
					// TODO: Emit workspaceActivated event for PresenceEvents
				}
				for (const [key, remoteAllKnownState] of Object.entries(remoteDatastore)) {
					mergeUntrackedDatastore(key, remoteAllKnownState, workspaceDatastore, timeModifier);
				}
			}
		}
	}
}
