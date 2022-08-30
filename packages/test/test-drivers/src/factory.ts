/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import http from "http";
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

let httpRequestPatched = false;
function patchHttpRequestToForceKeepAlive() {
    // Each TCP connection port has a delay to disallow it to be reused after close,
    // and unit test make a lot of connection, which might cause port exhaustion.
    // Patch http.request to force keep-alive.

    if (httpRequestPatched) { return; }

    httpRequestPatched = true;

    const httpAgent = new http.Agent({ keepAlive: true, scheduling: "fifo" });
    const oldRequest = http.request;
    http.request = ((url, options, callback) => {
        // There are two variant of the API
        // - http.request(options[, callback])
        // - http.request(url[, options][, callback])
        // See https://nodejs.org/dist/latest-v18.x/docs/api/http.html#httprequestoptions-callback

        // decide which param is the actual options object and add agent to it.
        let opts;
        if (options !== undefined) {
            opts = typeof options !== "function" ? options : url;
        } else if (callback !== undefined) {
            // eslint-disable-next-line no-param-reassign
            options = {};
            opts = options;
        } else {
            opts = url;
        }
        if (opts.agent === undefined) {
            opts.agent = httpAgent;
            opts.headers.Connection = ["keep-alive"];
        }
        // pass thru the param to the original function
        return oldRequest(url, options, callback);
    }) as any;
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
            patchHttpRequestToForceKeepAlive();
            return new TinyliciousTestDriver(api.RouterliciousDriverApi);

        case "r11s":
        case "routerlicious":
            patchHttpRequestToForceKeepAlive();
            return RouterliciousTestDriver.createFromEnv(config?.r11s, api.RouterliciousDriverApi);

        case "odsp":
            patchHttpRequestToForceKeepAlive();
            return OdspTestDriver.createFromEnv(config?.odsp, api.OdspDriverApi);

        default:
            unreachableCase(fluidTestDriverType, `No Fluid test driver registered for type "${fluidTestDriverType}"`);
    }
}
