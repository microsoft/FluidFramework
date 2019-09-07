/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as registerDebug from "debug";
import { pkgName, pkgVersion } from "./packageVersion";

export const debug = registerDebug("fluid:ink");
debug(`Package: ${pkgName} - Version: ${pkgVersion}`);
