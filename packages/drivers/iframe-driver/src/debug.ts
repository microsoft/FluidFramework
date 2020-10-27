/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import registerDebug from "debug";
import { ITelemetryBaseEvent, ITelemetryBaseLogger } from "@fluidframework/common-definitions";
import { pkgName, pkgVersion } from "./packageVersion";

export const debug = registerDebug("fluid:iframe-socket-storage");
debug(`Package: ${pkgName} - Version: ${pkgVersion}`);

export class IFrameDebugLogger implements ITelemetryBaseLogger {
    constructor(
        private readonly namespace: string,
    ) {}

    public send(event: ITelemetryBaseEvent): void {
        debug(`${this.namespace} ${JSON.stringify(event)}`);
    }
}
