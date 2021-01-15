/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITestDriver } from "./interfaces";
import { ILocalServerTestDriver } from "./localServerTestDriver";

export type TestDriver = ITestDriver | ILocalServerTestDriver;

declare global {
    export function getFluidTestDriver(): TestDriver;
}
