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
import { SharedCell } from "@fluidframework/cell";
import { IContainer, ILoader } from "@fluidframework/container-definitions";
import { Container } from "@fluidframework/container-loader";
import { IFluidCodeDetails, IFluidHandle } from "@fluidframework/core-interfaces";
import { IFluidDataStoreRuntime } from "@fluidframework/datastore-definitions";
import { IUrlResolver } from "@fluidframework/driver-definitions";
import { readAndParse } from "@fluidframework/driver-utils";
import { LocalResolver } from "@fluidframework/local-driver";
import { ISharedDirectory, SharedMap } from "@fluidframework/map";
import { SharedMatrix } from "@fluidframework/matrix";
import { IServiceConfiguration, ISnapshotTree, ISummaryConfiguration } from "@fluidframework/protocol-definitions";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { SharedObjectSequence } from "@fluidframework/sequence";
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

interface ITestConfig {
    id: string;
    create(runtime: IFluidDataStoreRuntime): IFluidHandle;
    set(ddsHandle: IFluidHandle, value: IFluidHandle | string, key?: string): Promise<void>;
    delete(ddsHandle: IFluidHandle, key?: string): Promise<void>;
}

const tests = (config: ITestConfig) => {
    if (config.id !== "SharedMap") {
        return;
    }
    const documentId = "garbageCollection";
    const codeDetails: IFluidCodeDetails = {
        package: "garbageCollectionTestPackage",
        config: {},
    };
    const factory = new DataObjectFactory(
        "TestDataObject",
        TestDataObject,
        [
            SharedMap.getFactory(),
            SharedCell.getFactory(),
            SharedMatrix.getFactory(),
            SharedObjectSequence.getFactory(),
        ],
        []);

    const runtimeOptions = {
        generateSummaries: true,
        enableWorker: false,
        initialSummarizerDelayMs: 10,
        runGC: true,
    };

    const IdleDetectionTime = 3000;

    const summaryConfig: ISummaryConfiguration = {
        idleTime: IdleDetectionTime,

        maxTime: IdleDetectionTime * 12,

        // Snapshot if 1000 ops received since last snapshot.
        maxOps: 1000,

        // Wait 10 minutes for summary ack
        maxAckWaitTime: 600000,
    };

    const serviceConfig: Partial<IServiceConfiguration> = {
        summary: summaryConfig,
    };

    let deltaConnectionServer: ILocalDeltaConnectionServer;
    let urlResolver: IUrlResolver;
    let opProcessingController: OpProcessingController;
    let container: IContainer;

    let ds1: TestDataObject;
    let ds1dds1: ISharedDirectory;
    let ds1dds2Handle: IFluidHandle;

    let ds2: TestDataObject;
    let ds2dds1: ISharedDirectory;
    let ds2dds2Handle: IFluidHandle;

    let ds3: TestDataObject;
    let ds3dds1: ISharedDirectory;
    let ds3dds2Handle: IFluidHandle;

    let ds4: TestDataObject;
    let ds4dds1: ISharedDirectory;
    let ds4dds2Handle: IFluidHandle;

    let allRoutes: string[];
    let deletedRoutes: string[];

    async function createContainer(): Promise<IContainer> {
        const runtimeFactory =
            new ContainerRuntimeFactoryWithDefaultDataStore(
                factory,
                [
                    ["default", Promise.resolve(factory)],
                    ["TestDataObject", Promise.resolve(factory)],
                ],
                undefined,
                undefined,
                runtimeOptions,
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
                reject(new Error("summaryNack"));
            }
        }));

        return getSnapshot(handle);
    }

    async function validateReferenceStates(snapshotTree: ISnapshotTree) {
        const storageService = (container as Container).storage;
        assert(storageService);

        const tempDeletedRoutes =
            await readAndParse<any>(storageService, snapshotTree.blobs[".deletedRoutes"]) as string[];
        const actualDeletedRoutes = tempDeletedRoutes.sort();
        const expectedDeletedRoutes = deletedRoutes.sort();
        assert.deepStrictEqual(actualDeletedRoutes, expectedDeletedRoutes);

        const tempReferencedRoutes =
            await readAndParse<any>(storageService, snapshotTree.blobs[".referencedRoutes"]) as string[];
        const actualReferencedRoutes = tempReferencedRoutes.filter(removeSchedulerEntries).sort();

        const referencedRoutes = allRoutes.filter((route) => !deletedRoutes.includes(route));
        const expectedReferencedRoutes = referencedRoutes.sort();
        assert.deepStrictEqual(actualReferencedRoutes, expectedReferencedRoutes);
    }

    function removeSchedulerEntries(value: string) {
        if (value.startsWith("/_scheduler")) {
            return false;
        }
        return true;
    }

    async function createDataStoreReferencesTree() {
        // Get DataStore DS1.
        ds1 = await requestFluidObject<TestDataObject>(container, "default");
        ds1dds1 = ds1._root;
        // Create DDS2 in DS1 and store in root DS1DDS1.
        ds1dds2Handle = config.create(ds1._runtime);
        ds1dds1.set("ds1dds2Handle", ds1dds2Handle);

        // Create DataStore DS2.
        ds2 = await factory.createInstance(ds1._context.containerRuntime);
        // Store DS2 in ds1dds2Handle
        await config.set(ds1dds2Handle, ds2.handle, "ds2");

        // Create DDS2 in DS2 and store in root DS2DDS1.
        ds2dds1 = ds2._root;
        ds2dds2Handle = config.create(ds2._runtime);
        ds2dds1.set("ds2dds2Handle", ds2dds2Handle);

        // Create DataStore DS3.
        ds3 = await factory.createInstance(ds1._context.containerRuntime);
        // Store DS3 in ds2dds2Handle
        await config.set(ds2dds2Handle, ds3.handle, "ds3");

        // Create DDS2 in DS3 and store in DS3DDS1.
        ds3dds1 = ds3._root;
        ds3dds2Handle = config.create(ds3._runtime);
        ds3dds1.set("ds3dds2Handle", ds3dds2Handle);

        // Create DataStore DS4.
        ds4 = await factory.createInstance(ds1._context.containerRuntime);
        // Store DS4 in ds3dds2Handle
        await config.set(ds3dds2Handle, ds4.handle, "ds5");

        // Create DDS2 in DS4 and store in DS4DDS1.
        ds4dds1 = ds4._root;
        ds4dds2Handle = config.create(ds4._runtime);
        ds4dds1.set("ds4dds2Handle", ds4dds2Handle);

        allRoutes.push(ds1.handle.absolutePath);
        allRoutes.push(ds1dds1.handle.absolutePath);
        allRoutes.push(ds1dds2Handle.absolutePath);

        allRoutes.push(ds2.handle.absolutePath);
        allRoutes.push(ds2dds1.handle.absolutePath);
        allRoutes.push(ds2dds2Handle.absolutePath);

        allRoutes.push(ds3.handle.absolutePath);
        allRoutes.push(ds3dds1.handle.absolutePath);
        allRoutes.push(ds3dds2Handle.absolutePath);

        allRoutes.push(ds4.handle.absolutePath);
        allRoutes.push(ds4dds1.handle.absolutePath);
        allRoutes.push(ds4dds2Handle.absolutePath);

        opProcessingController.addDeltaManagers(ds1._runtime.deltaManager);
        await opProcessingController.process();
    }

    beforeEach(async () => {
        deltaConnectionServer = LocalDeltaConnectionServer.create(undefined, serviceConfig);
        urlResolver = new LocalResolver();

        // Create a Container for the first client.
        container = await createContainer();

        opProcessingController = new OpProcessingController(deltaConnectionServer);

        allRoutes = [];
        deletedRoutes = [];

        await createDataStoreReferencesTree();
    });

    it("should not collect referenced objects", async () => {
        // wait for summary ack/nack
        const snapshotTree = await waitForSummary();
        await validateReferenceStates(snapshotTree);
    });

    it("should collect unreferenced objects", async () => {
        // wait for summary ack/nack
        await waitForSummary();

        await config.delete(ds2dds2Handle, "ds3");

        deletedRoutes.push(ds3.handle.absolutePath);
        deletedRoutes.push(ds3dds1.handle.absolutePath);
        deletedRoutes.push(ds3dds2Handle.absolutePath);

        deletedRoutes.push(ds4.handle.absolutePath);
        deletedRoutes.push(ds4dds1.handle.absolutePath);
        deletedRoutes.push(ds4dds2Handle.absolutePath);

        ds1dds1.set("key", "value");

        // wait for summary ack/nack
        await waitForSummary();

        // Do an additional set on the DDS from which we removed the handle above. This is required for
        // sequence which removes the segments only after the sequenceNumber of the deleted segement goes
        // below the minimumSequenceNumber.
        // Sending an additional op here increments the minimumSequenceNumber thereby deleting the segment.
        await config.set(ds2dds2Handle, "randomValue", "randomKey");

        const snapshotTree = await waitForSummary();
        await validateReferenceStates(snapshotTree);
    });

    it("should collect unreferenced objects after multiple summaries", async () => {
        await config.delete(ds2dds2Handle, "ds3");

        deletedRoutes.push(ds3.handle.absolutePath);
        deletedRoutes.push(ds3dds1.handle.absolutePath);
        deletedRoutes.push(ds3dds2Handle.absolutePath);

        deletedRoutes.push(ds4.handle.absolutePath);
        deletedRoutes.push(ds4dds1.handle.absolutePath);
        deletedRoutes.push(ds4dds2Handle.absolutePath);

        // wait for summary ack/nack
        await waitForSummary();

        // Do an additional set on the DDS from which we removed the handle above. This is required for
        // sequence which removes the segments only after the sequenceNumber of the deleted segement goes
        // below the minimumSequenceNumber.
        // Sending an additional op here increments the minimumSequenceNumber thereby deleting the segment.
        await config.set(ds2dds2Handle, "randomValue", "randomKey");

        let snapshotTree = await waitForSummary();
        await validateReferenceStates(snapshotTree);

        // Do some operation to trigger summary.
        ds1dds1.set("key", "value");

        snapshotTree = await waitForSummary();
        await validateReferenceStates(snapshotTree);
    });

    it("should uncollect objects after they are referenced back", async () => {
        await config.delete(ds2dds2Handle, "ds3");

        // wait for summary ack/nack
        await waitForSummary();

        // Do an additional set on the DDS from which we removed the handle above. This is required for
        // sequence which removes the segments only after the sequenceNumber of the deleted segement goes
        // below the minimumSequenceNumber.
        // Sending an additional op here increments the minimumSequenceNumber thereby deleting the segment.
        await config.set(ds2dds2Handle, "randomValue", "randomKey");

        let snapshotTree = await waitForSummary();

        await config.set(ds2dds2Handle, ds4.handle, "ds4");

        deletedRoutes.push(ds3.handle.absolutePath);
        deletedRoutes.push(ds3dds1.handle.absolutePath);
        deletedRoutes.push(ds3dds2Handle.absolutePath);

        snapshotTree = await waitForSummary();
        await validateReferenceStates(snapshotTree);

        await config.set(ds4dds2Handle, ds3.handle, "ds3");

        deletedRoutes = [];

        snapshotTree = await waitForSummary();
        await validateReferenceStates(snapshotTree);
    });

    afterEach(async () => {
        await deltaConnectionServer.webSocketServer.close();
    });
};

describe("Garbage Collection", () => {
    describe("SharedMap", () => {
        function createSharedMap(runtime: IFluidDataStoreRuntime): IFluidHandle {
            const sharedMap = SharedMap.create(runtime);
            return sharedMap.handle;
        }

        async function setInSharedMap(ddsHandle: IFluidHandle, value: IFluidHandle | string, key: string) {
            const sharedMap = await ddsHandle.get() as SharedMap;
            sharedMap.set(key, value);
        }

        async function deleteFromSharedMap(ddsHandle: IFluidHandle, key: string) {
            const sharedMap = await ddsHandle.get() as SharedMap;
            sharedMap.delete(key);
        }

        tests({
            id: "SharedMap",
            create: createSharedMap,
            set: setInSharedMap,
            delete: deleteFromSharedMap,
        });
    });

    describe("SharedCell", () => {
        function createSharedCell(runtime: IFluidDataStoreRuntime): IFluidHandle {
            const sharedCell = SharedCell.create(runtime);
            return sharedCell.handle;
        }

        async function setInSharedCell(ddsHandle: IFluidHandle, value: IFluidHandle | string) {
            const sharedCell = await ddsHandle.get() as SharedCell;
            sharedCell.set(value);
        }

        async function deleteFromSharedCell(ddsHandle: IFluidHandle) {
            const sharedCell = await ddsHandle.get() as SharedCell;
            sharedCell.delete();
        }

        tests({
            id: "SharedCell",
            create: createSharedCell,
            set: setInSharedCell,
            delete: deleteFromSharedCell,
        });
    });

    describe("SharedMatrix", () => {
        function createSharedMatrix(runtime: IFluidDataStoreRuntime): IFluidHandle {
            const sharedMatrix = SharedMatrix.create(runtime);
            sharedMatrix.insertRows(0, 1);
            sharedMatrix.insertCols(0, 1);
            return sharedMatrix.handle;
        }

        async function setInSharedMatrix(ddsHandle: IFluidHandle, value: IFluidHandle | string) {
            const sharedMatrix = await ddsHandle.get() as SharedMatrix;
            sharedMatrix.setCell(0, 0, value);
        }

        async function deleteFromSharedMatrix(ddsHandle: IFluidHandle) {
            const sharedMatrix = await ddsHandle.get() as SharedMatrix;
            sharedMatrix.setCell(0, 0, undefined);
        }

        tests({
            id: "SharedMatrix",
            create: createSharedMatrix,
            set: setInSharedMatrix,
            delete: deleteFromSharedMatrix,
        });
    });

    describe("SharedSequence", () => {
        function createSharedSequence(runtime: IFluidDataStoreRuntime): IFluidHandle {
            const sharedSequence = SharedObjectSequence.create<IFluidHandle | string>(runtime);
            return sharedSequence.handle;
        }

        async function setInSharedSequence(ddsHandle: IFluidHandle, value: IFluidHandle | string) {
            const sharedSequence = await ddsHandle.get() as SharedObjectSequence<IFluidHandle | string>;
            sharedSequence.insert(0, [ value ]);
        }

        async function deleteFromSharedSequence(ddsHandle: IFluidHandle) {
            const sharedSequence = await ddsHandle.get() as SharedObjectSequence<IFluidHandle | string>;
            sharedSequence.remove(0, 1);
        }

        tests({
            id: "SharedSequence",
            create: createSharedSequence,
            set: setInSharedSequence,
            delete: deleteFromSharedSequence,
        });
    });
});
