/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { RemoteFluidObjectHandle } from "../remoteObjectHandle";
import { FluidSerializer } from "../serializer";
import {
    makeJson,
    MockHandleContext,
} from "./utils";

describe("FluidSerializer", () => {
    // eslint-disable-next-line prefer-arrow/prefer-arrow-functions
    function printHandle(target: any) {
        return JSON.stringify(target, (key, value) => {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-return
            return value?.IFluidHandle !== undefined
                ? "#HANDLE"
                : value;
        });
    }

    describe("vanilla JSON", () => {
        const context = new MockHandleContext();
        const serializer = new FluidSerializer(context);
        const handle = new RemoteFluidObjectHandle("/root", context);

        // Start with the various JSON-serializable types
        // eslint-disable-next-line no-null/no-null
        const simple = [true, 1, "x", null, [], {}];
        // Add an object where each field references one of the JSON serializable types.
        simple.push(
            simple.reduce<any>(
                (o, value, index) => {
                    o[`f${index}`] = value;
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
                    return o;
                },
                {}));
        // Add an array that contains each of our constructed test cases.
        simple.push([...simple]);

        // Verify that `replaceHandles` is a no-op for these simple cases.
        for (const input of simple) {
            it(`${printHandle(input)} -> ${JSON.stringify(input)}`, () => {
                const actual = serializer.replaceHandles(input, handle);
                assert.strictEqual(actual, input,
                    "replaceHandles() on input with no handles must return original input.");

                const stringified = serializer.stringify(input, handle);
                const parsed = serializer.parse(stringified);
                assert.deepStrictEqual(parsed, input,
                    "input must round-trip through stringify()/parse().");

                // Paranoid check that serializer.parse() and JSON.parse() agree.
                assert.deepStrictEqual(parsed, JSON.parse(stringified),
                    "parse() of input without handles must produce same result as JSON.parse().");
            });
        }

        it("replaceHandles() must round-trip undefined", () => {
            assert.strictEqual(serializer.replaceHandles(undefined, handle), undefined);
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

        function check(input, expected) {
            it(`${printHandle(input)} -> ${JSON.stringify(expected)}`, () => {
                const replaced = serializer.replaceHandles(input, handle);
                assert.notStrictEqual(replaced, input,
                    "replaceHandles() must shallow-clone rather than mutate original object.");
                assert.deepStrictEqual(replaced, expected,
                    "replaceHandles() must return expected output.");

                const stringified = serializer.stringify(input, handle);

                // Note that we're using JSON.parse() in this test, so the handles remained serialized.
                assert.deepStrictEqual(JSON.parse(stringified), expected,
                    "Round-trip through stringify()/JSON.parse() must produce the same output as replaceHandles()");

                const parsed = serializer.parse(stringified);
                assert.deepStrictEqual(parsed, input,
                    "input must round-trip through stringify()/parse().");
            });
        }

        check(handle, serializedHandle);
        check([handle], [serializedHandle]);
        check({ handle }, { handle: serializedHandle });
        check([{ handle }, { handle }], [{ handle: serializedHandle }, { handle: serializedHandle }]);

        it(`sizable json tree`, () => {
            const input: any = makeJson(
                /* breadth: */ 4,
                /* depth: */ 4,
                /* createLeaf: */() => ({ a: 0, b: handle, c: [handle, handle], d: false, e: handle }));

            // Add some handles to intermediate objects.
            input.h = handle;
            input.o1.h = handle;

            const replaced = serializer.replaceHandles(input, handle);
            assert.notStrictEqual(replaced, input,
                "replaceHandles() must shallow-clone rather than mutate original object.");

            const stringified = serializer.stringify(input, handle);
            const parsed = serializer.parse(stringified);
            assert.deepStrictEqual(parsed, input,
                "input must round-trip through stringify()/parse().");
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
            const parsedHandle: RemoteFluidObjectHandle = serializer.parse(serializedHandle);
            assert.strictEqual(
                parsedHandle.absolutePath, "/default/sharedDDS", "Incorrect absolute path in parsed handle");
            assert.strictEqual(
                parsedHandle.routeContext.absolutePath, "", "Parsed handle's route context should be the root context");
        });

        it("can parse handles with relative path", () => {
            const serializedHandle = JSON.stringify({
                type: "__fluid_handle__",
                url: "sharedDDS", // relative path
            });

            // Parse a handle whose url is a path relative to its route context. The serializer will generate absolute
            // path for the handle and create a handle with it.
            const parsedHandle: RemoteFluidObjectHandle = serializer.parse(serializedHandle);
            assert.strictEqual(
                parsedHandle.absolutePath, "/default/sharedDDS", "Incorrect absolute path in parsed handle");
            assert.strictEqual(
                parsedHandle.routeContext.absolutePath, "", "Parsed handle's route context should be the root context");
        });
    });
});
