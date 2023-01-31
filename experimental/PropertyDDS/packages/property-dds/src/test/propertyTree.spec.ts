/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import _ from "lodash";

import { expect } from "chai";
import {
	IContainer,
	IHostLoader,
	ILoaderOptions,
	IFluidCodeDetails,
} from "@fluidframework/container-definitions";
import { LocalResolver, LocalDocumentServiceFactory } from "@fluidframework/local-driver";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import {
	LocalDeltaConnectionServer,
	ILocalDeltaConnectionServer,
} from "@fluidframework/server-local-server";
import { IUrlResolver } from "@fluidframework/driver-definitions";
import {
	createAndAttachContainer,
	createLoader,
	LoaderContainerTracker,
	ITestFluidObject,
	TestFluidObjectFactory,
	TestObjectProvider,
	TestContainerRuntimeFactory,
	ChannelFactoryRegistry,
	ITestObjectProvider,
	createSummarizer,
	summarizeNow,
} from "@fluidframework/test-utils";
import {
	PropertyFactory,
	StringProperty,
	BaseProperty,
	NodeProperty,
	ArrayProperty,
} from "@fluid-experimental/property-properties";
import { Loader as ContainerLoader } from "@fluidframework/container-loader";
import { LocalServerTestDriver } from "@fluidframework/test-drivers";
import { DeflatedPropertyTree, LZ4PropertyTree } from "../propertyTreeExt";
import { SharedPropertyTree } from "../propertyTree";
import { PropertyTreeFactory } from "../propertyTreeFactory";

interface Result {
	container: IContainer;
	client: SharedPropertyTree;
	dataObject: ITestFluidObject;
}

interface withSummarizer extends Result {
	summarizer: Awaited<ReturnType<typeof createSummarizer>>;
}

describe("PropertyDDS summarizer", () => {
	let objProvider: ITestObjectProvider;
	const propertyDdsId = "PropertyTree";
	const USERS = "users";
	const getClient = async (withSummarizer = false, load = false) => {
		const container = await (load
			? objProvider.loadTestContainer()
			: objProvider.makeTestContainer());
		const dataObject = await requestFluidObject<ITestFluidObject>(container, "/");

		let summarizer;
		if (withSummarizer) {
			summarizer = await getSummarizer(container);
		}
		const client = await dataObject.getSharedObject<SharedPropertyTree>(propertyDdsId);
		const res: withSummarizer = {
			summarizer,
			client,
			dataObject,
			container,
		};
		return res;
	};

	const getSummarizer = async (container) => {
		const summarizer = await createSummarizer(objProvider, container);
		return summarizer;
	};

	const createUserNode = (name: string) => {
		const node = PropertyFactory.create<NodeProperty>("NodeProperty");
		node.insert("name", PropertyFactory.create("String", undefined, name));
	};

	beforeEach(async () => {
		const driver = new LocalServerTestDriver();
		const registry = [[propertyDdsId, new PropertyTreeFactory()]] as ChannelFactoryRegistry;

		objProvider = new TestObjectProvider(
			ContainerLoader as any,
			driver,
			() =>
				new TestContainerRuntimeFactory(
					"@fluid-experimental/test-propertyTree",
					new TestFluidObjectFactory(registry),
				),
		);
	});

	it("Scenario 1", async function () {
		/**
		 * This test produces a scenario where a summarizer creates a summary with an empty remoteChanges array.
		 * This can happen, if the summarizer client prunes all remote changes. However, all remote changes will only be
		 * pruned, when the last operation in the stream is not a changeset op (e.g. a join/remove operation).
		 * In addition to that, the minimum sequence number has to point to the last operation in the stream. For this,
		 * all clients must be synced and have updated their referenceSequenceNumber.
		 *
		 * We create this scenario to reproduce a bug, where a client that joined after such a summary had been created,
		 * submitted an operation with an incorrect referenceGuid. Clients that already had been joined to the session
		 * before the summarization, then performed an incorrect rebase which resulted in exceptions or an incorrect
		 * state in the property tree after the rebase.
		 */
		this.timeout(30000);

		// 1- U1 joins together with summarizer
		const {
			client: u1,
			summarizer,
			dataObject: dataObject1,
			container: container1,
		} = await getClient(true);
		await objProvider.ensureSynchronized();

		// Test debugging code
		// container.deltaManager.inbound.on("op", (task: any) => {
		//     console.info(task);
		// });

		// container.deltaManager.outbound.on("op", (task: any) => {
		//     console.info(task);
		// });

		// 2- Insert array with u1 as user
		u1.root.insert(USERS, PropertyFactory.create("NodeProperty", "array"));
		u1.commit();
		await objProvider.ensureSynchronized();

		let users = u1.root.get<ArrayProperty>(USERS);
		users?.push(createUserNode("u1"));

		users?.push(createUserNode("u2"));
		u1.commit();

		await objProvider.ensureSynchronized();

		const {
			client: u2,
			dataObject: dataObject2,
			container: container2,
		} = await getClient(false, true);
		await objProvider.ensureSynchronized();

		// We do two changes to a different DDS (the root map), to make sure, that
		// updates are triggered that do not affect the propertyDDS
		dataObject1.root.set("c2", "aaa");
		dataObject2.root.set("c2", "aaa");

		// Now we wait until the msn has sufficiently advanced that the pruning below
		// will remove all remoteChanges
		const expectedSequenceNumber = container2.deltaManager.lastSequenceNumber;
		await new Promise((resolve) => {
			const waitForMSN = () => {
				if (
					container1.deltaManager.minimumSequenceNumber >= expectedSequenceNumber &&
					container2.deltaManager.minimumSequenceNumber >= expectedSequenceNumber
				) {
					resolve(undefined);
				}

				void objProvider.ensureSynchronized().then((x) => {
					setTimeout(waitForMSN, 5);
				});
			};
			waitForMSN();
		});

		// Summarize
		await summarizeNow(summarizer);

		await objProvider.ensureSynchronized();

		// U3 joins and remove a user
		const { client: u3 } = await getClient(false, true);

		users = u3.root.get<ArrayProperty>(USERS);

		users?.remove(1);
		u3.commit();
		await objProvider.ensureSynchronized();

		expect(u1.root.get<ArrayProperty>(USERS)?.getValues().length).to.equal(1);
	});
});

describe("PropertyTree", () => {
	const documentId = "localServerTest";
	const documentLoadUrl = `fluid-test://localhost/${documentId}`;
	const propertyDdsId = "PropertyTree";
	const codeDetails: IFluidCodeDetails = {
		package: "localServerTestPackage",
		config: {},
	};
	const factory1 = new TestFluidObjectFactory([
		[propertyDdsId, DeflatedPropertyTree.getFactory()],
	]);
	describe("DeflatedPropertyTree", () => {
		executePerPropertyTreeType(
			codeDetails,
			factory1,
			documentId,
			documentLoadUrl,
			propertyDdsId,
		);
	});

	const factory2 = new TestFluidObjectFactory([[propertyDdsId, SharedPropertyTree.getFactory()]]);
	describe("SharedPropertyTree", () => {
		executePerPropertyTreeType(
			codeDetails,
			factory2,
			documentId,
			documentLoadUrl,
			propertyDdsId,
		);
	});

	const factory3 = new TestFluidObjectFactory([[propertyDdsId, LZ4PropertyTree.getFactory()]]);
	describe("LZ4PropertyTree", () => {
		executePerPropertyTreeType(
			codeDetails,
			factory1,
			documentId,
			documentLoadUrl,
			propertyDdsId,
		);
	});
});
function executePerPropertyTreeType(
	codeDetails: IFluidCodeDetails,
	factory: TestFluidObjectFactory,
	documentId: string,
	documentLoadUrl: string,
	propertyDdsId: string,
) {
	let deltaConnectionServer: ILocalDeltaConnectionServer;
	let urlResolver: LocalResolver;
	let opProcessingController: LoaderContainerTracker;
	let container1: IContainer;
	let container2: IContainer;
	let dataObject1: ITestFluidObject;
	let dataObject2: ITestFluidObject;
	let sharedPropertyTree1;
	let sharedPropertyTree2;

	function createLocalLoader(
		packageEntries: Iterable<[IFluidCodeDetails, TestFluidObjectFactory]>,
		localDeltaConnectionServer: ILocalDeltaConnectionServer,
		localUrlResolver: IUrlResolver,
		options?: ILoaderOptions,
	): IHostLoader {
		const documentServiceFactory = new LocalDocumentServiceFactory(localDeltaConnectionServer);

		return createLoader(
			packageEntries,
			documentServiceFactory,
			localUrlResolver,
			undefined,
			options,
		);
	}

	async function createContainer(): Promise<IContainer> {
		const loader = createLocalLoader(
			[[codeDetails, factory]],
			deltaConnectionServer,
			urlResolver,
		);
		opProcessingController.add(loader);
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
		opProcessingController.add(loader);
		return loader.resolve({ url: documentLoadUrl });
	}

	describe("Local state", () => {
		let propertyTree;

		beforeEach(async () => {
			opProcessingController = new LoaderContainerTracker();
			deltaConnectionServer = LocalDeltaConnectionServer.create();
			urlResolver = new LocalResolver();

			// Create a Container for the first client.
			container1 = await createContainer();
			dataObject1 = await requestFluidObject<ITestFluidObject>(container1, "default");
			sharedPropertyTree1 = await dataObject1.getSharedObject(propertyDdsId);

			// Load the Container that was created by the first client.
			container2 = await loadContainer();
			dataObject2 = await requestFluidObject<ITestFluidObject>(container2, "default");
			sharedPropertyTree2 = await dataObject2.getSharedObject(propertyDdsId);
		});

		describe("APIs", () => {
			it("Can create a PropertyTree", () => {
				expect(sharedPropertyTree1).to.not.be.equal(undefined);
			});

			it("Can get Root Property", () => {
				const root = sharedPropertyTree1.root;

				expect(root).to.not.be.equal(undefined);
				expect(root).to.be.an.instanceof(BaseProperty);
			});

			it("Can commit", async () => {
				await opProcessingController.pauseProcessing();

				sharedPropertyTree1.root.insert(
					"test",
					PropertyFactory.create("String", undefined, "Magic"),
				);

				expect(
					(sharedPropertyTree1.root.get("test") as StringProperty).getValue(),
				).to.equal("Magic");
				expect(sharedPropertyTree2.root.get("test")).to.equal(undefined);

				sharedPropertyTree1.commit();

				await opProcessingController.ensureSynchronized();

				expect(
					(sharedPropertyTree2.root.get("test") as StringProperty).getValue(),
				).to.equal("Magic");
			});

			it("Can commit with metadata", async () => {
				await opProcessingController.pauseProcessing();

				sharedPropertyTree1.root.insert(
					"test",
					PropertyFactory.create("String", undefined, "Magic"),
				);

				expect(
					(sharedPropertyTree1.root.get("test") as StringProperty).getValue(),
				).to.equal("Magic");
				expect(sharedPropertyTree2.root.get("test")).to.equal(undefined);

				sharedPropertyTree1.commit({ someKey: "some data" });
				expect(sharedPropertyTree1.activeCommit.metadata).to.deep.equal({
					someKey: "some data",
				});

				await opProcessingController.ensureSynchronized();

				expect(
					(sharedPropertyTree2.root.get("test") as StringProperty).getValue(),
				).to.equal("Magic");
				expect(sharedPropertyTree2.activeCommit.metadata).to.deep.equal({
					someKey: "some data",
				});
			});

			it("Can commit with metadata, with empty changeset, when commit behaviour is unspecified", async () => {
				await opProcessingController.pauseProcessing();
				sharedPropertyTree1.commit({ someKey: "some data" });
				expect(sharedPropertyTree1.activeCommit.metadata).to.deep.equal({
					someKey: "some data",
				});

				await opProcessingController.ensureSynchronized();
				expect(sharedPropertyTree2.activeCommit.metadata).to.deep.equal({
					someKey: "some data",
				});
			});

			it("Cannot commit with metadata, with empty changeset, behaviour is specified to false", async () => {
				await opProcessingController.pauseProcessing();
				sharedPropertyTree1.commit({ someKey: "some data" }, false);
				expect(sharedPropertyTree1.activeCommit).to.equal(undefined);

				await opProcessingController.ensureSynchronized();
				expect(sharedPropertyTree2.activeCommit).to.equal(undefined);
			});

			it("Can commit with metadata, with empty changeset, behaviour is specified to true", async () => {
				await opProcessingController.pauseProcessing();
				sharedPropertyTree1.commit({ someKey: "some data" }, true);
				expect(sharedPropertyTree1.activeCommit.metadata).to.deep.equal({
					someKey: "some data",
				});

				await opProcessingController.ensureSynchronized();
				expect(sharedPropertyTree2.activeCommit.metadata).to.deep.equal({
					someKey: "some data",
				});
			});

			it("Should not commit empty change by default", async () => {
				await opProcessingController.pauseProcessing();

				sharedPropertyTree1.commit();

				await opProcessingController.ensureSynchronized();
				expect(sharedPropertyTree2.remoteChanges.length).to.equal(0);
			});

			it("Should commit empty change", async () => {
				await opProcessingController.pauseProcessing();

				sharedPropertyTree1.commit(true);

				await opProcessingController.ensureSynchronized();
				expect(sharedPropertyTree2.remoteChanges.length).to.equal(1);
				expect(
					_.isEmpty(
						_.last((sharedPropertyTree2 as SharedPropertyTree).remoteChanges)
							?.changeSet,
					),
				).to.equal(true);
			});

			it("Can start/stopTransmission", async () => {
				sharedPropertyTree1.stopTransmission(true);
				sharedPropertyTree1.root.insert(
					"test",
					PropertyFactory.create("String", undefined, "Magic"),
				);

				expect(
					(sharedPropertyTree1.root.get("test") as StringProperty).getValue(),
				).to.equal("Magic");
				expect(sharedPropertyTree2.root.get("test")).to.be.equal(undefined);

				sharedPropertyTree1.commit();

				await opProcessingController.ensureSynchronized();

				expect(sharedPropertyTree2.root.get("test")).to.equal(undefined);

				sharedPropertyTree1.stopTransmission(false);

				await opProcessingController.ensureSynchronized();

				expect(
					(sharedPropertyTree2.root.get("test") as StringProperty).getValue(),
				).to.equal("Magic");
			});

			it("Can emit local modification event", () => {
				let count = 0;
				sharedPropertyTree1.on("localModification", () => {
					count++;
				});

				expect(count).to.equal(0);

				sharedPropertyTree1.root.insert(
					"test",
					PropertyFactory.create("String", undefined, "Magic"),
				);

				expect(count).to.equal(1);
			});
			it("Can push/popNotificationDelayScope", () => {
				let count = 0;
				sharedPropertyTree1.on("localModification", () => {
					count++;
				});

				expect(count).to.equal(0);

				sharedPropertyTree1.pushNotificationDelayScope();
				sharedPropertyTree1.root.insert(
					"test",
					PropertyFactory.create("String", undefined, "Magic"),
				);

				expect(count).to.equal(0);

				sharedPropertyTree1.popNotificationDelayScope();

				expect(count).to.equal(1);
			});

			it("Can push/popNotificationDelayScope multiple times", () => {
				let count = 0;
				sharedPropertyTree1.on("localModification", () => {
					count++;
				});

				expect(count).to.equal(0);

				sharedPropertyTree1.pushNotificationDelayScope();
				sharedPropertyTree1.pushNotificationDelayScope();
				sharedPropertyTree1.root.insert(
					"test",
					PropertyFactory.create("String", undefined, "Magic"),
				);

				expect(count).to.equal(0);

				sharedPropertyTree1.popNotificationDelayScope();

				expect(count).to.equal(0);

				sharedPropertyTree1.popNotificationDelayScope();

				expect(count).to.equal(1);
			});

			it("getRebasedChanges should return empty array empty guid as start & end", async () => {
				await opProcessingController.pauseProcessing();
				sharedPropertyTree1.root.insert(
					"test",
					PropertyFactory.create("String", undefined, "Magic"),
				);
				sharedPropertyTree1.commit();
				await opProcessingController.ensureSynchronized();
				const result = sharedPropertyTree1.getRebasedChanges("", "");
				expect(result.length).to.equal(0);
			});
		});
	});
}
