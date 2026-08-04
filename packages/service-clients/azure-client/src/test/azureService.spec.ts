/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type { ITelemetryBaseLogger } from "@fluidframework/core-interfaces";
import { InsecureTokenProvider } from "@fluidframework/test-runtime-utils/internal";

import {
	type AzureServiceOptions,
	makeContainerLoaderOptions,
	normalizeAzureEndpoint,
} from "../azureService.js";

describe("Azure service client", () => {
	it("forwards the configured logger to the loader", () => {
		const logger: ITelemetryBaseLogger = { send: () => {} };
		const options: AzureServiceOptions = {
			connection: {
				type: "local",
				endpoint: "http://localhost:7071",
				tokenProvider: new InsecureTokenProvider("key", { id: "user", name: "User" }),
			},
			minVersionForCollaboration: "2.0.0",
			logger,
		};

		assert.strictEqual(makeContainerLoaderOptions(options).logger, logger);
	});

	it("removes a trailing slash from the service endpoint", () => {
		assert.strictEqual(
			normalizeAzureEndpoint("https://relay.example.com/"),
			"https://relay.example.com",
		);
	});
});
