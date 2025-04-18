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
	LatestMap,
	LatestMapItemUpdatedClientData,
	Presence,
} from "@fluidframework/presence/alpha";
import { StateFactory } from "@fluidframework/presence/alpha";

const testWorkspaceName = "name:testWorkspaceA";

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function createLatestMapManager(
	presence: Presence,
	valueControlSettings?: BroadcastControlSettings,
) {
	const states = presence.states.getWorkspace(testWorkspaceName, {
		fixedMap: StateFactory.latestMap(
			{ key1: { x: 0, y: 0 }, key2: { ref: "default", someId: 0 } },
			valueControlSettings,
		),
	});
	return states.props.fixedMap;
}

describe("Presence", () => {
	describe("LatestMap", () => {
		/**
		 * See {@link checkCompiles} below
		 */
		it("API use compiles", () => {});

		addControlsTests(createLatestMapManager);

		function setupMapValueManager(): LatestMap<
			{
				x: number;
				y: number;
			},
			string
		> {
			const presence = createPresenceManager(new MockEphemeralRuntime());
			const states = presence.states.getWorkspace(testWorkspaceName, {
				fixedMap: StateFactory.latestMap({ key1: { x: 0, y: 0 } }),
			});
			return states.props.fixedMap;
		}

		it("localItemUpdated event is fired with new value when local value is updated", () => {
			// Setup
			const mapVM = setupMapValueManager();

			let localUpdateCount = 0;
			mapVM.events.on("localItemUpdated", (update) => {
				localUpdateCount++;
				assert.strictEqual(update.key, "key1");
				assert.deepStrictEqual(update.value, { x: 1, y: 2 });
			});

			// Act & Verify
			mapVM.local.set("key1", { x: 1, y: 2 });
			assert.strictEqual(localUpdateCount, 1);
		});

		it("localItemRemoved event is fired with new value when local value is deleted", () => {
			// Setup
			const mapVM = setupMapValueManager();

			let localRemovalCount = 0;
			mapVM.events.on("localItemRemoved", (update) => {
				localRemovalCount++;
				assert.strictEqual(update.key, "key1");
			});

			// Act & Verify
			mapVM.local.delete("key1");
			assert.strictEqual(localRemovalCount, 1);
		});

		it(".presence provides Presence it was created under", () => {
			const presence = createPresenceManager(new MockEphemeralRuntime());
			const states = presence.states.getWorkspace(testWorkspaceName, {
				fixedMap: StateFactory.latestMap({ key1: { x: 0, y: 0 } }),
			});

			assert.strictEqual(states.props.fixedMap.presence, presence);
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
	const statesWorkspace = presence.states.getWorkspace(
		"name:testStatesWorkspaceWithLatestMap",
		{
			fixedMap: StateFactory.latestMap({
				key1: { x: 0, y: 0 },
				key2: { ref: "default", someId: 0 },
			}),
		},
	);
	// Workaround ts(2775): Assertions require every name in the call target to be declared with an explicit type annotation.
	const workspace: typeof statesWorkspace = statesWorkspace;
	const props = workspace.props;

	props.fixedMap.local.get("key1");
	// @ts-expect-error with inferred keys only those named it init are accessible
	props.fixedMap.local.get("key3");

	props.fixedMap.local.set("key2", { x: 0, y: 2 });
	props.fixedMap.local.set("key2", { ref: "string", someId: -1 });
	// @ts-expect-error with inferred type `undefined` optional values are errors
	props.fixedMap.local.set("key2", { x: undefined, y: undefined, ref: "string", someId: -1 });
	// @ts-expect-error with inferred type partial values are errors
	props.fixedMap.local.set("key2", { x: 0 });
	// @ts-expect-error with inferred heterogenous type mixed type values are errors
	props.fixedMap.local.set("key2", { x: 0, y: 2, ref: "a", someId: 3 });

	for (const key of props.fixedMap.local.keys()) {
		const value = props.fixedMap.local.get(key);
		console.log(key, value);
	}

	interface PointerData {
		x: number;
		y: number;
		pressure?: number;
		tilt?: number;
	}

	workspace.add("pointers", StateFactory.latestMap<PointerData>({}));

	const pointers = workspace.props.pointers;
	const localPointers = pointers.local;

	function logClientValue<T>({
		attendee,
		key,
		value,
	}: Pick<
		LatestMapItemUpdatedClientData<T, string | number>,
		"attendee" | "key" | "value"
	>): void {
		console.log(attendee.attendeeId, key, value);
	}

	localPointers.set("pen", { x: 1, y: 2 });

	const pointerItemUpdatedOff = pointers.events.on("remoteItemUpdated", logClientValue);
	pointerItemUpdatedOff();

	for (const attendee of pointers.getStateAttendees()) {
		const items = pointers.getRemote(attendee);
		for (const [key, { value }] of items.entries()) {
			logClientValue({ attendee, key, value });
		}
	}

	for (const { attendee, items } of pointers.getRemotes()) {
		for (const [key, { value }] of items.entries()) logClientValue({ attendee, key, value });
	}

	pointers.events.on("remoteItemRemoved", ({ attendee, key }) =>
		logClientValue<string>({ attendee, key, value: "<removed>" }),
	);

	pointers.events.on("remoteUpdated", ({ attendee, items }) => {
		for (const [key, { value }] of items.entries()) logClientValue({ attendee, key, value });
	});
}
