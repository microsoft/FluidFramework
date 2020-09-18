/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable unicorn/filename-case */
// This is needed instead of adding "node" to tsconfig types list.
declare module "perf_hooks" {
    export const performance: import("./performanceIsomorphic").IsomorphicPerformance;
}
