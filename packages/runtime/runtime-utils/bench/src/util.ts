/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable no-bitwise */

// This file contains some helpers creating/executing benchmark suites using 'Benchmark.js'.

import process = require("process");
import { Suite } from "benchmark";

let count = 0;
let cached: any;

/**
 * Paranoid defense against dead code elimination.
 */
export function consume(value: any) {
    count++;
    if ((count >>> 0) === 0) {
        cached = value;
    }
}

// Prevent v8's optimizer from identifying 'cached' as an unused value.
process.on("exit", () => {
    if ((count >>> 0) === 0) {
        console.log(`Ignore this: ${cached}`);
    }
});

export function runSuite(suite: Suite) {
    count = 0;

    console.log();
    console.group((suite as any).name);
    return suite
        .on("cycle", (event: any) => {
            console.log(String(event.target));
        })
        .on("error", (event: any) => {
            console.error(String(event.target.error));
        })
        .on("complete", (event: any) => {
            console.groupEnd();
            console.log(`Fastest is ${event.currentTarget.filter("fastest").map("name")}`);
        })
        .run();
}

export function runSuites(suites: Iterable<Suite>) {
    for (const suite of suites) {
        runSuite(suite);
    }
}
