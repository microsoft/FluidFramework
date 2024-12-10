/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	IPresence,
	LatestMap,
	type PresenceStates,
	type PresenceStatesSchema,
} from "@fluidframework/presence/alpha";
import { v4 as uuid } from "uuid";

export interface User {
	photo: string;
}

const statesSchema = {
	onlineUsers: LatestMap<{ value: User }, `id-${string}`>(),
} satisfies PresenceStatesSchema;

export type UserPresence = PresenceStates<typeof statesSchema>;

// Takes a presence object and returns the user presence object that contains the shared object states
export function buildUserPresence(presence: IPresence): UserPresence {
	const states = presence.getStates(`name:user-avatar-states-${uuid()}`, statesSchema);
	return states;
}
