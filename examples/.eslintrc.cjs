/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// NOTE: this file isn't recognized by eslint automatically in this location.
// Packages that want to leverage it should extend from it in their local
// `.eslintrc.cjs` and normally after other configurations; so that these
// rules get priority.

const { lintConfig } = require("./.eslintrc.data.cjs");

module.exports = lintConfig;
