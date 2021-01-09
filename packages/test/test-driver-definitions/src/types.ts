/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITestDriver } from "./interfaces";
import { ILocalServerTestDriver } from "./localServerTestDriver";

declare global {
    export const getFluidTestDriver: () => ITestDriver | ILocalServerTestDriver;
}
