/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { createPresenceManager } from "../presenceManager.js";

import { addControlsTests } from "./broadcastControlsTests.js";
import { MockEphemeralRuntime } from "./mockEphemeralRuntime.js";

import type {
	BroadcastControlSettings,
	LatestClientData,
	Presence,
} from "@fluidframework/presence/alpha";
import { StateFactory } from "@fluidframework/presence/alpha";

const testWorkspaceName = "name:testWorkspaceA";

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function createLatestManager(
	presence: Presence,
	valueControlSettings?: BroadcastControlSettings,
) {
	const states = presence.states.getWorkspace(testWorkspaceName, {
		camera: StateFactory.latest({ x: 0, y: 0, z: 0 }, valueControlSettings),
	});
	return states.props.camera;
}

describe("Presence", () => {
	describe("Latest", () => {
		/**
		 * See {@link checkCompiles} below
		 */
		it("API use compiles", () => {});

		describe("when initialized", () => {
			let presence: Presence;

			beforeEach(() => {
				presence = createPresenceManager(new MockEphemeralRuntime());
			});

			it("can set and get empty object as initial value", () => {
				const states = presence.states.getWorkspace(testWorkspaceName, {
					obj: StateFactory.latest({}),
				});
				assert.deepStrictEqual(states.props.obj.local, {});
			});

			it("can set and get object with properties as initial value", () => {
				const states = presence.states.getWorkspace(testWorkspaceName, {
					obj: StateFactory.latest({ x: 0, y: 0, z: 0 }),
				});
				assert.deepStrictEqual(states.props.obj.local, { x: 0, y: 0, z: 0 });
			});

			it("can set and get empty array as initial value", () => {
				const states = presence.states.getWorkspace(testWorkspaceName, {
					arr: StateFactory.latest([]),
				});
				assert.deepStrictEqual(states.props.arr.local, []);
			});

			it("can set and get array with elements as initial value", () => {
				const states = presence.states.getWorkspace(testWorkspaceName, {
					arr: StateFactory.latest([1, 2, 3]),
				});
				assert.deepStrictEqual(states.props.arr.local, [1, 2, 3]);
			});
		});

		addControlsTests(createLatestManager);

		it("localUpdate event is fired with new value when local value is updated", () => {
			// Setup
			const presence = createPresenceManager(new MockEphemeralRuntime());
			const states = presence.states.getWorkspace(testWorkspaceName, {
				camera: StateFactory.latest({ x: 0, y: 0, z: 0 }),
			});
			const camera = states.props.camera;

			let localUpdateCount = 0;
			camera.events.on("localUpdated", (update) => {
				localUpdateCount++;
				assert.deepStrictEqual(update.value, { x: 1, y: 2, z: 3 });
			});

			// Act & Verify
			camera.local = { x: 1, y: 2, z: 3 };
			assert.strictEqual(localUpdateCount, 1);
		});
	});
});

// ---- test (example) code ----

/**
 * Check that the code compiles.
 */
export function checkCompiles(): void {
	// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
	const presence = {} as Presence;
	const statesWorkspace = presence.states.getWorkspace("name:testStatesWorkspaceWithLatest", {
		cursor: StateFactory.latest({ x: 0, y: 0 }),
		camera: StateFactory.latest({ x: 0, y: 0, z: 0 }),
	});
	// Workaround ts(2775): Assertions require every name in the call target to be declared with an explicit type annotation.
	const workspace: typeof statesWorkspace = statesWorkspace;
	const props = workspace.props;

	workspace.add("caret", StateFactory.latest({ id: "", pos: 0 }));

	const fakeAdd =
		workspace.props.caret.local.pos + props.camera.local.z + props.cursor.local.x;
	console.log(fakeAdd);

	// @ts-expect-error local may be set wholly, but partially it is readonly
	workspace.props.caret.local.pos = 0;

	function logClientValue<
		T /* following extends should not be required: */ extends Record<string, unknown>,
	>({ attendee, value }: Pick<LatestClientData<T>, "attendee" | "value">): void {
		console.log(attendee.attendeeId, value);
	}

	// Create new cursor state
	const cursor = props.cursor;

	// Update our cursor position
	cursor.local = { x: 1, y: 2 };

	// Listen to others cursor updates
	const cursorUpdatedOff = cursor.events.on("updated", ({ attendee, value }) =>
		console.log(`attendee ${attendee.attendeeId}'s cursor is now at (${value.x},${value.y})`),
	);
	cursorUpdatedOff();

	for (const attendee of cursor.clients()) {
		logClientValue({ attendee, ...cursor.clientValue(attendee) });
	}

	// Enumerate all cursor values
	for (const { attendee, value } of cursor.clientValues()) {
		logClientValue({ attendee, value });
	}
}
