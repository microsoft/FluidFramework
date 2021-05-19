/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryBaseLogger } from "@fluidframework/common-definitions";

export interface TinyliciousContainerConfig {
    id: string;
    logger?: ITelemetryBaseLogger;
}

export interface TinyliciousConnectionConfig {
    port?: number;
}
