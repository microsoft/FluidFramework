/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITestDriver, TestDriverTypes } from "@fluidframework/test-driver-definitions";
import { createFluidTestDriver } from "./factory";

const envVar = "FLUID_TEST_DRIVER";
const _global = global as any;

// can be async or not
export const mochaGlobalSetup = async function() {
    const fluidTestDriverType = process.env[envVar]?.toLocaleLowerCase() as TestDriverTypes | undefined | "";
    const fluidTestDriver =
        fluidTestDriverType === "" || fluidTestDriverType === undefined
        ? await createFluidTestDriver("local")
        : await createFluidTestDriver(fluidTestDriverType);

    _global.getFluidTestDriver = (): ITestDriver => {
        return fluidTestDriver;
    };
};
