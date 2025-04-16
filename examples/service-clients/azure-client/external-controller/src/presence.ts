/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	Presence,
	StateFactory,
	type StatesWorkspace,
	type StatesWorkspaceSchema,
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
 * The first state, lastRoll, is using {@link @fluidframework/presence#Latest| Latest} where
 * all dice values are updated as a whole ({@link DiceValues} structure which has optional values).
 * If any part of the data is updated, then the entire data structure is shared. This means
 * keeping a local copy of the data structure or recomposing it each time making an update.
 *
 * The second state, lastDiceRolls, is using {@link @fluidframework/presence#LatestMap| LatestMap} where
 * each die is updated independently. This allows for more granular updates, but also requires
 * more verbose setting/reading logic and use of boxed values (e.g. `{ value: DieValue}`). This
 * pattern more directly lends itself to handling arbitrary numbers of dice.
 *
 * Throughout the code, the `lastRoll` state is focus of use.
 */
const statesSchema = {
	// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
	lastRoll: StateFactory.latest({} as DiceValues),
	lastDiceRolls: StateFactory.latestMap<{ value: DieValue }, `die${number}`>(),
} satisfies StatesWorkspaceSchema;

export type DicePresence = StatesWorkspace<typeof statesSchema>;

export function buildDicePresence(presence: Presence): DicePresence {
	const states = presence.states.getWorkspace("name:app-client-states", statesSchema);
	return states;
}
