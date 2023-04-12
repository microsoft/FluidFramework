/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { IRequest } from "@fluidframework/core-interfaces";
import { useFakeTimers, SinonFakeTimers } from "sinon";
import { IContainer, IFluidCodeDetails } from "@fluidframework/container-definitions";
import { ConnectionState, Loader } from "@fluidframework/container-loader";

import {
	LocalCodeLoader,
	TestObjectProvider,
	LoaderContainerTracker,
	TestContainerRuntimeFactory,
	ITestObjectProvider,
	TestFluidObjectFactory,
	waitForContainerConnection,
	timeoutPromise,
} from "@fluidframework/test-utils";
import {
	getDataStoreFactory,
	TestDataObjectType,
	describeNoCompat,
} from "@fluid-internal/test-version-utils";
import { IContainerRuntimeBase } from "@fluidframework/runtime-definitions";

const id = "fluid-test://localhost/containerTest";
const codeDetails: IFluidCodeDetails = { package: "test" };
const timeoutMs = 500;

describe.skip("Pong", () => {
	let clock: SinonFakeTimers;

	before(() => {
		clock = useFakeTimers();
	});

	after(() => {
		clock.restore();
	});

	describeNoCompat("Pong", (getTestObjectProvider) => {
		let provider: ITestObjectProvider;
		const loaderContainerTracker = new LoaderContainerTracker();
		const flushPromises = async () => new Promise((resolve) => process.nextTick(resolve));

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
			const container = await loader.createDetachedContainer(codeDetails);
			await container.attach(provider.driver.createCreateNewRequest("containerTest"));
		});

		afterEach(() => {
			loaderContainerTracker.reset();
		});

		async function createConnectedContainer(): Promise<IContainer> {
			const innerRequestHandler = async (request: IRequest, runtime: IContainerRuntimeBase) =>
				runtime.IFluidHandleContext.resolveHandle(request);
			const runtimeFactory = (_?: unknown) =>
				new TestContainerRuntimeFactory(TestDataObjectType, getDataStoreFactory(), {}, [
					innerRequestHandler,
				]);
			const localTestObjectProvider = new TestObjectProvider(
				Loader,
				provider.driver,
				runtimeFactory,
			);

			const container = await localTestObjectProvider.makeTestContainer();
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

		it.only("Delta manager receives pong event", async () => {
			const container = await createConnectedContainer();
			let run = 0;
			container.deltaManager.on("pong", () => {
				run++;
			});

			clock.tick(60 * 1000);
			await timeoutPromise((resolve) => container.deltaManager.once("pong", () => resolve()));
			assert.strictEqual(run, 1);
		}).timeout(100 * 1000);
	});
});
