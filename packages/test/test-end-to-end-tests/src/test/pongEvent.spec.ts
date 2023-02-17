/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { IRequest } from "@fluidframework/core-interfaces";
import { useFakeTimers, SinonFakeTimers } from "sinon";
import { IFluidCodeDetails } from "@fluidframework/container-definitions";
import { Container, ConnectionState, Loader } from "@fluidframework/container-loader";

import {
	LocalCodeLoader,
	TestObjectProvider,
	LoaderContainerTracker,
	TestContainerRuntimeFactory,
	ITestObjectProvider,
	TestFluidObjectFactory,
	waitForContainerConnection,
} from "@fluidframework/test-utils";
import {
	getDataStoreFactory,
	TestDataObjectType,
	describeNoCompat,
} from "@fluidframework/test-version-utils";
import { IContainerRuntimeBase } from "@fluidframework/runtime-definitions";

const id = "fluid-test://localhost/containerTest";
const testRequest: IRequest = { url: id };
const codeDetails: IFluidCodeDetails = { package: "test" };
const timeoutMs = 500;

// REVIEW: enable compat testing?
describeNoCompat("Pong", (getTestObjectProvider) => {
	let provider: ITestObjectProvider;
	let clock: SinonFakeTimers;
	const loaderContainerTracker = new LoaderContainerTracker();

	before(async () => {
		provider = getTestObjectProvider();
		// only run the test with local, odsp and frs drivers
		if (
			provider.driver.type !== "local" &&
			provider.driver.type !== "odsp" &&
			provider.driver.endpointName !== "frs"
		) {
			this.skip();
		}
		clock = useFakeTimers();
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

	after(() => {
		clock.restore();
	});

	async function createConnectedContainer(): Promise<Container> {
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

		const container = (await localTestObjectProvider.makeTestContainer()) as Container;
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
		// let initial registration of pong event happen
		clock.tick(60000);
		// real pong events will take at least a minute to fire in real time, so exit test when we receive the real one.
		await new Promise((resolve) => {
			container.deltaManager.on("pong", resolve);
		});
	});
});
