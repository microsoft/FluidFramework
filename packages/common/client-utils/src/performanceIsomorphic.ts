/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Exposes `Performance.now()` in both Node and browser environments.
 *
 * @remarks
 *
 * The performance API is available as an attribute on the `WindowOrWorkerGlobalScope` object which `globalThis` points to.
 * - The [global `performance` attribute](https://w3c.github.io/hr-time/#the-performance-attribute)
 * - [`globalThis`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/globalThis)
 *
 * @internal
 */
export const performanceNow: () => number = () => globalThis.performance.now();
