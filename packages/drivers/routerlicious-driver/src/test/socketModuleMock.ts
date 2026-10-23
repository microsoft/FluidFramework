/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { createRequire } from "node:module";
import path from "node:path";
import { mock } from "node:test";
import { pathToFileURL } from "node:url";

import type { io } from "socket.io-client";

let socketFactory: typeof io | undefined;

export function setSocketFactory(factory: typeof io): void {
	socketFactory = factory;
}

export function resetSocketFactory(): void {
	socketFactory = undefined;
}

const socketIoClientSpecifier =
	process.env.FLUID_TEST_MODULE_SYSTEM === "CJS"
		? pathToFileURL(
				createRequire(path.join(process.cwd(), "package.json")).resolve("socket.io-client"),
			)
		: "socket.io-client";

mock.module(socketIoClientSpecifier, {
	namedExports: {
		io: (...args: Parameters<typeof io>) => {
			if (socketFactory === undefined) {
				throw new Error("A socket factory must be configured before creating a socket.");
			}
			return socketFactory(...args);
		},
	},
});
