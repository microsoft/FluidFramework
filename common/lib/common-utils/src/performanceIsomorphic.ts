/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * This type contains all browser performance properties as optional, and some
 * of the intersecting properties of node and browser performance as required.
 *
 * @deprecated Moved to the `@fluidframework-internal/client-utils` package.
 * @internal
 */
export interface IsomorphicPerformance {
	clearMarks(markName?: string): void;
	mark(markName: string): void;
	measure(measureName: string): void;
	now(): number;
}

/**
 * @deprecated Moved to the `@fluidframework-internal/client-utils` package.
 * @internal
 */
export const performance: IsomorphicPerformance = globalThis.performance;
