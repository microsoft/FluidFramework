/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import registerDebug from "debug";
import { pkgName, pkgVersion } from "./packageVersion";

export const debug = registerDebug("fluid:shared-object-common");
debug(`Package: ${pkgName} - Version: ${pkgVersion}`);
