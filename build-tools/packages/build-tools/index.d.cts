/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// Workaround TypeScript distrust of importing ESM in CJS use
//  error TS1479: The current file is a CommonJS module whose imports will produce 'require' calls; however, the referenced file is an ECMAScript module and cannot be imported with 'require'.
// Only type exports from typeCompatibility.ts are needed in support of type test
// infrastructure and that is CJS-ESM agnostic.
// (Node 22+ supports synchronous ESM load via require under certain conditions.
// build-tools has not been investigated for this use as there is no known need.)
export type * from "./dist/common/typeCompatibility.js";
