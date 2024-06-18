/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { PropertySet } from "@fluidframework/merge-tree/internal";
import { IFluidDataStoreContext } from "@fluidframework/runtime-definitions/internal";
import { SharedString } from "@fluidframework/sequence/internal";
import { MockFluidDataStoreRuntime } from "@fluidframework/test-runtime-utils/internal";

import { createSharedStringWithInterception } from "../sequence/index.js";

describe("Shared String with Interception", () => {
	/**
	 * The following tests test simple user attribution in SharedString with interception.
	 * In the callback function of the SharedString with interception, it adds the user
	 * information to the passed properties and returns it.
	 */
	describe("Simple User Attribution", () => {
		const userAttributes = { userId: "Fake User" };
		const documentId = "fakeId";
		let sharedString: SharedString;
		let dataStoreContext: IFluidDataStoreContext;

		function orderSequentially(callback: () => void): void {
			callback();
		}

		// Interception function that adds userProps to the passed props and returns.
		function propertyInterceptionCb(props?: PropertySet): PropertySet {
			const newProps = { ...props, ...userAttributes };
			return newProps;
		}

		// Function that verifies that the given shared string has correct value and the right properties at
		// the given position.
		function verifyString(
			ss: SharedString,
			text: string,
			props: PropertySet,
			position: number,
		) {
			assert.equal(ss.getText(), text, "The retrieved text should match the inserted text");
			assert.deepEqual(
				{ ...ss.getPropertiesAtPosition(position) },
				{ ...props },
				"The properties set via the interception callback should exist",
			);
		}

		beforeEach(() => {
			const dataStoreRuntime = new MockFluidDataStoreRuntime({
				registry: [SharedString.getFactory()],
			});
			sharedString = SharedString.create(dataStoreRuntime, documentId);

			// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
			dataStoreContext = {
				containerRuntime: { orderSequentially },
			} as IFluidDataStoreContext;
		});

		it("should be able to intercept SharedString methods by the wrapper", async () => {
			const sharedStringWithInterception = createSharedStringWithInterception(
				sharedString,
				dataStoreContext,
				propertyInterceptionCb,
			);

			// Insert text into shared string.
			let text: string = "123";
			let syleProps: PropertySet = { style: "bold" };
			sharedStringWithInterception.insertText(0, text, syleProps);
			verifyString(sharedStringWithInterception, text, { ...syleProps, ...userAttributes }, 2);

			// Replace text in the shared string.
			text = "aaa";
			syleProps = { style: "italics " };
			sharedStringWithInterception.replaceText(2, 3, "aaa", syleProps);
			verifyString(
				sharedStringWithInterception,
				"12aaa",
				{ ...syleProps, ...userAttributes },
				2,
			);

			// Annotate the shared string.
			const colorProps = { color: "green" };
			sharedStringWithInterception.annotateRange(0, 5, colorProps);
			verifyString(
				sharedStringWithInterception,
				"12aaa",
				{ ...syleProps, ...colorProps, ...userAttributes },
				2,
			);
		});

		it("should be able to see changes made by the wrapper from the underlying shared string", async () => {
			const sharedStringWithInterception = createSharedStringWithInterception(
				sharedString,
				dataStoreContext,
				propertyInterceptionCb,
			);

			// Insert text via the shared string with interception wrapper.
			let text: string = "123";
			let syleProps: PropertySet = { style: "bold" };
			sharedStringWithInterception.insertText(0, text, syleProps);
			// Verify the text and properties via the underlying shared string.
			verifyString(sharedString, text, { ...syleProps, ...userAttributes }, 2);

			// Replace text via the shared string with interception wrapper.
			text = "aaa";
			syleProps = { style: "italics " };
			sharedStringWithInterception.replaceText(2, 3, "aaa", syleProps);
			// Verify the text and properties via the underlying shared string.
			verifyString(sharedString, "12aaa", { ...syleProps, ...userAttributes }, 2);

			// Annotate the shared string.
			const colorProps = { color: "green" };
			sharedStringWithInterception.annotateRange(0, 5, colorProps);
			// Verify the text and properties via the underlying shared string.
			verifyString(
				sharedString,
				"12aaa",
				{ ...syleProps, ...colorProps, ...userAttributes },
				2,
			);
		});

		it("should be able to see changes made by the underlying shared string from the wrapper", async () => {
			const sharedStringWithInterception = createSharedStringWithInterception(
				sharedString,
				dataStoreContext,
				propertyInterceptionCb,
			);

			// Insert text via the underlying shared string.
			let text: string = "123";
			let syleProps: PropertySet = { style: "bold" };
			sharedString.insertText(0, text, syleProps);
			// Verify the text and properties via the interception wrapper. It should not have the user attributes.
			verifyString(sharedStringWithInterception, text, syleProps, 2);

			// Replace text via the underlying shared string.
			text = "aaa";
			syleProps = { style: "italics " };
			sharedString.replaceText(2, 3, "aaa", syleProps);
			// Verify the text and properties via the interception wrapper. It should not have the user attributes.
			verifyString(sharedStringWithInterception, "12aaa", syleProps, 2);

			// Annotate the shared string via the underlying shared string.
			const colorProps = { color: "green" };
			sharedString.annotateRange(0, 5, colorProps);
			// Verify the text and properties via the interception wrapper. It should not have the user attributes.
			verifyString(sharedStringWithInterception, "12aaa", { ...syleProps, ...colorProps }, 2);
		});

		/**
		 * This test calls a method on the wrapper from the interception callback which will cause an infinite
		 * recursion. Verify that the wrapper detects this and asserts.
		 * Also, verify that the object is not unusable after the assert.
		 */
		it("should assert if a wrapper method is called from the callback causing infinite recursion", async () => {
			// eslint-disable-next-line prefer-const
			let sharedStringWithInterception: SharedString;

			const propsInRecursiveCb = { fromRecursiveCb: "true" };
			let useWrapper: boolean = true;
			// If useWrapper above is true, this interception callback calls a method on the wrapped object
			// causing an infinite recursion.
			// If useWrapper is false, it uses the passed shared string which does not cause recursion.
			function recursiveInterceptionCb(properties?: PropertySet) {
				const ss = useWrapper ? sharedStringWithInterception : sharedString;
				ss.annotateRange(0, 1, propsInRecursiveCb);
				return { ...properties, ...userAttributes };
			}

			// Create the interception wrapper with the above callback. The set method should throw an assertion as this
			// will cause infinite recursion.
			sharedStringWithInterception = createSharedStringWithInterception(
				sharedString,
				dataStoreContext,
				recursiveInterceptionCb,
			);

			let text: string = "123";
			const props: PropertySet = { style: "bold" };
			// First, insert text via the unwrapped shared string so that we have something to annotate in the
			// recursiveInterceptionCb.
			sharedString.insertText(0, text, props);

			let asserted: boolean = false;
			try {
				text = "abc";
				// Try to replace text.
				sharedStringWithInterception.replaceText(1, 2, text);
			} catch (error: any) {
				assert.strictEqual(
					error.message,
					"0x0c8",
					"We should have caught an assert in replaceText because it detects an infinite recursion",
				);
				asserted = true;
			}
			assert.equal(
				asserted,
				true,
				"replaceText should have asserted because it detects inifinite recursion",
			);

			// Verify that the object is still usable:
			// Set useWrapper to false and call replacetext on the wrapper again. Verify that we do not get an assert.
			useWrapper = false;
			text = "test";
			sharedStringWithInterception.replaceText(2, 3, text, props);
			verifyString(sharedStringWithInterception, "12test", { ...props, ...userAttributes }, 2);

			// Verify that the annotate on position 0 in the recursiveInterceptionCb annotated the attributes.
			verifyString(
				sharedStringWithInterception,
				"12test",
				{ ...props, ...propsInRecursiveCb },
				0,
			);
		});
	});
});
