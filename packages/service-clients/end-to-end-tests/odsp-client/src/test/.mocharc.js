/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import path from "node:path";

import { getFluidTestMochaConfigWithCompat } from "@fluid-private/test-version-utils/mocharc-common";

const packageDir = path.resolve(import.meta.dirname, "../..");
const config = getFluidTestMochaConfigWithCompat(packageDir);
// mocha v12+ supports ESM config when default export is given via `export default config;`.
// Prior to that synchronous ESM can be loaded with specifically configured
// module.exports export containing the config.
export { config as "module.exports" };
