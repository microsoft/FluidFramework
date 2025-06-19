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
	LatestMapRaw,
	LatestMapItemUpdatedClientData,
	Presence,
	RawValueAccessor,
	LatestMap,
} from "@fluidframework/presence/beta";
import { StateFactory } from "@fluidframework/presence/beta";

const testWorkspaceName = "name:testWorkspaceA";

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function createLatestMapManager(
	presence: Presence,
	valueControlSettings?: BroadcastControlSettings,
) {
	const workspace = presence.states.getWorkspace(testWorkspaceName, {
		fixedMap: StateFactory.latestMap({
			local: { key1: { x: 0, y: 0 }, key2: { ref: "default", someId: 0 } },
			settings: valueControlSettings,
		}),
	});
	return workspace.states.fixedMap;
}

describe("Presence", () => {
	describe("LatestMap", () => {
		/**
		 * See {@link checkCompiles} below
		 */
		it("API use compiles", () => {});

		addControlsTests(createLatestMapManager);

		function setupMapValueManager(): LatestMapRaw<
			{
				x: number;
				y: number;
			},
			string
		> {
			const presence = createPresenceManager(new MockEphemeralRuntime());
			const workspace = presence.states.getWorkspace(testWorkspaceName, {
				fixedMap: StateFactory.latestMap({ local: { key1: { x: 0, y: 0 } } }),
			});
			return workspace.states.fixedMap;
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
			const workspace = presence.states.getWorkspace(testWorkspaceName, {
				fixedMap: StateFactory.latestMap({ local: { key1: { x: 0, y: 0 } } }),
			});

			assert.strictEqual(workspace.states.fixedMap.presence, presence);
		});
	});
});

// ---- test (example) code ----

type TestMapData =
	| { x: number; y: number; ref?: never; someId?: never }
	| { ref: string; someId: number; x?: never; y?: never };

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
				local: {
					key1: { x: 0, y: 0 },
					key2: { ref: "default", someId: 0 },
				},
			}),
			validatedMap: StateFactory.latestMap({
				local: {
					key1: { x: 0, y: 0 },
					key2: { ref: "default", someId: 0 },
				},
				validator: (data) => data as TestMapData,
			}),
		},
	);
	// Workaround ts(2775): Assertions require every name in the call target to be declared with an explicit type annotation.
	const workspace: typeof statesWorkspace = statesWorkspace;
	const props = workspace.states;

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

	assertIdenticalTypes(
		props.validatedMap,
		createInstanceOf<LatestMap<TestMapData, "key1" | "key2">>(),
	);

	assertIdenticalTypes(
		props.fixedMap,
		createInstanceOf<LatestMapRaw<TestMapData, "key1" | "key2">>(),
	);

	// Get a reference to one of the remote attendees
	// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
	const attendee2 = [...props.validatedMap.getStateAttendees()].find(
		(attendee) => attendee !== presence.attendees.getMyself(),
	)!;

	// Get a remote validated value
	const latestMapData = props.validatedMap.getRemote(attendee2);

	// Get a value from the validated map
	const keyValue = latestMapData.get("key2");
	if (keyValue === undefined) {
		throw new Error("'key2' not found in LatestMap");
	}

	const validatedKeyValue = keyValue.value;

	// @ts-expect-error because validatedKeyValue is an accessor, not a value
	// Type '() =>
	// { readonly x: number; readonly y: number; readonly ref?: never; readonly someId?: never; } | { readonly ref:
	// string; readonly someId: number; readonly x?: never; readonly y?: never; } | undefined'
	// is not assignable to type 'TestMapData | undefined'.
	assertIdenticalTypes(validatedKeyValue, createInstanceOf<TestMapData | undefined>());

	// The key value should be a function that returns a value.
	const validatedValue: TestMapData | undefined = validatedKeyValue?.();

	if (validatedValue === undefined) {
		throw new Error("Value is not valid according to the validator function.");
	}
	logClientValue({ attendee: attendee2, key: "key2", value: validatedValue });

	// ----------------------------------
	// pointers data

	interface PointerData {
		x: number;
		y: number;
		pressure?: number;
		tilt?: number;
	}

	workspace.add("pointers", StateFactory.latestMap<PointerData>({ local: {} }));

	const pointers = workspace.states.pointers;
	const localPointers = pointers.local;

	function logClientValue<T>({
		attendee,
		key,
		value,
	}: Pick<
		LatestMapItemUpdatedClientData<T, string | number, RawValueAccessor<T>>,
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
		for (const [key, { value }] of items.entries()) {
			logClientValue({ attendee, key, value });
		}
	}

	pointers.events.on("remoteItemRemoved", ({ attendee, key }) =>
		logClientValue<string>({ attendee, key, value: "<removed>" }),
	);

	pointers.events.on("remoteUpdated", ({ attendee, items }) => {
		for (const [key, { value }] of items.entries()) {
			logClientValue({ attendee, key, value });
		}
	});

	// ----------------------------------
	// primitive and null value support

	workspace.add(
		"primitiveMap",
		StateFactory.latestMap({
			local: {
				// eslint-disable-next-line unicorn/no-null
				null: null,
				string: "string",
				number: 0,
				boolean: true,
			},
		}),
	);

	const localPrimitiveMap = workspace.states.primitiveMap.local;

	// map value types are not matched to specific key
	localPrimitiveMap.set("string", 1);
	// latestMap should infer that `true` or `false` is a valid value
	// without use of `true as const` or explicit specification.
	// That happened under PR #24752 unexpectedly. Presumably from some
	// additional inference complication where `& JsonDeserialized<T>`
	// was used in `LatestMapArguments` that was relaxed in PR #247??. !!! <- to fill in
	// Caller can always use explicit generic specification to be
	// completely clear about the types.
	localPrimitiveMap.set("number", false);
	// eslint-disable-next-line unicorn/no-null
	localPrimitiveMap.set("boolean", null);
	localPrimitiveMap.set("null", "null");

	// @ts-expect-error with inferred keys only those named in init are accessible
	localPrimitiveMap.set("key3", "value");
	// @ts-expect-error value of type value is not assignable
	localPrimitiveMap.set("null", { value: "value" });
}
