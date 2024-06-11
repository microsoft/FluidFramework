/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { describeCompat } from "@fluid-private/test-version-utils";
import { IFluidCodeDetails } from "@fluidframework/container-definitions/internal";
import { ConnectionState } from "@fluidframework/container-loader";
import { Loader } from "@fluidframework/container-loader/internal";
import {
	ITestObjectProvider,
	LoaderContainerTracker,
	LocalCodeLoader,
	TestFluidObjectFactory,
	timeoutPromise,
	waitForContainerConnection,
} from "@fluidframework/test-utils/internal";

const codeDetails: IFluidCodeDetails = { package: "test" };

describe("Pong", () => {
	describeCompat("Pong", "NoCompat", (getTestObjectProvider) => {
		let provider: ITestObjectProvider;
		const loaderContainerTracker = new LoaderContainerTracker();

		beforeEach("setup", async function () {
			provider = getTestObjectProvider();
			// only skip local driver
			if (provider.driver.type === "local") {
				this.skip();
			}

			const loader = new Loader({
				logger: provider.logger,
				urlResolver: provider.urlResolver,
				documentServiceFactory: provider.documentServiceFactory,
				codeLoader: new LocalCodeLoader([[codeDetails, new TestFluidObjectFactory([])]]),
			});
			loaderContainerTracker.add(loader);
		});

		afterEach(() => {
			loaderContainerTracker.reset();
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
