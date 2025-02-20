/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	IPresence,
	Latest,
	LatestMap,
	type PresenceStates,
	type PresenceStatesSchema,
} from "@fluidframework/presence/alpha";

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
 * The first state, lastRoll, is using the simpler {@link @fluidframework/presence#Latest | Latest}
 * pattern (-\> {@link @fluidframework/presence#LatestValueManager | LatestValueManager}) where
 * all dice values are updated as a whole ({@link DiceValues} structure which has optional values).
 * If any part of the data is updated, then the entire data structure is shared. This means
 * keeping a local copy of the data structure or recomposing it each time making an update.
 *
 * The second state, lastDiceRolls, is using the {@link @fluidframework/presence#LatestMap | LatestMap}
 * pattern (-\> {@link @fluidframework/presence#LatestMapManager | LatestMapManager}) where
 * each die is updated independently. This allows for more granular updates, but also requires
 * more verbose setting/reading logic and use of boxed values (e.g. `{ value: DieValue}`). This
 * pattern more directly lends itself to handling arbitrary numbers of dice.
 *
 * Throughout the code, the `lastRoll` state is focus of use.
 */
const statesSchema = {
	// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
	lastRoll: Latest({} as DiceValues),
	lastDiceRolls: LatestMap<{ value: DieValue }, `die${number}`>(),
} satisfies PresenceStatesSchema;

export type DicePresence = PresenceStates<typeof statesSchema>;

export function buildDicePresence(presence: IPresence): DicePresence {
	const states = presence.getStates("name:app-client-states", statesSchema);
	return states;
}
