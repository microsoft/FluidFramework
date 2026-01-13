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
	joinSession(
		clientId: ClientConnectionId,
		alternateProvider: ClientConnectionId | undefined,
	): void;
	onDisconnected(): void;
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
		message: InboundExtensionMessage<SignalMessages> & { clientId: ClientConnectionId },
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
 * Delays used for broadcasting join responses to clients.
 *
 * @remarks
 * Exported for test coordination.
 * These could be made customizable in the future to accommodate different
 * session configurations.
 */
export const broadcastJoinResponseDelaysMs = {
	/**
	 * The delay in milliseconds before a join response is sent to any client.
	 * This is used to accumulate other join response requests and reduce
	 * network traffic.
	 */
	namedResponder: 200,
	/**
	 * The additional delay in milliseconds a backup responder waits before sending
	 * a join response to allow others to respond first.
	 */
	backupResponderIncrement: 40,
} as const;

/**
 * Manages singleton datastore for all Presence.
 */
export class PresenceDatastoreManagerImpl implements PresenceDatastoreManager {
	private readonly datastore: PresenceDatastore;
	private averageLatency = 0;
	private returnedMessages = 0;
	private readonly sendMessageTimer = new TimerManager();
	private readonly workspaces = new Map<string, AnyWorkspaceEntry<StatesWorkspaceSchema>>();
	private readonly targetedSignalSupport: boolean;

	/**
	 * Tracks whether this client has complete snapshot level knowledge and
	 * how that determination was reached.
	 * - "alone": no other audience members detected at join
	 * - "join response": another client has responded to our join request
	 * - "full requests": all others have requested response from us
	 *
	 * @remarks
	 * Only applies when not using targeted join responses.
	 *
	 * Without a complete snapshot, we cannot fully onboard any other clients.
	 * One exception to this is if this client is the only participant in the
	 * session. In such a case, there is no one to respond to the join request.
	 * Another exception is multiple clients attempting to join at the same
	 * time and thus expecting that someone has full knowledge, yet none have
	 * received a complete update to think they are qualified to respond.
	 * Generically if the number of outstanding requestors meets or exceeds the
	 * count of other audience members, then we can consider the snapshot
	 * complete (as all will have provided their own complete information in
	 * their join responses).
	 */
	private reasonForCompleteSnapshot?: "alone" | "join response" | "full requests";

	/**
	 * Map of outstanding broadcast (join response) requests.
	 */
	private readonly broadcastRequests = new Map<
		ClientConnectionId,
		{ deadlineTime: number; responseOrder?: number | undefined }
	>();
	/**
	 * Timer for managing broadcast (join response) request timing.
	 */
	private readonly broadcastRequestsTimer = new TimerManager();

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
		// If audience member is removed, they won't need a broadcast response.
		this.runtime.getAudience().on("removeMember", (clientId) => {
			this.broadcastRequests.delete(clientId);
		});
	}

	private getAudienceInformation(selfClientId: ClientConnectionId): {
		selfPresent: boolean;
		interactiveMembersExcludingSelf: {
			all: Set<ClientConnectionId>;
			writers: Set<ClientConnectionId>;
		};
	} {
		const audience = this.runtime.getAudience();
		const members = audience.getMembers();
		const all = new Set<ClientConnectionId>();
		const writers = new Set<ClientConnectionId>();
		const selfPresent = members.has(selfClientId);
		if (selfPresent) {
			// Remove self
			members.delete(selfClientId);
		}
		// Gather interactive client IDs
		for (const [id, client] of members) {
			if (client.details.capabilities.interactive) {
				all.add(id);
				if (client.mode === "write") {
					writers.add(id);
				}
			}
		}
		return {
			selfPresent,
			interactiveMembersExcludingSelf: {
				all,
				writers,
			},
		};
	}

	public joinSession(
		selfClientId: ClientConnectionId,
		alternateProvider: ClientConnectionId | undefined = undefined,
	): void {
		// Before broadcasting the join message, check that there is at least
		// one audience member present (self or another). This is useful to
		// optimize join messages while not using targeted join responses.
		// (We need at least one other to be able to elect them as update
		// provider.)
		// Lack of anyone likely means that this client is very freshly joined
		// and has not received any Join Signals (type="join") from the service
		// yet.
		const { selfPresent, interactiveMembersExcludingSelf } =
			this.getAudienceInformation(selfClientId);

		if (selfPresent) {
			if (interactiveMembersExcludingSelf.all.size === 0) {
				// If there aren't any members connected except self, then this client
				// must have complete information.
				this.reasonForCompleteSnapshot = "alone";
				// It would be possible to return at this time and skip ClientJoin
				// signal. Instead continue in case audience information is
				// inaccurate. This client might temporarily erroneously believe it
				// has complete information, but the other(s) should respond to
				// ClientJoin soon rectifying that and covering for bad incomplete
				// responses this client sent in the meantime.
			}
		} else {
			// When self is not represented, audience is an unreliable state,
			// especially during a reconnect. An alternateProvider is expected
			// to have been provided for this call to be useful (efficient).
			assert(
				alternateProvider !== undefined,
				0xcba /* Self is not in audience and no alternateProvider given */,
			);
		}

		// Broadcast join message to all clients
		// Select primary update providers
		// Use write members if any, then fallback to read-only members.
		const updateProviders = [
			...(interactiveMembersExcludingSelf.writers.size > 0
				? interactiveMembersExcludingSelf.writers
				: interactiveMembersExcludingSelf.all),
		];
		// Limit to three providers to prevent flooding the network.
		// If none respond, others present will (should) after a delay.
		if (updateProviders.length > 3) {
			updateProviders.length = 3;
		} else if (updateProviders.length === 0 && alternateProvider !== undefined) {
			updateProviders.push(alternateProvider);
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
		this.logger?.sendTelemetryEvent({
			eventName: "JoinRequested",
			details: {
				attendeeId: this.attendeeId,
				connectionId: selfClientId,
				// Empty updateProviders is indicative of join when alone.
				updateProviders: JSON.stringify(updateProviders),
				// If false and providers is single entry, then join was probably forced.
				selfPresent,
			},
		});
	}

	public onDisconnected(): void {
		delete this.reasonForCompleteSnapshot;
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
		// eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- using ??= could change behavior if value is falsy
		if (workspaceDatastore === undefined) {
			workspaceDatastore = this.datastore[internalWorkspaceAddress] = {};
		}

		const localUpdate = (
			states: { [key: string]: ClientUpdateEntry },
			options: RuntimeLocalUpdateOptions,
		): void => {
			// Check for connectivity before sending updates.
			if (this.runtime.getJoinedStatus() === "disconnected") {
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
	 * The combined contents of all queued updates. Will be `"sendAll"` when a
	 * full broadcast is pending or `undefined` when no messages are queued.
	 */
	private queuedData: GeneralDatastoreMessageContent | "sendAll" | undefined;

	/**
	 * Enqueues a new message to be sent. The message may be queued or may be sent immediately depending on the state of
	 * the send timer, other messages in the queue, the configured allowed latency, etc.
	 */
	private enqueueMessage(
		data: GeneralDatastoreMessageContent | "sendAll",
		options: RuntimeLocalUpdateOptions,
	): void {
		if (this.queuedData !== "sendAll") {
			this.queuedData =
				data === "sendAll"
					? "sendAll"
					: // Merging the message with any queued messages effectively queues the message.
						// It is OK to queue all incoming messages as long as when we send, we send the queued data.
						mergeGeneralDatastoreMessageContent(this.queuedData, data);
		}

		const { allowableUpdateLatencyMs } = options;
		const now = Date.now();
		const thisMessageDeadline = now + allowableUpdateLatencyMs;

		if (
			// If the timer has not expired, we can short-circuit because the timer will fire
			// and cover this update. In other words, queuing this will be fast enough to
			// meet its deadline, because a timer is already scheduled to fire before its deadline.
			!this.sendMessageTimer.hasExpired() &&
			// If the deadline for this message is later than the overall send deadline, then
			// we can exit early since a timer will take care of sending it.
			thisMessageDeadline >= this.sendMessageTimer.expireTime
		) {
			return;
		}

		// Either we need to send this message immediately, or we need to schedule a timer
		// to fire at the send deadline that will take care of it.

		// Note that timeoutInMs === allowableUpdateLatencyMs, but the calculation is done this way for clarity.
		const timeoutInMs = thisMessageDeadline - now;
		const scheduleForLater = timeoutInMs > 0;

		if (scheduleForLater) {
			// Schedule the queued messages to be sent at the updateDeadline
			this.sendMessageTimer.setTimeout(this.sendQueuedMessage.bind(this), timeoutInMs);
		} else {
			this.sendQueuedMessage();
		}
	}

	/**
	 * Send any queued signal immediately. Does nothing if no message is queued.
	 */
	private sendQueuedMessage(): void {
		this.sendMessageTimer.clearTimeout();

		if (this.queuedData === undefined) {
			return;
		}

		// Check for connectivity before sending updates.
		if (this.runtime.getJoinedStatus() === "disconnected") {
			// Clear the queued data since we're disconnected. We don't want messages
			// to queue infinitely while disconnected.
			this.queuedData = undefined;
			return;
		}

		if (this.queuedData === "sendAll") {
			this.broadcastAllKnownState();
			return;
		}

		const clientConnectionId = this.runtime.getClientId();
		assert(clientConnectionId !== undefined, 0xa59 /* Client connected without clientId */);
		const currentClientToSessionValueState =
			// When connected, `clientToSessionId` must always have current connection entry.
			this.datastore["system:presence"].clientToSessionId[clientConnectionId];
		assert(
			currentClientToSessionValueState !== undefined,
			0xcbb /* Client connection update missing */,
		);

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
		const content: OutboundDatastoreUpdateMessage["content"] = {
			sendTimestamp: Date.now(),
			avgLatency: this.averageLatency,
			isComplete: true,
			data: this.stripValidationMetadata(this.datastore),
		};

		const primaryRequestors: ClientConnectionId[] = [];
		const secondaryRequestors: [ClientConnectionId, number][] = [];
		if (this.broadcastRequests.size > 0) {
			content.joinResponseFor = [...this.broadcastRequests.keys()];
			if (this.logger) {
				// Build telemetry data
				for (const [requestor, { responseOrder }] of this.broadcastRequests.entries()) {
					if (responseOrder === undefined) {
						primaryRequestors.push(requestor);
					} else {
						secondaryRequestors.push([requestor, responseOrder]);
					}
				}
			}
			this.broadcastRequests.clear();
		}

		// This broadcast will satisfy all requests; clear any remaining timer.
		this.broadcastRequestsTimer.clearTimeout();
		this.sendMessageTimer.clearTimeout();

		this.runtime.submitSignal({
			type: datastoreUpdateMessageType,
			content,
		});
		if (content.joinResponseFor) {
			this.logger?.sendTelemetryEvent({
				eventName: "JoinResponse",
				details: {
					type: "broadcastAll",
					attendeeId: this.attendeeId,
					connectionId: this.runtime.getClientId(),
					primaryResponses: JSON.stringify(primaryRequestors),
					secondaryResponses: JSON.stringify(secondaryRequestors),
				},
			});
		}

		// Sending all must account for anything queued before.
		this.queuedData = undefined;
	}

	public processSignal(
		message: InboundExtensionMessage<SignalMessages> & { clientId: ClientConnectionId },
		local: boolean,
		optional: boolean,
	): void {
		const received = Date.now();
		if (!isPresenceMessage(message)) {
			assert(optional, 0xcbc /* Unrecognized message type in critical message */);
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

		const postUpdateActions: PostUpdateAction[] = [];

		if (message.type === joinMessageType) {
			// It is possible for some signals to come in while client is not connected due
			// to how work is scheduled. If we are not connected, we can't respond to the
			// join request. We will make our own Join request once we are connected.
			if (this.runtime.getJoinedStatus() !== "disconnected") {
				this.prepareJoinResponse(message.content.updateProviders, message.clientId);
			}
			// It is okay to continue processing the contained updates even if we are not
			// connected.
		} else {
			// Update join response requests that are now satisfied.
			const joinResponseFor = message.content.joinResponseFor;
			if (joinResponseFor) {
				const selfClientId = this.runtime.getClientId();
				assert(selfClientId !== undefined, 0xcbd /* Received signal without clientId */);

				let justGainedCompleteSnapshot = false;
				if (joinResponseFor.includes(selfClientId)) {
					if (this.reasonForCompleteSnapshot) {
						if (this.reasonForCompleteSnapshot === "alone") {
							// No response was expected. This might happen when
							// either cautionary ClientJoin signal is received
							// by audience member that was unknown.
							this.logger?.sendTelemetryEvent({
								eventName: "JoinResponseWhenAlone",
								details: {
									attendeeId: this.attendeeId,
									connectionId: this.runtime.getClientId(),
								},
							});
						}
					} else {
						// If we are the intended recipient of the join response,
						// we can consider our knowledge complete and can respond
						// to others join requests.
						justGainedCompleteSnapshot = true;
					}
					this.reasonForCompleteSnapshot = "join response";
				}
				if (this.broadcastRequests.size > 0) {
					for (const responseFor of joinResponseFor) {
						this.broadcastRequests.delete(responseFor);
					}
					if (this.broadcastRequests.size === 0) {
						// If no more requests are pending, clear any timer.
						this.broadcastRequestsTimer.clearTimeout();
					} else if (justGainedCompleteSnapshot) {
						// May or may not be time to respond to remaining requests.
						// Clear the timer and recheck after processing.
						this.broadcastRequestsTimer.clearTimeout();
						postUpdateActions.push(this.sendJoinResponseIfStillNeeded);
					}
				}
			}

			// If the message requests an acknowledgement, we will send a targeted acknowledgement message back to just the requestor.
			if (message.content.acknowledgementId !== undefined) {
				assert(
					this.targetedSignalSupport,
					0xcbe /* Acknowledgment message was requested while targeted signal capability is not supported */,
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
			const match = /^([^:]):([^:]+:.+)$/.exec(workspaceAddress) as
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
	 * Broadcasts a join response (complete datastore update message)
	 * if there is an outstanding join response request.
	 */
	private readonly sendJoinResponseIfStillNeeded = (): void => {
		// Make sure we are currently connected and a broadcast is still needed.
		// If not connected, nothing we can do.
		if (this.runtime.getJoinedStatus() !== "disconnected" && this.broadcastRequests.size > 0) {
			// Confirm that of remaining requests, now is the time to respond.
			const now = Date.now();
			let minResponseTime = Number.POSITIVE_INFINITY;
			for (const { deadlineTime } of this.broadcastRequests.values()) {
				minResponseTime = Math.min(minResponseTime, deadlineTime);
			}
			if (minResponseTime <= now) {
				if (this.reasonForCompleteSnapshot) {
					this.broadcastAllKnownState();
				}
			} else {
				// No response needed yet - schedule a later attempt
				this.broadcastRequestsTimer.setTimeout(
					this.sendJoinResponseIfStillNeeded,
					minResponseTime - now,
				);
			}
		}
	};

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
		// We must be connected to receive this message, so clientId should be defined.
		// If it isn't then, not really a problem; just won't be in provider or audience list.
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		const selfClientId = this.runtime.getClientId()!;
		let joinResponseDelayMs = broadcastJoinResponseDelaysMs.namedResponder;
		let relativeResponseOrder: number | undefined;
		if (!updateProviders.includes(selfClientId)) {
			// Schedule a broadcast to the new client after a delay only to send if
			// another broadcast satisfying the request hasn't been seen in the
			// meantime. The delay is based on the position in the quorum list. It
			// doesn't have to be a stable list across all clients. We need
			// something to provide suggested order to prevent a flood of broadcasts.
			const quorumMembers = this.runtime.getQuorum().getMembers();
			const self = quorumMembers.get(selfClientId);
			if (self) {
				// Compute order quorum join order (indicated by sequenceNumber)
				relativeResponseOrder = 0;
				for (const { client, sequenceNumber } of quorumMembers.values()) {
					if (
						sequenceNumber < self.sequenceNumber &&
						client.details.capabilities.interactive
					) {
						relativeResponseOrder++;
					}
				}
			} else {
				// Order past quorum members + arbitrary additional offset up to 10
				let possibleQuorumRespondents = 0;
				for (const { client } of quorumMembers.values()) {
					if (client.details.capabilities.interactive) {
						possibleQuorumRespondents++;
					}
				}
				relativeResponseOrder = possibleQuorumRespondents + Math.random() * 10;
			}
			// When not named to provide update, wait an additional amount
			// of time for those named or others to respond.
			joinResponseDelayMs +=
				broadcastJoinResponseDelaysMs.backupResponderIncrement *
				(3 * updateProviders.length + relativeResponseOrder);
		}

		// Add the requestor to the list of clients that will receive the broadcast.
		const deadlineTime = Date.now() + joinResponseDelayMs;
		this.broadcastRequests.set(requestor, {
			deadlineTime,
			responseOrder: relativeResponseOrder,
		});

		if (!this.reasonForCompleteSnapshot) {
			// Check if requestor count meets or exceeds count of other audience
			// members indicating that we effectively have a complete snapshot
			// (once the current message being processed is processed).
			const { selfPresent, interactiveMembersExcludingSelf } =
				this.getAudienceInformation(selfClientId);
			if (
				// Self-present check is done to help ensure that audience
				// information is accurate. If self is not present, audience
				// information might be incomplete.
				selfPresent &&
				this.broadcastRequests.size >= interactiveMembersExcludingSelf.all.size
			) {
				// Note that no action is taken here specifically.
				// We want action to be queued so that it takes place after
				// current message is completely processed. All of the actions
				// below should be delayed (not immediate).
				this.reasonForCompleteSnapshot = "full requests";
			}
		}

		// Check if capable of full primary response. If requested to provide
		// primary response, but do not yet have complete snapshot, we need to
		// delay a full response, until we think we have complete snapshot. In
		// the meantime we will send partial updates as usual.
		if (this.reasonForCompleteSnapshot && updateProviders.includes(selfClientId)) {
			// Use regular message queue to handle timing of the broadcast.
			// Any more immediate broadcasts will accelerate the response time.
			// As a primary responder, it is expected that broadcast will happen and
			// using the regular queue allows other updates to avoid merge work.
			this.enqueueMessage("sendAll", {
				allowableUpdateLatencyMs: joinResponseDelayMs,
			});
		} else {
			// Check if there isn't already a timer scheduled to send a join
			// response with in this request's deadline.
			if (
				this.broadcastRequestsTimer.hasExpired() ||
				deadlineTime < this.broadcastRequestsTimer.expireTime
			) {
				// Set or update the timer.
				this.broadcastRequestsTimer.setTimeout(
					this.sendJoinResponseIfStillNeeded,
					joinResponseDelayMs,
				);
			}
		}
	}
}
