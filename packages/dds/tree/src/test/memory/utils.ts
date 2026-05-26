/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export { memoryAddedBy } from "@fluid-tools/benchmark";

/**
 * These tests are quite slow, so force a lower iteration count.
 * If we need better data at some point, we can look into raising it.
 */
export const iterationSettings = { keepIterations: 4, warmUpIterations: 2 };
