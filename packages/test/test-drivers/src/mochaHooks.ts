/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import http from "http";
import Axios from "axios";
import { ITestDriver, TestDriverTypes } from "@fluidframework/test-driver-definitions";
import { LocalServerTestDriver } from "./localServerTestDriver";
import { OdspTestDriver } from "./odspTestDriver";
import { RouterliciousTestDriver } from "./routerliciousTestDriver";
import { TinyliciousTestDriver } from "./tinyliciousTestDriver";

function setKeepAlive() {
    // Each TCP connect has a delay to allow it to be reuse after close, and unit test make a lot of connection,
    // which might cause port exhaustion.

    // For drivers that use Axios (t9s and r11s), keep the TCP connection open so that they can be reused
    // TODO: no solution for node-fetch used by ODSP driver.
    // TODO: currently the driver use a global setting.  Might want to make this encapsulated.
    Axios.defaults.httpAgent = new http.Agent({ keepAlive: true });
}

const envVar = "FLUID_TEST_DRIVER";
const fluidTestDriverType = process.env[envVar]?.toLocaleLowerCase() as TestDriverTypes | undefined | "";
let fluidTestDriver: ITestDriver | undefined;
const _global = global as any;
_global.getFluidTestDriver = (): ITestDriver => {
    if (fluidTestDriver === undefined) {
        switch (fluidTestDriverType) {
            case undefined:
            case "":
            case "local":
                fluidTestDriver = new LocalServerTestDriver();
                break;

            case "tinylicious":
                setKeepAlive();
                fluidTestDriver = new TinyliciousTestDriver();
                break;

            case "routerlicious":
                setKeepAlive();
                fluidTestDriver = RouterliciousTestDriver.createFromEnv();
                break;

            case "odsp":
                fluidTestDriver = OdspTestDriver.createFromEnv();
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
        || _global.getFluidTestDriver() === undefined) {
        throw new Error("getFluidTestDriver does not exist or did not return a driver");
    }
};
