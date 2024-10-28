/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	IPresence,
	Latest,
	LatestMap,
	Notifications,
	type ISessionClient,
	type PresenceStates,
	type PresenceStatesSchema,
} from "@fluid-experimental/presence";

import type { DieValue } from "./controller.js";

export interface DiceValues {
	die1?: DieValue;
	die2?: DieValue;
}

/**
 * This example schema shows two ways to share a simple state (in this case
 * the values of two dice as last rolled by clients). No practical application
 * would need both of these states.
 *
 * The first state, lastRoll, is using the simpler {@link @fluid-experimental/presence#Latest | Latest}
 * pattern (-\> {@link @fluid-experimental/presence#LatestValueManager | LatestValueManager}) where
 * all dice values are updated as a whole ({@link DiceValues} structure which has optional values).
 * If any part of the data is updated, then the entire data structure is shared. This means
 * keeping a local copy of the data structure or recomposing it each time making an update.
 *
 * The second state, lastDiceRolls, is using the {@link @fluid-experimental/presence#LatestMap | LatestMap}
 * pattern (-\> {@link @fluid-experimental/presence#LatestMapManager | LatestMapManager}) where
 * each die is updated independently. This allows for more granular updates, but also requires
 * more verbose setting/reading logic and use of boxed values (e.g. `{ value: DieValue}`). This
 * pattern more directly lends itself to handling arbitrary numbers of dice.
 *
 * Throughout the code, the `lastRoll` state is focus of use.
 */
const statesSchema = {
	// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
	lastRoll: Latest({} as DiceValues),
	// eslint-disable-next-line @typescript-eslint/member-delimiter-style
	lastDiceRolls: LatestMap<{ value: DieValue }, `die${number}`>(),
} satisfies PresenceStatesSchema;

export type DicePresence = PresenceStates<typeof statesSchema>;

export function buildDicePresence(presence: IPresence): DicePresence {
	const states = presence.getStates("name:app-client-states", statesSchema);
	return states;
}

export function initNotifications(presence: IPresence): void {
	const notificationsWorkspace = presence.getNotifications("name:name:app-notifications", {
		chat: Notifications<{
			msg: (message: string) => void;
		}>({
			msg: (client: ISessionClient, message: string) => {
				console.log(`${client.sessionId} says, "${message}"`);
			},
		}),
	});

	// Workaround ts(2775): Assertions require every name in the call target to be declared with an explicit type
	// annotation.
	const notifications: typeof notificationsWorkspace = notificationsWorkspace;

	notifications.add(
		"CustomEvents",
		Notifications<
			// Below explicit generic specifiction should not be required.
			{
				newId: (id: number) => void;
			},
			"CustomEvents"
		>({
			newId: (client: ISessionClient, id: number) => {
				console.log(`${client.sessionId} has a new id: ${id}`);
			},
		}),
	);
}
