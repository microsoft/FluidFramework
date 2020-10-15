/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
    ContainerRuntimeFactoryWithDefaultDataStore,
    DataObject,
    DataObjectFactory,
} from "@fluidframework/aqueduct";
import { IContainer, IFluidCodeDetails, ILoader } from "@fluidframework/container-definitions";
import { Container } from "@fluidframework/container-loader";
import { IUrlResolver } from "@fluidframework/driver-definitions";
import { readAndParse } from "@fluidframework/driver-utils";
import { LocalResolver } from "@fluidframework/local-driver";
import { ISharedDirectory, ISharedMap, SharedMap } from "@fluidframework/map";
import { ISnapshotTree } from "@fluidframework/protocol-definitions";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { ILocalDeltaConnectionServer, LocalDeltaConnectionServer } from "@fluidframework/server-local-server";
import {
    createAndAttachContainer,
    createLocalLoader,
    OpProcessingController,
} from "@fluidframework/test-utils";

class TestDataObject extends DataObject {
    public get _root() {
        return this.root;
    }

    public get _runtime() {
        return this.runtime;
    }

    public get _context() {
        return this.context;
    }
}

describe("Garbage Collection", () => {
    const documentId = "cellTest";
    // const documentLoadUrl = `fluid-test://localhost/${documentId}`;
    const codeDetails: IFluidCodeDetails = {
        package: "sharedCellTestPackage",
        config: {},
    };
    const factory = new DataObjectFactory(
        "TestDataObject",
        TestDataObject,
        [],
        []);

    let deltaConnectionServer: ILocalDeltaConnectionServer;
    let urlResolver: IUrlResolver;
    let opProcessingController: OpProcessingController;
    let container: IContainer;

    let ds1: TestDataObject;
    let ds1dds1: ISharedDirectory;
    let ds1dds2: ISharedMap;

    let ds2: TestDataObject;
    let ds2dds1: ISharedDirectory;
    let ds2dds2: ISharedMap;

    let ds3: TestDataObject;
    let ds3dds1: ISharedDirectory;
    let ds3dds2: ISharedMap;

    let ds4: TestDataObject;
    let ds4dds1: ISharedDirectory;
    let ds4dds2: ISharedMap;

    let expectedDeletedStores: string[];

    async function createContainer(): Promise<IContainer> {
        const runtimeFactory =
            new ContainerRuntimeFactoryWithDefaultDataStore(
                "default",
                [
                    ["default", Promise.resolve(factory)],
                    ["TestDataObject", Promise.resolve(factory)],
                ],
            );
        const loader: ILoader = createLocalLoader([[codeDetails, runtimeFactory]], deltaConnectionServer, urlResolver);
        return createAndAttachContainer(documentId, codeDetails, loader, urlResolver);
    }

    async function getSnapshot(handle: string) {
        const storageService = (container as Container).storage;
        assert(storageService);
        const versions = await storageService.getVersions(handle, 1);
        const version = versions[0];
        assert(version, "No version in snapshot");
        const snapshotTree = await storageService.getSnapshotTree(version);
        assert(snapshotTree, "No snapshot tree");
        return snapshotTree;
    }

    async function waitForSummary(): Promise<ISnapshotTree> {
        let handle: string = "";
        // wait for summary ack/nack
        await new Promise((resolve, reject) => container.on("op", (op) => {
            if (op.type === "summaryAck") {
                handle = op.contents.handle;
                resolve();
            } else if (op.type === "summaryNack") {
                reject("summaryNack");
            }
        }));

        return getSnapshot(handle);
    }

    async function validateReferenceStates(snapshotTree: ISnapshotTree) {
        const storageService = (container as Container).storage;
        assert(storageService);

        const deletedDataStores = await readAndParse<any>(storageService, snapshotTree.blobs[".deletedDataStores"]);
        assert.deepStrictEqual(deletedDataStores, expectedDeletedStores);
    }

    async function createDataStoreReferencesTree() {
        // Get DataStore DS1.
        ds1 = await requestFluidObject<TestDataObject>(container, "default");
        ds1dds1 = ds1._root;
        // Create DDS2 in DS1 and store in root DS1DDS1.
        ds1dds2 = SharedMap.create(ds1._runtime);
        ds1dds1.set("ds1dds2", ds1dds2.handle);

        // Create DataStore DS2.
        ds2 = await factory.createInstance(ds1._context.containerRuntime);
        // Store DS2 in DS1DDS2
        ds1dds2.set("ds2", ds2.handle);

        // Create DDS2 in DS2 and store in root DS2DDS1.
        ds2dds1 = ds2._root;
        ds2dds2 = SharedMap.create(ds2._runtime);
        ds2dds1.set("ds2dds2", ds2dds2.handle);

        // Create DataStore DS3.
        ds3 = await factory.createInstance(ds1._context.containerRuntime);
        // Store DS3 in DS2DDS2
        ds2dds2.set("ds3", ds3.handle);

        // Create DDS2 in DS3 and store in DS3DDS1.
        ds3dds1 = ds3._root;
        ds3dds2 = SharedMap.create(ds3._runtime);
        ds3dds1.set("ds3dds2", ds3dds2.handle);

        // Create DataStore DS4.
        ds4 = await factory.createInstance(ds1._context.containerRuntime);
        // Store DS4 in DS3DDS2
        ds3dds2.set("ds4", ds4.handle);

        // Create DDS2 in DS4 and store in DS4DDS1.
        ds4dds1 = ds4._root;
        ds4dds2 = SharedMap.create(ds4._runtime);
        ds4dds1.set("ds4dds2", ds4dds2.handle);

        opProcessingController.addDeltaManagers(ds1._runtime.deltaManager);
        await opProcessingController.process();
    }

    beforeEach(async () => {
        deltaConnectionServer = LocalDeltaConnectionServer.create();
        urlResolver = new LocalResolver();

        // Create a Container for the first client.
        container = await createContainer();

        opProcessingController = new OpProcessingController(deltaConnectionServer);

        expectedDeletedStores = [];

        await createDataStoreReferencesTree();
    });

    it("should not collect referenced objects", async () => {
        // wait for summary ack/nack
        const snapshotTree = await waitForSummary();
        await validateReferenceStates(snapshotTree);
    });

    it("should collect unreferenced objects", async () => {
        // wait for summary ack/nack
        let snapshotTree = await waitForSummary();
        await validateReferenceStates(snapshotTree);

        ds2dds2.delete("ds3");
        expectedDeletedStores.push(ds3.id);
        expectedDeletedStores.push(ds4.id);

        // wait for summary ack/nack
        snapshotTree = await waitForSummary();
        await validateReferenceStates(snapshotTree);
    });

    it("should collect unreferenced objects after multiple summaries", async () => {
        ds2dds2.delete("ds3");
        expectedDeletedStores.push(ds3.id);
        expectedDeletedStores.push(ds4.id);

        let snapshotTree = await waitForSummary();
        await validateReferenceStates(snapshotTree);

        // Do some operation to trigger summary.
        ds1dds2.set("key", "value");

        snapshotTree = await waitForSummary();
        await validateReferenceStates(snapshotTree);
    });

    it("should uncollect objects after they are referenced back", async () => {
        ds2dds2.delete("ds3");
        expectedDeletedStores.push(ds3.id);
        expectedDeletedStores.push(ds4.id);

        let snapshotTree = await waitForSummary();
        await validateReferenceStates(snapshotTree);

        ds2dds2.set("ds4", ds4.handle);
        expectedDeletedStores.pop();

        snapshotTree = await waitForSummary();
        await validateReferenceStates(snapshotTree);

        ds4dds2.set("ds3", ds3.handle);
        expectedDeletedStores.pop();

        snapshotTree = await waitForSummary();
        await validateReferenceStates(snapshotTree);
    });

    afterEach(async () => {
        await deltaConnectionServer.webSocketServer.close();
    });
});
