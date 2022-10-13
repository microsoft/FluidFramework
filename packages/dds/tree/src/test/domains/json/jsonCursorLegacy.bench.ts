/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { benchmark, BenchmarkType, isInPerformanceTestingMode } from "@fluid-tools/benchmark";
import { Jsonable } from "@fluidframework/datastore-definitions";
import {
    buildForest,
    ITreeCursor,
    jsonableTreeFromCursor,
    singleTextCursor,
    EmptyKey,
    jsonSchemaData,
} from "../../..";
import { initializeForest, TreeNavigationResult } from "../../../forest";
// Allow importing from this specific file which is being tested:
/* eslint-disable-next-line import/no-internal-modules */
import { cursorToJsonObject, JsonCursor } from "../../../domains/json/jsonCursor";
import { defaultSchemaPolicy, singleTextCursorNew } from "../../../feature-libraries";
import { InMemoryStoredSchemaRepository } from "../../../schema-stored";
import { Canada, generateCanada } from "./canada";
import { averageTwoValues, sum } from "./benchmarksLegacy";
import { generateTwitterJsonByByteSize, TwitterStatus } from "./twitter";

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
            result[key] = clone((obj as any)[key]);
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
    for (const { name, getJson, dataConsumer } of data) {
        const json = getJson();
        const encodedTree = jsonableTreeFromCursor(new JsonCursor(json));
        const schema = new InMemoryStoredSchemaRepository(defaultSchemaPolicy, jsonSchemaData);

        benchmark({
            type: BenchmarkType.Measurement,
            title: `Direct: '${name}'`,
            before: () => {
                const cloned = clone(json);
                assert.deepEqual(cloned, json, "clone() must return an equivalent tree.");
                assert.notEqual(cloned, json, "clone() must not return the same tree instance.");
            },
            benchmarkFn: () => {
                clone(json);
            },
        });

        const cursorFactories: [string, () => ITreeCursor][] = [
            ["JsonCursor", () => new JsonCursor(json)],
            ["TextCursor", () => singleTextCursor(encodedTree)],
            [
                "object-forest Cursor",
                () => {
                    const forest = buildForest(schema);
                    initializeForest(forest, [singleTextCursorNew(encodedTree)]);
                    const cursor = forest.allocateCursor();
                    assert.equal(
                        forest.tryMoveCursorTo(forest.root(forest.rootField), cursor),
                        TreeNavigationResult.Ok,
                    );
                    return cursor;
                },
            ],
        ];

        const consumers: [
            string,
            (
                cursor: ITreeCursor,
                dataConsumer: (cursor: ITreeCursor, calculate: (...operands: any[]) => void) => any,
            ) => void,
        ][] = [
            ["cursorToJsonObject", cursorToJsonObject],
            ["jsonableTreeFromCursor", jsonableTreeFromCursor],
            ["sum", sum],
            ["averageTwoValues", averageTwoValues],
        ];

        for (const [consumerName, consumer] of consumers) {
            for (const [factoryName, factory] of cursorFactories) {
                let cursor: ITreeCursor;
                benchmark({
                    type: BenchmarkType.Measurement,
                    title: `${consumerName}(${factoryName}): '${name}'`,
                    before: () => {
                        cursor = factory();
                        assert.deepEqual(
                            cursorToJsonObject(cursor),
                            json,
                            "data should round trip through json",
                        );
                        assert.deepEqual(
                            jsonableTreeFromCursor(cursor),
                            encodedTree,
                            "data should round trip through jsonable",
                        );
                    },
                    benchmarkFn: () => {
                        consumer(cursor, dataConsumer);
                    },
                });
            }
        }
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
    cursor.down(Canada.FeatureKey, 0);
    cursor.down(EmptyKey, 0);
    cursor.down(Canada.GeometryKey, 0);
    cursor.down(Canada.CoordinatesKey, 0);

    let result = cursor.down(EmptyKey, 0);
    assert.equal(result, TreeNavigationResult.Ok, "Unexpected shape for Canada dataset");

    while (result === TreeNavigationResult.Ok) {
        let resultInner = cursor.down(EmptyKey, 0);
        assert.equal(resultInner, TreeNavigationResult.Ok, "Unexpected shape for Canada dataset");

        while (resultInner === TreeNavigationResult.Ok) {
            // Read x and y values
            assert.equal(cursor.down(EmptyKey, 0), TreeNavigationResult.Ok, "No X field");
            const x = cursor.value as number;
            cursor.up();

            assert.equal(cursor.down(EmptyKey, 1), TreeNavigationResult.Ok, "No Y field");
            const y = cursor.value as number;
            cursor.up();

            calculate(x, y);
            resultInner = cursor.seek(1);
        }
        cursor.up();
        result = cursor.seek(1);
    }

    // Reset the cursor state
    cursor.up();
    cursor.up();
    cursor.up();
    cursor.up();
}

function extractAvgValsFromTwitter(
    cursor: ITreeCursor,
    calculate: (x: number, y: number) => void,
): void {
    cursor.down(TwitterStatus.statusesKey, 0);

    let result = cursor.down(EmptyKey, 0);
    while (result === TreeNavigationResult.Ok) {
        cursor.down(TwitterStatus.retweetCountKey, 0);
        const retweetCount = cursor.value as number;
        cursor.up();

        cursor.down(TwitterStatus.favoriteCountKey, 0);
        const favoriteCount = cursor.value as number;
        cursor.up();
        calculate(retweetCount, favoriteCount);

        result = cursor.seek(1);
    }

    // Reset the cursor state
    cursor.up();
    cursor.up();
    cursor.up();
}

// The original benchmark twitter.json is 466906 Bytes according to getSizeInBytes.
const twitter = generateTwitterJsonByByteSize(isInPerformanceTestingMode ? 2500000 : 466906, true);
describe("ITreeCursor", () => {
    bench([{ name: "canada", getJson: () => canada, dataConsumer: extractCoordinatesFromCanada }]);
    bench([{ name: "twitter", getJson: () => twitter, dataConsumer: extractAvgValsFromTwitter }]);
});
