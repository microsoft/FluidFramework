/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { IContainer, IFluidCodeDetails } from "@fluidframework/container-definitions";
import { ConnectionState, Loader } from "@fluidframework/container-loader";

import { describeCompat } from "@fluid-private/test-version-utils";
import {
	ITestObjectProvider,
	LoaderContainerTracker,
	LocalCodeLoader,
	TestFluidObjectFactory,
	timeoutPromise,
	waitForContainerConnection,
} from "@fluidframework/test-utils";

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

		async function createConnectedContainer(): Promise<IContainer> {
			const container = await provider.makeTestContainer();
			await waitForContainerConnection(container, true, {
				errorMsg: "Container initial connection timeout",
			});
			assert.strictEqual(
				container.connectionState,
				ConnectionState.Connected,
				"Container should be connected after creation",
			);

			return container;
		}

		it("Delta manager receives pong event", async () => {
			const container = await createConnectedContainer();

			let run = 0;
			container.deltaManager.on("pong", () => {
				run++;
			});

			await timeoutPromise((resolve) => container.deltaManager.once("pong", () => resolve()));
			assert.strictEqual(run, 1);
		});
	});
});
