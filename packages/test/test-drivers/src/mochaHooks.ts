/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITestDriver, TestDriverTypes } from "@fluidframework/test-driver-definitions";
import { createFluidTestDriver } from "./factory";

const envVar = "FLUID_TEST_DRIVER";
const _global = global as any;
let fluidTestDriver: ITestDriver;
_global.getFluidTestDriver = (): ITestDriver => {
    return fluidTestDriver;
};
// can be async or not
export async function mochaGlobalSetup() {
    const fluidTestDriverType = process.env[envVar]?.toLocaleLowerCase() as TestDriverTypes | undefined | "";
    if(fluidTestDriver === undefined) {
        fluidTestDriver = await createFluidTestDriver(
            fluidTestDriverType === "" || fluidTestDriverType === undefined ? "local" : fluidTestDriverType);
    }

    if (_global.getFluidTestDriver === undefined
        || _global.getFluidTestDriver() === undefined) {
        throw new Error("getFluidTestDriver does not exist or did not return a driver");
    }
}

export const mochaHooks = {
    async beforeAll() {
        await mochaGlobalSetup();
    },
};
