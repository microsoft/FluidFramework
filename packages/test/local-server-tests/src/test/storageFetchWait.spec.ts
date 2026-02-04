/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { ContainerRuntimeFactoryWithDefaultDataStore } from "@fluidframework/aqueduct/internal";
import type {
	IContainer,
	IFluidCodeDetails,
} from "@fluidframework/container-definitions/internal";
import { ConnectionState } from "@fluidframework/container-loader";
import {
	loadExistingContainer,
	type ILoaderProps,
} from "@fluidframework/container-loader/internal";
import type { ConfigTypes, IConfigProviderBase } from "@fluidframework/core-interfaces";
import {
	LocalDocumentServiceFactory,
	LocalResolver,
} from "@fluidframework/local-driver/internal";
import { SharedMap } from "@fluidframework/map/internal";
import {
	type ILocalDeltaConnectionServer,
	LocalDeltaConnectionServer,
} from "@fluidframework/server-local-server";
import {
	createAndAttachContainerUsingProps,
	LoaderContainerTracker,
	LocalCodeLoader,
	TestFluidObjectFactory,
	waitForContainerConnection,
} from "@fluidframework/test-utils/internal";

const configProvider = (settings: Record<string, ConfigTypes>): IConfigProviderBase => ({
	getRawConfig: (name: string): ConfigTypes => settings[name],
});

describe("Storage fetch wait for Connected state", () => {
	const documentId = "storageFetchWaitTest";
	const documentLoadUrl = `https://localhost/${documentId}`;
	const mapId = "mapKey";
	const codeDetails: IFluidCodeDetails = {
		package: "storageFetchWaitTestPackage",
		config: {},
	};

	let urlResolver: LocalResolver;
	let deltaConnectionServer: ILocalDeltaConnectionServer;
	let documentServiceFactory: LocalDocumentServiceFactory;
	let loaderContainerTracker: LoaderContainerTracker;

	function createLoaderProps(): ILoaderProps {
		const factory = new TestFluidObjectFactory([[mapId, SharedMap.getFactory()]], "default");

		const runtimeFactory = new ContainerRuntimeFactoryWithDefaultDataStore({
			defaultFactory: factory,
			registryEntries: [[factory.type, Promise.resolve(factory)]],
		});

		const codeLoader = new LocalCodeLoader([[codeDetails, runtimeFactory]]);

		return {
			urlResolver,
			documentServiceFactory,
			codeLoader,
		};
	}

	async function createContainer(): Promise<IContainer> {
		const loaderProps = createLoaderProps();
		const container = await createAndAttachContainerUsingProps(
			{ ...loaderProps, codeDetails },
			urlResolver.createCreateNewRequest(documentId),
		);
		loaderContainerTracker.addContainer(container);
		return container;
	}

	beforeEach(async () => {
		deltaConnectionServer = LocalDeltaConnectionServer.create();
		documentServiceFactory = new LocalDocumentServiceFactory(deltaConnectionServer);
		urlResolver = new LocalResolver();
		loaderContainerTracker = new LoaderContainerTracker();

		// Create and attach a container first to establish the document
		const container = await createContainer();
		await waitForContainerConnection(container);
	});

	afterEach(() => {
		loaderContainerTracker.reset();
	});

	it("Container waits for storage fetch before transitioning to Connected", async () => {
		const loaderProps = createLoaderProps();

		// Load an existing container
		const container = await loadExistingContainer({
			...loaderProps,
			request: { url: documentLoadUrl },
		});
		loaderContainerTracker.addContainer(container);

		// Wait for container to be connected
		await waitForContainerConnection(container);

		// Verify we reached Connected state
		assert.strictEqual(
			container.connectionState,
			ConnectionState.Connected,
			"Container should be in Connected state",
		);
	});

	it("Container respects DisableStorageFetchWait config flag", async () => {
		const loaderProps = createLoaderProps();

		// Create loader props with the opt-out flag
		const propsWithOptOut: ILoaderProps = {
			...loaderProps,
			configProvider: configProvider({
				"Fluid.Container.DisableStorageFetchWait": true,
			}),
		};

		// Load container with opt-out flag
		const container = await loadExistingContainer({
			...propsWithOptOut,
			request: { url: documentLoadUrl },
		});
		loaderContainerTracker.addContainer(container);

		// Wait for container to be connected
		await waitForContainerConnection(container);

		// Verify we reached Connected state
		assert.strictEqual(
			container.connectionState,
			ConnectionState.Connected,
			"Container should be in Connected state even with opt-out",
		);
	});

	it("Multiple containers can connect and reach Connected state", async () => {
		const loaderProps = createLoaderProps();

		// Load a second container
		const container2 = await loadExistingContainer({
			...loaderProps,
			request: { url: documentLoadUrl },
		});
		loaderContainerTracker.addContainer(container2);

		// Wait for container to be connected
		await waitForContainerConnection(container2);

		// Load a third container
		const container3 = await loadExistingContainer({
			...loaderProps,
			request: { url: documentLoadUrl },
		});
		loaderContainerTracker.addContainer(container3);

		// Wait for container to be connected
		await waitForContainerConnection(container3);

		// Verify both containers reached Connected state
		assert.strictEqual(
			container2.connectionState,
			ConnectionState.Connected,
			"Container 2 should be in Connected state",
		);
		assert.strictEqual(
			container3.connectionState,
			ConnectionState.Connected,
			"Container 3 should be in Connected state",
		);
	});
});
