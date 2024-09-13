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
} from "@fluid-experimental/presence";

import type { DieValue } from "./controller.js";

export interface DiceValues {
	die1?: DieValue;
	die2?: DieValue;
}

const statesSchema = {
	// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
	lastRoll: Latest({} as DiceValues),
	// Both lastRoll and lastDiceRolls are not required. lastDiceRolls is here
	// to demonstrate and example of LatestMap.
	// eslint-disable-next-line @typescript-eslint/member-delimiter-style
	lastDiceRolls: LatestMap<{ value: DieValue }, `die${number}`>(),
} satisfies PresenceStatesSchema;

export type DicePresence = PresenceStates<typeof statesSchema>;

export function buildDicePresence(presence: IPresence): DicePresence {
	const states = presence.getStates("name:app-client-states", statesSchema);
	return states;
}
