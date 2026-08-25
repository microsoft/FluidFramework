/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// eslint-disable-next-line no-restricted-syntax -- This external entrypoint includes all exports shared with the internal entrypoint.
export * from "./main.js";

// Export deprecated external variant of `assert`.
// TODO: when this export is removed, this special barrel file should be removed.
export { assert } from "./assert.js";
