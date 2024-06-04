/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import {
	IContainer,
	IFluidCodeDetails,
	IHostLoader,
	ILoaderOptions,
} from "@fluidframework/container-definitions/internal";
import { IUrlResolver, MessageType } from "@fluidframework/driver-definitions/internal";
import { LocalDocumentServiceFactory, LocalResolver } from "@fluidframework/local-driver/internal";
import { SharedString } from "@fluidframework/sequence/internal";
import {
	ILocalDeltaConnectionServer,
	LocalDeltaConnectionServer,
} from "@fluidframework/server-local-server";
import {
	ITestFluidObject,
	LoaderContainerTracker,
	TestFluidObjectFactory,
	createAndAttachContainer,
	createLoader,
} from "@fluidframework/test-utils/internal";

/**
 * Creates a loader with the given package entries and a delta connection server.
 * @param packageEntries - A list of code details to Fluid entry points.
 * @param deltaConnectionServer - The delta connection server to use as the server.
 */
function createLocalLoader(
	packageEntries: Iterable<[IFluidCodeDetails, TestFluidObjectFactory]>,
	deltaConnectionServer: ILocalDeltaConnectionServer,
	urlResolver: IUrlResolver,
	options?: ILoaderOptions,
): IHostLoader {
	const documentServiceFactory = new LocalDocumentServiceFactory(deltaConnectionServer);

	return createLoader(packageEntries, documentServiceFactory, urlResolver, undefined, options);
}

describe("LocalTestServer", () => {
	const documentId = "localServerTest";
	const documentLoadUrl = `https://localhost/${documentId}`;
	const stringId = "stringKey";
	const codeDetails: IFluidCodeDetails = {
		package: "localServerTestPackage",
		config: {},
	};
	const factory = new TestFluidObjectFactory([[stringId, SharedString.getFactory()]]);

	let deltaConnectionServer: ILocalDeltaConnectionServer;
	let urlResolver: LocalResolver;
	let loaderContainerTracker: LoaderContainerTracker;
	let container1: IContainer;
	let container2: IContainer;
	let dataObject1: ITestFluidObject;
	let dataObject2: ITestFluidObject;
	let sharedString1: SharedString;
	let sharedString2: SharedString;

	async function createContainer(): Promise<IContainer> {
		const loader = createLocalLoader(
			[[codeDetails, factory]],
			deltaConnectionServer,
			urlResolver,
		);
		loaderContainerTracker.add(loader);
		return createAndAttachContainer(
			codeDetails,
			loader,
			urlResolver.createCreateNewRequest(documentId),
		);
	}

	async function loadContainer(): Promise<IContainer> {
		const loader = createLocalLoader(
			[[codeDetails, factory]],
			deltaConnectionServer,
			urlResolver,
		);
		loaderContainerTracker.add(loader);
		return loader.resolve({ url: documentLoadUrl });
	}

	beforeEach(async () => {
		deltaConnectionServer = LocalDeltaConnectionServer.create();
		urlResolver = new LocalResolver();
		loaderContainerTracker = new LoaderContainerTracker();

		// Create a Container for the first client.
		container1 = await createContainer();
		dataObject1 = (await container1.getEntryPoint()) as ITestFluidObject;
		sharedString1 = await dataObject1.getSharedObject<SharedString>(stringId);

		// Load the Container that was created by the first client.
		container2 = await loadContainer();
		dataObject2 = (await container2.getEntryPoint()) as ITestFluidObject;
		sharedString2 = await dataObject2.getSharedObject<SharedString>(stringId);
	});

	afterEach(() => {
		loaderContainerTracker.reset();
	});

	describe("Attach Op Handlers on Both Clients", () => {
		it("Validate messaging", async () => {
			let user1ReceivedMsgCount: number = 0;
			let user2ReceivedMsgCount: number = 0;

			// Perform couple of bugs in sharedString1. The first Container is in read-only mode so the first op it
			// sends will get nack'd and is re-sent. Do it here so that this does not mess with rest of the test.
			// sharedString1.insertText(0, "A");
			// sharedString1.removeText(0, 1);
			// await opProcessingController.process();

			sharedString1.on("op", (msg, local) => {
				if (!local) {
					if (msg.type === MessageType.Operation) {
						user1ReceivedMsgCount = user1ReceivedMsgCount + 1;
					}
				}
			});

			sharedString2.on("op", (msg, local) => {
				if (!local) {
					if (msg.type === MessageType.Operation) {
						user2ReceivedMsgCount = user2ReceivedMsgCount + 1;
					}
				}
			});

			await loaderContainerTracker.pauseProcessing();

			sharedString1.insertText(0, "A");
			sharedString2.insertText(0, "C");
			assert.equal(user1ReceivedMsgCount, 0, "User1 received message count is incorrect");
			assert.equal(user2ReceivedMsgCount, 0, "User2 received message count is incorrect");

			await loaderContainerTracker.ensureSynchronized(container1);
			assert.equal(user1ReceivedMsgCount, 0, "User1 received message count is incorrect");
			assert.equal(user2ReceivedMsgCount, 0, "User2 received message count is incorrect");

			await loaderContainerTracker.ensureSynchronized(container2);
			assert.equal(user1ReceivedMsgCount, 0, "User1 received message count is incorrect");
			assert.equal(user2ReceivedMsgCount, 1, "User2 received message count is incorrect");

			await loaderContainerTracker.processIncoming(container1);
			assert.equal(user1ReceivedMsgCount, 1, "User1 received message count is incorrect");
			assert.equal(user2ReceivedMsgCount, 1, "User2 received message count is incorrect");

			sharedString1.insertText(0, "B");
			await loaderContainerTracker.ensureSynchronized();

			assert.equal(
				sharedString1.getText(),
				sharedString2.getText(),
				"Shared string not synced",
			);
			assert.equal(sharedString1.getText().length, 3, sharedString1.getText());
			assert.equal(user1ReceivedMsgCount, 1, "User1 received message count is incorrect");
			assert.equal(user2ReceivedMsgCount, 2, "User2 received message count is incorrect");
		});
	});

	afterEach(async () => {
		await deltaConnectionServer.webSocketServer.close();
	});
});
