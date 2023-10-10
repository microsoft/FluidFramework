/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { IContainer, IFluidCodeDetails } from "@fluidframework/container-definitions";
import { ConnectionState, Loader } from "@fluidframework/container-loader";

import {
	LocalCodeLoader,
	LoaderContainerTracker,
	ITestObjectProvider,
	TestFluidObjectFactory,
	waitForContainerConnection,
	timeoutPromise,
} from "@fluidframework/test-utils";
import { describeNoCompat } from "@fluid-internal/test-version-utils";

const codeDetails: IFluidCodeDetails = { package: "test" };
const timeoutMs = 500;

describe("Pong", () => {
	describeNoCompat("Pong", (getTestObjectProvider) => {
		let provider: ITestObjectProvider;
		const loaderContainerTracker = new LoaderContainerTracker();

		beforeEach(async function () {
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
				durationMs: timeoutMs,
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
