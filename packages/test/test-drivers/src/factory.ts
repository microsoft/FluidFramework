/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import http from "http";

import { TestDriverTypes } from "@fluid-internal/test-driver-definitions";
import { unreachableCase } from "@fluidframework/core-utils/internal";
import Agent from "agentkeepalive";

import { LocalDriverApi, LocalDriverApiType } from "./localDriverApi.js";
import { LocalServerTestDriver } from "./localServerTestDriver.js";
import { OdspDriverApi, OdspDriverApiType } from "./odspDriverApi.js";
import { OdspTestDriver } from "./odspTestDriver.js";
import {
	RouterliciousDriverApi,
	RouterliciousDriverApiType,
} from "./routerliciousDriverApi.js";
import { RouterliciousTestDriver } from "./routerliciousTestDriver.js";
import { TinyliciousTestDriver } from "./tinyliciousTestDriver.js";

/**
 * @internal
 */
export interface DriverApiType {
	LocalDriverApi: LocalDriverApiType;
	OdspDriverApi: OdspDriverApiType;
	RouterliciousDriverApi: RouterliciousDriverApiType;
}
/**
 * @internal
 */
export const DriverApi: DriverApiType = {
	LocalDriverApi,
	OdspDriverApi,
	RouterliciousDriverApi,
};

// IMPORTANT: the Agent from agentkeepalive sets keep-alive to true by default and manages timeouts for active and
// inactive connections on the client side (default to 8s and 4s respectively). This should be coordinated with the
// corresponding timeout on the server's end. If the timeout on the client is higher than on the server, an inactive
// connection might be closed by the server but kept around on the client, and when something attempts to reuse it,
// our drivers will end up throwing an error like ECONNRESET or "socket hang up", indicating that "the other side of
// the connection closed it abruptly", which in this case isn't really abruptly, it's just that the client doesn't
// immediately react to the server closing the socket.
http.globalAgent = new Agent();

/**
 * @internal
 */
export type CreateFromEnvConfigParam<T extends (config: any, ...args: any) => any> =
	T extends (config: infer P, ...args: any) => any ? P : never;

/**
 * @internal
 */
export interface FluidTestDriverConfig {
	odsp?: CreateFromEnvConfigParam<typeof OdspTestDriver.createFromEnv>;
	r11s?: CreateFromEnvConfigParam<typeof RouterliciousTestDriver.createFromEnv>;
}

/**
 * @internal
 */
export async function createFluidTestDriver(
	fluidTestDriverType: TestDriverTypes = "local",
	config?: FluidTestDriverConfig,
	api: DriverApiType = DriverApi,
): Promise<
	LocalServerTestDriver | TinyliciousTestDriver | RouterliciousTestDriver | OdspTestDriver
> {
	switch (fluidTestDriverType) {
		case "local":
			return new LocalServerTestDriver(api.LocalDriverApi);

		case "t9s":
		case "tinylicious":
			return new TinyliciousTestDriver(api.RouterliciousDriverApi);

		case "r11s":
		case "routerlicious":
			return RouterliciousTestDriver.createFromEnv(config?.r11s, api.RouterliciousDriverApi);

		case "odsp":
			return OdspTestDriver.createFromEnv(config?.odsp, api.OdspDriverApi);

		default:
			unreachableCase(
				fluidTestDriverType,
				`No Fluid test driver registered for type "${fluidTestDriverType}"`,
			);
	}
}
