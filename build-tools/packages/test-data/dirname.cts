/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// Problem:
//   - `__dirname` is not defined in ESM
//   - `import.meta.url` is not defined in CJS
// Solution:
//   - Export '__dirname' from a .cjs file in the same directory.
//
// Note that *.cjs files are always CommonJS, but can be imported from ESM.
// eslint-disable-next-line unicorn/prefer-module -- this is used for ESM/CJS interop
export const _dirname = __dirname;
