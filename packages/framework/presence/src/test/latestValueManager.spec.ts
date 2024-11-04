/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { LatestValueClientData } from "../index.js";
import { Latest } from "../index.js";
import type { IPresence } from "../presence.js";

describe("Presence", () => {
	describe("LatestValueManager", () => {
		/**
		 * See {@link checkCompiles} below
		 */
		it("API use compiles", () => {});
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
	const map: typeof statesWorkspace = statesWorkspace;

	map.add("caret", Latest({ id: "", pos: 0 }));

	const fakeAdd = map.caret.local.pos + map.camera.local.z + map.cursor.local.x;
	console.log(fakeAdd);

	// @ts-expect-error local may be set wholly, but partially it is readonly
	map.caret.local.pos = 0;

	function logClientValue<
		T /* following extends should not be required: */ extends Record<string, unknown>,
	>({ client, value }: Pick<LatestValueClientData<T>, "client" | "value">): void {
		console.log(client.sessionId, value);
	}

	// Create new cursor state
	const cursor = map.cursor;

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
