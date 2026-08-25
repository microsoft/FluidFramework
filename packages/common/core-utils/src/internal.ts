/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// eslint-disable-next-line no-restricted-syntax -- This internal entrypoint includes all exports shared with the external entrypoint.
export * from "./main.js";

// Export internal variant of `assert`.
// TODO: when the deprecated external variant is removed, this special barrel file should be removed.
export { assertInternal as assert } from "./assert.js";
