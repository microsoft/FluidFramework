/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// Problem:
//   - `__dirname` is not defined in ESM
//   - `import.meta.url` is not defined in CJS
// Solution:
//   - Export '__dirname' from a .cts file in the same directory.
//
// Note that *.cts files are always CommonJS, but can be imported from ESM.
// eslint-disable-next-line jsdoc/require-jsdoc
export const _dirname = __dirname;
