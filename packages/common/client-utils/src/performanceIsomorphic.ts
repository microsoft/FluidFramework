/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * This type contains the common browser performance properties used by client packages.
 *
 * @internal
 */
export interface IsomorphicPerformance {
	now: () => number;
}

/**
 * This exported "performance" member masks the built-in globalThis.performance object
 * as an IsomorphicPerformance, which hides all of its features that aren't compatible
 * between Node and browser implementations.  Anything exposed on this performance object
 * is considered safe to use regarless of the environment it runs in.
 *
 * @internal
 */
export const performance: IsomorphicPerformance = globalThis.performance;
