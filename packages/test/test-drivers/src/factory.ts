/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import http from "http";

import { TestDriverTypes } from "@fluid-internal/test-driver-definitions";
import { unreachableCase } from "@fluidframework/core-utils/internal";
import { HttpAgent } from "agentkeepalive";

import { LocalDriverApi, LocalDriverApiType } from "./localDriverApi.js";
import { LocalServerTestDriver } from "./localServerTestDriver.js";
import { OdspDriverApi, OdspDriverApiType } from "./odspDriverApi.js";
import { OdspTestDriver } from "./odspTestDriver.js";
import { pkgVersion } from "./packageVersion.js";
import {
	RouterliciousDriverApi,
	RouterliciousDriverApiType,
} from "./routerliciousDriverApi.js";
import { RouterliciousTestDriver } from "./routerliciousTestDriver.js";
import { TinyliciousTestDriver } from "./tinyliciousTestDriver.js";
import type { SeaWebSocketTestDriver } from "./seaWebSocketTestDriver.js";

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
http.globalAgent = new HttpAgent();

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
 * Creates a test driver for the specified Fluid service type.
 *
 * @internal
 */
export async function createFluidTestDriver(
	fluidTestDriverType: TestDriverTypes = "local",
	config?: FluidTestDriverConfig,
	api: DriverApiType = DriverApi,
): Promise<
	| LocalServerTestDriver
	| TinyliciousTestDriver
	| RouterliciousTestDriver
	| OdspTestDriver
	| SeaWebSocketTestDriver
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

		case "sea-websocket": {
			if (api.LocalDriverApi.version !== pkgVersion) {
				throw new Error("SEA WebSocket tests require the current driver version");
			}
			const endpoint = process.env.SEA_TEST_WEBSOCKET_URL;
			if (endpoint === undefined || endpoint.length === 0) {
				throw new Error(
					"SEA_TEST_WEBSOCKET_URL is required for sea-websocket; use the SEA test runner",
				);
			}
			const { SeaWebSocketTestDriver: Driver } = await import("./seaWebSocketTestDriver.js");
			return new Driver(endpoint);
		}

		default:
			unreachableCase(
				fluidTestDriverType,
				`No Fluid test driver registered for type "${fluidTestDriverType}"`,
			);
	}
}
