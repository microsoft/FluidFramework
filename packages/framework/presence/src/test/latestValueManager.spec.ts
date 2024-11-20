/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { addControlsTests } from "./broadcastControlsTests.js";

import type {
	BroadcastControlSettings,
	IPresence,
	LatestValueClientData,
} from "@fluidframework/presence/alpha";
import { Latest } from "@fluidframework/presence/alpha";

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function createLatestManager(
	presence: IPresence,
	valueControlSettings?: BroadcastControlSettings,
) {
	const states = presence.getStates("name:testWorkspaceA", {
		camera: Latest({ x: 0, y: 0, z: 0 }, valueControlSettings),
	});
	return states.props.camera;
}

describe("Presence", () => {
	describe("LatestValueManager", () => {
		/**
		 * See {@link checkCompiles} below
		 */
		it("API use compiles", () => {});

		addControlsTests(createLatestManager);
	});
});

// ---- test (example) code ----

/**
 * Check that the code compiles.
 */
export function checkCompiles(): void {
	// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
	const presence = {} as IPresence;
	const statesWorkspace = presence.getStates("name:testStatesWorkspaceWithLatest", {
		cursor: Latest({ x: 0, y: 0 }),
		camera: Latest({ x: 0, y: 0, z: 0 }),
	});
	// Workaround ts(2775): Assertions require every name in the call target to be declared with an explicit type annotation.
	const workspace: typeof statesWorkspace = statesWorkspace;
	const props = workspace.props;

	workspace.add("caret", Latest({ id: "", pos: 0 }));

	const fakeAdd =
		workspace.props.caret.local.pos + props.camera.local.z + props.cursor.local.x;
	console.log(fakeAdd);

	// @ts-expect-error local may be set wholly, but partially it is readonly
	workspace.props.caret.local.pos = 0;

	function logClientValue<
		T /* following extends should not be required: */ extends Record<string, unknown>,
	>({ client, value }: Pick<LatestValueClientData<T>, "client" | "value">): void {
		console.log(client.sessionId, value);
	}

	// Create new cursor state
	const cursor = props.cursor;

	// Update our cursor position
	cursor.local = { x: 1, y: 2 };

	// Listen to others cursor updates
	const cursorUpdatedOff = cursor.events.on("updated", ({ client, value }) =>
		console.log(`client ${client.sessionId}'s cursor is now at (${value.x},${value.y})`),
	);
	cursorUpdatedOff();

	for (const client of cursor.clients()) {
		logClientValue({ client, ...cursor.clientValue(client) });
	}

	// Enumerate all cursor values
	for (const { client, value } of cursor.clientValues()) {
		logClientValue({ client, value });
	}
}
