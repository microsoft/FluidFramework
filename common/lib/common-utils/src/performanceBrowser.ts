/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IsomorphicPerformance } from "./performanceIsomorphic";

/**
 * @deprecated Moved to the `@fluidframework-internal/client-utils` package.
 */
export const performance: IsomorphicPerformance = globalThis.performance;
