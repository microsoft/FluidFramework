/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	IPresence,
	LatestMap,
	type PresenceStates,
	type PresenceStatesSchema,
} from "@fluid-experimental/presence";

export interface User {
	photo: string;
}

const statesSchema = {
	// eslint-disable-next-line @typescript-eslint/member-delimiter-style
	onlineUsers: LatestMap<{ value: User }, `id-${string}`>(),
} satisfies PresenceStatesSchema;

export type UserPresence = PresenceStates<typeof statesSchema>;

export function buildUserPresence(presence: IPresence): UserPresence {
	const states = presence.getStates("name:app-client-states", statesSchema);
	return states;
}
