/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { LatestMapItemValueClientData } from "../index.js";
import { LatestMap } from "../index.js";
import type { IPresence } from "../presence.js";

describe("Presence", () => {
	describe("LatestMapValueManager", () => {
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
	const statesWorkspace = presence.getStates("name:testStatesWorkspaceWithLatestMap", {
		fixedMap: LatestMap({ key1: { x: 0, y: 0 }, key2: { ref: "default", someId: 0 } }),
	});
	// Workaround ts(2775): Assertions require every name in the call target to be declared with an explicit type annotation.
	const map: typeof statesWorkspace = statesWorkspace;

	map.fixedMap.local.get("key1");
	// @ts-expect-error with inferred keys only those named it init are accessible
	map.fixedMap.local.get("key3");

	map.fixedMap.local.set("key2", { x: 0, y: 2 });
	map.fixedMap.local.set("key2", { ref: "string", someId: -1 });
	// @ts-expect-error with inferred type `undefined` optional values are errors
	map.fixedMap.local.set("key2", { x: undefined, y: undefined, ref: "string", someId: -1 });
	// @ts-expect-error with inferred type partial values are errors
	map.fixedMap.local.set("key2", { x: 0 });
	// @ts-expect-error with inferred heterogenous type mixed type values are errors
	map.fixedMap.local.set("key2", { x: 0, y: 2, ref: "a", someId: 3 });

	for (const key of map.fixedMap.local.keys()) {
		const value = map.fixedMap.local.get(key);
		console.log(key, value);
	}

	interface PointerData {
		x: number;
		y: number;
		pressure?: number;
		tilt?: number;
	}

	map.add("pointers", LatestMap<PointerData>({}));

	const pointers = map.pointers;
	const localPointers = pointers.local;

	function logClientValue<T>({
		client,
		key,
		value,
	}: Pick<
		LatestMapItemValueClientData<T, string | number>,
		"client" | "key" | "value"
	>): void {
		console.log(client.sessionId, key, value);
	}

	localPointers.set("pen", { x: 1, y: 2 });

	const pointerItemUpdatedOff = pointers.events.on("itemUpdated", logClientValue);
	pointerItemUpdatedOff();

	for (const client of pointers.clients()) {
		const items = pointers.clientValue(client);
		for (const [key, { value }] of items.entries()) {
			logClientValue({ client, key, value });
		}
	}

	for (const { client, items } of pointers.clientValues()) {
		for (const [key, { value }] of items.entries()) logClientValue({ client, key, value });
	}

	pointers.events.on("itemRemoved", ({ client, key }) =>
		logClientValue<string>({ client, key, value: "<removed>" }),
	);

	pointers.events.on("updated", ({ client, items }) => {
		for (const [key, { value }] of items.entries()) logClientValue({ client, key, value });
	});
}
