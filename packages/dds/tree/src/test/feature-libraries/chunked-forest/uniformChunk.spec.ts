/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { benchmark, BenchmarkType } from "@fluid-tools/benchmark";
import {
    uniformChunk,
    Shape,
    TreeChunk,
    // eslint-disable-next-line import/no-internal-modules
} from "../../../feature-libraries/chunked-forest/uniformChunk";
import { testSpecializedCursor } from "../../cursorTestSuite";
import { jsonArray, jsonNull, jsonNumber, jsonObject } from "../../../domains";
import { brand } from "../../../util";
import {
    EmptyKey,
    ITreeCursorSynchronous,
    JsonableTree,
    TreeSchemaIdentifier,
} from "../../../core";
// eslint-disable-next-line import/no-internal-modules
import { sum } from "../../domains/json/benchmarks";
import {
    jsonableTreeFromCursor,
    mapTreeFromCursor,
    singleMapTreeCursor,
    singleTextCursor,
} from "../../../feature-libraries";

const numberShape = new Shape(jsonNumber.name, 1, true, []);
const number3Shape = new Shape(jsonNumber.name, 3, true, []);
const withChildShape = new Shape(jsonObject.name, 1, false, [[brand("x"), numberShape]]);
const pointShape = new Shape(jsonObject.name, 1, false, [
    [brand("x"), numberShape],
    [brand("y"), numberShape],
]);
const emptyShape = new Shape(jsonNull.name, 1, false, []);

const sides = 100;

const testTrees = [
    {
        name: "number",
        data: uniformChunk(numberShape, [5]),
        reference: [{ type: jsonNumber.name, value: 5 }],
    },
    {
        name: "root sequence",
        data: uniformChunk(number3Shape, [1, 2, 3]),
        reference: [
            { type: jsonNumber.name, value: 1 },
            { type: jsonNumber.name, value: 2 },
            { type: jsonNumber.name, value: 3 },
        ],
    },
    {
        name: "child sequence",
        data: uniformChunk(
            new Shape(jsonArray.name, 1, false, [[EmptyKey, number3Shape]]),
            [1, 2, 3],
        ),
        reference: [
            {
                type: jsonArray.name,
                fields: {
                    [EmptyKey]: [
                        { type: jsonNumber.name, value: 1 },
                        { type: jsonNumber.name, value: 2 },
                        { type: jsonNumber.name, value: 3 },
                    ],
                },
            },
        ],
    },
    {
        name: "withChild",
        data: uniformChunk(withChildShape, [1]),
        reference: [
            {
                type: jsonObject.name,
                fields: {
                    x: [{ type: jsonNumber.name, value: 1 }],
                },
            },
        ],
    },
    {
        name: "point",
        data: uniformChunk(pointShape, [1, 2]),
        reference: [
            {
                type: jsonObject.name,
                fields: {
                    x: [{ type: jsonNumber.name, value: 1 }],
                    y: [{ type: jsonNumber.name, value: 2 }],
                },
            },
        ],
    },
    {
        name: "polygon",
        data: uniformChunk(
            new Shape(jsonArray.name, 1, false, [
                [EmptyKey, pointShape.withNewTopLevelLength(sides)],
            ]),
            new Array(sides * 2).fill(1),
        ),
        reference: [
            {
                type: jsonArray.name,
                fields: {
                    [EmptyKey]: new Array(sides).fill({
                        type: jsonObject.name,
                        fields: {
                            x: [{ type: jsonNumber.name, value: 1 }],
                            y: [{ type: jsonNumber.name, value: 1 }],
                        },
                    }),
                },
            },
        ],
    },
];

// testing is per node, and our data can have multiple nodes at the root, so split tests as needed:
const testData: { name: string; data: [number, TreeChunk]; reference: JsonableTree }[] =
    testTrees.flatMap(({ name, data, reference }) => {
        const out: { name: string; data: [number, TreeChunk]; reference: JsonableTree }[] = [];
        for (let index = 0; index < reference.length; index++) {
            out.push({
                name: reference.length > 1 ? `${name} part ${index + 1}` : name,
                data: [index, data],
                reference: reference[index],
            });
        }
        return out;
    });

describe("uniformChunk", () => {
    it("shape", () => {
        assert.equal(withChildShape.atPosition(1).shape, numberShape);
    });

    describe("jsonable bench", () => {
        for (const { name, data, reference } of testTrees) {
            let cursor: ITreeCursorSynchronous;
            benchmark({
                type: BenchmarkType.Measurement,
                title: `Sum: '${name}'`,
                before: () => {
                    cursor = singleTextCursor(reference[0]);
                },
                benchmarkFn: () => {
                    sum(cursor);
                },
            });
        }
    });

    describe("mapTree bench", () => {
        for (const { name, data, reference } of testTrees) {
            let cursor: ITreeCursorSynchronous;
            benchmark({
                type: BenchmarkType.Measurement,
                title: `Sum: '${name}'`,
                before: () => {
                    cursor = singleMapTreeCursor(mapTreeFromCursor(singleTextCursor(reference[0])));
                },
                benchmarkFn: () => {
                    sum(cursor);
                },
            });
        }
    });

    describe("mapTree bench2", () => {
        for (const { name, data, reference } of testTrees) {
            it(`equal: '${name}'`, () => {
                const cursor1 = singleMapTreeCursor(
                    mapTreeFromCursor(singleTextCursor(reference[0])),
                );
                const cursor2 = singleMapTreeCursor(mapTreeFromCursor(data.cursor()));
                const t1 = jsonableTreeFromCursor(cursor1);
                const t2 = jsonableTreeFromCursor(cursor2);
                assert.deepEqual(t1, reference[0]);
                assert.deepEqual(t2, reference[0]);
            });

            let cursor: ITreeCursorSynchronous;
            benchmark({
                type: BenchmarkType.Measurement,
                title: `Sum: '${name}'`,
                before: () => {
                    cursor = singleMapTreeCursor(mapTreeFromCursor(data.cursor()));
                },
                benchmarkFn: () => {
                    sum(cursor);
                },
            });
        }
    });

    describe("uniformChunk bench", () => {
        for (const { name, data, reference } of testTrees) {
            let cursor: ITreeCursorSynchronous;
            benchmark({
                type: BenchmarkType.Measurement,
                title: `Sum: '${name}'`,
                before: () => {
                    cursor = data.cursor();
                },
                benchmarkFn: () => {
                    sum(cursor);
                },
            });
        }
    });

    testSpecializedCursor<[number, TreeChunk], ITreeCursorSynchronous>({
        cursorName: "uniformChunkCursor",
        builders: {
            withKeys: (keys) => {
                const schema: TreeSchemaIdentifier = brand("fakeSchema");
                const withKeysShape = new Shape(
                    schema,
                    1,
                    false,
                    keys.map((key) => [key, emptyShape]),
                );
                return [0, uniformChunk(withKeysShape, [])];
            },
        },
        cursorFactory: (data: [number, TreeChunk]): ITreeCursorSynchronous => {
            const cursor = data[1].cursor();
            assert(cursor.seekNodes(data[0]));
            return cursor;
        },
        testData,
    });
});
