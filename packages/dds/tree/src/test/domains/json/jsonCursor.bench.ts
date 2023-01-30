/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { benchmark, BenchmarkType, isInPerformanceTestingMode } from "@fluid-tools/benchmark";
import { Jsonable } from "@fluidframework/datastore-definitions";
import {
    ITreeCursor,
    singleJsonCursor,
    jsonableTreeFromCursor,
    EmptyKey,
    cursorToJsonObject,
    jsonSchemaData,
    JsonCompatible,
} from "../../..";
import {
    buildForest,
    defaultSchemaPolicy,
    mapTreeFromCursor,
    singleMapTreeCursor,
    singleTextCursor,
    buildChunkedForest,
    chunkTree,
} from "../../../feature-libraries";
import {
    initializeForest,
    InMemoryStoredSchemaRepository,
    JsonableTree,
    moveToDetachedField,
} from "../../../core";
import { Canada, generateCanada } from "./canada";
import { averageTwoValues, sum, sumMap } from "./benchmarks";
import { generateTwitterJsonByByteSize, Twitter } from "./twitter";
import { CitmCatalog, generateCitmJson } from "./citm";

// IIRC, extracting this helper from clone() encourages V8 to inline the terminal case at
// the leaves, but this should be verified.
function cloneObject<T, J = Jsonable<T>>(obj: J): J {
    if (Array.isArray(obj)) {
        // PERF: 'Array.map()' was ~44% faster than looping over the array. (node 14 x64)
        return obj.map(clone) as unknown as J;
    } else {
        const result: any = {};
        // PERF: Nested array allocs make 'Object.entries()' ~2.4x slower than reading
        //       value via 'value[key]', even when destructuring. (node 14 x64)
        for (const key of Object.keys(obj)) {
            // Like `result[key] = clone((obj as any)[key]);` but safe for when key == "__proto__"
            Object.defineProperty(result, key, {
                enumerable: true,
                configurable: true,
                writable: true,
                value: clone((obj as any)[key]),
            });
        }
        return result as J;
    }
}

// Optimized deep clone implementation for "Jsonable" object trees.  Used as a real-world-ish
// baseline to measure the overhead of using ITreeCursor in a scenario where we're reifying a
// domain model for the application.
function clone<T>(value: Jsonable<T>): Jsonable<T> {
    // PERF: Separate clone vs. cloneObject yields an ~11% speedup in 'canada.json',
    //       likely due to inlining short-circuiting recursing at leaves (node 14 x64).
    return typeof value !== "object" || value === null ? value : cloneObject(value);
}

/**
 * Performance test suite that measures a variety of access patterns using ITreeCursor.
 */
function bench(
    data: {
        name: string;
        getJson: () => any;
        dataConsumer: (cursor: ITreeCursor, calculate: (...operands: any[]) => void) => any;
    }[],
) {
    const schema = new InMemoryStoredSchemaRepository(defaultSchemaPolicy, jsonSchemaData);
    for (const { name, getJson, dataConsumer } of data) {
        describe(name, () => {
            let json: JsonCompatible;
            let encodedTree: JsonableTree;
            before(() => {
                json = getJson();
                encodedTree = jsonableTreeFromCursor(singleJsonCursor(json));
            });

            benchmark({
                type: BenchmarkType.Measurement,
                title: "Clone JS Object",
                before: () => {
                    const cloned = clone<any>(json);
                    assert.deepEqual(cloned, json, "clone() must return an equivalent tree.");
                    assert.notEqual(
                        cloned,
                        json,
                        "clone() must not return the same tree instance.",
                    );
                },
                benchmarkFn: () => {
                    clone<any>(json);
                },
            });

            const cursorFactories: [string, () => ITreeCursor][] = [
                ["JsonCursor", () => singleJsonCursor(json)],
                ["TextCursor", () => singleTextCursor(encodedTree)],
                [
                    "MapCursor",
                    () => singleMapTreeCursor(mapTreeFromCursor(singleTextCursor(encodedTree))),
                ],
                [
                    "object-forest Cursor",
                    () => {
                        const forest = buildForest(schema);
                        initializeForest(forest, [singleTextCursor(encodedTree)]);
                        const cursor = forest.allocateCursor();
                        moveToDetachedField(forest, cursor);
                        assert(cursor.firstNode());
                        return cursor;
                    },
                ],
                [
                    "BasicChunkCursor",
                    () => {
                        const input = singleTextCursor(encodedTree);
                        const chunk = chunkTree(input);
                        const cursor = chunk.cursor();
                        cursor.enterNode(0);
                        return cursor;
                    },
                ],
                [
                    "chunked-forest Cursor",
                    () => {
                        const forest = buildChunkedForest(schema);
                        initializeForest(forest, [singleTextCursor(encodedTree)]);
                        const cursor = forest.allocateCursor();
                        moveToDetachedField(forest, cursor);
                        assert(cursor.firstNode());
                        return cursor;
                    },
                ],
            ];

            const consumers: [
                string,
                (
                    cursor: ITreeCursor,
                    dataConsumer: (
                        cursor: ITreeCursor,
                        calculate: (...operands: any[]) => void,
                    ) => any,
                ) => void,
            ][] = [
                ["cursorToJsonObject", cursorToJsonObject],
                ["jsonableTreeFromCursor", jsonableTreeFromCursor],
                ["mapTreeFromCursor", mapTreeFromCursor],
                ["sum", sum],
                ["sum-map", sumMap],
                ["averageTwoValues", averageTwoValues],
            ];

            for (const [factoryName, factory] of cursorFactories) {
                describe(factoryName, () => {
                    for (const [consumerName, consumer] of consumers) {
                        let cursor: ITreeCursor;
                        benchmark({
                            type: BenchmarkType.Measurement,
                            title: `${consumerName}(${factoryName})`,
                            before: () => {
                                cursor = factory();
                                // TODO: validate behavior
                                // assert.deepEqual(cursorToJsonObject(cursor), json, "data should round trip through json");
                                // assert.deepEqual(
                                //     jsonableTreeFromCursor(cursor), encodedTree, "data should round trip through jsonable");
                            },
                            benchmarkFn: () => {
                                consumer(cursor, dataConsumer);
                            },
                        });
                    }
                });
            }
        });
    }
}

const canada = generateCanada(
    // Use the default (large) data set for benchmarking, otherwise use a small dataset.
    isInPerformanceTestingMode ? undefined : [2, 10],
);

function extractCoordinatesFromCanada(
    cursor: ITreeCursor,
    calculate: (x: number, y: number) => void,
): void {
    cursor.enterField(Canada.SharedTreeFieldKey.features);
    cursor.enterNode(0);
    cursor.enterField(EmptyKey);
    cursor.enterNode(0);
    cursor.enterField(Canada.SharedTreeFieldKey.geometry);
    cursor.enterNode(0);
    cursor.enterField(Canada.SharedTreeFieldKey.coordinates);
    cursor.enterNode(0);

    cursor.enterField(EmptyKey);

    for (let result = cursor.firstNode(); result; result = cursor.nextNode()) {
        cursor.enterField(EmptyKey);

        for (let resultInner = cursor.firstNode(); resultInner; resultInner = cursor.nextNode()) {
            // Read x and y values
            cursor.enterField(EmptyKey);
            assert.equal(cursor.firstNode(), true, "No X field");
            const x = cursor.value as number;
            assert.equal(cursor.nextNode(), true, "No Y field");
            const y = cursor.value as number;

            cursor.exitNode();
            cursor.exitField();

            calculate(x, y);
        }

        cursor.exitField();
    }

    // Reset the cursor state
    cursor.exitField();
    cursor.exitNode();
    cursor.exitField();
    cursor.exitNode();
    cursor.exitField();
    cursor.exitNode();
    cursor.exitField();
    cursor.exitNode();
    cursor.exitField();
}

function extractAvgValsFromTwitter(
    cursor: ITreeCursor,
    calculate: (x: number, y: number) => void,
): void {
    cursor.enterField(Twitter.SharedTreeFieldKey.statuses); // move from root to field
    cursor.enterNode(0); // move from field to node at 0 (which is an object of type array)
    cursor.enterField(EmptyKey); // enter the array field at the node,

    for (let result = cursor.firstNode(); result; result = cursor.nextNode()) {
        cursor.enterField(Twitter.SharedTreeFieldKey.retweetCount);
        cursor.enterNode(0);
        const retweetCount = cursor.value as number;
        cursor.exitNode();
        cursor.exitField();

        cursor.enterField(Twitter.SharedTreeFieldKey.favoriteCount);
        cursor.enterNode(0);
        const favoriteCount = cursor.value;
        cursor.exitNode();
        cursor.exitField();
        calculate(retweetCount, favoriteCount as number);
    }

    // Reset the cursor state
    cursor.exitField();
    cursor.exitNode();
    cursor.exitField();
}

function extractAvgValsFromCitm(
    cursor: ITreeCursor,
    calculate: (x: number, y: number) => void,
): void {
    cursor.enterField(CitmCatalog.SharedTreeFieldKey.performances);
    cursor.enterNode(0);
    cursor.enterField(EmptyKey);

    // iterate over each performance
    for (
        let performanceIterator = cursor.firstNode();
        performanceIterator;
        performanceIterator = cursor.nextNode()
    ) {
        cursor.enterField(CitmCatalog.SharedTreeFieldKey.seatCategories);
        const numSeatCategories = cursor.getFieldLength();
        cursor.exitField();

        cursor.enterField(CitmCatalog.SharedTreeFieldKey.start);
        cursor.enterNode(0);
        const startTimeEpoch = cursor.value as number;
        cursor.exitNode();
        cursor.exitField();

        calculate(numSeatCategories, startTimeEpoch);
    }

    // Reset the cursor state
    cursor.exitField();
    cursor.exitNode();
    cursor.exitField();
}

// The original benchmark twitter.json is 466906 Bytes according to getSizeInBytes.
const twitter = generateTwitterJsonByByteSize(isInPerformanceTestingMode ? 2500000 : 466906, true);
// The original benchmark citm_catalog.json 500299 Bytes according to getSizeInBytes.
const citm = isInPerformanceTestingMode
    ? generateCitmJson(2, 2500000)
    : generateCitmJson(1, 500299);
describe("ITreeCursor", () => {
    bench([{ name: "canada", getJson: () => canada, dataConsumer: extractCoordinatesFromCanada }]);
    bench([{ name: "twitter", getJson: () => twitter, dataConsumer: extractAvgValsFromTwitter }]);
    bench([{ name: "citm", getJson: () => citm, dataConsumer: extractAvgValsFromCitm }]);
});
