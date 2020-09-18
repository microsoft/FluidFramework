/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { performance } from "perf_hooks";
export { performance };

// back-compat
export function performanceNow() {
    return performance.now();
}
