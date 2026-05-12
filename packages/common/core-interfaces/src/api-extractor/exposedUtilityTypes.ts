/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// This is a workaround for api-extractor to see that "./index.js" exports are
// covered for the "internal/exposedUtilityTypes" entry point. This file
// re-exports everything from index.js and the exposedUtilityTypes.js files,
// which allows api-extractor to verify that all exports from both files are
// exported somewhere by the package.

/* eslint-disable no-restricted-syntax */

// The "internal" exports are a superset of the standard ones. So, we want to export everything from the standard barrel file.
// eslint-disable-next-line @typescript-eslint/no-restricted-imports
export type * from "../index.js";

export type * from "../exposedUtilityTypes.js";
