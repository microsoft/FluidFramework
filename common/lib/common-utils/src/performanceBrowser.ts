/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

export const performance = window.performance;
export const PerformanceObserver = window.PerformanceObserver;

export function performanceNow() {
    return performance.now();
}
