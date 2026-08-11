/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { AttendeeId } from "@fluid-internal/presence-definitions";
import type { ValidatableValueDirectoryOrState } from "@fluid-internal/presence-definitions/internal";

/**
 * Basic structure of set of {@link Attendee} records within Presence datastore
 *
 * @remarks
 * This exists per named state in State Managers.
 *
 * @internal
 */
export interface ClientRecord<TValue extends ValidatableValueDirectoryOrState<unknown>> {
	// Caution: any particular item may or may not exist
	// Typescript does not support absent keys without forcing type to also be undefined.
	// See https://github.com/microsoft/TypeScript/issues/42810.
	[AttendeeId: AttendeeId]: TValue;
}
