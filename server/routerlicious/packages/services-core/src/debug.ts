/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Lumberjack } from "@fluidframework/server-services-telemetry";
import registerDebug from "debug";
import { pkgName, pkgVersion } from "./packageVersion";

export const debug = registerDebug("fluid:core");
debug(`Package: ${pkgName} - Version: ${pkgVersion}`);
Lumberjack.info(`Package: ${pkgName} - Version: ${pkgVersion}`);
