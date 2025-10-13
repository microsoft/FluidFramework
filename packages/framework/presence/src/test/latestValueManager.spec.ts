/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { createPresenceManager } from "../presenceManager.js";

import { addControlsTests } from "./broadcastControlsTests.js";
import { MockEphemeralRuntime } from "./mockEphemeralRuntime.js";
import { assertIdenticalTypes, createInstanceOf } from "./testUtils.js";

import type {
	BroadcastControlSettings,
	Latest,
	LatestClientData,
	LatestRaw,
	Presence,
	RawValueAccessor,
} from "@fluidframework/presence/beta";
import { StateFactory } from "@fluidframework/presence/beta";

const testWorkspaceName = "name:testWorkspaceA";

/* eslint-disable unicorn/no-null -- API null support must be tested */

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function createLatestManager(
	presence: Presence,
	valueControlSettings?: BroadcastControlSettings,
) {
	const workspace = presence.states.getWorkspace(testWorkspaceName, {
		camera: StateFactory.latest({
			local: { x: 0, y: 0, z: 0 },
			settings: valueControlSettings,
		}),
	});
	return workspace.states.camera;
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
				const workspace = presence.states.getWorkspace(testWorkspaceName, {
					obj: StateFactory.latest({ local: {} }),
				});
				assert.deepStrictEqual(workspace.states.obj.local, {});
			});

			it("can set and get object with properties as initial value", () => {
				const workspace = presence.states.getWorkspace(testWorkspaceName, {
					obj: StateFactory.latest({ local: { x: 0, y: 0, z: 0 } }),
				});
				assert.deepStrictEqual(workspace.states.obj.local, { x: 0, y: 0, z: 0 });
			});

			it("can set and get empty array as initial value", () => {
				const workspace = presence.states.getWorkspace(testWorkspaceName, {
					arr: StateFactory.latest({ local: [] }),
				});
				assert.deepStrictEqual(workspace.states.arr.local, []);
			});

			it("can set and get array with elements as initial value", () => {
				const workspace = presence.states.getWorkspace(testWorkspaceName, {
					arr: StateFactory.latest({ local: [1, 2, 3] }),
				});
				assert.deepStrictEqual(workspace.states.arr.local, [1, 2, 3]);
			});

			it("can set and get null as initial value", () => {
				const workspace = presence.states.getWorkspace(testWorkspaceName, {
					nullable: StateFactory.latest({ local: null }),
				});
				assert.deepStrictEqual(workspace.states.nullable.local, null);
			});

			it("can set and get inferred nullable type as initial value", () => {
				// Setup
				// Use a function to generate the initial value so that TypeScript
				// can't statically infer the type as exactly null.
				function generateInitialValue(): { x: number; y: number } | null {
					return { x: 0, y: 0 };
				}
				const initialValue = generateInitialValue();
				// Act
				const workspace = presence.states.getWorkspace(testWorkspaceName, {
					nullable: StateFactory.latest({ local: initialValue }),
				});
				// Verify
				assert.deepStrictEqual(workspace.states.nullable.local, initialValue);
			});

			it(".presence provides Presence it was created under", () => {
				const workspace = presence.states.getWorkspace(testWorkspaceName, {
					camera: StateFactory.latest({ local: { x: 0, y: 0, z: 0 } }),
				});

				assert.strictEqual(workspace.states.camera.presence, presence);
			});

			it("can set and get null as modified local value", () => {
				// Setup
				const workspace = presence.states.getWorkspace(testWorkspaceName, {
					nullable: StateFactory.latest<{ x: number; y: number } | null>({
						local: { x: 0, y: 0 },
					}),
				});

				// Act and Verify
				workspace.states.nullable.local = null;
				assert.deepStrictEqual(workspace.states.nullable.local, null);
			});
		});

		addControlsTests(createLatestManager);

		it("localUpdate event is fired with new value when local value is updated", () => {
			// Setup
			const presence = createPresenceManager(new MockEphemeralRuntime());
			const workspace = presence.states.getWorkspace(testWorkspaceName, {
				camera: StateFactory.latest({ local: { x: 0, y: 0, z: 0 } }),
			});
			const camera = workspace.states.camera;

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
		cursor: StateFactory.latest({ local: { x: 0, y: 0 } }),
		camera: StateFactory.latest({ local: { x: 0, y: 0, z: 0 } }),
		nullablePoint: StateFactory.latest<null | { x: number; y: number }>({ local: null }),
		validated: StateFactory.latest({
			local: { num: 22 },
			validator: (data: unknown) => data as { num: number },
		}),
	});
	// Workaround ts(2775): Assertions require every name in the call target to be declared with an explicit type annotation.
	const workspace: typeof statesWorkspace = statesWorkspace;
	const props = workspace.states;

	workspace.add("caret", StateFactory.latest({ local: { id: "", pos: 0 } }));

	const fakeAdd =
		workspace.states.caret.local.pos + props.camera.local.z + props.cursor.local.x;
	console.log(fakeAdd);

	// @ts-expect-error local may be set wholly, but partially it is readonly
	workspace.states.caret.local.pos = 0;

	function logClientValue<T>({
		attendee,
		value,
	}: Pick<LatestClientData<T, RawValueAccessor<T>>, "attendee" | "value">): void {
		console.log(attendee.attendeeId, value);
	}

	function logRemoteValue<T>({
		attendee,
		value,
	}: Pick<LatestClientData<T>, "attendee" | "value">): void {
		console.log(attendee.attendeeId, value());
	}

	// Create new cursor state
	const cursor = props.cursor;

	// Update our cursor position
	cursor.local = { x: 1, y: 2 };

	// Set nullable point to non-null value
	props.nullablePoint.local = { x: 10, y: -2 };

	// Listen to others cursor updates
	const cursorUpdatedOff = cursor.events.on("remoteUpdated", ({ attendee, value }) =>
		console.log(`attendee ${attendee.attendeeId}'s cursor is now at (${value.x},${value.y})`),
	);
	cursorUpdatedOff();

	for (const attendee of cursor.getStateAttendees()) {
		logClientValue({ attendee, ...cursor.getRemote(attendee) });
	}

	// Enumerate all cursor values
	for (const { attendee, value } of cursor.getRemotes()) {
		logClientValue({ attendee, value });
	}

	// Get a reference to one of the remote attendees
	const attendee2 = [...cursor.getStateAttendees()].find(
		(attendee) => attendee !== presence.attendees.getMyself(),
	);
	assert(attendee2 !== undefined);

	// Get a remote raw value
	const remoteCursor = cursor.getRemote(attendee2);
	logClientValue({ attendee: attendee2, value: remoteCursor.value });

	assertIdenticalTypes(props.cursor, createInstanceOf<LatestRaw<{ x: number; y: number }>>());
	assertIdenticalTypes(props.validated, createInstanceOf<Latest<{ num: number }>>());

	// Get a remote validated value
	const latestData = props.validated.getRemote(attendee2);

	// The next line correctly does not compile because the value argument must be a RawValueAccessor
	// @ts-expect-error Type '() => { readonly num: number; } | undefined' is not assignable to type 'never'.
	logClientValue({ attendee: attendee2, value: latestData.value });

	// This line correctly compiles because logRemoteValue expects a ProxiedValueAccessor
	logRemoteValue({ attendee: attendee2, value: latestData.value });
}

/* eslint-enable unicorn/no-null */
