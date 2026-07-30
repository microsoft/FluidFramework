/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	AttendeeId,
	ClientConnectionId,
	PresenceWithNotifications as Presence,
} from "@fluid-internal/presence-definitions";
import type {
	InternalTypes,
	ValidatableValueDirectoryOrState,
	ValidatableValueStructure,
} from "@fluid-internal/presence-definitions/internal";
import type { ClientRecord } from "@fluid-internal/presence-definitions/internal/workspace";

/**
 * Miscellaneous options for local state updates
 *
 * @internal
 */
export interface LocalStateUpdateOptions {
	/**
	 * When defined, this is the maximum time in milliseconds that this
	 * update is allowed to be delayed before it must be sent to service.
	 * When `undefined`, the callee may determine maximum delay.
	 */
	allowableUpdateLatencyMs: number | undefined;

	/**
	 * Special option allowed for unicast notifications.
	 */
	targetClientId?: ClientConnectionId;
}

/**
 * Contract for States Workspace to support State Manager access to
 * datastore and general internal presence knowledge.
 *
 * @internal
 */
export interface StateDatastore<
	TKey extends string,
	TLocalUpdateValue extends InternalTypes.ValueDirectoryOrState<unknown>,
	TStoredValue extends
		ValidatableValueDirectoryOrState<unknown> = ValidatableValueStructure<TLocalUpdateValue>,
> {
	readonly presence: Presence;
	localUpdate(
		key: TKey,
		value: TLocalUpdateValue & {
			ignoreUnmonitored?: true;
		},
		options: LocalStateUpdateOptions,
	): void;
	update(key: TKey, attendeeId: AttendeeId, value: TStoredValue): void;
	knownValues(key: TKey): {
		self: AttendeeId | undefined;
		states: ClientRecord<TStoredValue>;
	};
}
