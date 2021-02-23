/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITestDriver, TestDriverTypes } from "@fluidframework/test-driver-definitions";
import { createFluidTestDriver } from "./factory";

const envVar = "FLUID_TEST_DRIVER";
const fluidTestDriverType = process.env[envVar]?.toLocaleLowerCase() as TestDriverTypes | undefined | "";
let fluidTestDriver: ITestDriver | undefined;
const _global = global as any;
_global.getFluidTestDriver = (): ITestDriver => {
    if (fluidTestDriver === undefined) {
        if(fluidTestDriverType === "" || fluidTestDriverType === undefined) {
            fluidTestDriver = createFluidTestDriver("local");
        }else{
            fluidTestDriver = createFluidTestDriver(fluidTestDriverType);
        }
    }
    return fluidTestDriver;
};

// can be async or not
export const mochaGlobalSetup = async function() {
    if (_global.getFluidTestDriver === undefined
        || _global.getFluidTestDriver() === undefined) {
        throw new Error("getFluidTestDriver does not exist or did not return a driver");
    }
};
