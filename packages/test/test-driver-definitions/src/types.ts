/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITestDriver } from "./interfaces";
import { ILocalServerTestDriver } from "./localServerTestDriver";

export type TestDriver = ITestDriver | ILocalServerTestDriver;

declare global {
    /**
     * This function needs to be provided by the environment leverging these defintions, like a mocha test hook.
     */
    export function getFluidTestDriver(): TestDriver;
}
