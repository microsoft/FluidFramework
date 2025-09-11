/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import registerDebug from "debug";

import { pkgName, pkgVersion } from "./packageVersion.js";

/**
 * Debug logger for the @fluidframework/tool-utils package.
 * 
 * This logger is initialized with the namespace "fluid:tool-utils" and can be used
 * throughout the package for debug logging. On initialization, it logs the package
 * name and version information.
 * 
 * @example
 * ```typescript
 * import { debug } from "./debug.js";
 * debug("Some debug message");
 * ```
 * 
 * @internal
 */
export const debug = registerDebug("fluid:tool-utils");
debug(`Package: ${pkgName} - Version: ${pkgVersion}`);
