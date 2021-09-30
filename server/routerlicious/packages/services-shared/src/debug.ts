/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import registerDebug from "debug";
import { Lumberjack } from "@fluidframework/server-services-telemetry";
import { pkgName, pkgVersion } from "./packageVersion";

export const debug = registerDebug("fluid:services");
debug(`Package: ${pkgName} - Version: ${pkgVersion}`);
Lumberjack.debug(`Package: ${pkgName} - Version: ${pkgVersion}`);
