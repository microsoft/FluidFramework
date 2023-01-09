/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { benchmark, BenchmarkType } from "@fluid-tools/benchmark";
import {
    uniformChunk,
    TreeShape,
    dummyRoot,
    ChunkShape,
    UniformChunk,
    TreeChunk,
    // eslint-disable-next-line import/no-internal-modules
} from "../../../feature-libraries/chunked-forest/uniformChunk";
import { testSpecializedCursor, TestTree } from "../../cursorTestSuite";
import {
    cursorToJsonObject,
    jsonArray,
    jsonNull,
    jsonNumber,
    jsonObject,
    singleJsonCursor,
} from "../../../domains";
import { brand, makeArray } from "../../../util";
import { EmptyKey, FieldKey, ITreeCursorSynchronous, TreeSchemaIdentifier } from "../../../core";
// eslint-disable-next-line import/no-internal-modules
import { sum } from "../../domains/json/benchmarks";
import {
    jsonableTreeFromCursor,
    mapTreeFromCursor,
    singleMapTreeCursor,
    singleTextCursor,
} from "../../../feature-libraries";

const xField: FieldKey = brand("x");
const yField: FieldKey = brand("y");

const numberShape = new TreeShape(jsonNumber.name, true, []);
const withChildShape = new TreeShape(jsonObject.name, false, [[xField, numberShape, 1]]);
const pointShape = new TreeShape(jsonObject.name, false, [
    [xField, numberShape, 1],
    [yField, numberShape, 1],
]);
const emptyShape = new TreeShape(jsonNull.name, false, []);

const sides = 100000;
const polygon = new TreeShape(jsonArray.name, false, [
    [EmptyKey, pointShape, sides],
]).withTopLevelLength(1);

const polygonTree: TestTree<TreeChunk> = {
    name: "polygon",
    dataFactory: () =>
        uniformChunk(
            polygon,
            makeArray(sides * 2, (index) => index),
        ),
    reference: {
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
};

const testTrees = [
    {
        name: "number",
        dataFactory: () => uniformChunk(numberShape.withTopLevelLength(1), [5]),
        reference: [{ type: jsonNumber.name, value: 5 }],
    },
    {
        name: "root sequence",
        dataFactory: () => uniformChunk(numberShape.withTopLevelLength(3), [1, 2, 3]),
        reference: [
            { type: jsonNumber.name, value: 1 },
            { type: jsonNumber.name, value: 2 },
            { type: jsonNumber.name, value: 3 },
        ],
    },
    {
        name: "child sequence",
        dataFactory: () =>
            uniformChunk(
                new TreeShape(jsonArray.name, false, [
                    [EmptyKey, numberShape, 3],
                ]).withTopLevelLength(1),
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
        dataFactory: () => uniformChunk(withChildShape.withTopLevelLength(1), [1]),
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
        dataFactory: () => uniformChunk(pointShape.withTopLevelLength(1), [1, 2]),
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
        ...polygonTree,
        reference: [polygonTree.reference],
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
                assert.equal(element.parentIndex, index);
                assert.equal(element.parentField, k);
                assert.equal(element.parent, info);
            }
        }
    });
}

// testing is per node, and our data can have multiple nodes at the root, so split tests as needed:
const testData: TestTree<[number, TreeChunk]>[] = testTrees.flatMap(
    ({ name, dataFactory, reference }) => {
        const out: TestTree<[number, TreeChunk]>[] = [];
        for (let index = 0; index < reference.length; index++) {
            out.push({
                name: reference.length > 1 ? `${name} part ${index + 1}` : name,
                dataFactory: () => [index, dataFactory()],
                reference: reference[index],
                path: { parent: undefined, parentIndex: index, parentField: dummyRoot },
            });
        }
        return out;
    },
);

describe("uniformChunk", () => {
    describe("shapes", () => {
        for (const tree of testTrees) {
            it(`validate shape for ${tree.name}`, () => {
                validateShape((tree.dataFactory() as UniformChunk).shape);
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

    const cursorSources = [
        { name: "uniformChunk", factory: (data: TreeChunk) => data.cursor() },
        {
            name: "jsonable",
            factory: (data: TreeChunk) => singleTextCursor(jsonableTreeFromCursor(data.cursor())),
        },
        {
            name: "mapTree",
            factory: (data: TreeChunk) => singleMapTreeCursor(mapTreeFromCursor(data.cursor())),
        },
        {
            name: "json",
            factory: (data: TreeChunk) => singleJsonCursor(cursorToJsonObject(data.cursor())),
        },
    ];

    for (const { name: cursorName, factory } of cursorSources) {
        describe(`${cursorName} bench`, () => {
            let cursor: ITreeCursorSynchronous;
            for (const { name, dataFactory: data } of testTrees) {
                benchmark({
                    type: BenchmarkType.Measurement,
                    title: `Sum: '${name}'`,
                    before: () => {
                        cursor = factory(data());
                    },
                    benchmarkFn: () => {
                        sum(cursor);
                    },
                });
            }

            benchmark({
                type: BenchmarkType.Measurement,
                title: "Polygon access",
                before: () => {
                    cursor = polygonTree.dataFactory().cursor();
                },
                benchmarkFn: () => {
                    let x = 0;
                    let y = 0;
                    cursor.enterField(EmptyKey);
                    for (let inNodes = cursor.firstNode(); inNodes; inNodes = cursor.nextNode()) {
                        cursor.enterField(xField);
                        cursor.enterNode(0);
                        x += cursor.value as number;
                        cursor.exitNode();
                        cursor.exitField();
                        cursor.enterField(yField);
                        cursor.enterNode(0);
                        y += cursor.value as number;
                        cursor.exitNode();
                        cursor.exitField();
                    }
                    cursor.exitField();
                    const _result = x + y;
                },
            });
        });
    }
});
