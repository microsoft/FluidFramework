/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import http from "http";
import Axios from "axios";
import { TestDriverTypes } from "@fluidframework/test-driver-definitions";
import { unreachableCase } from "@fluidframework/common-utils";
import { LocalServerTestDriver } from "./localServerTestDriver";
import { TinyliciousTestDriver } from "./tinyliciousTestDriver";
import { RouterliciousTestDriver } from "./routerliciousTestDriver";
import { OdspTestDriver } from "./odspTestDriver";
import { LocalDriverApiType, LocalDriverApi } from "./localDriverApi";
import { OdspDriverApiType, OdspDriverApi } from "./odspDriverApi";
import { RouterliciousDriverApiType, RouterliciousDriverApi } from "./routerliciousDriverApi";

export interface DriverApiType {
    LocalDriverApi: LocalDriverApiType,
    OdspDriverApi: OdspDriverApiType,
    RouterliciousDriverApi: RouterliciousDriverApiType,
}

export const DriverApi: DriverApiType = {
    LocalDriverApi,
    OdspDriverApi,
    RouterliciousDriverApi,
};

let hasSetKeepAlive = false;
function setKeepAlive() {
    // Make sure we only do it once so that createFluidTestDriver can be called multiple times.
    if (!hasSetKeepAlive) {
        // Each TCP connect has a delay to allow it to be reuse after close, and unit test make a lot of connection,
        // which might cause port exhaustion.

        // For drivers that use Axios (t9s and r11s), keep the TCP connection open so that they can be reused
        // TODO: no solution for node-fetch used by ODSP driver.
        // TODO: currently the driver use a global setting.  Might want to make this encapsulated.
        Axios.defaults.httpAgent = new http.Agent({ keepAlive: true });
        hasSetKeepAlive = true;
    }
}

export type CreateFromEnvConfigParam<T extends (config: any, ...args: any) => any> =
    T extends (config: infer P, ...args: any) => any ? P : never;

export interface FluidTestDriverConfig {
    odsp?: CreateFromEnvConfigParam<typeof OdspTestDriver.createFromEnv>,
}

export async function createFluidTestDriver(
    fluidTestDriverType: TestDriverTypes = "local",
    config?: FluidTestDriverConfig,
    api: DriverApiType = DriverApi,
): Promise<LocalServerTestDriver | TinyliciousTestDriver | RouterliciousTestDriver | OdspTestDriver> {
    switch (fluidTestDriverType) {
        case "local":
            return new LocalServerTestDriver(api.LocalDriverApi);

        case "tinylicious":
            setKeepAlive();
            return new TinyliciousTestDriver(api.RouterliciousDriverApi);

        case "routerlicious":
            setKeepAlive();
            return RouterliciousTestDriver.createFromEnv(api.RouterliciousDriverApi);

        case "odsp":
            return OdspTestDriver.createFromEnv(config?.odsp, api.OdspDriverApi);

        default:
            unreachableCase(fluidTestDriverType, `No Fluid test driver registered for type "${fluidTestDriverType}"`);
    }
}
