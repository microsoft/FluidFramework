/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import registerDebug from "debug";
import { pkgName, pkgVersion } from "./packageVersion";

export const debug = registerDebug("fluid:consensus-register-collection");
debug(`Package: ${pkgName} - Version: ${pkgVersion}`);
