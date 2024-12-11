/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	ArrayProperty,
	BaseProperty,
	NodeProperty,
	PropertyFactory,
	StringProperty,
} from "@fluid-experimental/property-properties";
import { LocalServerTestDriver } from "@fluid-private/test-drivers";
import {
	IContainer,
	IFluidCodeDetails,
	ILoaderOptions,
} from "@fluidframework/container-definitions/internal";
import {
	Loader as ContainerLoader,
	loadExistingContainer,
	type ILoaderProps,
} from "@fluidframework/container-loader/internal";
import { ContainerRuntime } from "@fluidframework/container-runtime/internal";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import { IUrlResolver } from "@fluidframework/driver-definitions/internal";
import {
	LocalDocumentServiceFactory,
	LocalResolver,
} from "@fluidframework/local-driver/internal";
import {
	ILocalDeltaConnectionServer,
	LocalDeltaConnectionServer,
} from "@fluidframework/server-local-server";
import {
	ChannelFactoryRegistry,
	ITestFluidObject,
	ITestObjectProvider,
	LoaderContainerTracker,
	TestContainerRuntimeFactory,
	TestFluidObjectFactory,
	TestObjectProvider,
	createAndAttachContainerUsingProps,
	createLoaderProps,
	createSummarizer,
	summarizeNow,
} from "@fluidframework/test-utils/internal";
import { expect } from "chai";
import lodash from "lodash";
const { isEmpty, last } = lodash;

import { SharedPropertyTree } from "../propertyTree.js";
import { DeflatedPropertyTree, LZ4PropertyTree } from "../propertyTreeExt.js";
import { PropertyTreeFactory } from "../propertyTreeFactory.js";

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
		const dataObject = (await container.getEntryPoint()) as ITestFluidObject;

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
		return createSummarizer(objProvider, container);
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

		// 2- Insert array with u1 as user
		u1.root.insert(USERS, PropertyFactory.create("NodeProperty", "array"));
		u1.commit();
		await objProvider.ensureSynchronized();

		let users = u1.root.get<ArrayProperty>(USERS);
		users?.push(createUserNode("u1"));

		users?.push(createUserNode("u2"));
		u1.commit();

		await objProvider.ensureSynchronized();

		const { dataObject: dataObject2, container: container2 } = await getClient(false, true);
		await objProvider.ensureSynchronized();

		// We do two changes to a different DDS (the root map), to make sure, that
		// updates are triggered that do not affect the propertyDDS
		dataObject1.root.set("c2", "aaa");
		dataObject2.root.set("c2", "aaa");
		await objProvider.ensureSynchronized();

		// Now we wait until the msn has sufficiently advanced that the pruning below
		// will remove all remoteChanges
		await synchronizeMSN(container2, container1);

		// Summarize
		await summarizeNow(summarizer.summarizer);

		await objProvider.ensureSynchronized();

		// U3 joins and remove a user
		const { client: u3 } = await getClient(false, true);

		users = u3.root.get<ArrayProperty>(USERS);

		users?.remove(1);
		u3.commit();
		await objProvider.ensureSynchronized();

		expect(u1.root.get<ArrayProperty>(USERS)?.getValues().length).to.equal(1);
	});

	it("Scenario 2 (repeated summarization)", async function () {
		/**
		 * This test produces a scenario where we have an empty remoteChanges array in the summarizer client
		 * and then get more changes that cannot yet be pruned away, because the MSN continues to point to the
		 * previous head commit.
		 *
		 * We used to have a bug that was caused by this, where the prune code would prune the remote changes
		 * but not the unrebased remote changes, causing rebase errors.
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

		// 2- Make some modifications
		u1.root.insert("c1", PropertyFactory.create("NodeProperty"));
		u1.commit();
		await objProvider.ensureSynchronized();

		u1.root.insert("c2", PropertyFactory.create("NodeProperty"));
		u1.commit();

		await objProvider.ensureSynchronized();

		const { dataObject: dataObject2, container: container2 } = await getClient(false, true);
		await objProvider.ensureSynchronized();

		// We do two changes to a different DDS (the root map), to make sure, that
		// updates are triggered that do not affect the propertyDDS
		dataObject1.root.set("c2", "aaa");
		dataObject2.root.set("c2", "aaa");
		await objProvider.ensureSynchronized();

		// Now we wait until the msn has sufficiently advanced that the pruning below
		// will remove all remoteChanges
		await synchronizeMSN(container2, container1);

		// Summarize
		await summarizeNow(summarizer.summarizer);

		const runtime = (summarizer.summarizer as any).runtime as ContainerRuntime;
		const entryPoint = (await runtime.getAliasedDataStoreEntryPoint("default")) as
			| IFluidHandle<ITestFluidObject>
			| undefined;
		if (entryPoint === undefined) {
			throw new Error("default dataStore must exist");
		}
		const summarizerDataObject = await entryPoint.get();
		const summarizerClient =
			await summarizerDataObject.getSharedObject<SharedPropertyTree>(propertyDdsId);

		// Make changes only on u1, u2 must not advance to make sure
		// the msn is not advanced
		u1.root.insert("a", PropertyFactory.create("NodeProperty"));
		u1.commit();

		u1.root.insert("b", PropertyFactory.create("NodeProperty"));
		u1.commit();

		await objProvider.opProcessingController.processOutgoing(container1);
		await objProvider.opProcessingController.processIncoming(container1);

		// Summarize again
		await summarizeNow(summarizer.summarizer);

		// Make sure the summarizer did not delete any of the unrebased changes
		expect(summarizerClient.remoteChanges.length).to.equal(2);
		expect(Object.keys(summarizerClient.unrebasedRemoteChanges).length).to.equal(2);
	});

	async function synchronizeMSN(container2: IContainer, container1: IContainer) {
		const expectedSequenceNumber = container2.deltaManager.lastSequenceNumber;
		await new Promise((resolve) => {
			const waitForMSN = () => {
				if (
					container1.deltaManager.minimumSequenceNumber >= expectedSequenceNumber &&
					container2.deltaManager.minimumSequenceNumber >= expectedSequenceNumber
				) {
					resolve(undefined);
					return;
				}

				void objProvider.ensureSynchronized().then((x) => {
					setTimeout(waitForMSN, 5);
				});
			};
			waitForMSN();
		});
	}
});

describe("PropertyTree", () => {
	const documentId = "localServerTest";
	const documentLoadUrl = `https://localhost/${documentId}`;
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

	const factory2 = new TestFluidObjectFactory([
		[propertyDdsId, SharedPropertyTree.getFactory()],
	]);
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
			factory3,
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

	function createLocalLoaderProps(
		packageEntries: Iterable<[IFluidCodeDetails, TestFluidObjectFactory]>,
		localDeltaConnectionServer: ILocalDeltaConnectionServer,
		localUrlResolver: IUrlResolver,
		options?: ILoaderOptions,
	): ILoaderProps {
		const documentServiceFactory = new LocalDocumentServiceFactory(localDeltaConnectionServer);

		return createLoaderProps(
			packageEntries,
			documentServiceFactory,
			localUrlResolver,
			undefined,
			options,
		);
	}

	async function createContainer(): Promise<IContainer> {
		const createDetachedContainerProps = createLocalLoaderProps(
			[[codeDetails, factory]],
			deltaConnectionServer,
			urlResolver,
		);

		const containerUsingProps = await createAndAttachContainerUsingProps(
			{ ...createDetachedContainerProps, codeDetails },
			urlResolver.createCreateNewRequest(documentId),
		);
		opProcessingController.addContainer(containerUsingProps);
		return containerUsingProps;
	}

	async function loadContainer(): Promise<IContainer> {
		const loaderProps = createLocalLoaderProps(
			[[codeDetails, factory]],
			deltaConnectionServer,
			urlResolver,
		);

		const containerUsingPops = await loadExistingContainer({
			...loaderProps,
			request: { url: documentLoadUrl },
		});
		opProcessingController.addContainer(containerUsingPops);
		return containerUsingPops;
	}

	describe("Local state", () => {
		beforeEach(async () => {
			opProcessingController = new LoaderContainerTracker();
			deltaConnectionServer = LocalDeltaConnectionServer.create();
			urlResolver = new LocalResolver();

			// Create a Container for the first client.
			container1 = await createContainer();
			dataObject1 = (await container1.getEntryPoint()) as ITestFluidObject;
			sharedPropertyTree1 = await dataObject1.getSharedObject(propertyDdsId);

			// Load the Container that was created by the first client.
			container2 = await loadContainer();
			dataObject2 = (await container2.getEntryPoint()) as ITestFluidObject;
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

				expect((sharedPropertyTree1.root.get("test") as StringProperty).getValue()).to.equal(
					"Magic",
				);
				expect(sharedPropertyTree2.root.get("test")).to.equal(undefined);

				sharedPropertyTree1.commit();

				await opProcessingController.ensureSynchronized();

				expect((sharedPropertyTree2.root.get("test") as StringProperty).getValue()).to.equal(
					"Magic",
				);
			});

			it("Can commit with metadata", async () => {
				await opProcessingController.pauseProcessing();

				sharedPropertyTree1.root.insert(
					"test",
					PropertyFactory.create("String", undefined, "Magic"),
				);

				expect((sharedPropertyTree1.root.get("test") as StringProperty).getValue()).to.equal(
					"Magic",
				);
				expect(sharedPropertyTree2.root.get("test")).to.equal(undefined);

				sharedPropertyTree1.commit({ someKey: "some data" });
				expect(sharedPropertyTree1.activeCommit.metadata).to.deep.equal({
					someKey: "some data",
				});

				await opProcessingController.ensureSynchronized();

				expect((sharedPropertyTree2.root.get("test") as StringProperty).getValue()).to.equal(
					"Magic",
				);
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
					isEmpty(last((sharedPropertyTree2 as SharedPropertyTree).remoteChanges)?.changeSet),
				).to.equal(true);
			});

			it("Can start/stopTransmission", async () => {
				sharedPropertyTree1.stopTransmission(true);
				sharedPropertyTree1.root.insert(
					"test",
					PropertyFactory.create("String", undefined, "Magic"),
				);

				expect((sharedPropertyTree1.root.get("test") as StringProperty).getValue()).to.equal(
					"Magic",
				);
				expect(sharedPropertyTree2.root.get("test")).to.be.equal(undefined);

				sharedPropertyTree1.commit();

				await opProcessingController.ensureSynchronized();

				expect(sharedPropertyTree2.root.get("test")).to.equal(undefined);

				sharedPropertyTree1.stopTransmission(false);

				await opProcessingController.ensureSynchronized();

				expect((sharedPropertyTree2.root.get("test") as StringProperty).getValue()).to.equal(
					"Magic",
				);
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
