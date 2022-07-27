/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { benchmark, BenchmarkType } from "@fluid-tools/benchmark";
import { Jsonable } from "@fluidframework/datastore-definitions";
import { default as Random } from "random-js";
import { ITreeCursor } from "../../..";
// Allow importing from this specific file which is being tested:
/* eslint-disable-next-line import/no-internal-modules */
import { cursorToJsonObject, JsonCursor } from "../../../domains/json/jsonCursor";
import { generateCanada } from "./json";

// Helper for creating a PRNG instance that produces a uniform distribution in the range [0..1).
function makeRng(seed: string) {
    const rng = Random.engines.mt19937().seed(Number.parseInt(seed, 36));
    const dist = Random.real(0, 1);
    return () => dist(rng);
}

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
    let cursor: ITreeCursor;
    let json: any;

    benchmark({
        type: BenchmarkType.Measurement,
        title: `Direct: '${name}'`,
        before: () => {
            json = getJson();
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

    benchmark({
        type: BenchmarkType.Measurement,
        title: `ITreeCursor: '${name}'`,
        before: () => {
            cursor = new JsonCursor(getJson());

            // TODO: extract() hasn't been optimized, and possibly should be cloned into
            //       the benchmark to avoid test enhancements (e.g., additional asserts)
            //       from skewing benchmark results.
            const extracted = cursorToJsonObject(cursor);

            assert.deepEqual(extracted, json,
                "extract() must return an equivalent tree.");
            assert.deepEqual(cursorToJsonObject(cursor), json,
                "Repeated calls to extract() must return an equivalent tree.");
            assert.notEqual(extracted, json,
                "extract() must not return the original tree instance.");
        },
        benchmarkFn: () => {
            cursorToJsonObject(cursor);
        },
    });
}

const canada = generateCanada(makeRng("canada"));

describe("ITreeCursor", () => {
    bench("canada", () => canada);
});
