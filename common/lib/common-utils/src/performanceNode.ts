/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { performance as nodePerformance } from "perf_hooks";
import { IsomorphicPerformance } from "./performanceIsomorphic";

export const performance: IsomorphicPerformance = nodePerformance;
