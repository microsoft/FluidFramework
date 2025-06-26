/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { debug as registerDebug } from "debug";

import { pkgName, pkgVersion } from "./packageVersion";

export const debug = registerDebug("fluid:services");
debug(`Package: ${pkgName} - Version: ${pkgVersion}`);
