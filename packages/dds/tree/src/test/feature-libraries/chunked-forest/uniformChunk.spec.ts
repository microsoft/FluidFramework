/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { benchmark, BenchmarkType } from "@fluid-tools/benchmark";
import {
    uniformChunk,
    TreeChunk,
    TreeShape,
    dummyRoot,
    ChunkShape,
    UniformChunk,
    // eslint-disable-next-line import/no-internal-modules
} from "../../../feature-libraries/chunked-forest/uniformChunk";
import { testSpecializedCursor, TestTree } from "../../cursorTestSuite";
import { jsonArray, jsonNull, jsonNumber, jsonObject } from "../../../domains";
import { brand, makeArray } from "../../../util";
import { EmptyKey, ITreeCursorSynchronous, TreeSchemaIdentifier } from "../../../core";
// eslint-disable-next-line import/no-internal-modules
import { sum } from "../../domains/json/benchmarks";
import {
    jsonableTreeFromCursor,
    mapTreeFromCursor,
    singleMapTreeCursor,
    singleTextCursor,
} from "../../../feature-libraries";

const numberShape = new TreeShape(jsonNumber.name, true, []);
const withChildShape = new TreeShape(jsonObject.name, false, [[brand("x"), numberShape, 1]]);
const pointShape = new TreeShape(jsonObject.name, false, [
    [brand("x"), numberShape, 1],
    [brand("y"), numberShape, 1],
]);
const emptyShape = new TreeShape(jsonNull.name, false, []);

const sides = 100;
const polygon = new TreeShape(jsonArray.name, false, [
    [EmptyKey, pointShape, sides],
]).withTopLevelLength(1);

const testTrees = [
    {
        name: "number",
        data: uniformChunk(numberShape.withTopLevelLength(1), [5]),
        reference: [{ type: jsonNumber.name, value: 5 }],
    },
    {
        name: "root sequence",
        data: uniformChunk(numberShape.withTopLevelLength(3), [1, 2, 3]),
        reference: [
            { type: jsonNumber.name, value: 1 },
            { type: jsonNumber.name, value: 2 },
            { type: jsonNumber.name, value: 3 },
        ],
    },
    {
        name: "child sequence",
        data: uniformChunk(
            new TreeShape(jsonArray.name, false, [[EmptyKey, numberShape, 3]]).withTopLevelLength(
                1,
            ),
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
        data: uniformChunk(withChildShape.withTopLevelLength(1), [1]),
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
        data: uniformChunk(pointShape.withTopLevelLength(1), [1, 2]),
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
            polygon,
            makeArray(sides * 2, (index) => index),
        ),
        reference: [
            {
                type: jsonArray.name,
                fields: {
                    [EmptyKey]: makeArray(sides, (index) => ({
                        type: jsonObject.name,
                        fields: {
                            x: [{ type: jsonNumber.name, value: index * 2 }],
                            y: [{ type: jsonNumber.name, value: index * 2 + 1 }],
                        },
                    })),
                },
            },
        ],
    },
];

// Validate a few aspects of shapes that are easier to verify here than via checking the cursor.
function validateShape(shape: ChunkShape): void {
    shape.positions.forEach((info, positionIndex) => {
        assert.equal(
            info.parent,
            info.indexOfParentPosition === undefined
                ? undefined
                : shape.positions[info.indexOfParentPosition],
        );
        for (const [k, v] of info.shape.fields) {
            for (let index = 0; index < v.topLevelLength; index++) {
                // TODO: if we keep all the duplicated position info, inline positionIndex into field offsets to save the addition.
                const offset = v.offset + index * v.shape.positions.length;
                const element = shape.positions[offset + positionIndex];
                assert.equal(element.parentField, k);
                assert.equal(element.parent, info);
            }
        }
    });
}

// testing is per node, and our data can have multiple nodes at the root, so split tests as needed:
const testData: TestTree<[number, TreeChunk]>[] = testTrees.flatMap(({ name, data, reference }) => {
    const out: TestTree<[number, TreeChunk]>[] = [];
    for (let index = 0; index < reference.length; index++) {
        out.push({
            name: reference.length > 1 ? `${name} part ${index + 1}` : name,
            data: [index, data],
            reference: reference[index],
            path: { parent: undefined, parentIndex: index, parentField: dummyRoot },
        });
    }
    return out;
});

describe("uniformChunk", () => {
    describe("shapes", () => {
        for (const tree of testTrees) {
            it(`validate shape for ${tree.name}`, () => {
                validateShape((tree.data as UniformChunk).shape);
            });
        }
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
                const withKeysShape = new TreeShape(
                    schema,
                    false,
                    keys.map((key) => [key, emptyShape, 1] as const),
                );
                return [0, uniformChunk(withKeysShape.withTopLevelLength(1), [])];
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
