/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { IRequest } from "@fluidframework/core-interfaces";
import {
	IPendingLocalState,
	ContainerErrorType,
	LoaderHeader,
	IFluidCodeDetails,
} from "@fluidframework/container-definitions";
import {
	Container,
	ConnectionState,
	Loader,
	ILoaderProps,
	waitContainerToCatchUp,
} from "@fluidframework/container-loader";
import {
	DriverErrorType,
	FiveDaysMs,
	IDocumentServiceFactory,
	IFluidResolvedUrl,
} from "@fluidframework/driver-definitions";
import { MockDocumentDeltaConnection } from "@fluidframework/test-loader-utils";
import {
	LocalCodeLoader,
	TestObjectProvider,
	LoaderContainerTracker,
	TestContainerRuntimeFactory,
	ITestObjectProvider,
	TestFluidObjectFactory,
	timeoutPromise,
	waitForContainerConnection,
} from "@fluidframework/test-utils";
import { ensureFluidResolvedUrl, IAnyDriverError } from "@fluidframework/driver-utils";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import {
	getDataStoreFactory,
	ITestDataObject,
	TestDataObjectType,
	describeNoCompat,
	itExpects,
} from "@fluidframework/test-version-utils";
import { IContainerRuntimeBase } from "@fluidframework/runtime-definitions";
import { ContainerRuntime } from "@fluidframework/container-runtime";

const id = "fluid-test://localhost/containerTest";
const testRequest: IRequest = { url: id };
const codeDetails: IFluidCodeDetails = { package: "test" };
const timeoutMs = 500;

// REVIEW: enable compat testing?
describeNoCompat("Container", (getTestObjectProvider) => {
	let provider: ITestObjectProvider;
	const loaderContainerTracker = new LoaderContainerTracker();
	before(function () {
		provider = getTestObjectProvider();

		// TODO: Convert these to mocked unit test. These are all API tests and doesn't
		// need the service.  For new disable the tests other than local driver
		if (provider.driver.type !== "local") {
			this.skip();
		}
	});
	before(async () => {
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
	async function loadContainer(props?: Partial<ILoaderProps>) {
		const loader = new Loader({
			...props,
			logger: provider.logger,
			urlResolver: props?.urlResolver ?? provider.urlResolver,
			documentServiceFactory:
				props?.documentServiceFactory ?? provider.documentServiceFactory,
			codeLoader:
				props?.codeLoader ??
				new LocalCodeLoader([[codeDetails, new TestFluidObjectFactory([])]]),
		});
		loaderContainerTracker.add(loader);

		const testResolved = await loader.services.urlResolver.resolve(testRequest);
		ensureFluidResolvedUrl(testResolved);
		return Container.load(loader, {
			canReconnect: testRequest.headers?.[LoaderHeader.reconnect],
			clientDetailsOverride: testRequest.headers?.[LoaderHeader.clientDetails],
			resolvedUrl: testResolved,
			version: testRequest.headers?.[LoaderHeader.version] ?? undefined,
			loadMode: testRequest.headers?.[LoaderHeader.loadMode],
		});
	}

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

	it("Load container successfully", async () => {
		const container = await loadContainer();
		assert.strictEqual(
			container.clientDetails.capabilities.interactive,
			true,
			"Client details should be set with interactive as true",
		);
	});

	itExpects(
		"Load container unsuccessfully",
		[
			{ eventName: "fluid:telemetry:Container:ContainerClose", error: "expectedFailure" },
			{ eventName: "fluid:telemetry:Container:ContainerDispose", error: "expectedFailure" },
			{
				eventName: "TestException",
				error: "expectedFailure",
				errorType: ContainerErrorType.genericError,
			},
		],
		async () => {
			const documentServiceFactory = provider.documentServiceFactory;
			const mockFactory = Object.create(documentServiceFactory) as IDocumentServiceFactory;
			// Issue typescript-eslint/typescript-eslint #1256
			mockFactory.createDocumentService = async (resolvedUrl) => {
				const service = await documentServiceFactory.createDocumentService(resolvedUrl);
				// Issue typescript-eslint/typescript-eslint #1256
				service.connectToStorage = async () => Promise.reject(new Error("expectedFailure"));
				return service;
			};

			await loadContainer({ documentServiceFactory: mockFactory });
		},
	);

	itExpects(
		"Load container with error",
		[
			{
				eventName: "fluid:telemetry:DeltaManager:GetDeltas_Exception",
				error: "expectedFailure",
			},
			{ eventName: "fluid:telemetry:Container:ContainerClose", error: "expectedFailure" },
			{ eventName: "fluid:telemetry:Container:ContainerDispose", error: "expectedFailure" },
			{
				eventName: "TestException",
				error: "expectedFailure",
				errorType: ContainerErrorType.genericError,
			},
		],
		async () => {
			const documentServiceFactory = provider.documentServiceFactory;
			const mockFactory = Object.create(documentServiceFactory) as IDocumentServiceFactory;
			// Issue typescript-eslint/typescript-eslint #1256
			mockFactory.createDocumentService = async (resolvedUrl) => {
				const service = await documentServiceFactory.createDocumentService(resolvedUrl);
				// Issue typescript-eslint/typescript-eslint #1256
				service.connectToDeltaStorage = async () =>
					Promise.reject(new Error("expectedFailure"));
				return service;
			};
			const container2 = await loadContainer({ documentServiceFactory: mockFactory });
			await waitContainerToCatchUp(container2);
		},
	);

	it("Raise disconnected event", async () => {
		const deltaConnection = new MockDocumentDeltaConnection("test");
		const documentServiceFactory = provider.documentServiceFactory;
		const mockFactory = Object.create(documentServiceFactory) as IDocumentServiceFactory;
		// Issue typescript-eslint/typescript-eslint #1256
		mockFactory.createDocumentService = async (resolvedUrl) => {
			const service = await documentServiceFactory.createDocumentService(resolvedUrl);
			// Issue typescript-eslint/typescript-eslint #1256
			service.connectToDeltaStream = async () => deltaConnection;
			return service;
		};

		const container = await loadContainer({ documentServiceFactory: mockFactory });
		assert.strictEqual(
			container.connectionState,
			ConnectionState.CatchingUp,
			"Container should be in Connecting state",
		);
		// Note: this will create infinite loop of reconnects as every reconnect would bring closed connection.
		// Only closing container will break that cycle.
		deltaConnection.dispose();
		try {
			assert.strictEqual(
				container.connectionState,
				ConnectionState.Disconnected,
				"Container should be in Disconnected state",
			);

			// 'disconnected' event listener should be invoked right after registration
			let disconnectedEventArgs;
			container.on("disconnected", (...args) => {
				disconnectedEventArgs = args;
			});
			await Promise.resolve();
			assert.deepEqual(disconnectedEventArgs, []);
		} finally {
			deltaConnection.removeAllListeners();
			container.close();
		}
	});

	it("Raise connection error event", async () => {
		const deltaConnection = new MockDocumentDeltaConnection("test");
		const documentServiceFactory = provider.documentServiceFactory;
		const mockFactory = Object.create(documentServiceFactory) as IDocumentServiceFactory;
		// Issue typescript-eslint/typescript-eslint #1256
		mockFactory.createDocumentService = async (resolvedUrl) => {
			const service = await documentServiceFactory.createDocumentService(resolvedUrl);
			// Issue typescript-eslint/typescript-eslint #1256
			service.connectToDeltaStream = async () => deltaConnection;
			return service;
		};
		let errorRaised = false;
		const container = await loadContainer({ documentServiceFactory: mockFactory });
		container.on("error", () => {
			errorRaised = true;
		});
		assert.strictEqual(
			container.connectionState,
			ConnectionState.CatchingUp,
			"Container should be in Connecting state",
		);
		const err: IAnyDriverError = {
			errorType: DriverErrorType.genericError,
			message: "Test error",
			canRetry: false,
		};
		// Note: this will create infinite loop of reconnects as every reconnect would bring closed connection.
		// Only closing container will break that cycle.
		deltaConnection.emitError(err);
		try {
			assert.strictEqual(
				container.connectionState,
				ConnectionState.Disconnected,
				"Container should be in Disconnected state",
			);
			// All errors on socket are not critical!
			assert.strictEqual(container.closed, false, "Container should not be closed");
			assert.strictEqual(errorRaised, false, "Error event should not be raised.");
		} finally {
			deltaConnection.removeAllListeners();
			container.close();
		}
	});

	it("Close called on container", async () => {
		const deltaConnection = new MockDocumentDeltaConnection("test");
		const documentServiceFactory = provider.documentServiceFactory;
		const mockFactory = Object.create(documentServiceFactory) as IDocumentServiceFactory;
		// Issue typescript-eslint/typescript-eslint #1256
		mockFactory.createDocumentService = async (resolvedUrl) => {
			const service = await documentServiceFactory.createDocumentService(resolvedUrl);
			// Issue typescript-eslint/typescript-eslint #1256
			service.connectToDeltaStream = async () => deltaConnection;
			return service;
		};
		const container = await loadContainer({ documentServiceFactory: mockFactory });
		container.on("error", () => {
			assert.ok(false, "Error event should not be raised.");
		});
		assert.strictEqual(
			container.connectionState,
			ConnectionState.CatchingUp,
			"Container should be in Connecting state",
		);
		container.close();
		assert.strictEqual(
			container.connectionState,
			ConnectionState.Disconnected,
			"Container should be in Disconnected state",
		);
		assert.strictEqual(container.closed, true, "Container should be closed");
		deltaConnection.removeAllListeners();
	});

	it("Delta manager receives readonly event when calling container.forceReadonly()", async () => {
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
		const dataObject = await requestFluidObject<ITestDataObject>(container, "default");

		let runCount = 0;

		dataObject._context.deltaManager.on("readonly", () => {
			runCount++;
		});

		container.forceReadonly(true);
		assert.strictEqual(container.readOnlyInfo.readonly, true);

		assert.strictEqual(runCount, 1);
	});

	it("closeAndGetPendingLocalState() called on container", async () => {
		const runtimeFactory = (_?: unknown) =>
			new TestContainerRuntimeFactory(TestDataObjectType, getDataStoreFactory(), {
				enableOfflineLoad: true,
			});

		const localTestObjectProvider = new TestObjectProvider(
			Loader,
			provider.driver,
			runtimeFactory,
		);

		const container = (await localTestObjectProvider.makeTestContainer()) as Container;

		const pendingLocalState: IPendingLocalState = JSON.parse(
			container.closeAndGetPendingLocalState(),
		);
		assert.strictEqual(container.closed, true);
		assert.strictEqual(pendingLocalState.url, (container.resolvedUrl as IFluidResolvedUrl).url);
	});

	it("can call connect() and disconnect() on Container", async () => {
		const container = await createConnectedContainer();

		let disconnectedEventFired = false;
		container.once("disconnected", () => {
			disconnectedEventFired = true;
		});
		container.disconnect();
		assert(
			disconnectedEventFired,
			"disconnected event didn't fire when calling container.disconnect",
		);
		assert.strictEqual(
			container.connectionState,
			ConnectionState.Disconnected,
			"container can't disconnect()",
		);

		container.connect();
		await waitForContainerConnection(container, true, {
			durationMs: timeoutMs,
			errorMsg: "container connect() timeout",
		});
		assert.strictEqual(
			container.connectionState,
			ConnectionState.Connected,
			"container can't connect()",
		);
	});

	it("can control op processing with connect() and disconnect()", async () => {
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

		const container1 = (await localTestObjectProvider.makeTestContainer()) as Container;
		await waitForContainerConnection(container1, false, {
			durationMs: timeoutMs,
			errorMsg: "container1 initial connect timeout",
		});
		assert.strictEqual(
			container1.connectionState,
			ConnectionState.Connected,
			"container is not connected after connected event fires",
		);

		const dataObject = await requestFluidObject<ITestDataObject>(container1, "default");
		const directory1 = dataObject._root;
		directory1.set("key", "value");
		let value1 = await directory1.get("key");
		assert.strictEqual(value1, "value", "value1 is not set");

		const container2 = (await localTestObjectProvider.loadTestContainer()) as Container;
		await waitForContainerConnection(container2, false, {
			durationMs: timeoutMs,
			errorMsg: "container2 initial connect timeout",
		});
		const dataObjectTest = await requestFluidObject<ITestDataObject>(container2, "default");
		const directory2 = dataObjectTest._root;
		await localTestObjectProvider.ensureSynchronized();
		let value2 = await directory2.get("key");
		assert.strictEqual(value2, "value", "value2 is not set");

		let disconnectedEventFired = false;
		container2.once("disconnected", () => {
			disconnectedEventFired = true;
		});
		container2.disconnect();
		assert(
			disconnectedEventFired,
			"disconnected event didn't fire when calling container.disconnect",
		);
		assert.strictEqual(
			container2.connectionState,
			ConnectionState.Disconnected,
			"container can't disconnect()",
		);

		directory1.set("key", "new-value");
		value1 = await directory1.get("key");
		assert.strictEqual(value1, "new-value", "value1 is not changed");

		const valueChangePromise = timeoutPromise(
			(resolve) => directory2.once("valueChanged", () => resolve()),
			{ durationMs: timeoutMs, errorMsg: "valueChanged timeout (expected error)" },
		);
		await assert.rejects(valueChangePromise, "valueChanged event fired while disconnected");
		value2 = await directory2.get("key");
		assert.notStrictEqual(value1, value2, "container2 processing ops after disconnect()");

		container2.connect();
		await timeoutPromise((resolve) => directory2.once("valueChanged", () => resolve()), {
			durationMs: timeoutMs,
			errorMsg: "valueChanged timeout after connect()",
		});
		value2 = await directory2.get("key");
		assert.strictEqual(value1, value2, "container2 not processing ops after connect()");
	});

	it("can cancel connect() with disconnect()", async () => {
		const container = await createConnectedContainer();

		container.disconnect();

		container.connect();
		container.disconnect();
		const connectPromise = waitForContainerConnection(container, true, {
			durationMs: timeoutMs,
			errorMsg: "connected timeout (expected error)",
		});
		await assert.rejects(connectPromise, "connected event fired after cancelling");
		assert.strictEqual(
			container.connectionState,
			ConnectionState.Disconnected,
			"container connected after disconnect()",
		);
		assert.strictEqual(
			(container as any).deltaManager.connectionManager.pendingConnection,
			undefined,
			"pendingConnection is not undefined",
		);
	});

	it("can call connect() twice", async () => {
		const container = await createConnectedContainer();

		container.disconnect();

		container.connect();
		container.connect();
		await waitForContainerConnection(container, true, {
			durationMs: timeoutMs,
			errorMsg: "container connected event timeout",
		});
		assert.strictEqual(
			container.connectionState,
			ConnectionState.Connected,
			"container not connected after two connect() calls",
		);
	});

	it("can call connect() twice to change the connection mode", async () => {
		const container = await createConnectedContainer();

		container.disconnect();

		container.connect();
		(container as any).deltaManager.connectionManager.shouldJoinWrite = () => {
			return true;
		};
		container.connect();

		await waitForContainerConnection(container, true, {
			durationMs: timeoutMs,
			errorMsg: "container connected event timeout",
		});

		assert.strictEqual(
			(container as any).connectionMode,
			"write",
			"container in read mode after connecting with pending op",
		);
	});

	it("can cancel call connect() twice then cancel with disconnect()", async () => {
		const container = await createConnectedContainer();

		container.disconnect();

		container.connect();
		container.connect();
		container.disconnect();
		const connectPromise = waitForContainerConnection(container, true, {
			durationMs: timeoutMs,
			errorMsg: "connected timeout (expected error)",
		});
		await assert.rejects(connectPromise, "connected event fired after cancelling");
		assert.strictEqual(
			container.connectionState,
			ConnectionState.Disconnected,
			"container connected after disconnect()",
		);
		assert.strictEqual(
			(container as any).deltaManager.connectionManager.pendingConnection,
			undefined,
			"pendingConnection is not undefined",
		);
	});

	it("can rapidly call connect() and disconnect()", async () => {
		const container = await createConnectedContainer();

		container.disconnect();

		container.connect();
		container.disconnect();
		container.connect();
		container.disconnect();
		container.connect();
		await waitForContainerConnection(container, true, {
			durationMs: timeoutMs,
			errorMsg: "connected event not fired after rapid disconnect() + connect()",
		});
		assert.strictEqual(
			container.connectionState,
			ConnectionState.Connected,
			"container is not connected after rapid disconnect() + connect()",
		);
	});

	it("Disposing container does not send deltaManager readonly event", async () => {
		const container = await createConnectedContainer();

		let run = 0;
		container.deltaManager.on("readonly", () => run++);

		container.dispose?.();
		assert.strictEqual(
			run,
			0,
			"DeltaManager should not send readonly event on container dispose",
		);
	});

	it("Closing container sends deltaManager readonly event", async () => {
		const container = await createConnectedContainer();

		let run = 0;
		container.deltaManager.on("readonly", () => run++);

		container.close();
		assert.strictEqual(run, 1, "DeltaManager should send readonly event on container close");
	});

	it("Disposing container should send dispose events", async () => {
		const container = await createConnectedContainer();
		const dataObject = await requestFluidObject<ITestDataObject>(container, "default");

		let containerDisposed = 0;
		let containerClosed = 0;
		let deltaManagerDisposed = 0;
		let deltaManagerClosed = 0;
		let runtimeDispose = 0;
		container.on("disposed", () => containerDisposed++);
		container.on("closed", () => containerClosed++);
		(container.deltaManager as any).on("disposed", () => deltaManagerDisposed++);
		(container.deltaManager as any).on("closed", () => deltaManagerClosed++);
		(dataObject._context.containerRuntime as ContainerRuntime).on(
			"dispose",
			() => runtimeDispose++,
		);

		container.dispose?.();
		assert.strictEqual(
			containerDisposed,
			1,
			"Container should send disposed event on container dispose",
		);
		assert.strictEqual(
			containerClosed,
			0,
			"Container should not send closed event on container dispose",
		);
		assert.strictEqual(
			deltaManagerDisposed,
			1,
			"DeltaManager should send disposed event on container dispose",
		);
		assert.strictEqual(
			deltaManagerClosed,
			0,
			"DeltaManager should not send closed event on container dispose",
		);
		assert.strictEqual(
			runtimeDispose,
			1,
			"ContainerRuntime should send dispose event on container dispose",
		);
	});

	it("Closing then disposing container should send close and dispose events", async () => {
		const container = await createConnectedContainer();
		const dataObject = await requestFluidObject<ITestDataObject>(container, "default");

		let containerDisposed = 0;
		let containerClosed = 0;
		let deltaManagerDisposed = 0;
		let deltaManagerClosed = 0;
		let runtimeDispose = 0;
		container.on("disposed", () => containerDisposed++);
		container.on("closed", () => containerClosed++);
		(container.deltaManager as any).on("disposed", () => deltaManagerDisposed++);
		(container.deltaManager as any).on("closed", () => deltaManagerClosed++);
		(dataObject._context.containerRuntime as ContainerRuntime).on(
			"dispose",
			() => runtimeDispose++,
		);

		container.close();
		container.dispose?.();
		assert.strictEqual(containerDisposed, 1, "Container should send disposed event");
		assert.strictEqual(containerClosed, 1, "Container should send closed event");
		assert.strictEqual(deltaManagerDisposed, 1, "DeltaManager should send disposed event");
		assert.strictEqual(deltaManagerClosed, 1, "DeltaManager should send closed event");
		assert.strictEqual(runtimeDispose, 1, "ContainerRuntime should send dispose event");
	});
});

describeNoCompat("Driver", (getTestObjectProvider) => {
	it("Driver Storage Policy Values", async () => {
		const provider = getTestObjectProvider();
		const fiveDaysMs: FiveDaysMs = 432_000_000;

		const container = (await provider.makeTestContainer()) as Container;
		assert.equal(container.storage.policies?.maximumCacheDurationMs, fiveDaysMs);
	});
});
