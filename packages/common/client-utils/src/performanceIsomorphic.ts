/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Exposes the common browser performance properties used by client packages, which consists
 * of the `now` method.
 *
 * @internal
 */
export const performanceNow: () => number = () => globalThis.performance.now();
