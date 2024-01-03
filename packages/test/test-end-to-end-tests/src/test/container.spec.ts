/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { v4 as uuid } from "uuid";
import { MockDocumentDeltaConnection } from "@fluid-private/test-loader-utils";
import {
	ConfigTypes,
	IConfigProviderBase,
	IErrorBase,
	IRequest,
	IRequestHeader,
} from "@fluidframework/core-interfaces";
import {
	ContainerErrorType,
	IFluidCodeDetails,
	IContainer,
	LoaderHeader,
} from "@fluidframework/container-definitions";
import {
	ConnectionState,
	Loader,
	ILoaderProps,
	waitContainerToCatchUp,
	IContainerExperimental,
} from "@fluidframework/container-loader";
import {
	DriverErrorType,
	FiveDaysMs,
	IAnyDriverError,
	IDocumentServiceFactory,
} from "@fluidframework/driver-definitions";
import {
	LocalCodeLoader,
	TestObjectProvider,
	LoaderContainerTracker,
	TestContainerRuntimeFactory,
	ITestObjectProvider,
	TestFluidObjectFactory,
	timeoutPromise,
	ITestContainerConfig,
	waitForContainerConnection,
} from "@fluidframework/test-utils";
import {
	getDataStoreFactory,
	ITestDataObject,
	TestDataObjectType,
	describeCompat,
	itExpects,
} from "@fluid-private/test-version-utils";
import { DataCorruptionError } from "@fluidframework/telemetry-utils";
import { ContainerRuntime } from "@fluidframework/container-runtime";
import { IClient } from "@fluidframework/protocol-definitions";
import {
	DeltaStreamConnectionForbiddenError,
	NonRetryableError,
} from "@fluidframework/driver-utils";
import { Deferred } from "@fluidframework/core-utils";

const id = "fluid-test://localhost/containerTest";
const testRequest: IRequest = { url: id };
const codeDetails: IFluidCodeDetails = { package: "test" };
const timeoutMs = 500;

// REVIEW: enable compat testing?
describeCompat("Container", "NoCompat", (getTestObjectProvider) => {
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
	async function loadContainer(props?: Partial<ILoaderProps>, headers?: IRequestHeader) {
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

		return loader.resolve({
			url: testRequest.url,
			headers: { ...testRequest.headers, ...headers },
		});
	}

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

	it("Load container successfully", async () => {
		const container = await loadContainer();
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
				service.connectToStorage = () => {
					throw new Error("expectedFailure");
				};
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
		try {
			let disconnectEventRaised = false;
			container.once("disconnected", () => {
				disconnectEventRaised = true;
				assert.strictEqual(
					container.connectionState,
					ConnectionState.Disconnected,
					"Container should be in Disconnected state",
				);
			});
			deltaConnection.dispose();
			// Disconnected event should be raised on next JS turn
			await Promise.resolve();
			assert(disconnectEventRaised, "Disconnected event should be raised");
		} finally {
			deltaConnection.removeAllListeners();
			container.dispose();
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
		const container = await loadContainer({ documentServiceFactory: mockFactory });
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
		} finally {
			deltaConnection.removeAllListeners();
			container.dispose();
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
		const runtimeFactory = (_?: unknown) =>
			new TestContainerRuntimeFactory(TestDataObjectType, getDataStoreFactory(), {});

		const localTestObjectProvider = new TestObjectProvider(
			Loader,
			provider.driver,
			runtimeFactory,
		);

		const container = await localTestObjectProvider.makeTestContainer();
		const dataObject = (await container.getEntryPoint()) as ITestDataObject;

		let runCount = 0;

		dataObject._context.deltaManager.on("readonly", () => {
			runCount++;
		});

		container.forceReadonly?.(true);
		assert.strictEqual(container.readOnlyInfo.readonly, true);

		assert.strictEqual(runCount, 1);
	});

	it("closeAndGetPendingLocalState() called on container", async () => {
		const configProvider = (settings: Record<string, ConfigTypes>): IConfigProviderBase => ({
			getRawConfig: (name: string): ConfigTypes => settings[name],
		});

		const testContainerConfig: ITestContainerConfig = {
			loaderProps: {
				configProvider: configProvider({
					"Fluid.Container.enableOfflineLoad": true,
				}),
			},
		};

		const runtimeFactory = (_?: unknown) =>
			new TestContainerRuntimeFactory(TestDataObjectType, getDataStoreFactory());

		const localTestObjectProvider = new TestObjectProvider(
			Loader,
			provider.driver,
			runtimeFactory,
		);

		const container: IContainerExperimental =
			await localTestObjectProvider.makeTestContainer(testContainerConfig);
		const pendingString = await container.closeAndGetPendingLocalState?.();
		assert.ok(pendingString);
		const pendingLocalState: { url?: string } = JSON.parse(pendingString);
		assert.strictEqual(container.closed, true);
		assert.strictEqual(pendingLocalState.url, container.resolvedUrl?.url);
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
		const runtimeFactory = (_?: unknown) =>
			new TestContainerRuntimeFactory(TestDataObjectType, getDataStoreFactory(), {});

		const localTestObjectProvider = new TestObjectProvider(
			Loader,
			provider.driver,
			runtimeFactory,
		);

		const container1 = await localTestObjectProvider.makeTestContainer();
		await waitForContainerConnection(container1, false, {
			durationMs: timeoutMs,
			errorMsg: "container1 initial connect timeout",
		});
		assert.strictEqual(
			container1.connectionState,
			ConnectionState.Connected,
			"container is not connected after connected event fires",
		);

		const dataObject = (await container1.getEntryPoint()) as ITestDataObject;
		const directory1 = dataObject._root;
		directory1.set("key", "value");
		let value1 = await directory1.get("key");
		assert.strictEqual(value1, "value", "value1 is not set");

		const container2 = await localTestObjectProvider.loadTestContainer();
		await waitForContainerConnection(container2, false, {
			durationMs: timeoutMs,
			errorMsg: "container2 initial connect timeout",
		});
		const dataObjectTest = (await container2.getEntryPoint()) as ITestDataObject;
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

		container.dispose();
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

	it("DeltaStreamConnectionForbidden error on connectToDeltaStream sends deltamanager readonly event", async () => {
		const documentServiceFactory = provider.documentServiceFactory;

		const mockFactory = Object.create(documentServiceFactory) as IDocumentServiceFactory;
		mockFactory.createDocumentService = async (resolvedUrl) => {
			const service = await documentServiceFactory.createDocumentService(resolvedUrl);
			const realDeltaStream = service.connectToDeltaStream;
			service.connectToDeltaStream = async (client) => {
				throw new DeltaStreamConnectionForbiddenError(
					"deltaStreamConnectionForbidden",
					{ driverVersion: "1" },
					"deltaStreamConnectionForbidden",
				);
			};
			return service;
		};
		const container = await loadContainer(
			{ documentServiceFactory: mockFactory },
			{ [LoaderHeader.loadMode]: { deltaConnection: "none" } },
		);

		const readOnlyPromise = new Deferred<boolean>();
		container.deltaManager.on("readonly", (readonly?: boolean) => {
			assert(readonly, "Readonly should be true");
			readOnlyPromise.resolve(true);
		});

		container.connect();
		assert(
			await readOnlyPromise.promise,
			"DeltaManager should send readonly event on DeltaStreamConnectionForbidden error",
		);
	});

	it("OutOfStorageError sends deltamanager readonly event", async () => {
		const documentServiceFactory = provider.documentServiceFactory;

		const mockFactory = Object.create(documentServiceFactory) as IDocumentServiceFactory;
		mockFactory.createDocumentService = async (resolvedUrl) => {
			const service = await documentServiceFactory.createDocumentService(resolvedUrl);
			const realDeltaStream = service.connectToDeltaStream;
			service.connectToDeltaStream = async (client) => {
				throw new NonRetryableError(
					"outOfStorageError",
					DriverErrorType.outOfStorageError,
					{ driverVersion: "1" },
				);
			};
			return service;
		};
		const container = await loadContainer(
			{ documentServiceFactory: mockFactory },
			{ [LoaderHeader.loadMode]: { deltaConnection: "none" } },
		);

		const readOnlyPromise = new Deferred<boolean>();
		container.deltaManager.on(
			"readonly",
			(
				readonly?: boolean,
				readonlyConnectionReason?: { reason: string; error?: IErrorBase },
			) => {
				assert(readonly, "Readonly should be true");
				assert.strictEqual(
					readonlyConnectionReason?.error?.errorType,
					DriverErrorType.outOfStorageError,
					"Error should be outOfStorageError",
				);
				readOnlyPromise.resolve(true);
			},
		);

		container.connect();
		assert(
			await readOnlyPromise.promise,
			"DeltaManager should send readonly event on Out of storage error",
		);
	});

	itExpects(
		"Disposing container should send dispose events",
		[{ eventName: "fluid:telemetry:Container:ContainerDispose", category: "error" }],
		async () => {
			const container = await createConnectedContainer();
			const dataObject = (await container.getEntryPoint()) as ITestDataObject;

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

			container.dispose(new DataCorruptionError("expected", {}));
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
		},
	);

	itExpects(
		"Closing then disposing container should send close and dispose events",
		[
			{ eventName: "fluid:telemetry:Container:ContainerClose", category: "error" },
			{ eventName: "fluid:telemetry:Container:ContainerDispose", category: "generic" },
		],
		async () => {
			const container = await createConnectedContainer();
			const dataObject = (await container.getEntryPoint()) as ITestDataObject;

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

			container.close(new DataCorruptionError("expected", {}));
			container.dispose(new DataCorruptionError("expected", {}));
			assert.strictEqual(containerDisposed, 1, "Container should send disposed event");
			assert.strictEqual(containerClosed, 1, "Container should send closed event");
			assert.strictEqual(deltaManagerDisposed, 1, "DeltaManager should send disposed event");
			assert.strictEqual(deltaManagerClosed, 1, "DeltaManager should send closed event");
			assert.strictEqual(runtimeDispose, 1, "ContainerRuntime should send dispose event");
		},
	);

	// Temporary disable since we reverted the fix that caused an increase in loader bundle size.
	// Tracking alternative fix in AB#4129.
	it.skip("clientDetailsOverride does not cause client details of other containers with the same loader to change", async function () {
		const documentId = uuid();
		const client: IClient = {
			details: {
				capabilities: { interactive: true },
			},
			permission: [],
			scopes: [],
			user: { id: "" },
			mode: "write",
		};
		const loaderProps: Partial<ILoaderProps> = {
			options: {
				client,
			},
		};
		const loader = provider.makeTestLoader({ loaderProps });
		const container1 = await loader.createDetachedContainer(provider.defaultCodeDetails);
		const createNewRequest = provider.driver.createCreateNewRequest(documentId);
		await container1.attach(createNewRequest);

		// Check that client details are the expected ones before resolving a second container with different client details
		assert.equal(
			(container1 as any).clientDetails?.capabilities?.interactive,
			true,
			"First container's client capabilities should say 'interactive: true' before resolving second container",
		);
		assert.equal(
			(container1 as any).clientDetails?.type,
			undefined,
			"First container's clientDetails should have undefined 'type' before resolving second container",
		);

		// Check that the IClient object passed in loader props hasn't been mutated
		assert.equal(
			client.details.capabilities.interactive,
			true,
			"IClient.details.capabilities.interactive should be 'true' before resolving second container",
		);
		assert.equal(
			client.details.type,
			undefined,
			"IClient.details.type should be undefined before resolving second container",
		);

		// Resolve the container a second time with different client details.
		// The contents of the [LoaderHeader.clientDetails] header end up in IContainerLoadOptions.clientDetailsOverride
		// when loading the container during the loader.resolve() call.
		const request: IRequest = {
			headers: {
				[LoaderHeader.cache]: false,
				[LoaderHeader.clientDetails]: {
					capabilities: { interactive: false },
					type: "myContainerType",
				},
				[LoaderHeader.reconnect]: false,
			},
			url: await provider.driver.createContainerUrl(documentId, container1.resolvedUrl),
		};
		const container2 = await loader.resolve(request);

		// Check that the second container's client details are the expected ones
		assert.equal(
			(container2 as any).clientDetails?.capabilities?.interactive,
			false,
			"Second container's capabilities should say 'interactive: false'",
		);
		assert.equal(
			(container2 as any).clientDetails?.type,
			"myContainerType",
			"Second container's clientDetails say 'type: myContainerType'",
		);

		// Check that the first container's client details are still the expected ones after resolving the second container
		assert.equal(
			(container1 as any).clientDetails?.capabilities?.interactive,
			true,
			"First container's capabilities should say 'interactive: true' after resolving second container",
		);
		assert.equal(
			(container1 as any).clientDetails?.type,
			undefined,
			"First container's clientDetails should have undefined 'type' after resolving second container",
		);

		// Check that the IClient object passed in loader props hasn't been mutated
		assert.equal(
			client.details.capabilities.interactive,
			true,
			"IClient.details.capabilities.interactive should be 'true' after resolving second container",
		);
		assert.equal(
			client.details.type,
			undefined,
			"IClient.details.type should be undefined after resolving second container",
		);
	});
});

describeCompat("Driver", "NoCompat", (getTestObjectProvider) => {
	it("Driver Storage Policy Values", async () => {
		const provider = getTestObjectProvider();
		const fiveDaysMs: FiveDaysMs = 432_000_000;

		const { resolvedUrl } = await provider.makeTestContainer();
		assert(resolvedUrl !== undefined, "Missing resolved url");
		const ds = await provider.documentServiceFactory.createDocumentService(resolvedUrl);
		const storage = await ds.connectToStorage();
		assert.equal(storage.policies?.maximumCacheDurationMs, fiveDaysMs);
	});
});
