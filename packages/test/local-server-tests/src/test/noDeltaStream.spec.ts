/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import {
	IContainer,
	IFluidCodeDetails,
	DisconnectReason,
} from "@fluidframework/container-definitions/internal";
import { ConnectionState } from "@fluidframework/container-loader";
import { loadExistingContainer } from "@fluidframework/container-loader/internal";
import { IDocumentServiceFactory } from "@fluidframework/driver-definitions/internal";
import { DeltaStreamConnectionForbiddenError } from "@fluidframework/driver-utils/internal";
import {
	LocalDocumentServiceFactory,
	LocalResolver,
	createLocalResolverCreateNewRequest,
} from "@fluidframework/local-driver/internal";
import { SharedString } from "@fluidframework/sequence/internal";
import {
	ILocalDeltaConnectionServer,
	LocalDeltaConnectionServer,
} from "@fluidframework/server-local-server";
import {
	ITestFluidObject,
	LoaderContainerTracker,
	TestContainerRuntimeFactory,
	TestFluidObjectFactory,
	createAndAttachContainerUsingProps,
	createLoader,
	createLoaderProps,
} from "@fluidframework/test-utils/internal";

describe("No Delta Stream", () => {
	const documentId = "localServerTest";
	const documentLoadUrl = `https://localhost/${documentId}`;
	const stringId = "stringKey";
	const codeDetails: IFluidCodeDetails = {
		package: "localServerTestPackage",
		config: {},
	};
	const factory = new TestContainerRuntimeFactory(
		"",
		new TestFluidObjectFactory([[stringId, SharedString.getFactory()]]),
		{},
	);

	let deltaConnectionServer: ILocalDeltaConnectionServer;
	let loaderContainerTracker: LoaderContainerTracker;

	async function createContainer(): Promise<IContainer> {
		const createDetachedContainerProps = createLoaderProps(
			[[codeDetails, factory]],
			new LocalDocumentServiceFactory(deltaConnectionServer),
			new LocalResolver(),
		);

		const container = await createAndAttachContainerUsingProps(
			{ ...createDetachedContainerProps, codeDetails },
			createLocalResolverCreateNewRequest(documentId),
		);
		loaderContainerTracker.addContainer(container);
		return container;
	}

	async function loadContainer(storageOnly: boolean, track = true): Promise<IContainer> {
		const service = new LocalDocumentServiceFactory(deltaConnectionServer, { storageOnly });
		const loaderProps = createLoaderProps(
			[[codeDetails, factory]],
			service,
			new LocalResolver(),
		);

		const container = await loadExistingContainer({
			...loaderProps,
			request: {
				url: documentLoadUrl,
			},
		});
		if (!storageOnly) {
			loaderContainerTracker.addContainer(container);
		}
		await loaderContainerTracker.ensureSynchronized();
		return container;
	}

	async function loadContainerWithDocServiceFactory(
		documentServiceFactory: IDocumentServiceFactory,
	): Promise<IContainer> {
		const loader = createLoader(
			[[codeDetails, factory]],
			documentServiceFactory,
			new LocalResolver(),
		);
		const container = await loader.resolve({ url: documentLoadUrl });
		await loaderContainerTracker.ensureSynchronized();
		return container;
	}

	beforeEach(async () => {
		deltaConnectionServer = LocalDeltaConnectionServer.create();
		loaderContainerTracker = new LoaderContainerTracker();

		// Create a Container for the first client.
		const container = await createContainer();
		const dataObject = (await container.getEntryPoint()) as ITestFluidObject;

		assert.strictEqual(container.deltaManager.active, false, "active");
		assert.strictEqual(container.deltaManager.readOnlyInfo.readonly, false, "readonly");

		assert.strictEqual(dataObject.runtime.connected, true, "connected");
		assert.notStrictEqual(dataObject.runtime.clientId, undefined, "clientId");

		dataObject.root.set("test", "key");
		await loaderContainerTracker.ensureSynchronized();
	});

	afterEach(() => {
		loaderContainerTracker.reset();
	});

	it("Validate Properties on Loaded Container With No Delta Stream", async () => {
		// Load the Container that was created by the first client.
		const container = await loadContainer(true);

		assert.strictEqual(
			container.connectionState,
			ConnectionState.Connected,
			"container.connected",
		);
		assert.strictEqual(container.clientId, "storage-only client", "container.clientId");
		assert.strictEqual(
			container.readOnlyInfo.readonly,
			true,
			"container.readOnlyInfo.readonly",
		);

		const deltaManager = container.deltaManager;
		assert.strictEqual(deltaManager.active, false, "deltaManager.active");
		assert.ok(deltaManager.readOnlyInfo.readonly, "deltaManager.readOnlyInfo.readonly");
		assert.ok(deltaManager.readOnlyInfo.permissions, "deltaManager.readOnlyInfo.permissions");
		assert.ok(deltaManager.readOnlyInfo.storageOnly, "deltaManager.readOnlyInfo.storageOnly");

		const dataObject = (await container.getEntryPoint()) as ITestFluidObject;
		assert.strictEqual(dataObject.runtime.connected, false, "dataObject.runtime.connected");
		assert.strictEqual(
			dataObject.runtime.clientId,
			"storage-only client",
			"dataObject.runtime.clientId",
		);

		assert.strictEqual(dataObject.root.get("test"), "key", "mapKey");

		container.close(DisconnectReason.Expected);
	});

	it("doesn't affect normal containers", async () => {
		await loadContainer(true);
		const normalContainer1 = await loadContainer(false);
		const normalContainer2 = await loadContainer(false);
		const normalDataObject1 = (await normalContainer1.getEntryPoint()) as ITestFluidObject;
		const normalDataObject2 = (await normalContainer2.getEntryPoint()) as ITestFluidObject;
		normalDataObject1.root.set("fluid", "great");
		normalDataObject2.root.set("prague", "a city in europe");
		await loaderContainerTracker.ensureSynchronized();
		assert.strictEqual(normalDataObject1.root.get("prague"), "a city in europe");
		assert.strictEqual(normalDataObject2.root.get("fluid"), "great");

		const storageOnlyContainer = await loadContainer(true);
		const storageOnlyDataObject =
			(await storageOnlyContainer.getEntryPoint()) as ITestFluidObject;
		assert.strictEqual(storageOnlyDataObject.root.get("prague"), "a city in europe");
		assert.strictEqual(storageOnlyDataObject.root.get("fluid"), "great");
	});

	it("loads in storage-only mode on error thrown from connectToDeltaStream()", async () => {
		const documentServiceFactory = new LocalDocumentServiceFactory(deltaConnectionServer);
		const createDocServ =
			documentServiceFactory.createDocumentService.bind(documentServiceFactory);
		documentServiceFactory.createDocumentService = async (...args) => {
			return createDocServ(...args).then((docService) => {
				docService.connectToDeltaStream = () => {
					throw new DeltaStreamConnectionForbiddenError("asdf", {
						driverVersion: "1.2.3",
					});
				};
				return docService;
			});
		};
		const container = await loadContainerWithDocServiceFactory(documentServiceFactory);

		assert.strictEqual(
			container.connectionState,
			ConnectionState.Connected,
			"container.connected",
		);
		assert.strictEqual(container.clientId, "storage-only client", "container.clientId");
		assert.strictEqual(
			container.readOnlyInfo.readonly,
			true,
			"container.readOnlyInfo.readonly",
		);
		assert.ok(container.readOnlyInfo.readonly, "container.storageOnly");

		const deltaManager = container.deltaManager;
		assert.strictEqual(deltaManager.active, false, "deltaManager.active");
		assert.ok(deltaManager.readOnlyInfo.readonly, "deltaManager.readOnlyInfo.readonly");
		assert.ok(deltaManager.readOnlyInfo.permissions, "deltaManager.readOnlyInfo.permissions");
		assert.ok(deltaManager.readOnlyInfo.storageOnly, "deltaManager.readOnlyInfo.storageOnly");

		const dataObject = (await container.getEntryPoint()) as ITestFluidObject;
		assert.strictEqual(dataObject.runtime.connected, false, "dataObject.runtime.connected");
		assert.strictEqual(
			dataObject.runtime.clientId,
			"storage-only client",
			"dataObject.runtime.clientId",
		);

		assert.strictEqual(dataObject.root.get("test"), "key", "mapKey");

		container.close(DisconnectReason.Expected);
	});

	afterEach(async () => {
		await deltaConnectionServer.webSocketServer.close();
	});
});
