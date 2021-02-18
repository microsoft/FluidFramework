/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITestDriver } from "./interfaces";

declare global {
    /**
     * This function needs to be provided by the environment leveraging these defintions, like a mocha test hook.
     */
    export function getFluidTestDriver(): ITestDriver;
}

export * from "./interfaces";
