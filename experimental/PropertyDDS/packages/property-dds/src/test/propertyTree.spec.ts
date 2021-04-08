import { expect } from "chai";
import { IContainer, ILoader } from "@fluidframework/container-definitions";
import { IFluidCodeDetails, IFluidSerializer } from "@fluidframework/core-interfaces";
import { LocalResolver } from "@fluidframework/local-driver";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { LocalDeltaConnectionServer, ILocalDeltaConnectionServer } from "@fluidframework/server-local-server";
import {
	createAndAttachContainer,
    createLoader,
	OpProcessingController,
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
	let opProcessingController: OpProcessingController;
	let container1: IContainer;
	let container2: IContainer;
	let dataObject1: ITestFluidObject;
	let dataObject2: ITestFluidObject;
	let sharedPropertyTree1: SharedPropertyTree;
	let sharedPropertyTree2: SharedPropertyTree;

	async function createContainer(): Promise<IContainer> {
		const loader = createLoader([[codeDetails, factory]], deltaConnectionServer, urlResolver);
		return createAndAttachContainer(codeDetails, loader, urlResolver.createCreateNewRequest(documentId));
	}

	async function loadContainer(): Promise<IContainer> {
		const loader: ILoader = createLoader([[codeDetails, factory]], deltaConnectionServer, urlResolver);
		return loader.resolve({ url: documentLoadUrl });
	}

	describe("Local state", () => {
		let propertyTree: SharedPropertyTree;

		beforeEach(async () => {
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

			opProcessingController = new OpProcessingController();
			opProcessingController.addDeltaManagers(container1.deltaManager, container2.deltaManager);
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

				await opProcessingController.process(container1.deltaManager, container2.deltaManager);

				expect((sharedPropertyTree2.root.get("test") as StringProperty).getValue()).to.equal("Magic");
			});
			it("Can start/stopTransmission", async () => {
				sharedPropertyTree1.stopTransmission(true);
				sharedPropertyTree1.root.insert("test", PropertyFactory.create("String", undefined, "Magic"));

				expect((sharedPropertyTree1.root.get("test") as StringProperty).getValue()).to.equal("Magic");
				expect(sharedPropertyTree2.root.get("test")).to.be.equal(undefined);

				sharedPropertyTree1.commit();

				await opProcessingController.process(container1.deltaManager, container2.deltaManager);

				expect(sharedPropertyTree2.root.get("test")).to.equal(undefined);

				sharedPropertyTree1.stopTransmission(false);

				await opProcessingController.process(container1.deltaManager, container2.deltaManager);

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
		});
	});
});
