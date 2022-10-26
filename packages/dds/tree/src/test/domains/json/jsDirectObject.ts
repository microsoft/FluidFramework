/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { benchmark, BenchmarkType } from "@fluid-tools/benchmark";
import { Jsonable } from "@fluidframework/datastore-definitions";
import { averageTwoValues, sumDirect } from "./benchmarks";

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

export function jsObjectBench(
    data: {
        name: string;
        getJson: () => any;
        dataConsumer: (directObj: any, calculate: (...operands: any[]) => void) => any;
    }[],
) {
    for (const { name, getJson, dataConsumer } of data) {
        const json = getJson();

        benchmark({
            type: BenchmarkType.Measurement,
            title: `clone JS Object: '${name}'`,
            before: () => {
                const cloned = clone(json);
                assert.deepEqual(cloned, json, "clone() must return an equivalent tree.");
                assert.notEqual(cloned, json, "clone() must not return the same tree instance.");
            },
            benchmarkFn: () => {
                clone(json);
            },
        });

        benchmark({
            type: BenchmarkType.Measurement,
            title: `sum JS Object: '${name}'`,
            before: () => {},
            benchmarkFn: () => {
                sumDirect(json);
            },
        });

        benchmark({
            type: BenchmarkType.Measurement,
            title: `averageTwoValues JS Object: '${name}'`,
            before: () => {},
            benchmarkFn: () => {
                averageTwoValues(json, dataConsumer);
            },
        });
    }
}
