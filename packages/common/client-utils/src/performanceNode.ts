/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// eslint-disable-next-line import/no-nodejs-modules
import { performance as nodePerformance } from "perf_hooks";
import { IsomorphicPerformance } from "./performanceIsomorphic";

/**
 * @internal
 */
export const performance: IsomorphicPerformance = nodePerformance;
