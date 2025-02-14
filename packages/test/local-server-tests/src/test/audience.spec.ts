/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import {
	ICodeDetailsLoader,
	IContainer,
	IFluidCodeDetails,
} from "@fluidframework/container-definitions/internal";
import { Loader } from "@fluidframework/container-loader/internal";
import {
	LocalDocumentServiceFactory,
	LocalResolver,
} from "@fluidframework/local-driver/internal";
import { SharedMap } from "@fluidframework/map/internal";
import { LocalDeltaConnectionServer } from "@fluidframework/server-local-server";
import {
	ContainerRuntimeFactoryWithDefaultDataStore,
	TestFluidObjectFactory,
	timeoutPromise,
	waitForContainerConnection,
} from "@fluidframework/test-utils/internal";

describe("Audience correctness", () => {
	const mapId = "mapKey";
	const codeDetails: IFluidCodeDetails = {
		package: "connectionModeTestPackage",
		config: {},
	};

	const factory: TestFluidObjectFactory = new TestFluidObjectFactory(
		[[mapId, SharedMap.getFactory()]],
		"default",
	);

	const runtimeFactory = new ContainerRuntimeFactoryWithDefaultDataStore({
		defaultFactory: factory,
		registryEntries: [[factory.type, Promise.resolve(factory)]],
	});

	/**
	 * Function to wait for a client with the given clientId to be added to the audience of the given container.
	 */
	async function waitForClientAdd(container: IContainer, clientId: string, errorMsg: string) {
		if (container.audience.getMember(clientId) === undefined) {
			return timeoutPromise(
				(resolve) => {
					const listener = (newClientId: string) => {
						if (newClientId === clientId) {
							container.audience.off("addMember", listener);
							resolve();
						}
					};
					container.audience.on("addMember", (newClientId: string) => listener(newClientId));
				},
				// Wait for 2 seconds to get the client in audience. This wait is needed for a client to get added to its
				// own audience and 2 seconds should be enough time. It it takes longer than this, we might need to
				// reevaluate our assumptions around audience.
				// Also see - https://github.com/microsoft/FluidFramework/issues/7275.
				{ durationMs: 2000, errorMsg },
			);
		}
	}

	it("second client should see first client in audience when it connects immediately after", async () => {
		const codeLoader: ICodeDetailsLoader = {
			// The code loader we pass to a loader just needs to ensure we get the runtime factory for our desired container
			// so we don't need to use the code details parameter in this case.
			load: async (source: IFluidCodeDetails) => {
				return {
					module: {
						fluidExport: runtimeFactory,
					},
					details: source,
				};
			},
		};

		const testDocumentUrl = "https://localhost:8080/test_document_id";
		const deltaConnectionServer = LocalDeltaConnectionServer.create();
		const documentServiceFactory = new LocalDocumentServiceFactory(deltaConnectionServer);
		const urlResolver = new LocalResolver();

		// Create container in first client
		const loader = new Loader({
			urlResolver,
			documentServiceFactory,
			codeLoader,
		});
		const container1 = await loader.createDetachedContainer(codeDetails);
		await container1.attach({
			url: testDocumentUrl,
			headers: {
				createNew: true,
			},
		});

		// Load container from a second client
		const container2 = await loader.resolve({
			url: testDocumentUrl,
		});

		await waitForContainerConnection(container1);
		await waitForContainerConnection(container2);

		// Validate that client1 is added to its own audience.
		assert(container1.clientId !== undefined, "client1 does not have clientId");
		await waitForClientAdd(
			container1,
			container1.clientId,
			"client1's audience doesn't have self",
		);

		// Validate that client2 is added to its own audience.
		assert(container2.clientId !== undefined, "client2 does not have clientId");
		await waitForClientAdd(
			container2,
			container2.clientId,
			"client2's audience doesn't have self",
		);

		// Validate that client2 is added to client1's audience.
		await waitForClientAdd(
			container1,
			container2.clientId,
			"client1's audience doesn't have client2",
		);

		// Validate that client1 is added to client2's audience.
		await waitForClientAdd(
			container2,
			container1.clientId,
			"client2's audience doesn't have client1",
		);
	});
});
