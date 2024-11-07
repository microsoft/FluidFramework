import {
	Latest,
	type IPresence,
	type PresenceStates,
	type PresenceStatesSchema,
} from "@fluid-experimental/presence";

export interface IMousePosition {
	x: number;
	y: number;
}

export interface IFocusState {
	focused: boolean;
}

const initialPosition: IMousePosition = { x: 0, y: 0 };
const initialFocus: IFocusState = { focused: false };

const statesSchema = {
	mouse: Latest(initialPosition),
	focus: Latest(initialFocus),
} satisfies PresenceStatesSchema;

export type AppPresence = PresenceStates<typeof statesSchema>;

export function initializePresenceWorkspace(presence: IPresence): AppPresence {
	const workspace = presence.getStates("name:presenceDataStates", statesSchema);
	return workspace;
}
