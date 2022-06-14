/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import http from "http";
import * as path from "path";
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
    LocalDriverApi: LocalDriverApiType;
    OdspDriverApi: OdspDriverApiType;
    RouterliciousDriverApi: RouterliciousDriverApiType;
}

export const DriverApi: DriverApiType = {
    LocalDriverApi,
    OdspDriverApi,
    RouterliciousDriverApi,
};

let httpAgent: http.Agent | undefined;
function setKeepAlive(api: RouterliciousDriverApiType) {
    // Each TCP connect has a delay to disallow it to be reused after close, and unit test make a lot of connection,
    // which might cause port exhaustion.

    // For drivers that use Axios (t9s and r11s), keep the TCP connection open so that they can be reused
    // TODO: no solution for node-fetch used by ODSP driver.
    // TODO: currently the driver use a global setting.  Might want to make this encapsulated.

    // create the keepAlive httpAgent only once
    if (httpAgent === undefined) {
        httpAgent = new http.Agent({ keepAlive: true });
    }

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const axios = api.modulePath === "" ? Axios : require(path.join(api.modulePath, "node_modules", "axios"));
    // Don't override it if there is already one
    if (axios.defaults.httpAgent === undefined) {
        axios.defaults.httpAgent = httpAgent;
    }
}

export type CreateFromEnvConfigParam<T extends (config: any, ...args: any) => any> =
    T extends (config: infer P, ...args: any) => any ? P : never;

export interface FluidTestDriverConfig {
    odsp?: CreateFromEnvConfigParam<typeof OdspTestDriver.createFromEnv>;
    r11s?: CreateFromEnvConfigParam<typeof RouterliciousTestDriver.createFromEnv>;
}

export async function createFluidTestDriver(
    fluidTestDriverType: TestDriverTypes = "local",
    config?: FluidTestDriverConfig,
    api: DriverApiType = DriverApi,
): Promise<LocalServerTestDriver | TinyliciousTestDriver | RouterliciousTestDriver | OdspTestDriver> {
    switch (fluidTestDriverType) {
        case "local":
            return new LocalServerTestDriver(api.LocalDriverApi);

        case "t9s":
        case "tinylicious":
            setKeepAlive(api.RouterliciousDriverApi);
            return new TinyliciousTestDriver(api.RouterliciousDriverApi);

        case "r11s":
        case "routerlicious":
            setKeepAlive(api.RouterliciousDriverApi);
            return RouterliciousTestDriver.createFromEnv(config?.r11s, api.RouterliciousDriverApi);

        case "odsp":
            return OdspTestDriver.createFromEnv(config?.odsp, api.OdspDriverApi);

        default:
            unreachableCase(fluidTestDriverType, `No Fluid test driver registered for type "${fluidTestDriverType}"`);
    }
}
