/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IsomorphicPerformance } from "./performanceIsomorphic";

/**
 * @internal
 */
export const performance: IsomorphicPerformance = globalThis.performance;
