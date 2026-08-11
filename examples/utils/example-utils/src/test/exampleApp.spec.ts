/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	cleanupEphemeralService,
	type EphemeralService,
	getDefaultEphemeralService,
	type LocalServiceClient,
} from "@fluidframework/local-driver/alpha";

import { getExampleServiceClient } from "../exampleApp.js";

describe("getExampleServiceClient", () => {
	afterEach(async () => {
		await cleanupEphemeralService();
	});

	it("selects default service by default", () => {
		const exampleClient = getExampleServiceClient() as LocalServiceClient<EphemeralService>;
		const defaultService = getDefaultEphemeralService();
		assert.equal(exampleClient.service, defaultService);
	});

	it("location query parameter can select a different service", () => {
		// Cache location to restore it after the test.
		const originalLocation = Object.getOwnPropertyDescriptor(globalThis, "location");

		const selectService = (fluidClient?: string): void => {
			const search = fluidClient === undefined ? "" : `?fluidClient=${fluidClient}`;
			Object.defineProperty(globalThis, "location", {
				configurable: true,
				value: new URL(`http://localhost/${search}`),
			});
		};

		try {
			selectService("ephemeral");
			const ephemeralClient =
				getExampleServiceClient() as LocalServiceClient<EphemeralService>;
			const defaultService = getDefaultEphemeralService();
			assert.equal(ephemeralClient.service, defaultService);

			selectService("tinylicious");
			const tinyliciousClient = getExampleServiceClient() as Partial<
				LocalServiceClient<EphemeralService>
			>;
			// We don't have a robust way to narrow or downcast the returned client, but this at least ensures they are different.
			assert.equal("service" in ephemeralClient, true);
			assert.equal("service" in tinyliciousClient, false);

			// Note we do not test the session service here, as doing so would start it as a side-effect and we don't have a way to clean it up.
		} finally {
			if (originalLocation === undefined) {
				Reflect.deleteProperty(globalThis, "location");
			} else {
				Object.defineProperty(globalThis, "location", originalLocation);
			}
		}
	});
});
