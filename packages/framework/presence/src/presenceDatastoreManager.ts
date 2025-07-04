/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { InboundExtensionMessage } from "@fluidframework/container-runtime-definitions/internal";
import type { IEmitter } from "@fluidframework/core-interfaces/internal";
import { assert } from "@fluidframework/core-utils/internal";
import type { ITelemetryLoggerExt } from "@fluidframework/telemetry-utils/internal";

import type { ClientConnectionId } from "./baseTypes.js";
import type { BroadcastControlSettings } from "./broadcastControls.js";
import type { InternalTypes } from "./exposedInternalTypes.js";
import type {
	IEphemeralRuntime,
	PostUpdateAction,
	ValidatableOptionalState,
	ValidatableValueDirectory,
	ValidatableValueStructure,
} from "./internalTypes.js";
import { objectEntries } from "./internalUtils.js";
import type {
	AttendeeId,
	PresenceWithNotifications as Presence,
	PresenceEvents,
} from "./presence.js";
import type {
	ClientUpdateEntry,
	RuntimeLocalUpdateOptions,
	PresenceStatesInternal,
	ValueElementMap,
} from "./presenceStates.js";
import {
	createPresenceStates,
	mergeUntrackedDatastore,
	mergeValueDirectory,
} from "./presenceStates.js";
import type {
	DatastoreMessageContent,
	GeneralDatastoreMessageContent,
	InboundClientJoinMessage,
	InboundDatastoreUpdateMessage,
	InternalWorkspaceAddress,
	OutboundDatastoreUpdateMessage,
	SignalMessages,
	SystemDatastore,
} from "./protocol.js";
import {
	acknowledgementMessageType,
	datastoreUpdateMessageType,
	joinMessageType,
} from "./protocol.js";
import type { SystemWorkspaceDatastore } from "./systemWorkspace.js";
import { TimerManager } from "./timerManager.js";
import type {
	AnyWorkspace,
	NotificationsWorkspace,
	NotificationsWorkspaceSchema,
	StatesWorkspace,
	StatesWorkspaceSchema,
	WorkspaceAddress,
} from "./types.js";

interface AnyWorkspaceEntry<TSchema extends StatesWorkspaceSchema> {
	public: AnyWorkspace<TSchema>;
	internal: PresenceStatesInternal;
}

/**
 * Datastore structure used for broadcasting to other clients.
 * Validation metadata is stripped before transmission.
 */
type PresenceDatastore = SystemDatastore & {
	[WorkspaceAddress: InternalWorkspaceAddress]: ValueElementMap<StatesWorkspaceSchema>;
};

const internalWorkspaceTypes: Readonly<Record<string, "States" | "Notifications">> = {
	s: "States",
	n: "Notifications",
} as const;

const knownMessageTypes = new Set([
	joinMessageType,
	datastoreUpdateMessageType,
	acknowledgementMessageType,
]);
function isPresenceMessage(
	message: InboundExtensionMessage<SignalMessages>,
): message is InboundDatastoreUpdateMessage | InboundClientJoinMessage {
	return knownMessageTypes.has(message.type);
}

/**
 * Type guard to check if a value hierarchy object is a directory (has "items"
 * property).
 *
 * @param obj - The object to check
 * @returns True if the object is a {@link ValidatableValueDirectory}
 */
export function isValueDirectory<T>(
	obj: ValidatableValueDirectory<T> | ValidatableOptionalState<T>,
): obj is ValidatableValueDirectory<T> {
	return "items" in obj;
}

/**
 * High-level contract for manager of singleton Presence datastore
 */
export interface PresenceDatastoreManager {
	joinSession(clientId: ClientConnectionId): void;
	getWorkspace<TSchema extends StatesWorkspaceSchema>(
		internalWorkspaceAddress: `s:${WorkspaceAddress}`,
		requestedContent: TSchema,
		controls?: BroadcastControlSettings,
	): StatesWorkspace<TSchema>;
	getWorkspace<TSchema extends NotificationsWorkspaceSchema>(
		internalWorkspaceAddress: `n:${WorkspaceAddress}`,
		requestedContent: TSchema,
	): NotificationsWorkspace<TSchema>;
	processSignal(
		message: InboundExtensionMessage<SignalMessages>,
		local: boolean,
		optional: boolean,
	): void;
}

function mergeGeneralDatastoreMessageContent(
	base: GeneralDatastoreMessageContent | undefined,
	newData: GeneralDatastoreMessageContent,
): GeneralDatastoreMessageContent {
	// This function-local "datastore" will hold the merged message data.
	const queueDatastore = base ?? {};

	// Merge the current data with the existing data, if any exists.
	// Iterate over the current message data; individual items are workspaces.
	for (const [workspaceName, workspaceData] of objectEntries(newData)) {
		// Initialize the merged data as the queued datastore entry for the workspace.
		// Since the key might not exist, create an empty object in that case. It will
		// be set explicitly after the loop.
		const mergedData = queueDatastore[workspaceName] ?? {};

		// Iterate over each value manager and its data, merging it as needed.
		for (const [valueManagerKey, valueManagerValue] of objectEntries(workspaceData)) {
			for (const [attendeeId, value] of objectEntries(valueManagerValue)) {
				const mergeObject = (mergedData[valueManagerKey] ??= {});
				const oldData = mergeObject[attendeeId];
				mergeObject[attendeeId] = mergeValueDirectory(
					oldData,
					value,
					0, // local values do not need a time shift
				);
			}
		}

		// Store the merged data in the function-local queue workspace. The whole contents of this
		// datastore will be sent as the message data.
		queueDatastore[workspaceName] = mergedData;
	}
	return queueDatastore;
}

/**
 * Manages singleton datastore for all Presence.
 */
export class PresenceDatastoreManagerImpl implements PresenceDatastoreManager {
	private readonly datastore: PresenceDatastore;
	private averageLatency = 0;
	private returnedMessages = 0;
	private refreshBroadcastRequested = false;
	private readonly timer = new TimerManager();
	private readonly workspaces = new Map<string, AnyWorkspaceEntry<StatesWorkspaceSchema>>();
	private readonly targetedSignalSupport: boolean;

	public constructor(
		private readonly attendeeId: AttendeeId,
		private readonly runtime: IEphemeralRuntime,
		private readonly logger: ITelemetryLoggerExt | undefined,
		private readonly events: IEmitter<PresenceEvents>,
		private readonly presence: Presence,
		systemWorkspaceDatastore: SystemWorkspaceDatastore,
		systemWorkspace: AnyWorkspaceEntry<StatesWorkspaceSchema>,
	) {
		// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
		this.datastore = { "system:presence": systemWorkspaceDatastore } as PresenceDatastore;
		this.workspaces.set("system:presence", systemWorkspace);
		this.targetedSignalSupport = this.runtime.supportedFeatures.has("submit_signals_v2");
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
		this.runtime.submitSignal({
			type: joinMessageType,
			content: {
				sendTimestamp: Date.now(),
				avgLatency: this.averageLatency,
				data: this.stripValidationMetadata(this.datastore),
				updateProviders,
			},
		});
	}

	public getWorkspace<TSchema extends StatesWorkspaceSchema>(
		internalWorkspaceAddress: InternalWorkspaceAddress,
		requestedContent: TSchema,
		controls?: BroadcastControlSettings,
	): AnyWorkspace<TSchema> {
		const existing = this.workspaces.get(internalWorkspaceAddress);
		if (existing) {
			return existing.internal.ensureContent(requestedContent, controls);
		}

		let workspaceDatastore: ValueElementMap<StatesWorkspaceSchema> | undefined =
			this.datastore[internalWorkspaceAddress];
		if (workspaceDatastore === undefined) {
			workspaceDatastore = this.datastore[internalWorkspaceAddress] = {};
		}

		const localUpdate = (
			states: { [key: string]: ClientUpdateEntry },
			options: RuntimeLocalUpdateOptions,
		): void => {
			// Check for connectivity before sending updates.
			if (!this.runtime.isConnected()) {
				return;
			}

			const updates: GeneralDatastoreMessageContent[InternalWorkspaceAddress] = {};
			for (const [key, value] of Object.entries(states)) {
				updates[key] = { [this.attendeeId]: value };
			}

			this.enqueueMessage(
				{
					[internalWorkspaceAddress]: updates,
				},
				options,
			);
		};

		const entry = createPresenceStates(
			{
				presence: this.presence,
				attendeeId: this.attendeeId,
				localUpdate,
			},
			workspaceDatastore,
			requestedContent,
			controls,
		);

		this.workspaces.set(internalWorkspaceAddress, entry);
		return entry.public;
	}

	/**
	 * The combined contents of all queued updates. Will be undefined when no messages are queued.
	 */
	private queuedData: GeneralDatastoreMessageContent | undefined;

	/**
	 * Enqueues a new message to be sent. The message may be queued or may be sent immediately depending on the state of
	 * the send timer, other messages in the queue, the configured allowed latency, etc.
	 */
	private enqueueMessage(
		data: GeneralDatastoreMessageContent,
		options: RuntimeLocalUpdateOptions,
	): void {
		// Merging the message with any queued messages effectively queues the message.
		// It is OK to queue all incoming messages as long as when we send, we send the queued data.
		this.queuedData = mergeGeneralDatastoreMessageContent(this.queuedData, data);

		const { allowableUpdateLatencyMs } = options;
		const now = Date.now();
		const thisMessageDeadline = now + allowableUpdateLatencyMs;

		if (
			// If the timer has not expired, we can short-circuit because the timer will fire
			// and cover this update. In other words, queuing this will be fast enough to
			// meet its deadline, because a timer is already scheduled to fire before its deadline.
			!this.timer.hasExpired() &&
			// If the deadline for this message is later than the overall send deadline, then
			// we can exit early since a timer will take care of sending it.
			thisMessageDeadline >= this.timer.expireTime
		) {
			return;
		}

		// Either we need to send this message immediately, or we need to schedule a timer
		// to fire at the send deadline that will take care of it.

		// Note that timeoutInMs === allowableUpdateLatency, but the calculation is done this way for clarity.
		const timeoutInMs = thisMessageDeadline - now;
		const scheduleForLater = timeoutInMs > 0;

		if (scheduleForLater) {
			// Schedule the queued messages to be sent at the updateDeadline
			this.timer.setTimeout(this.sendQueuedMessage.bind(this), timeoutInMs);
		} else {
			this.sendQueuedMessage();
		}
	}

	/**
	 * Send any queued signal immediately. Does nothing if no message is queued.
	 */
	private sendQueuedMessage(): void {
		this.timer.clearTimeout();

		if (this.queuedData === undefined) {
			return;
		}

		// Check for connectivity before sending updates.
		if (!this.runtime.isConnected()) {
			// Clear the queued data since we're disconnected. We don't want messages
			// to queue infinitely while disconnected.
			this.queuedData = undefined;
			return;
		}

		const clientConnectionId = this.runtime.getClientId();
		assert(clientConnectionId !== undefined, 0xa59 /* Client connected without clientId */);
		const currentClientToSessionValueState =
			// When connected, `clientToSessionId` must always have current connection entry.
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			this.datastore["system:presence"].clientToSessionId[clientConnectionId]!;

		const newMessage = {
			sendTimestamp: Date.now(),
			avgLatency: this.averageLatency,
			// isComplete: false,
			data: {
				// Always send current connection mapping for some resiliency against
				// lost signals. This ensures that client session id found in `updates`
				// (which is this client's client session id) is always represented in
				// system workspace of recipient clients.
				"system:presence": {
					clientToSessionId: {
						[clientConnectionId]: { ...currentClientToSessionValueState },
					},
				},
				...this.queuedData,
			},
		} satisfies OutboundDatastoreUpdateMessage["content"];
		this.queuedData = undefined;
		this.runtime.submitSignal({ type: datastoreUpdateMessageType, content: newMessage });
	}

	/**
	 * Recursively strips validation metadata (validatedValue) from datastore before broadcasting.
	 * This ensures that validation metadata doesn't leak into signals sent to other clients.
	 */
	private stripValidationMetadata(datastore: PresenceDatastore): DatastoreMessageContent {
		const messageContent: DatastoreMessageContent = {
			["system:presence"]: datastore["system:presence"],
		};

		for (const [workspaceAddress, workspace] of objectEntries(datastore)) {
			// System workspace has no validation metadata and is already
			// set in messageContent; so, it can be skipped.
			if (workspaceAddress === "system:presence") continue;

			const workspaceData: GeneralDatastoreMessageContent[typeof workspaceAddress] = {};

			for (const [stateName, clientRecord] of objectEntries(workspace)) {
				const cleanClientRecord: GeneralDatastoreMessageContent[typeof workspaceAddress][typeof stateName] =
					{};

				for (const [attendeeId, valueData] of objectEntries(clientRecord)) {
					cleanClientRecord[attendeeId] = this.stripValidationFromValueData(valueData);
				}

				workspaceData[stateName] = cleanClientRecord;
			}

			messageContent[workspaceAddress] = workspaceData;
		}

		return messageContent;
	}

	/**
	 * Strips validation metadata from individual value data entries.
	 */
	private stripValidationFromValueData<
		T extends
			| InternalTypes.ValueDirectory<unknown>
			| InternalTypes.ValueRequiredState<unknown>
			| InternalTypes.ValueOptionalState<unknown>,
	>(valueDataIn: ValidatableValueStructure<T>): T {
		// Clone the input object since we may mutate it
		const valueData = { ...valueDataIn };

		// Handle directory structures (with "items" property)
		if (isValueDirectory(valueData)) {
			for (const [key, item] of Object.entries(valueData.items)) {
				valueData.items[key] = this.stripValidationFromValueData(item);
			}

			// This `satisfies` test is rather weak while ValidatableValueDirectory
			// only has optional properties over InternalTypes.ValueDirectory and
			// thus readily does satisfy. If `validatedValue?: never` is uncommented
			// in Value*State then this will fail.
			valueData satisfies InternalTypes.ValueDirectory<unknown>;
			return valueData as T;
		}

		delete valueData.validatedValue;
		// This `satisfies` test is rather weak while Validatable*State
		// only has optional properties over InternalTypes.Value*State and
		// thus readily does satisfy. If `validatedValue?: never` is uncommented
		// in Value*State then this will fail.
		valueData satisfies
			| InternalTypes.ValueRequiredState<unknown>
			| InternalTypes.ValueOptionalState<unknown>;
		return valueData as T;
	}

	private broadcastAllKnownState(): void {
		this.runtime.submitSignal({
			type: datastoreUpdateMessageType,
			content: {
				sendTimestamp: Date.now(),
				avgLatency: this.averageLatency,
				isComplete: true,
				data: this.stripValidationMetadata(this.datastore),
			},
		});
		this.refreshBroadcastRequested = false;
	}

	public processSignal(
		message: InboundExtensionMessage<SignalMessages>,
		local: boolean,
		optional: boolean,
	): void {
		const received = Date.now();
		assert(message.clientId !== null, 0xa3a /* Map received signal without clientId */);
		if (!isPresenceMessage(message)) {
			assert(optional, "Unrecognized message type in critical message");
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
			// It is possible for some signals to come in while client is not connected due
			// to how work is scheduled. If we are not connected, we can't respond to the
			// join request. We will make our own Join request once we are connected.
			if (this.runtime.isConnected()) {
				this.prepareJoinResponse(message.content.updateProviders, message.clientId);
			}
			// It is okay to continue processing the contained updates even if we are not
			// connected.
		} else {
			if (message.content.isComplete) {
				this.refreshBroadcastRequested = false;
			}
			// If the message requests an acknowledgement, we will send a targeted acknowledgement message back to just the requestor.
			if (message.content.acknowledgementId !== undefined) {
				assert(
					this.targetedSignalSupport,
					"Acknowledgment message was requested while targeted signal capability is not supported",
				);
				this.runtime.submitSignal({
					type: acknowledgementMessageType,
					content: { id: message.content.acknowledgementId },
					targetClientId: message.clientId,
				});
			}
		}

		// Handle activation of unregistered workspaces before processing updates.
		for (const [workspaceAddress] of objectEntries(message.content.data)) {
			// The first part of OR condition checks if workspace is already registered.
			// The second part checks if the workspace has already been seen before.
			// In either case we can skip emitting 'workspaceActivated' event.
			if (this.workspaces.has(workspaceAddress) || this.datastore[workspaceAddress]) {
				continue;
			}

			// Separate internal type prefix from public workspace address
			const match = workspaceAddress.match(/^([^:]):([^:]+:.+)$/) as
				| null
				| [string, string, WorkspaceAddress];

			if (match === null) {
				continue;
			}

			const prefix = match[1];
			const publicWorkspaceAddress = match[2];

			const internalWorkspaceType = internalWorkspaceTypes[prefix] ?? "Unknown";

			this.events.emit("workspaceActivated", publicWorkspaceAddress, internalWorkspaceType);
		}

		const postUpdateActions: PostUpdateAction[] = [];
		// While the system workspace is processed here too, it is declared as
		// conforming to the general schema. So drop its override.
		const data = message.content.data as Omit<typeof message.content.data, "system:presence">;
		for (const [workspaceAddress, remoteDatastore] of objectEntries(data)) {
			// Direct to the appropriate Presence Workspace, if present.
			const workspace = this.workspaces.get(workspaceAddress);
			if (workspace) {
				postUpdateActions.push(
					...workspace.internal.processUpdate(
						received,
						timeModifier,
						remoteDatastore,
						message.clientId,
					),
				);
			} else {
				// All broadcast state is kept even if not currently registered, unless a value
				// notes itself to be ignored.

				// Ensure there is a datastore at this address and get it.
				const workspaceDatastore = (this.datastore[workspaceAddress] ??= {});
				for (const [key, remoteAllKnownState] of Object.entries(remoteDatastore)) {
					mergeUntrackedDatastore(key, remoteAllKnownState, workspaceDatastore, timeModifier);
				}
			}
		}

		for (const action of postUpdateActions) {
			action();
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
		const clientId = this.runtime.getClientId()!;
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
				if (this.refreshBroadcastRequested && this.runtime.isConnected()) {
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
