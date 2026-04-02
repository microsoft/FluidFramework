/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { InternalTypes } from "./exposedInternalTypes.js";
import type { Attendee } from "./presence.js";

/**
 * A function to be called at the end of an update frame
 */
export type PostUpdateAction = () => void;

/**
 * Contract for State Managers as used by a States Workspace (`PresenceStatesImpl`)
 *
 * @remarks
 * See uses of `unbrandIVM`.
 */
export interface ValueManager<
	TValue,
	TValueState extends
		InternalTypes.ValueDirectoryOrState<TValue> = InternalTypes.ValueDirectoryOrState<TValue>,
> {
	// State objects should provide value - implement Required<ValueManager<...>>
	readonly value?: TValueState;

	/**
	 * Process an update of `value` for remote attendee.
	 * @param attendee - The attendee whose `value` is being updated
	 * @param received - The revision number received
	 * @param value - The new `value` state
	 */
	update(attendee: Attendee, received: number, value: TValueState): PostUpdateAction[];
}
