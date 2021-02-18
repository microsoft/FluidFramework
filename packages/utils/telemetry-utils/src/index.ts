/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryBaseLogger } from "@fluidframework/common-definitions";

//* Where should this actually go? common-definitions?
declare global {
    /** This function may be provided by the environment, like a mocha test hook */
    export const getTestLogger: (() => ITelemetryBaseLogger) | undefined;
}

export * from "./debugLogger";
export * from "./eventEmitterWithErrorHandling";
export * from "./events";
export * from "./logger";
