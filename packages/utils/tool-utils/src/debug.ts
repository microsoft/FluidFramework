/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import registerDebug from "debug";

import { pkgName, pkgVersion } from "./packageVersion.js";

/**
 * Debug logger for the `@fluidframework/tool-utils` package.
 *
 * This logger is initialized with the namespace "fluid:tool-utils" and can be used
 * throughout the package for debug logging.
 */
export const debug = registerDebug("fluid:tool-utils");
debug(`Package: ${pkgName} - Version: ${pkgVersion}`);
