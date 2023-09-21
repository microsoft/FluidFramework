/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// This is referring to our own `perf_hooks`, not Node's.
// eslint-disable-next-line import/no-nodejs-modules, unicorn/prefer-node-protocol
import { performance as nodePerformance } from "perf_hooks";
import { IsomorphicPerformance } from "./performanceIsomorphic";

/**
 * @internal
 */
export const performance: IsomorphicPerformance = nodePerformance;
