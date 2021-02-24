/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import http from "http";
import Axios from "axios";
import { TestDriverTypes } from "@fluidframework/test-driver-definitions";
import { LocalServerTestDriver } from "./localServerTestDriver";
import { TinyliciousTestDriver } from "./tinyliciousTestDriver";
import { RouterliciousTestDriver } from "./routerliciousTestDriver";
import { OdspTestDriver } from "./odspTestDriver";

function setKeepAlive() {
    // Each TCP connect has a delay to allow it to be reuse after close, and unit test make a lot of connection,
    // which might cause port exhaustion.

    // For drivers that use Axios (t9s and r11s), keep the TCP connection open so that they can be reused
    // TODO: no solution for node-fetch used by ODSP driver.
    // TODO: currently the driver use a global setting.  Might want to make this encapsulated.
    Axios.defaults.httpAgent = new http.Agent({ keepAlive: true });
}

type CreateFromEnvConfigParam<T extends (config: any, ...args: any) => any> =
    T extends (config: infer P, ...args: any[]) => any ? P : never;

export async function createFluidTestDriver(
    fluidTestDriverType: TestDriverTypes,
    config?: {
        odsp?: CreateFromEnvConfigParam<typeof OdspTestDriver.createFromEnv>,
    }) {
    switch (fluidTestDriverType.toLocaleLowerCase()) {
        case "local":
            return new LocalServerTestDriver();

        case "tinylicious":
            setKeepAlive();
            return new TinyliciousTestDriver();

        case "routerlicious":
            setKeepAlive();
            return RouterliciousTestDriver.createFromEnv();

        case "odsp":
            return OdspTestDriver.createFromEnv(config?.odsp);

        default:
            throw new Error(`No Fluid test driver registered for type "${fluidTestDriverType}"`);
    }
}
