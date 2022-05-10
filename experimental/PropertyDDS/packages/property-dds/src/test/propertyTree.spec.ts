/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import _ from "lodash";

import { expect } from "chai";
import { IContainer, IHostLoader, ILoaderOptions, IFluidCodeDetails } from "@fluidframework/container-definitions";
import { LocalResolver, LocalDocumentServiceFactory } from "@fluidframework/local-driver";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { LocalDeltaConnectionServer, ILocalDeltaConnectionServer } from "@fluidframework/server-local-server";
import { IUrlResolver } from "@fluidframework/driver-definitions";
import {
	createAndAttachContainer,
	createLoader,
	LoaderContainerTracker,
	ITestFluidObject,
	TestFluidObjectFactory,
} from "@fluidframework/test-utils";
import { PropertyFactory, StringProperty, BaseProperty } from "@fluid-experimental/property-properties";
import { SharedPropertyTree } from "../propertyTree";

describe("PropertyTree", () => {
	const documentId = "localServerTest";
	const documentLoadUrl = `fluid-test://localhost/${documentId}`;
	const propertyDdsId = "PropertyTree";
	const codeDetails: IFluidCodeDetails = {
		package: "localServerTestPackage",
		config: {},
	};
	const factory = new TestFluidObjectFactory([[propertyDdsId, SharedPropertyTree.getFactory()]]);

	let deltaConnectionServer: ILocalDeltaConnectionServer;
	let urlResolver: LocalResolver;
	let opProcessingController: LoaderContainerTracker;
	let container1: IContainer;
	let container2: IContainer;
	let dataObject1: ITestFluidObject;
	let dataObject2: ITestFluidObject;
	let sharedPropertyTree1: SharedPropertyTree;
	let sharedPropertyTree2: SharedPropertyTree;

	function createLocalLoader(
		packageEntries: Iterable<[IFluidCodeDetails, TestFluidObjectFactory]>,
		localDeltaConnectionServer: ILocalDeltaConnectionServer,
		localUrlResolver: IUrlResolver,
		options?: ILoaderOptions,
	): IHostLoader {
		const documentServiceFactory = new LocalDocumentServiceFactory(localDeltaConnectionServer);

		return createLoader(packageEntries, documentServiceFactory, localUrlResolver, undefined, options);
	}

	async function createContainer(): Promise<IContainer> {
		const loader = createLocalLoader([[codeDetails, factory]], deltaConnectionServer, urlResolver);
		opProcessingController.add(loader);
		return createAndAttachContainer(codeDetails, loader, urlResolver.createCreateNewRequest(documentId));
	}

	async function loadContainer(): Promise<IContainer> {
		const loader = createLocalLoader([[codeDetails, factory]], deltaConnectionServer, urlResolver);
		opProcessingController.add(loader);
		return loader.resolve({ url: documentLoadUrl });
	}

	describe("Local state", () => {
		let propertyTree: SharedPropertyTree;

		beforeEach(async () => {
			opProcessingController = new LoaderContainerTracker();
			deltaConnectionServer = LocalDeltaConnectionServer.create();
			urlResolver = new LocalResolver();

			// Create a Container for the first client.
			container1 = await createContainer();
			dataObject1 = await requestFluidObject<ITestFluidObject>(container1, "default");
			sharedPropertyTree1 = await dataObject1.getSharedObject<SharedPropertyTree>(propertyDdsId);

			// Load the Container that was created by the first client.
			container2 = await loadContainer();
			dataObject2 = await requestFluidObject<ITestFluidObject>(container2, "default");
			sharedPropertyTree2 = await dataObject2.getSharedObject<SharedPropertyTree>(propertyDdsId);
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

				sharedPropertyTree1.root.insert("test", PropertyFactory.create("String", undefined, "Magic"));

				expect((sharedPropertyTree1.root.get("test") as StringProperty).getValue()).to.equal("Magic");
				expect(sharedPropertyTree2.root.get("test")).to.equal(undefined);

				sharedPropertyTree1.commit();

				await opProcessingController.ensureSynchronized();

				expect((sharedPropertyTree2.root.get("test") as StringProperty).getValue()).to.equal("Magic");
			});

            it("Can commit with metadata", async () => {
				await opProcessingController.pauseProcessing();

				sharedPropertyTree1.root.insert("test", PropertyFactory.create("String", undefined, "Magic"));

				expect((sharedPropertyTree1.root.get("test") as StringProperty).getValue()).to.equal("Magic");
				expect(sharedPropertyTree2.root.get("test")).to.equal(undefined);

				sharedPropertyTree1.commit({ someKey: "some data" });
                expect(sharedPropertyTree1.activeCommit.metadata).to.deep.equal({ someKey: "some data" });

				await opProcessingController.ensureSynchronized();

				expect((sharedPropertyTree2.root.get("test") as StringProperty).getValue()).to.equal("Magic");
                expect(sharedPropertyTree2.activeCommit.metadata).to.deep.equal({ someKey: "some data" });
			});

            it("Can commit with metadata, with empty changeset, when commit behaviour is unspecified", async () => {
				await opProcessingController.pauseProcessing();
				sharedPropertyTree1.commit({ someKey: "some data" });
                expect(sharedPropertyTree1.activeCommit.metadata).to.deep.equal({ someKey: "some data" });

				await opProcessingController.ensureSynchronized();
                expect(sharedPropertyTree2.activeCommit.metadata).to.deep.equal({ someKey: "some data" });
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
                expect(sharedPropertyTree1.activeCommit.metadata).to.deep.equal({ someKey: "some data" });

				await opProcessingController.ensureSynchronized();
                expect(sharedPropertyTree2.activeCommit.metadata).to.deep.equal({ someKey: "some data" });
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
				expect(_.isEmpty(_.last(sharedPropertyTree2.remoteChanges)?.changeSet)).to.equal(true);
			});

			it("Can start/stopTransmission", async () => {
				sharedPropertyTree1.stopTransmission(true);
				sharedPropertyTree1.root.insert("test", PropertyFactory.create("String", undefined, "Magic"));

				expect((sharedPropertyTree1.root.get("test") as StringProperty).getValue()).to.equal("Magic");
				expect(sharedPropertyTree2.root.get("test")).to.be.equal(undefined);

				sharedPropertyTree1.commit();

				await opProcessingController.ensureSynchronized();

				expect(sharedPropertyTree2.root.get("test")).to.equal(undefined);

				sharedPropertyTree1.stopTransmission(false);

				await opProcessingController.ensureSynchronized();

				expect((sharedPropertyTree2.root.get("test") as StringProperty).getValue()).to.equal("Magic");
			});

			it("Can emit local modification event", () => {
				let count = 0;
				sharedPropertyTree1.on("localModification", () => {
					count++;
				});

				expect(count).to.equal(0);

				sharedPropertyTree1.root.insert("test", PropertyFactory.create("String", undefined, "Magic"));

				expect(count).to.equal(1);
			});
			it("Can push/popNotificationDelayScope", () => {
				let count = 0;
				sharedPropertyTree1.on("localModification", () => {
					count++;
				});

				expect(count).to.equal(0);

				sharedPropertyTree1.pushNotificationDelayScope();
				sharedPropertyTree1.root.insert("test", PropertyFactory.create("String", undefined, "Magic"));

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
				sharedPropertyTree1.root.insert("test", PropertyFactory.create("String", undefined, "Magic"));

				expect(count).to.equal(0);

				sharedPropertyTree1.popNotificationDelayScope();

				expect(count).to.equal(0);

				sharedPropertyTree1.popNotificationDelayScope();

				expect(count).to.equal(1);
			});

            it("getRebasedChanges should return empty array empty guid as start & end", async () => {
                await opProcessingController.pauseProcessing();
                sharedPropertyTree1.root.insert("test", PropertyFactory.create("String", undefined, "Magic"));
				sharedPropertyTree1.commit();
                await opProcessingController.ensureSynchronized();
                const result = sharedPropertyTree1.getRebasedChanges("", "");
                expect(result.length).to.equal(0);
            });
		});
	});
});
