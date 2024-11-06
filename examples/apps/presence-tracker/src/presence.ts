import {
	Latest,
	type IPresence,
	type PresenceStates,
	type PresenceStatesSchema,
} from "@fluid-experimental/presence";

import type { IMousePosition } from "./MouseTracker.js";

export interface IFocusState {
	focused: boolean;
}

const initialPosition: IMousePosition = { x: 0, y: 0 };
const initialFocus: IFocusState = { focused: false };

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
	// mouse: LatestMap<{ position: IMousePosition }, `die${number}`>(),
	mouse: Latest(initialPosition),
	focus: Latest(initialFocus),
} satisfies PresenceStatesSchema;

export type MousePresence = PresenceStates<typeof statesSchema>;

export function initializePresenceWorkspace(presence: IPresence): MousePresence {
	const workspace = presence.getStates("name:presenceDataStates", statesSchema);
	return workspace;

	// Workaround ts(2775): Assertions require every name in the call target to be declared with an explicit type annotation.
	// const presenceWorkspace: typeof workspace = workspace;

	// return presenceWorkspace;
}

export function getFocusPresences(mousePresence: MousePresence): Map<string, boolean> {
	const statuses: Map<string, boolean> = new Map<string, boolean>();
	const { focus } = mousePresence;
	for (const f of focus.clientValues()) {
		const { focused } = f.value;
		statuses.set(f.client.sessionId, focused);
	}
	return statuses;
}
