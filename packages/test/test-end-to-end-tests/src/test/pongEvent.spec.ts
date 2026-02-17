/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { describeCompat } from "@fluid-private/test-version-utils";
import { ConnectionState } from "@fluidframework/container-loader";
import {
	ITestObjectProvider,
	timeoutPromise,
	waitForContainerConnection,
} from "@fluidframework/test-utils/internal";

describe("Pong", () => {
	describeCompat("Pong", "NoCompat", (getTestObjectProvider) => {
		let provider: ITestObjectProvider;

		beforeEach("setup", async function () {
			provider = getTestObjectProvider();
			// only skip local driver
			if (provider.driver.type === "local") {
				this.skip();
			}
		});

		it("Delta manager receives pong event", async () => {
			const container = await provider.makeTestContainer();

			// Pong can arrive while we are waiting for "connected" event.
			// If we miss it, we will wait another minute for a ping/pong, and test will time out!
			const promise = timeoutPromise((resolve) =>
				container.deltaManager.once("pong", () => resolve()),
			);

			await waitForContainerConnection(container, true, {
				errorMsg: "Container initial connection timeout",
			});
			assert.strictEqual(
				container.connectionState,
				ConnectionState.Connected,
				"Container should be connected after creation",
			);

			await promise;
		});
	});
});
