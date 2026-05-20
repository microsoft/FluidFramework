/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	AttendeeId,
	BroadcastControlSettings,
	ClientConnectionId,
	StatesWorkspaceSchema,
} from "@fluid-internal/presence-definitions";
import type {
	AnyWorkspace,
	InternalTypes,
	PostUpdateAction,
	ValidatableValueDirectoryOrState,
} from "@fluid-internal/presence-definitions/internal";
import type { ClientRecord } from "@fluid-internal/presence-definitions/internal/workspace";

/**
 * Miscellaneous options for local state updates
 *
 * @internal
 */
export interface RuntimeLocalUpdateOptions {
	/**
	 * The maximum time in milliseconds that this update is allowed to be
	 * delayed before it must be sent to the service.
	 */
	allowableUpdateLatencyMs: number;

	/**
	 * Special option allowed for unicast notifications.
	 */
	targetClientId?: ClientConnectionId;
}

/**
 * ValueElementMap is a map of key to a map of attendeeId to ValueState.
 *
 * @remarks
 * It is not restricted to the schema of the map as it may receive updates from other clients
 * with managers that have not been registered locally. Each map node is responsible for keeping
 * all session's state to be able to pick an arbitrary client to rebroadcast to others.
 *
 * This generic aspect makes some typing difficult. The loose typing is not broadcast to the
 * consumers. They are expected to maintain their schema over multiple versions of clients.
 *
 * @internal
 */
export interface ValueElementMap<_TSchema extends StatesWorkspaceSchema> {
	[key: string]: ClientRecord<ValidatableValueDirectoryOrState<unknown>>;
}

// An attempt to make the type more precise, but it is not working.
// If the casting in support code is too much we could keep two references to the same
// complete datastore, but with the respective types desired.
// type ValueElementMap<TSchema extends PresenceStatesNodeSchema> =
// 	| {
// 			[Key in keyof TSchema & string]?: {
// 				[AttendeeId: AttendeeId]: InternalTypes.ValueDirectoryOrState<MapSchemaElement<TSchema,"value",Key>>;
// 			};
// 	  }
// 	| {
// 			[key: string]: ClientRecord<InternalTypes.ValueDirectoryOrState<unknown>>;
// 	  };
// interface ValueElementMap<TValue> {
// 	[Id: string]: ClientRecord<InternalTypes.ValueDirectoryOrState<TValue>>;
// 	// Version with local packed in is convenient for map, but not for join broadcast to serialize simply.
// 	// [Id: string]: {
// 	// 	local: InternalTypes.ValueDirectoryOrState<TValue>;
// 	// 	all: ClientRecord<InternalTypes.ValueDirectoryOrState<TValue>>;
// 	// };
// }

/**
 * Data content of a datastore entry in update messages
 *
 * @internal
 */
export type ClientUpdateEntry = InternalTypes.ValueDirectoryOrState<unknown> & {
	ignoreUnmonitored?: true;
};

/**
 * Record of client update entries keyed by attendee ID
 */
interface ClientUpdateRecord {
	[AttendeeId: AttendeeId]: ClientUpdateEntry;
}

/**
 * Record of value updates keyed by value key
 *
 * @internal
 */
export interface ValueUpdateRecord {
	[valueKey: string]: ClientUpdateRecord;
}

/**
 * Contract for Workspaces as required by `PresenceDatastoreManager`
 *
 * @internal
 */
export interface PresenceStatesInternal {
	ensureContent<TSchemaAdditional extends StatesWorkspaceSchema>(
		content: TSchemaAdditional,
		controls: BroadcastControlSettings | undefined,
	): AnyWorkspace<TSchemaAdditional>;
	processUpdate(
		received: number,
		timeModifier: number,
		remoteDatastore: ValueUpdateRecord,
		senderConnectionId: ClientConnectionId,
	): PostUpdateAction[];
}
