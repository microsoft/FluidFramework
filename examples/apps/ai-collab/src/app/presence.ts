/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	IPresence,
	LatestMap,
	type PresenceStates,
	type PresenceStatesSchema,
	// eslint-disable-next-line import/no-internal-modules
} from "@fluidframework/presence/alpha";

export interface User {
	photo: string;
}

const statesSchema = {
	onlineUsers: LatestMap<{ value: User }, `id-${string}`>(),
} satisfies PresenceStatesSchema;

export type UserPresence = PresenceStates<typeof statesSchema>;

// Takes a presence object and returns the user presence object that contains the shared object states
export function buildUserPresence(presence: IPresence): UserPresence {
	const states = presence.getStates("name:app-client-states", statesSchema);
	return states;
}
