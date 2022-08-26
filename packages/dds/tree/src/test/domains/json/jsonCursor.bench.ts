/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { benchmark, BenchmarkType, isInPerformanceTestingMode } from "@fluid-tools/benchmark";
import { Jsonable } from "@fluidframework/datastore-definitions";
import {
    ITreeCursorNew, jsonableTreeFromCursor, singleTextCursorNew, jsonTypeSchema, CursorLocationType,
} from "../../..";
// Allow importing from this specific file which is being tested:
/* eslint-disable-next-line import/no-internal-modules */
import { JsonCursor } from "../../../domains/json/jsonCursor";
import { defaultSchemaPolicy } from "../../../feature-libraries";
import { SchemaData, StoredSchemaRepository } from "../../../schema-stored";
import { generateCanada } from "./json";

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

// Helper that measures an optimized 'deepClone()' vs. using ITreeCursor to extract an
// equivalent clone of the source data.
function bench(name: string, getJson: () => any) {
    const json = getJson();
    const encodedTree = jsonableTreeFromCursor(new JsonCursor(json));
    const schemaData: SchemaData = {
            globalFieldSchema: new Map(),
            treeSchema: jsonTypeSchema,
    };
    const schema = new StoredSchemaRepository(defaultSchemaPolicy, schemaData);

    // benchmark({
    //     type: BenchmarkType.Measurement,
    //     title: `Direct: '${name}'`,
    //     before: () => {
    //         const cloned = clone(json);
    //         assert.deepEqual(cloned, json,
    //             "clone() must return an equivalent tree.");
    //         assert.notEqual(cloned, json,
    //             "clone() must not return the same tree instance.");
    //     },
    //     benchmarkFn: () => {
    //         clone(json);
    //     },
    // });

    const cursorFactories: [string, () => ITreeCursorNew][] = [
        ["TextCursor", () => singleTextCursorNew(encodedTree)],
    ];

    const consumers: [string, (cursor: ITreeCursorNew) => void][] = [
        // ["cursorToJsonObject", cursorToJsonObjectNew],
        // ["jsonableTreeFromCursor", jsonableTreeFromCursorNew],
        ["sum", sum],
        ["sum-map", sumMap],
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
                    consumer(cursor);
                },
                // maxBenchmarkDurationSeconds: 30,
                // minSampleDurationSeconds: 2,
            });
        }
    }
}

function sum(cursor: ITreeCursorNew): number {
    let total = 0;
    const value = cursor.value;
    if (typeof value === "number") {
        total += value;
    }
    let moreFields = cursor.firstField();
    while (moreFields) {
        let inField = cursor.firstNode();
        while (inField) {
            total += sum(cursor);
            inField = cursor.nextField();
        }
        moreFields = cursor.nextField();
    }
    return total;
}

function sumMap(cursor: ITreeCursorNew): number {
    let total = 0;
    const value = cursor.value;
    if (typeof value === "number") {
        total += value;
    }
    cursor.forEachField((c) => { c.forEachNode((c2) => { total += sumMap(c2); }); });
    return total;
}

const canada = generateCanada(
    // Use the default (large) data set for benchmarking, otherwise use a small dataset.
    isInPerformanceTestingMode
        ? undefined
        : [2, 10]);

describe("ITreeCursor", () => {
    bench("canada", () => canada);
});
