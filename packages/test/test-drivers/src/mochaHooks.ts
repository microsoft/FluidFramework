/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITestDriver, TestDriverTypes } from "@fluidframework/test-driver-definitions";
import { LocalServerTestDriver } from "./localServerTestDriver";
import { OdspTestDriver } from "./odspTestDriver";
import { RouterliciousTestDriver } from "./routerliciousTestDriver";
import { TinyliciousTestDriver } from "./tinyliciousTestDriver";

const envVar = "FLUID_TEST_DRIVER";
const fluidTestDriverType = process.env[envVar]?.toLocaleLowerCase() as TestDriverTypes | undefined | "";
let fluidTestDriver: ITestDriver | undefined;
const _global =  global as any;
_global.getFluidTestDriver = (): ITestDriver => {
    if (fluidTestDriver === undefined) {
        switch (fluidTestDriverType) {
            case undefined:
            case "":
            case "local":
                fluidTestDriver = new LocalServerTestDriver();
                break;

            case "tinylicious":
                fluidTestDriver = new TinyliciousTestDriver();
                break;

            case "routerlicious":
                fluidTestDriver = RouterliciousTestDriver.createFromEnv();
                break;

            case "odsp":
                fluidTestDriver =  OdspTestDriver.createFromEnv();
                break;

            default:
                throw new Error(`No Fluid test driver registered for type "${fluidTestDriverType}"`);
        }
    }
    return fluidTestDriver;
};

// can be async or not
export const mochaGlobalSetup = async function() {
    if (_global.getFluidTestDriver === undefined
        || _global.getFluidTestDriver() === undefined)  {
        throw new Error("getFluidTestDriver does not exist or did not return a driver");
    }
};
