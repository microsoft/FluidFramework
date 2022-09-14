/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { benchmark, BenchmarkType, isInPerformanceTestingMode } from "@fluid-tools/benchmark";
import { Jsonable } from "@fluidframework/datastore-definitions";
import {
    ITreeCursorNew, jsonableTreeFromCursor, singleTextCursorNew, EmptyKey,
} from "../../..";
// Allow importing from this specific file which is being tested:
/* eslint-disable-next-line import/no-internal-modules */
import { JsonCursor } from "../../../domains/json/jsonCursor";
import { jsonableTreeFromCursorNew } from "../../../feature-libraries";
import { CoordinatesKey, FeatureKey, generateCanada, GeometryKey } from "./canada";
import { averageLocation, sum, sumMap } from "./benchmarks";

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
    return typeof value !== "object" || value === null
        ? value
        : cloneObject(value);
}

/**
 * Performance test suite that measures a variety of access patterns using ITreeCursor.
 */
function bench(
    data: {
        name: string;
        getJson: () => any;
        dataConsumer: (cursor: ITreeCursorNew, calculate: (...operands: any[]) => void) => any;
    }[],
) {
    for (const { name, getJson, dataConsumer } of data) {
        const json = getJson();
        const encodedTree = jsonableTreeFromCursor(new JsonCursor(json));

        benchmark({
            type: BenchmarkType.Measurement,
            title: `Direct: '${name}'`,
            before: () => {
                const cloned = clone(json);
                assert.deepEqual(cloned, json,
                    "clone() must return an equivalent tree.");
                assert.notEqual(cloned, json,
                    "clone() must not return the same tree instance.");
            },
            benchmarkFn: () => {
                clone(json);
            },
        });

    const cursorFactories: [string, () => ITreeCursorNew][] = [
        ["TextCursor", () => singleTextCursorNew(encodedTree)],
    ];

    const consumers: [
        string,
        (cursor: ITreeCursorNew,
            dataConsumer: (cursor: ITreeCursorNew, calculate: (...operands: any[]) => void) => any
        ) => void,
    ][] = [
        // TODO: finish porting other cursor code and enable this.
        // ["cursorToJsonObject", cursorToJsonObjectNew],
        ["jsonableTreeFromCursor", jsonableTreeFromCursorNew],
        ["sum", sum],
        ["sum-map", sumMap],
        ["averageLocation", averageLocation],
    ];

    for (const [consumerName, consumer] of consumers) {
        for (const [factoryName, factory] of cursorFactories) {
            let cursor: ITreeCursorNew;
            benchmark({
                type: BenchmarkType.Measurement,
                title: `${consumerName}(${factoryName}): '${name}'`,
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
    }
}
}

const canada = generateCanada(
    // Use the default (large) data set for benchmarking, otherwise use a small dataset.
    isInPerformanceTestingMode
        ? undefined
        : [2, 10]);

function extractCoordinatesFromCanada(cursor: ITreeCursorNew, calculate: (x: number, y: number) => void): void {
    cursor.enterField(FeatureKey);
    cursor.enterNode(0);
    cursor.enterField(EmptyKey);
    cursor.enterNode(0);
    cursor.enterField(GeometryKey);
    cursor.enterNode(0);
    cursor.enterField(CoordinatesKey);
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

describe("ITreeCursor", () => {
    bench([{ name: "canada", getJson: () => canada, dataConsumer: extractCoordinatesFromCanada }]);
});
