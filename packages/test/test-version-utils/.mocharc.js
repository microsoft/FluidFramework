/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { getFluidTestMochaConfig } from "@fluid-internal/mocha-test-setup/mocharc-common";

const config = getFluidTestMochaConfig(import.meta.dirname);
// mocha v12+ supports ESM config when default export is given via `export default config;`.
// Prior to that synchronous ESM can be loaded with specifically configured
// module.exports export containing the config.
export { config as "module.exports" };
