/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { ITreeCursor, TreeNavigationResult } from "../forest";
import { EmptyKey, FieldKey, JsonableTree } from "../tree";
import { brand } from "../util";

export const cursorTestCases: [string, JsonableTree][] = [
    ["minimal", { type: brand("Foo") }],
    ["true boolean", { type: brand("Foo"), value: true }],
    ["false boolean", { type: brand("Foo"), value: true }],
    ["integer", { type: brand("Foo"), value: Number.MIN_SAFE_INTEGER - 1 }],
    ["string", { type: brand("Foo"), value: "test" }],
    ["string with escaped characters", { type: brand("Foo"), value: "\\\"\b\f\n\r\t" }],
    ["string with emoticon", { type: brand("Foo"), value: "😀" }],
    ["nested", { type: brand("Foo"), fields: { x: [{ type: brand("Bar") }, { type: brand("Foo"), value: 6 }] } }],
    ["multiple fields", {
        type: brand("Foo"),
        fields: {
            a: [{ type: brand("Bar") }],
            b: [{ type: brand("Baz") }],
        },
    }],
    ["double nested", {
        type: brand("Foo"),
        fields: {
            b: [{
                type: brand("Bar"),
                fields: { c: [{ type: brand("Baz") }] },
            }],
        },
    }],
    ["complex", {
        type: brand("Foo"),
        fields: {
            a: [{ type: brand("Bar") }],
            b: [{
                type: brand("Bar"),
                fields: {
                    c: [{ type: brand("Bar"), value: 6 }],
                },
            }],
        },
    }],
    ["siblings restored on up", {
        type: brand("Foo"),
        fields: {
            X: [
                {
                    type: brand("a"),
                    // Inner node so that when navigating up from it,
                    // The cursor's siblings value needs to be restored.
                    fields: { q: [{ type: brand("b") }] },
                },
                { type: brand("c") },
            ],
        },
    }],
];

/**
 * Tests the provided cursor factory with JsonableTree data. The cursor must be JSON compatible.
 * @param suiteName - The name of the test suite to create.
 * @param factory - Creates the cursor to be tested with or without provided data.
 * @param dataFromCursor - Gets a JsonableTree from the provided cursor.
 */
export function testJsonCompatibleCursor(
    suiteName: string,
    factory: (data: JsonableTree) => ITreeCursor,
    dataFromCursor: (cursor: ITreeCursor) => JsonableTree,
): void {
    describe.only(`${suiteName} cursor implementation`, () => {
        describe("extract roundtrip", () => {
            for (const [name, data] of cursorTestCases) {
                it(`${name}: ${JSON.stringify(data)}`, () => {
                    const cursor = factory(data);
                    const clone = dataFromCursor(cursor);
                    assert.deepEqual(clone, data);
                    // Check objects are actually json compatible
                    const text = JSON.stringify(clone);
                    const parsed = JSON.parse(text);
                    assert.deepEqual(parsed, data);
                });
            }
        });

        it("up from root", () => {
            const cursor = factory({ type: brand("Foo") });
            assert.equal(cursor.up(), TreeNavigationResult.NotFound);
        });

        describe("keys", () => {
            it("object", () => {
                assert.deepEqual([...factory({ type: brand("Foo") }).keys], []);
                assert.deepEqual([...factory({
                    type: brand("Foo"),
                    fields: { x: [{ type: brand("Bar") }] },
                }).keys], ["x"]);
                assert.deepEqual(
                    new Set(factory({
                        type: brand("Foo"),
                        fields: { x: [{ type: brand("Bar") }], test: [{ type: brand("Bar"), value: 6 }] },
                    }).keys),
                    new Set(["x", "test"]),
                );
            });

            it("array", () => {
                // TODO: should empty arrays report this key?
                assert.deepEqual([...factory({ type: brand("Foo"), fields: { [EmptyKey]: [] } }).keys], [EmptyKey]);
                assert.deepEqual(
                    [...factory({
                        type: brand("Foo"),
                        fields: { [EmptyKey]: [{ type: brand("Bar"), value: 0 }] },
                    }).keys],
                    [EmptyKey],
                );
                assert.deepEqual(
                    [...factory({
                        type: brand("Foo"),
                        fields: { [EmptyKey]: [{ type: brand("Bar"), value: "test" }, { type: brand("Bar") }] },
                    }).keys],
                    [EmptyKey],
                );
            });

            it("string", () => {
                assert.deepEqual([...factory({ type: brand("Foo"), value: "" }).keys], []);
                assert.deepEqual([...factory({ type: brand("Foo"), value: "test" }).keys], []);
            });

            it("number", () => {
                assert.deepEqual([...factory({ type: brand("Foo"), value: 0 }).keys], []);
                assert.deepEqual([...factory({ type: brand("Foo"), value: 6.5 }).keys], []);
            });

            it("boolean", () => {
                assert.deepEqual([...factory({ type: brand("Foo"), value: false }).keys], []);
                assert.deepEqual([...factory({ type: brand("Foo"), value: true }).keys], []);
            });
        });

        describe("seek()", () => {
            describe("with map-like node", () => {
                const tests: [string, FieldKey][] = [
                    ["non-empty", brand("key")],
                    ["empty", EmptyKey],
                ];

                tests.forEach(([name, key]) => {
                    it(`permits offset of zero with ${name} map key`, () => {
                        const cursor = factory({
                            type: brand("Foo"),
                            fields: { [key as string]: [{ type: brand("Bar"), value: 0 }] },
                        });
                        assert.equal(cursor.down(key, 0), TreeNavigationResult.Ok);
                        assert.equal(cursor.value, 0);
                        assert.deepEqual(cursor.seek(0), TreeNavigationResult.Ok);
                        assert.equal(cursor.value, 0);
                    });

                    it(`disallows non-zero offset with ${name} map key`, () => {
                        const cursor = factory({
                            type: brand("Foo"),
                            fields: { [key as string]: [{ type: brand("Bar"), value: 0 }] },
                        });
                        assert.equal(cursor.down(key, 0), TreeNavigationResult.Ok);
                        assert.equal(cursor.value, 0);
                        assert.deepEqual(cursor.seek(1), TreeNavigationResult.NotFound);
                        assert.equal(cursor.value, 0);
                        assert.deepEqual(cursor.seek(-1), TreeNavigationResult.NotFound);
                        assert.equal(cursor.value, 0);
                    });
                });
            });

            describe("with array-like node", () => {
                it(`can seek forward`, () => {
                    const cursor = factory({
                        type: brand("Foo"),
                        fields: { [EmptyKey]: [{ type: brand("Bar"), value: 0 }, { type: brand("Bar"), value: 1 }] },
                    });
                    assert.equal(cursor.down(EmptyKey, 0), TreeNavigationResult.Ok);
                    assert.equal(cursor.value, 0);
                    assert.deepEqual(cursor.seek(1), TreeNavigationResult.Ok);
                    assert.equal(cursor.value, 1);
                });

                it(`can seek backward`, () => {
                    const cursor = factory({
                        type: brand("Foo"),
                        fields: { [EmptyKey]: [{ type: brand("Bar"), value: 0 }, { type: brand("Bar"), value: 1 }] },
                    });
                    assert.equal(cursor.down(EmptyKey, 1), TreeNavigationResult.Ok);
                    assert.equal(cursor.value, 1);
                    assert.deepEqual(cursor.seek(-1), TreeNavigationResult.Ok);
                    assert.equal(cursor.value, 0);
                });

                it(`can not seek past end of array`, () => {
                    const cursor = factory({
                        type: brand("Foo"),
                        fields: { [EmptyKey]: [{ type: brand("Bar"), value: 0 }, { type: brand("Bar"), value: 1 }] },
                    });
                    assert.equal(cursor.down(EmptyKey, 1), TreeNavigationResult.Ok);
                    assert.equal(cursor.value, 1);
                    assert.deepEqual(cursor.seek(1), TreeNavigationResult.NotFound);
                    assert.equal(cursor.value, 1);
                });

                it(`can not seek before beginning of array`, () => {
                    const cursor = factory({
                        type: brand("Foo"),
                        fields: { [EmptyKey]: [{ type: brand("Bar"), value: 0 }, { type: brand("Bar"), value: 1 }] },
                    });
                    assert.equal(cursor.down(EmptyKey, 0), TreeNavigationResult.Ok);
                    assert.equal(cursor.value, 0);
                    assert.deepEqual(cursor.seek(-1), TreeNavigationResult.NotFound);
                    assert.equal(cursor.value, 0);
                });
            });
        });

        describe("TreeNavigationResult", () => {
            const notFoundKey: FieldKey = brand("notFound");
            const foundKey: FieldKey = brand("found");

            function expectFound(cursor: ITreeCursor, key: FieldKey, index = 0) {
                assert(0 <= index && index < cursor.length(key),
                    `.length() must include index of existing child '${String(key)}[${index}]'.`);

                assert.equal(cursor.down(key, index), TreeNavigationResult.Ok,
                    `Must navigate to child '${String(key)}[${index}]'.`);
            }

            function expectNotFound(cursor: ITreeCursor, key: FieldKey, index = 0) {
                assert(!(index >= 0) || index >= cursor.length(key),
                    `.length() must exclude index of missing child '${String(key)}[${index}]'.`);

                assert.equal(cursor.down(key, index), TreeNavigationResult.NotFound,
                    `Must return 'NotFound' for missing child '${String(key)}[${index}]'`);
            }

            it("Missing key in map returns NotFound", () => {
                const cursor = factory({
                    type: brand("Foo"),
                    fields: { [foundKey as string]: [{ type: brand("Bar"), value: true }] },
                });
                expectNotFound(cursor, notFoundKey);

                // A failed navigation attempt should leave the cursor in a valid state.  Verify
                // by subsequently moving to an existing key.
                expectFound(cursor, foundKey);
            });

            it("Out of bounds map index returns NotFound", () => {
                const cursor = factory({
                    type: brand("Foo"),
                    fields: { [foundKey as string]: [{ type: brand("Bar"), value: true }] },
                });
                expectNotFound(cursor, foundKey, 1);

                // A failed navigation attempt should leave the cursor in a valid state.  Verify
                // by subsequently moving to an existing key.
                expectFound(cursor, foundKey);
            });

            it("Empty array must not contain 0th item", () => {
                const cursor = factory({ type: brand("Foo"), fields: { [EmptyKey]: [] } });
                expectNotFound(cursor, EmptyKey, 0);
            });

            it("Out of bounds array index returns NotFound", () => {
                const cursor = factory({
                    type: brand("Foo"),
                    fields: { [EmptyKey]: [{ type: brand("Bar"), value: 0 }, { type: brand("Bar"), value: 1 }] },
                });
                expectNotFound(cursor, EmptyKey, -1);
                expectNotFound(cursor, EmptyKey, 2);

                // A failed navigation attempt should leave the cursor in a valid state.  Verify
                // by subsequently moving to an existing key.
                expectFound(cursor, EmptyKey, 1);
            });
        });
    });
}

function traverseNode(cursor: ITreeCursor) {
    // Keep track of current node value to check it during ascent
    const originalNodeValue = cursor.value;

    for (const key of cursor.keys) {
        const expectedKeyLength = cursor.length(key);
        let actualChildNodesTraversed = 0;

        const initialResult = cursor.down(key, 0);
        if (initialResult !== TreeNavigationResult.Ok) {
            break;
        }

        for (
            let result: TreeNavigationResult = initialResult;
            result === TreeNavigationResult.Ok;
            result = cursor.seek(1)
        ) {
            actualChildNodesTraversed++;
            traverseNode(cursor);
        }

        cursor.up();
        assert.equal(cursor.value, originalNodeValue);
        assert.equal(actualChildNodesTraversed, expectedKeyLength, "Could not traverse expected number of children");
    }
}

export function testCursors(
    suiteName: string,
    cursors: { cursorName: string; cursor: ITreeCursor; }[]) {
    describe.only(`${suiteName} cursor functionality`, () => {
        for (const { cursorName, cursor } of cursors) {
            describe(`${cursorName}`, () => {
                it("tree can be traversed", () => {
                    traverseNode(cursor);
                });
            });
        }
    });
}
