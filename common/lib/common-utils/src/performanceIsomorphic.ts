/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * This type contains all browser performance properties as optional, and some
 * of the intersecting properties of node and browser performance as required.
 */
export type IsomorphicPerformance = Partial<Performance> &
    Pick<Performance, "clearMarks" | "mark" | "measure" | "now">;
