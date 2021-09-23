/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable no-bitwise */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable no-null/no-null */

import { strict as assert } from "assert";
// import fs from "fs";
// import path from "path";
import { Random } from "best-random";
import { Serializable } from "@fluidframework/datastore-definitions";
import { ChunkReader, ChunkWriter } from "../chunk";

const literals = [
    { name: "null", cases: [null] },
    { name: "boolean", cases: [true, false] },
    { name: "integer", cases: [0, Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER] },
    { name: "real", cases: [1E1, 0.1e1, 1e-1, 1e+00, Number.MAX_VALUE, Number.MIN_VALUE] },
];

const strings = [
    ["empty", ""],
    ["space", " "],
    ["quote", "\""],
    ["backslash", "\\"],
    ["slash", "/ & \\/"],
    ["control", "\b\f\n\r\t"],
    ["unicode", "\u0022"],
    ["surrogate", "😀"],
];

const arrays = [
    [],
    [null],
    [true, false],
    [0, 1, 2, 3, 4],
    [["2 deep"]],
    [["left sibling"], ["right sibling"]],
    [[], "empty before content"],
];

const objects = [
    {},
    {"": ""},
    {"\\b": ""},
    { 1: {2: "deep" }},
    { left: { name: "left sibling" }, right: { name: "right sibling" }},
    { empty: {}, before: "content" },
];

const values = literals
    .map(({ cases }) => cases)
    .reduce((previous: any[], current: any[]) => previous.concat(current), [])
    .concat(strings, arrays, objects);

describe(`ChunkWriter`, () => {
    const check = (expected: Serializable) => {
        const w = new ChunkWriter();
        w.writeValue(expected);

        const r = new ChunkReader(w.u1);
        const actual1 = r.read();
        assert.deepEqual(actual1, expected);

        const b2 = w.trim();
        const r2 = new ChunkReader(b2);
        const actual2 = r2.read();
        assert.deepEqual(actual2, expected);

        const e = new TextEncoder();
        const jsonSize = e.encode(JSON.stringify(expected)).byteLength;
        const tapeSize = w.trim().byteLength;

        console.log(`json: ${jsonSize}, tape: ${tapeSize}: ${tapeSize / jsonSize}`);
    };

    const test = (expected: Serializable, description?: string) => {
        it(`${JSON.stringify(expected)}${description === undefined
                ? ` (${description})`
                : ""
            }`, () => {
                check(expected);
            });
    };

    function make<T>(breadth: number, depth: number, createLeaf: () => Serializable<T>) {
        let depthInternal = depth;
        if (--depthInternal === 0) {
            return createLeaf();
        }

        const o = {};
        for (let i = 0; i < breadth; i++) {
            o[`o${i}`] = make(breadth, depthInternal, createLeaf);
        }
        return o;
    }

    for (const cases of literals) {
        describe(`${cases.name}`, () => {
            for (const expected of cases.cases) {
                test(expected);
            }
        });
    }

    describe("string", () => {
        for (const [description, expected] of strings) {
            test(expected, description);
        }
    });

    describe("array", () => {
        for (const expected of arrays) {
            test(expected);
        }
    });

    describe("object", () => {
        for (const expected of objects) {
            test(expected);
        }
    });

    describe("complex", () => {
        const prng = new Random(0);
        const rnd = (max: number) => (prng.float64() * max) | 0;

        for (let i = 1; i <= 10; i++) {
            test(make(/* breadth: */ 10, /* depth: */ 3, () => {
                return values[rnd(values.length)];
            }), `Generated Case #${i}`);
        }
    });

    // it("twitter", () => {
    //     const json = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../src/test", "twitter.json"), "utf8"));
    //     check(json);
    // });
});
