/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import type { IInboundSignalMessage } from "@fluidframework/runtime-definitions/internal";
import type { ITelemetryLoggerExt } from "@fluidframework/telemetry-utils/internal";

import type { ClientConnectionId } from "./baseTypes.js";
import type { IEphemeralRuntime } from "./internalTypes.js";
import type { ClientSessionId, ISessionClient } from "./presence.js";
import type {
	ClientUpdateEntry,
	PresenceStatesInternal,
	ValueElementMap,
} from "./presenceStates.js";
import { createPresenceStates, mergeUntrackedDatastore } from "./presenceStates.js";
import type { SystemWorkspaceDatastore } from "./systemWorkspace.js";
import type {
	PresenceStates,
	PresenceStatesSchema,
	PresenceWorkspaceAddress,
} from "./types.js";

import type { IExtensionMessage } from "@fluid-experimental/presence/internal/container-definitions/internal";

interface PresenceStatesEntry<TSchema extends PresenceStatesSchema> {
	public: PresenceStates<TSchema>;
	internal: PresenceStatesInternal;
}

interface SystemDatastore {
	"system:presence": SystemWorkspaceDatastore;
}

type InternalWorkspaceAddress = `${"s" | "n"}:${PresenceWorkspaceAddress}`;

type PresenceDatastore = SystemDatastore & {
	[WorkspaceAddress: string]: ValueElementMap<PresenceStatesSchema>;
};

interface GeneralDatastoreMessageContent {
	[WorkspaceAddress: string]: {
		[StateValueManagerKey: string]: {
			[ClientSessionId: ClientSessionId]: ClientUpdateEntry;
		};
	};
}

type DatastoreMessageContent = SystemDatastore & GeneralDatastoreMessageContent;

const datastoreUpdateMessageType = "Pres:DatastoreUpdate";
interface DatastoreUpdateMessage extends IInboundSignalMessage {
	type: typeof datastoreUpdateMessageType;
	content: {
		sendTimestamp: number;
		avgLatency: number;
		isComplete?: true;
		data: DatastoreMessageContent;
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
 * @internal
 */
export interface PresenceDatastoreManager {
	joinSession(clientId: ClientConnectionId): void;
	getWorkspace<TSchema extends PresenceStatesSchema>(
		internalWorkspaceAddress: InternalWorkspaceAddress,
		requestedContent: TSchema,
	): PresenceStates<TSchema>;
	processSignal(message: IExtensionMessage, local: boolean): void;
}

/**
 * Manages singleton datastore for all Presence.
 */
export class PresenceDatastoreManagerImpl implements PresenceDatastoreManager {
	private readonly datastore: PresenceDatastore;
	private averageLatency = 0;
	private returnedMessages = 0;
	private refreshBroadcastRequested = false;

	private readonly workspaces = new Map<string, PresenceStatesEntry<PresenceStatesSchema>>();

	public constructor(
		private readonly clientSessionId: ClientSessionId,
		private readonly runtime: IEphemeralRuntime,
		private readonly lookupClient: (clientId: ClientSessionId) => ISessionClient,
		private readonly logger: ITelemetryLoggerExt | undefined,
		systemWorkspaceDatastore: SystemWorkspaceDatastore,
		systemWorkspace: PresenceStatesEntry<PresenceStatesSchema>,
	) {
		// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
		this.datastore = { "system:presence": systemWorkspaceDatastore } as PresenceDatastore;
		this.workspaces.set("system:presence", systemWorkspace);
	}

	public joinSession(clientId: ClientConnectionId): void {
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
		internalWorkspaceAddress: InternalWorkspaceAddress,
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
			if (!this.runtime.connected) {
				return;
			}

			const clientConnectionId = this.runtime.clientId;
			assert(clientConnectionId !== undefined, "Client connected without clientId");
			const currentClientToSessionValueState =
				this.datastore["system:presence"].clientToSessionId[clientConnectionId];

			const updates: GeneralDatastoreMessageContent[InternalWorkspaceAddress] = {};
			for (const [key, value] of Object.entries(states)) {
				updates[key] = { [this.clientSessionId]: value };
			}
			this.localUpdate(
				{
					// Always send current connection mapping for some resiliency against
					// lost signals. This ensures that client session id found in `updates`
					// (which is this client's client session id) is always represented in
					// system workspace of recipient clients.
					"system:presence": {
						clientToSessionId: {
							[clientConnectionId]: { ...currentClientToSessionValueState },
						},
					},
					[internalWorkspaceAddress]: updates,
				},
				forceBroadcast,
			);
		};

		const entry = createPresenceStates(
			{
				clientSessionId: this.clientSessionId,
				lookupClient: this.lookupClient,
				localUpdate,
			},
			workspaceDatastore,
			requestedContent,
		);

		this.workspaces.set(internalWorkspaceAddress, entry);
		return entry.public;
	}

	private localUpdate(data: DatastoreMessageContent, _forceBroadcast: boolean): void {
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
		// Note: IInboundSignalMessage is used here in place of IExtensionMessage
		// as IExtensionMessage's strictly JSON `content` creates type compatibility
		// issues with `ClientSessionId` keys and really unknown value content.
		// IExtensionMessage is a subset of IInboundSignalMessage so this is safe.
		// Change types of DatastoreUpdateMessage | ClientJoinMessage to
		// IExtensionMessage<> derivatives to see the issues.
		message: IInboundSignalMessage | DatastoreUpdateMessage | ClientJoinMessage,
		local: boolean,
	): void {
		const received = Date.now();
		assert(message.clientId !== null, 0xa3a /* Map received signal without clientId */);
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
			assert(this.runtime.connected, "Received presence join signal while not connected");
			this.prepareJoinResponse(message.content.updateProviders, message.clientId);
		} else {
			assert(message.type === datastoreUpdateMessageType, 0xa3b /* Unexpected message type */);
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

	/**
	 * Handles responding to another client joining the session.
	 *
	 * @param updateProviders - list of client connection id's that requestor selected
	 * to provide response
	 * @param requestor - `requestor` is only used in telemetry. While it is the requestor's
	 * client connection id, that is not most important. It is important that this is a
	 * unique shared id across all clients that might respond as we want to monitor the
	 * response patterns. The convenience of being client connection id will allow
	 * correlation with other telemetry where it is often called just `clientId`.
	 */
	private prepareJoinResponse(
		updateProviders: ClientConnectionId[],
		requestor: ClientConnectionId,
	): void {
		this.refreshBroadcastRequested = true;
		// We must be connected to receive this message, so clientId should be defined.
		// If it isn't then, not really a problem; just won't be in provider or quorum list.
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		const clientId = this.runtime.clientId!;
		// const requestor = message.clientId;
		if (updateProviders.includes(clientId)) {
			// Send all current state to the new client
			this.broadcastAllKnownState();
			this.logger?.sendTelemetryEvent({
				eventName: "JoinResponse",
				details: {
					type: "broadcastAll",
					requestor,
					role: "primary",
				},
			});
		} else {
			// Schedule a broadcast to the new client after a delay only to send if
			// another broadcast hasn't been seen in the meantime. The delay is based
			// on the position in the quorum list. It doesn't have to be a stable
			// list across all clients. We need something to provide suggested order
			// to prevent a flood of broadcasts.
			let relativeResponseOrder;
			const quorumMembers = this.runtime.getQuorum().getMembers();
			const self = quorumMembers.get(clientId);
			if (self) {
				// Compute order quorum join order (indicated by sequenceNumber)
				relativeResponseOrder = 0;
				for (const { sequenceNumber } of quorumMembers.values()) {
					if (sequenceNumber < self.sequenceNumber) {
						relativeResponseOrder++;
					}
				}
			} else {
				// Order past quorum members + arbitrary additional offset up to 10
				relativeResponseOrder = quorumMembers.size + Math.random() * 10;
			}
			// These numbers have been chosen arbitrarily to start with.
			// 20 is minimum wait time, 20 is the additional wait time per provider
			// given an chance before us with named providers given more time.
			const waitTime = 20 + 20 * (3 * updateProviders.length + relativeResponseOrder);
			setTimeout(() => {
				// Make sure a broadcast is still needed and we are currently connected.
				// If not connected, nothing we can do.
				if (this.refreshBroadcastRequested && this.runtime.connected) {
					this.broadcastAllKnownState();
					this.logger?.sendTelemetryEvent({
						eventName: "JoinResponse",
						details: {
							type: "broadcastAll",
							requestor,
							role: "secondary",
							order: relativeResponseOrder,
						},
					});
				}
			}, waitTime);
		}
	}
}
