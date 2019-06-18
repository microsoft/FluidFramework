/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Utility to run a forced garbage collector.
 * To expose gc, run node --expose-gc dist/paparazzi/index.js.
 */
export function runGC() {
    global.gc();
}

/**
 * Utility to print node memory usage.
 */
export function printMemoryUsage() {
    const used = process.memoryUsage();
    // tslint:disable-next-line
    for (const key in used) {
        console.log(`${key} ${Math.round(used[key] / 1024 / 1024 * 100) / 100} MB`);
    }
}
