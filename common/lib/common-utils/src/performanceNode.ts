/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { performance, PerformanceObserver } from "perf_hooks";
export { performance, PerformanceObserver };

export function performanceNow() {
    return performance.now();
}
