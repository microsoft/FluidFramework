/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITestDriver, IAsyncTelemetryBaseLogger } from "./interfaces";

declare global {
    /** This function needs to be provided by the environment leveraging these defintions, like a mocha test hook. */
    export function getFluidTestDriver(): ITestDriver;

    /** This function may be provided by the environment, like a mocha test hook */
    export function getTestLogger(): IAsyncTelemetryBaseLogger;
}

export * from "./interfaces";
