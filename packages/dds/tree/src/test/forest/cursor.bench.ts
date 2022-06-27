/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { benchmark, BenchmarkType } from "@fluid-tools/benchmark";
import { Jsonable } from "@fluidframework/datastore-definitions";
import { default as Random } from "random-js";
import { ITreeCursor } from "../..";
import { JsonCursor } from "./jsonCursor";
import { extract } from "./cursor.spec";
import { canada } from "./json";

function makeRng(seed: string) {
    const rng = Random.engines.mt19937().seed(Number.parseInt(seed, 36));
    const dist = Random.real(0, 1);
    return () => dist(rng);
}

const c = canada(makeRng("canada"));

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

function clone<T>(value: Jsonable<T>): Jsonable<T> {
    // PERF: Separate clone vs. cloneObject yields an ~11% speedup in 'canada.json',
    //       likely due to inlining short-circuiting recursing at leaves (node 14 x64).
    return typeof value !== "object" || value === null
        ? value
        : cloneObject(value);
}

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
            const extracted = extract(cursor);
            assert.deepEqual(extracted, json,
                "extract() must return an equivalent tree.");
            assert.deepEqual(extract(cursor), json,
                "Repeated calls to extract() must return an equivalent tree.");
            assert.notEqual(extracted, json,
                "extract() must not return the original tree instance.");
        },
        benchmarkFn: () => {
            extract(cursor);
        },
    });
}

describe("ITreeCursor", () => {
    bench("canada", () => c);
});
