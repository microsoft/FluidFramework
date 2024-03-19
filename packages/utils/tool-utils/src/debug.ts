/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import registerDebug from "debug";
import { pkgName, pkgVersion } from "./packageVersion.js";

export const debug = registerDebug("fluid:tool-utils");
debug(`Package: ${pkgName} - Version: ${pkgVersion}`);
