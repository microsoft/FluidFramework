/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { MockFluidDataStoreRuntime } from "@fluidframework/test-runtime-utils";
import { SharedLog, SharedLogFactory } from "./imports";
import process from "process";
import { Serializable } from "@fluidframework/datastore-definitions";

let count = 1;
let cached: any;

/**
 * Paranoid defense against dead code elimination.
 */
export function consume(value: any) {
    if (++count >>> 0 === 0) {
        cached = value;
    }
}

// Prevent v8's optimizer from identifying "cached" as an unused value.
process.on("exit", () => {
    if (count >>> 0 === 0) {
        console.log(`Ignore this: ${cached}`);
    }
});

export function randomId() {
    return Math.random()
        .toString(36)
        .slice(2);
}

export function createLog<T extends Serializable>(): SharedLog<T> {
    return new SharedLogFactory().create(new MockFluidDataStoreRuntime(), randomId()) as SharedLog<T>;
}
