/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// The "internal" exports are a superset of the standard ones. So, we want to export everything from the standard barrel file.
// eslint-disable-next-line no-restricted-syntax, @typescript-eslint/no-restricted-imports
export * from "./index.js";

import { assert as publicAssert } from "./assert.js";

/**
 * Asserts the specified condition.
 *
 * @internal
 */
export const assert: typeof publicAssert = publicAssert;
