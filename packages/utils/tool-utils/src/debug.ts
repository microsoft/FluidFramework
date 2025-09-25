/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import registerDebug from "debug";

import { pkgName, pkgVersion } from "./packageVersion.js";

/**
 * Debug logger for the `@fluidframework/tool-utils` package.
 *
 * This logger is initialized with the namespace "fluid:tool-utils" and should be used
 * throughout the package for debug logging during development and troubleshooting.
 * It provides detailed information about internal operations to help developers and
 * users diagnose issues when running tools that leverage the shared utilities in this package.
 *
 * Debug output is controlled by the DEBUG environment variable (see https://www.npmjs.com/package/debug).
 * To enable debug logging for this package, set DEBUG=fluid:tool-utils or DEBUG=fluid:* to see
 * all Fluid-related debug output.
 */
export const debug = registerDebug("fluid:tool-utils");
debug(`Package: ${pkgName} - Version: ${pkgVersion}`);
