/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { MockFluidDataStoreRuntime } from "@fluidframework/test-runtime-utils";
import { ISharedMap, SharedMap, MapFactory } from "@fluidframework/map";
import { IFluidDataStoreContext } from "@fluidframework/runtime-definitions";
import { createSharedMapWithInterception } from "../map/index.js";

describe("Shared Map with Interception", () => {
	describe("Simple User Attribution", () => {
		/**
		 * The following tests test simple user attribution in SharedMap with interception.
		 * In the callback function of the SharedMap with inteception, it sets the user
		 * attribution information in the underlying SharedMap against <key>.attribution.
		 */
		const userAttributes = { userId: "Fake User" };
		const documentId = "fakeId";
		const attributionKey = (key: string) => `${key}.attribution`;
		let sharedMap: ISharedMap;
		let dataStoreContext: IFluidDataStoreContext;

		function orderSequentially(callback: () => void): void {
			callback();
		}

		function interceptionCb(map: ISharedMap, key: string, value: any): void {
			map.set(attributionKey(key), userAttributes);
		}

		beforeEach(() => {
			const dataStoreRuntime = new MockFluidDataStoreRuntime();
			sharedMap = new SharedMap(documentId, dataStoreRuntime, MapFactory.Attributes);

			// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
			dataStoreContext = {
				containerRuntime: { orderSequentially },
			} as IFluidDataStoreContext;
		});

		// Verifies that the props are stored correctly in the given map under a key derived from the
		// given key - under attributionKey(key).
		function verifyMapAttribution(map: ISharedMap, key: string, value: string, props?: any) {
			assert.equal(
				map.get(key),
				value,
				"The retrieved value should match the value that was set",
			);

			if (props === undefined) {
				assert.equal(
					map.get(attributionKey(key)),
					undefined,
					"The user attributes should not exist because there was no interception",
				);
			} else {
				assert.deepEqual(
					map.get(attributionKey(key)),
					props,
					"The user attributes set via the interception callback should exist.",
				);
			}
		}

		it("should be able to intercept SharedMap set method in the wrapper", async () => {
			const sharedMapWithInterception = createSharedMapWithInterception(
				sharedMap,
				dataStoreContext,
				interceptionCb,
			);
			const key: string = "color";
			const value: string = "green";
			sharedMapWithInterception.set(key, value);
			verifyMapAttribution(sharedMapWithInterception, key, value, userAttributes);
		});

		it("should be able to see changes made by the wrapper from the underlying shared map", async () => {
			const sharedMapWithInterception = createSharedMapWithInterception(
				sharedMap,
				dataStoreContext,
				interceptionCb,
			);
			const key: string = "style";
			const value: string = "bold";
			sharedMapWithInterception.set(key, value);
			verifyMapAttribution(sharedMap, key, value, userAttributes);
		});

		it("should be able to see changes made by the underlying shared map from the wrapper", async () => {
			const sharedMapWithInterception = createSharedMapWithInterception(
				sharedMap,
				dataStoreContext,
				interceptionCb,
			);
			const key: string = "font";
			const value: string = "Arial";
			sharedMap.set(key, value);
			verifyMapAttribution(sharedMapWithInterception, key, value);
		});

		/**
		 * This test calls set on the wrapper from the interception callback which will cause an infinite
		 * recursion. Verify that the wrapper detects this and asserts.
		 * Also, verify that the object is not unusable after the assert.
		 */
		it("should assert if set is called on the wrapper from the callback causing infinite recursion", async () => {
			// eslint-disable-next-line prefer-const
			let sharedMapWithInterception: ISharedMap;

			let useWrapper: boolean = true;
			// If useWrapper above is true, this interception callback that calls a set on the wrapped object
			// causing an infinite recursion.
			// If useWrapper is false, it uses the passed sharedMap which does not cause recursion.
			function recursiveInterceptionCb(map: ISharedMap, key: string, value: any) {
				const localMap = useWrapper ? sharedMapWithInterception : sharedMap;
				localMap.set(attributionKey(key), userAttributes);
			}
			// Create the interception wrapper with a callback that calls set on the wrapper. The set method should
			// throw an assertion as this will cause infinite recursion.
			sharedMapWithInterception = createSharedMapWithInterception(
				sharedMap,
				dataStoreContext,
				recursiveInterceptionCb,
			);

			let asserted: boolean = false;
			try {
				sharedMapWithInterception.set("color", "green");
			} catch (error: any) {
				assert.strictEqual(
					error.message,
					"0x0c0",
					"We should have caught an assert in replaceText because it detects an infinite recursion",
				);
				asserted = true;
			}
			assert.equal(
				asserted,
				true,
				"The set call should have asserted because it detects inifinite recursion",
			);

			// Set useWrapper to false and call set on the wrapper again. Verify that the object is still usable and
			// we do not get an assert anymore.
			useWrapper = false;
			const colorKey: string = "color";
			const colorValue: string = "red";
			sharedMapWithInterception.set(colorKey, colorValue);
			verifyMapAttribution(sharedMapWithInterception, colorKey, colorValue, userAttributes);
		});
	});
});
