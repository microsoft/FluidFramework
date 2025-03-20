/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { isFluidHandle } from "@fluidframework/runtime-utils/internal";

import { RemoteFluidObjectHandle } from "../remoteObjectHandle.js";
import { FluidSerializer } from "../serializer.js";
import { makeHandlesSerializable, parseHandles } from "../utils.js";

import { MockHandleContext, makeJson } from "./utils.js";

describe("FluidSerializer", () => {
	function printHandle(target: unknown): string {
		return JSON.stringify(target, (key, value) => {
			// eslint-disable-next-line @typescript-eslint/no-unsafe-return
			return isFluidHandle(value) ? "#HANDLE" : value;
		});
	}

	function createNestedCases(testCases: unknown[]): unknown[] {
		testCases.push(
			// Add an object where each field references one of the JSON serializable types.
			// eslint-disable-next-line unicorn/no-array-reduce -- Not sure how to refactor this correctly
			testCases.reduce<object>((o, value, index) => {
				o[`f${index}`] = value;
				return o;
			}, {}),
			// Add an array that contains each of our constructed test cases.
			[...testCases],
		);

		return testCases;
	}

	describe("vanilla JSON", () => {
		const context = new MockHandleContext();
		const serializer = new FluidSerializer(context);
		const handle = new RemoteFluidObjectHandle("/root", context);

		// Start with the various JSON-serializable types.  A mix of "truthy" and "falsy" values
		// are of particular interest.
		// eslint-disable-next-line unicorn/no-null -- Explicitly testing null.
		const simple = createNestedCases([false, true, 0, 1, "", "x", null, [], {}]);

		simple.push(
			// Add an object where each field references one of the JSON serializable types.
			// eslint-disable-next-line unicorn/no-array-reduce -- Not sure how to refactor this correctly
			simple.reduce<object>((o, value, index) => {
				o[`f${index}`] = value;
				return o;
			}, {}),
			// Add an array that contains each of our constructed test cases.
			[...simple],
		);

		// Verify that `encode` is a no-op for these simple cases.
		for (const input of simple) {
			it(`${printHandle(input)} -> ${JSON.stringify(input)}`, () => {
				const actual = serializer.encode(input, handle);
				assert.strictEqual(
					actual,
					input,
					"encode() on input with no handles must return original input.",
				);

				const decoded = serializer.decode(actual);
				assert.strictEqual(
					decoded,
					input,
					"decode() on input with no handles must return original input.",
				);
				assert.deepStrictEqual(
					decoded,
					input,
					"input must round-trip through decode(encode()).",
				);

				const stringified = serializer.stringify(input, handle);
				// Paranoid check that serializer.stringify() and JSON.stringify() agree.
				assert.deepStrictEqual(
					stringified,
					JSON.stringify(input),
					"stringify() of input without handles must produce same result as JSON.stringify().",
				);

				const parsed = serializer.parse(stringified);
				assert.deepStrictEqual(
					parsed,
					input,
					"input must round-trip through parse(stringify()).",
				);

				// Paranoid check that serializer.parse() and JSON.parse() agree.
				assert.deepStrictEqual(
					parsed,
					JSON.parse(stringified),
					"parse() of input without handles must produce same result as JSON.parse().",
				);
			});
		}

		// Non-finite numbers are coerced to null.  Date is coerced to string.
		const tricky = createNestedCases([
			Number.NEGATIVE_INFINITY,
			Number.NaN,
			+Number.POSITIVE_INFINITY,
			new Date(),
		]);

		// Undefined is extra special in that it can't appear at the root, but can appear
		// embedded in the tree, in which case the key is elided (if an object) or it is
		// coerced to null (if in an array).
		tricky.push({ u: undefined }, [undefined]);

		for (const input of tricky) {
			it(`${printHandle(input)} -> ${JSON.stringify(input)}`, () => {
				const actual = serializer.encode(input, handle);
				assert.strictEqual(
					actual,
					input,
					"encode() on input with no handles must return original input.",
				);

				const decoded = serializer.decode(actual);
				assert.strictEqual(
					decoded,
					input,
					"decode() on input with no handles must return original input.",
				);
				assert.deepStrictEqual(
					decoded,
					input,
					"input must round-trip through decode(encode()).",
				);

				const stringified = serializer.stringify(input, handle);
				// Check that serializer.stringify() and JSON.stringify() agree.
				assert.deepStrictEqual(
					stringified,
					JSON.stringify(input),
					"stringify() of input without handles must produce same result as JSON.stringify().",
				);

				const parsed = serializer.parse(stringified);
				// Check that serializer.parse() and JSON.parse() agree.
				assert.deepStrictEqual(
					parsed,
					JSON.parse(stringified),
					"parse() of input without handles must produce same result as JSON.parse().",
				);
			});
		}

		// Undefined is extra special in that it can't be stringified at the root of the tree.
		it("'undefined' must round-trip through decode(replaceHandes(...))", () => {
			assert.strictEqual(serializer.encode(undefined, handle), undefined);
			assert.strictEqual(serializer.decode(undefined), undefined);
		});
	});

	describe("JSON w/embedded handles", () => {
		const context = new MockHandleContext();
		const serializer = new FluidSerializer(context);
		const handle = new RemoteFluidObjectHandle("/root", context);
		const serializedHandle = {
			type: "__fluid_handle__",
			url: "/root",
		};

		function check(decodedForm, encodedForm): void {
			it(`${printHandle(decodedForm)} -> ${JSON.stringify(encodedForm)}`, () => {
				const replaced = serializer.encode(decodedForm, handle);
				assert.notStrictEqual(
					replaced,
					decodedForm,
					"encode() must shallow-clone rather than mutate original object.",
				);
				assert.deepStrictEqual(replaced, encodedForm, "encode() must return expected output.");

				const replacedTwice = serializer.encode(replaced, handle);
				assert.deepStrictEqual(replacedTwice, replaced, "encode should be idempotent");

				const decodedRoundTrip = serializer.decode(replaced);
				assert.notStrictEqual(
					decodedRoundTrip,
					decodedForm,
					"decode() must shallow-clone rather than mutate original object.",
				);
				assert.deepStrictEqual(
					decodedRoundTrip,
					decodedForm,
					"input must round-trip through encode()/decode().",
				);

				const decodedTwice = serializer.decode(decodedRoundTrip);
				assert.deepStrictEqual(decodedTwice, decodedRoundTrip, "decode should be idempotent");

				const stringified = serializer.stringify(decodedForm, handle);

				// Note that we're using JSON.parse() in this test, so the handles remained serialized.
				assert.deepStrictEqual(
					JSON.parse(stringified),
					encodedForm,
					"Round-trip through stringify()/JSON.parse() must produce the same output as encode()",
				);

				const parsed = serializer.parse(stringified);
				assert.deepStrictEqual(
					parsed,
					decodedForm,
					"input must round-trip through stringify()/parse().",
				);
			});
		}

		check(handle, serializedHandle);
		check([handle], [serializedHandle]);
		check({ handle }, { handle: serializedHandle });
		check(
			[{ handle }, { handle }],
			[{ handle: serializedHandle }, { handle: serializedHandle }],
		);

		it(`sizable json tree`, () => {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any -- The test works on funky objects
			const input: any = makeJson(
				/* breadth: */ 4,
				/* depth: */ 4,
				/* createLeaf: */ () => ({
					a: 0,
					b: handle,
					c: [handle, handle],
					d: false,
					e: handle,
				}),
			);

			// Add some handles to intermediate objects.
			input.h = handle; // eslint-disable-line @typescript-eslint/no-unsafe-member-access
			input.o1.h = handle; // eslint-disable-line @typescript-eslint/no-unsafe-member-access

			const replaced = serializer.encode(input, handle);
			assert.notStrictEqual(
				replaced,
				input,
				"encode() must shallow-clone rather than mutate original object.",
			);

			const decoded = serializer.decode(replaced);
			assert.notStrictEqual(
				decoded,
				input,
				"decode() must shallow-clone rather than mutate original object.",
			);
			assert.deepStrictEqual(
				decoded,
				input,
				"input must round-trip through encode()/decode().",
			);

			const stringified = serializer.stringify(input, handle);
			const parsed = serializer.parse(stringified);
			assert.deepStrictEqual(
				parsed,
				input,
				"input must round-trip through stringify()/parse().",
			);
		});
	});

	describe("Parse handles with absolute / relative paths", () => {
		const rootContext = new MockHandleContext("");
		const dsContext = new MockHandleContext("/default", rootContext);
		// Create serialized with a handle context whose parent is a root handle context.
		const serializer = new FluidSerializer(dsContext);

		it("can parse handles with absolute path", () => {
			const serializedHandle = JSON.stringify({
				type: "__fluid_handle__",
				url: "/default/sharedDDS", // absolute path
			});

			// Parse a handle whose url is absolute path.
			const parsedHandle: RemoteFluidObjectHandle = serializer.parse(
				serializedHandle,
			) as RemoteFluidObjectHandle;
			assert.strictEqual(
				parsedHandle.absolutePath,
				"/default/sharedDDS",
				"Incorrect absolute path in parsed handle",
			);
			assert.strictEqual(
				parsedHandle.routeContext.absolutePath,
				"",
				"Parsed handle's route context should be the root context",
			);
		});

		it("can parse handles with relative path", () => {
			const serializedHandle = JSON.stringify({
				type: "__fluid_handle__",
				url: "sharedDDS", // relative path
			});

			// Parse a handle whose url is a path relative to its route context. The serializer will generate absolute
			// path for the handle and create a handle with it.
			const parsedHandle: RemoteFluidObjectHandle = serializer.parse(
				serializedHandle,
			) as RemoteFluidObjectHandle;
			assert.strictEqual(
				parsedHandle.absolutePath,
				"/default/sharedDDS",
				"Incorrect absolute path in parsed handle",
			);
			assert.strictEqual(
				parsedHandle.routeContext.absolutePath,
				"",
				"Parsed handle's route context should be the root context",
			);
		});
	});

	describe("Utils", () => {
		const serializer = new FluidSerializer(new MockHandleContext());
		it("makeSerializable is idempotent", () => {
			const bind = new RemoteFluidObjectHandle("/", new MockHandleContext());
			const handle = new RemoteFluidObjectHandle("/okay", new MockHandleContext());
			const input = { x: handle, y: 123 };
			const serializedOnce = makeHandlesSerializable(input, serializer, bind) as {
				x: { type: "__fluid_handle__" };
			};
			assert(
				serializedOnce.x.type === "__fluid_handle__",
				"Serialized handle should be a handle",
			);
			const serializedTwice = makeHandlesSerializable(serializedOnce, serializer, bind) as {
				x: { type: "__fluid_handle__" };
			};
			assert(
				serializedTwice.x.type === "__fluid_handle__",
				"Twice-Serialized handle should be a handle",
			);
		});
		it("parseHandles is idempotent", () => {
			const serializedHandle = {
				type: "__fluid_handle__",
				url: "/root",
			};
			const input = { x: serializedHandle, y: 123 };
			const parsedOnce = parseHandles(input, serializer) as { x: RemoteFluidObjectHandle };
			assert(
				parsedOnce.x instanceof RemoteFluidObjectHandle,
				"Parsed handle should be an instance of RemoteFluidObjectHandle",
			);
			const parsedTwice = parseHandles(parsedOnce, serializer) as {
				x: RemoteFluidObjectHandle;
			};
			assert(
				parsedTwice.x instanceof RemoteFluidObjectHandle,
				"Twice-Parsed handle should be an instance of RemoteFluidObjectHandle",
			);
		});
	});
});
