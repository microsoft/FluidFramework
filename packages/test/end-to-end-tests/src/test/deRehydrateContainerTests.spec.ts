/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { IFluidCodeDetails, IProxyLoaderFactory } from "@fluidframework/container-definitions";
import { Loader } from "@fluidframework/container-loader";
import { IUrlResolver } from "@fluidframework/driver-definitions";
import { LocalDocumentServiceFactory, LocalResolver } from "@fluidframework/local-driver";
import { ILocalDeltaConnectionServer, LocalDeltaConnectionServer } from "@fluidframework/server-local-server";
import {
    LocalCodeLoader,
    TestFluidObjectFactory,
    ITestFluidObject,
    TestFluidObject,
} from "@fluidframework/test-utils";
import { SharedMap, SharedDirectory } from "@fluidframework/map";
import { IDocumentAttributes } from "@fluidframework/protocol-definitions";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions";
import { IContainerRuntimeBase } from "@fluidframework/runtime-definitions";
import { ConsensusRegisterCollection } from "@fluidframework/register-collection";
import { SharedString, SparseMatrix } from "@fluidframework/sequence";
import { SharedCell } from "@fluidframework/cell";
import { Ink } from "@fluidframework/ink";
import { SharedMatrix } from "@fluidframework/matrix";
import { ConsensusQueue, ConsensusOrderedCollection } from "@fluidframework/ordered-collection";
import { SharedCounter } from "@fluidframework/counter";
import { IRequest } from "@fluidframework/core-interfaces";

describe(`Dehydrate Rehydrate Container Test`, () => {
    const documentId = "deReHydrateContainerTest";
    const codeDetails: IFluidCodeDetails = {
        package: "detachedContainerTestPackage1",
        config: {},
    };
    const sharedStringId = "ss1Key";
    const sharedMapId = "sm1Key";
    const crcId = "crc1Key";
    const cocId = "coc1Key";
    const sharedDirectoryId = "sd1Key";
    const sharedCellId = "scell1Key";
    const sharedMatrixId = "smatrix1Key";
    const sharedInkId = "sink1Key";
    const sparseMatrixId = "sparsematrixKey";
    const sharedCounterId = "sharedcounterKey";

    let testDeltaConnectionServer: ILocalDeltaConnectionServer;
    let loader: Loader;
    let request: IRequest;

    async function createDetachedContainerAndGetRootDataStore() {
        const container = await loader.createDetachedContainer(codeDetails);
        // Get the root dataStore from the detached container.
        const response = await container.request({ url: "/" });
        const defaultDataStore = response.value;
        return {
            container,
            defaultDataStore,
        };
    }

    function createTestLoader(urlResolver: IUrlResolver): Loader {
        const factory: TestFluidObjectFactory = new TestFluidObjectFactory([
            [sharedStringId, SharedString.getFactory()],
            [sharedMapId, SharedMap.getFactory()],
            [crcId, ConsensusRegisterCollection.getFactory()],
            [sharedDirectoryId, SharedDirectory.getFactory()],
            [sharedCellId, SharedCell.getFactory()],
            [sharedInkId, Ink.getFactory()],
            [sharedMatrixId, SharedMatrix.getFactory()],
            [cocId, ConsensusQueue.getFactory()],
            [sparseMatrixId, SparseMatrix.getFactory()],
            [sharedCounterId, SharedCounter.getFactory()],
        ]);
        const codeLoader = new LocalCodeLoader([[codeDetails, factory]]);
        const documentServiceFactory = new LocalDocumentServiceFactory(testDeltaConnectionServer);
        return new Loader(
            urlResolver,
            documentServiceFactory,
            codeLoader,
            {},
            {},
            new Map<string, IProxyLoaderFactory>());
    }

    const createPeerDataStore = async (
        containerRuntime: IContainerRuntimeBase,
    ) => {
        const peerDataStoreRuntimeChannel = await (containerRuntime as IContainerRuntime)
            .createDataStoreWithRealizationFn(["default"]);
        const peerDataStore =
            (await peerDataStoreRuntimeChannel.request({ url: "/" })).value as ITestFluidObject;
        return {
            peerDataStore,
            peerDataStoreRuntimeChannel,
        };
    };

    beforeEach(async () => {
        testDeltaConnectionServer = LocalDeltaConnectionServer.create();
        const urlResolver = new LocalResolver();
        request = urlResolver.createCreateNewRequest(documentId);
        loader = createTestLoader(urlResolver);
    });

    it("Dehydrated container snapshot", async () => {
        const { container } =
            await createDetachedContainerAndGetRootDataStore();
        const snapshotTree = JSON.parse(container.serialize());

        assert.strictEqual(Object.keys(snapshotTree.trees).length, 3,
            "3 trees should be there(protocol, default dataStore, scheduler");
        assert.strictEqual(Object.keys(snapshotTree.trees[".protocol"].blobs).length, 8,
            "4 protocol blobs should be there(8 mappings)");

        // Check for protocol attributes
        const protocolAttributesBlobId = snapshotTree.trees[".protocol"].blobs.attributes;
        const protocolAttributes: IDocumentAttributes =
            JSON.parse(Buffer.from(snapshotTree.trees[".protocol"].blobs[protocolAttributesBlobId],
                "base64").toString());
        assert.strictEqual(protocolAttributes.sequenceNumber, 0, "Seq number should be 0");
        assert.strictEqual(protocolAttributes.minimumSequenceNumber, 0, "Min Seq number should be 0");

        // Check for default dataStore
        const defaultDataStoreBlobId = snapshotTree.trees.default.blobs[".component"];
        const dataStoreAttributes = JSON.parse(
            Buffer.from(snapshotTree.trees.default.blobs[defaultDataStoreBlobId], "base64").toString());
        assert.strictEqual(dataStoreAttributes.pkg, JSON.stringify(["default"]), "Package name should be default");
    });

    it("Dehydrated container snapshot 2 times with changes in between", async () => {
        const { container, defaultDataStore } =
            await createDetachedContainerAndGetRootDataStore();
        const snapshotTree1 = JSON.parse(container.serialize());
        // Create a channel
        const channel = defaultDataStore.runtime.createChannel("test1",
            "https://graph.microsoft.com/types/map") as SharedMap;
        channel.bindToContext();
        const snapshotTree2 = JSON.parse(container.serialize());

        assert.strictEqual(JSON.stringify(Object.keys(snapshotTree1.trees)),
            JSON.stringify(Object.keys(snapshotTree2.trees)),
            "3 trees should be there(protocol, default dataStore, scheduler");

        // Check for protocol attributes
        const protocolAttributesBlobId1 = snapshotTree1.trees[".protocol"].blobs.attributes;
        const protocolAttributesBlobId2 = snapshotTree2.trees[".protocol"].blobs.attributes;
        const protocolAttributes1: IDocumentAttributes =
            JSON.parse(Buffer.from(snapshotTree1.trees[".protocol"].blobs[protocolAttributesBlobId1],
                "base64").toString());
        const protocolAttributes2: IDocumentAttributes =
            JSON.parse(Buffer.from(snapshotTree2.trees[".protocol"].blobs[protocolAttributesBlobId2],
                "base64").toString());
        assert.strictEqual(JSON.stringify(protocolAttributes1), JSON.stringify(protocolAttributes2),
            "Protocol attributes should be same as no change happened");

        // Check for newly create channel
        assert.strictEqual(snapshotTree1.trees.default.trees.test1, undefined,
            "Test channel 1 should not be present in snapshot 1");
        assert(snapshotTree2.trees.default.trees.test1,
            "Test channel 1 should be present in snapshot 2");
    });

    it("Dehydrated container snapshot with dataStore handle stored in map of other bound dataStore", async () => {
        const { container, defaultDataStore } =
            await createDetachedContainerAndGetRootDataStore();

        // Create another dataStore
        const peerDataStore = await createPeerDataStore(defaultDataStore.context.containerRuntime);
        const dataStore2 = peerDataStore.peerDataStore as TestFluidObject;

        // Create a channel
        const rootOfDataStore1 = await (defaultDataStore as TestFluidObject).getSharedObject<SharedMap>(sharedMapId);
        rootOfDataStore1.set("dataStore2", dataStore2.handle);

        const snapshotTree = JSON.parse(container.serialize());

        assert.strictEqual(Object.keys(snapshotTree.trees).length, 4, "4 trees should be there");
        assert(snapshotTree.trees[dataStore2.runtime.id], "Handle Bounded dataStore should be in summary");
    });

    it("Rehydrate container from snapshot and check contents before attach", async () => {
        const { container } =
            await createDetachedContainerAndGetRootDataStore();

        const snapshotTree = JSON.parse(container.serialize());

        const container2 = await loader.createDetachedContainerFromSnapshot(snapshotTree);

        // Check for scheduler
        const schedulerResponse = await container2.request({ url: "_scheduler" });
        assert.strictEqual(schedulerResponse.status, 200, "Scheduler Component should exist!!");
        const schedulerDataStore = schedulerResponse.value as TestFluidObject;
        assert.strictEqual(schedulerDataStore.runtime.id, "_scheduler", "Id should be of scheduler");

        // Check for default data store
        const response = await container2.request({ url: "/" });
        assert.strictEqual(response.status, 200, "Component should exist!!");
        const defaultDataStore = response.value as TestFluidObject;
        assert.strictEqual(defaultDataStore.runtime.id, "default", "Id should be default");

        // Check for dds
        const sharedMap = await defaultDataStore.getSharedObject<SharedMap>(sharedMapId);
        const sharedDir = await defaultDataStore.getSharedObject<SharedDirectory>(sharedDirectoryId);
        const sharedString = await defaultDataStore.getSharedObject<SharedString>(sharedStringId);
        const sharedCell = await defaultDataStore.getSharedObject<SharedCell>(sharedCellId);
        const sharedCounter = await defaultDataStore.getSharedObject<SharedCounter>(sharedCounterId);
        const crc = await defaultDataStore.getSharedObject<ConsensusRegisterCollection<string>>(crcId);
        const coc = await defaultDataStore.getSharedObject<ConsensusOrderedCollection>(cocId);
        const ink = await defaultDataStore.getSharedObject<Ink>(sharedInkId);
        const sharedMatrix = await defaultDataStore.getSharedObject<SharedMatrix>(sharedMatrixId);
        const sparseMatrix = await defaultDataStore.getSharedObject<SparseMatrix>(sparseMatrixId);
        assert.strictEqual(sharedMap.id, sharedMapId, "Shared map should exist!!");
        assert.strictEqual(sharedDir.id, sharedDirectoryId, "Shared directory should exist!!");
        assert.strictEqual(sharedString.id, sharedStringId, "Shared string should exist!!");
        assert.strictEqual(sharedCell.id, sharedCellId, "Shared cell should exist!!");
        assert.strictEqual(sharedCounter.id, sharedCounterId, "Shared counter should exist!!");
        assert.strictEqual(crc.id, crcId, "CRC should exist!!");
        assert.strictEqual(coc.id, cocId, "COC should exist!!");
        assert.strictEqual(ink.id, sharedInkId, "Shared ink should exist!!");
        assert.strictEqual(sharedMatrix.id, sharedMatrixId, "Shared matrix should exist!!");
        assert.strictEqual(sparseMatrix.id, sparseMatrixId, "Sparse matrix should exist!!");
    });

    it("Rehydrate container from snapshot and check contents after attach", async () => {
        const { container } =
            await createDetachedContainerAndGetRootDataStore();

        const snapshotTree = JSON.parse(container.serialize());

        const container2 = await loader.createDetachedContainerFromSnapshot(snapshotTree);
        await container2.attach(request);

        // Check for scheduler
        const schedulerResponse = await container2.request({ url: "_scheduler" });
        assert.strictEqual(schedulerResponse.status, 200, "Scheduler Component should exist!!");
        const schedulerDataStore = schedulerResponse.value as TestFluidObject;
        assert.strictEqual(schedulerDataStore.runtime.id, "_scheduler", "Id should be of scheduler");

        // Check for default data store
        const response = await container2.request({ url: "/" });
        assert.strictEqual(response.status, 200, "Component should exist!!");
        const defaultDataStore = response.value as TestFluidObject;
        assert.strictEqual(defaultDataStore.runtime.id, "default", "Id should be default");

        // Check for dds
        const sharedMap = await defaultDataStore.getSharedObject<SharedMap>(sharedMapId);
        const sharedDir = await defaultDataStore.getSharedObject<SharedDirectory>(sharedDirectoryId);
        const sharedString = await defaultDataStore.getSharedObject<SharedString>(sharedStringId);
        const sharedCell = await defaultDataStore.getSharedObject<SharedCell>(sharedCellId);
        const sharedCounter = await defaultDataStore.getSharedObject<SharedCounter>(sharedCounterId);
        const crc = await defaultDataStore.getSharedObject<ConsensusRegisterCollection<string>>(crcId);
        const coc = await defaultDataStore.getSharedObject<ConsensusOrderedCollection>(cocId);
        const ink = await defaultDataStore.getSharedObject<Ink>(sharedInkId);
        const sharedMatrix = await defaultDataStore.getSharedObject<SharedMatrix>(sharedMatrixId);
        const sparseMatrix = await defaultDataStore.getSharedObject<SparseMatrix>(sparseMatrixId);
        assert.strictEqual(sharedMap.id, sharedMapId, "Shared map should exist!!");
        assert.strictEqual(sharedDir.id, sharedDirectoryId, "Shared directory should exist!!");
        assert.strictEqual(sharedString.id, sharedStringId, "Shared string should exist!!");
        assert.strictEqual(sharedCell.id, sharedCellId, "Shared cell should exist!!");
        assert.strictEqual(sharedCounter.id, sharedCounterId, "Shared counter should exist!!");
        assert.strictEqual(crc.id, crcId, "CRC should exist!!");
        assert.strictEqual(coc.id, cocId, "COC should exist!!");
        assert.strictEqual(ink.id, sharedInkId, "Shared ink should exist!!");
        assert.strictEqual(sharedMatrix.id, sharedMatrixId, "Shared matrix should exist!!");
        assert.strictEqual(sparseMatrix.id, sparseMatrixId, "Sparse matrix should exist!!");
    });

    it("Change contents of dds, then rehydrate and then check snapshot", async () => {
        const { container } =
            await createDetachedContainerAndGetRootDataStore();

        const responseBefore = await container.request({ url: "/" });
        const defaultDataStoreBefore = responseBefore.value as TestFluidObject;
        const sharedStringBefore = await defaultDataStoreBefore.getSharedObject<SharedString>(sharedStringId);
        sharedStringBefore.insertText(0, "Hello");

        const snapshotTree = JSON.parse(container.serialize());

        const container2 = await loader.createDetachedContainerFromSnapshot(snapshotTree);

        const responseAfter = await container2.request({ url: "/" });
        const defaultComponentAfter = responseAfter.value as TestFluidObject;
        const sharedStringAfter = await defaultComponentAfter.getSharedObject<SharedString>(sharedStringId);
        assert.strictEqual(JSON.stringify(sharedStringAfter.snapshot()), JSON.stringify(sharedStringBefore.snapshot()),
            "Snapshot of shared string should match and contents should be same!!");
    });

    it("Rehydrate container from snapshot, change contents of dds and then check snapshot", async () => {
        const { container } =
            await createDetachedContainerAndGetRootDataStore();
        let str = "AA";
        const response1 = await container.request({ url: "/" });
        const defaultComponent1 = response1.value as TestFluidObject;
        const sharedString1 = await defaultComponent1.getSharedObject<SharedString>(sharedStringId);
        sharedString1.insertText(0, str);
        const snapshotTree = JSON.parse(container.serialize());

        const container2 = await loader.createDetachedContainerFromSnapshot(snapshotTree);
        const responseBefore = await container2.request({ url: "/" });
        const defaultDataStoreBefore = responseBefore.value as TestFluidObject;
        const sharedStringBefore = await defaultDataStoreBefore.getSharedObject<SharedString>(sharedStringId);
        const sharedMapBefore = await defaultDataStoreBefore.getSharedObject<SharedMap>(sharedMapId);
        str += "BB";
        sharedStringBefore.insertText(0, str);
        sharedMapBefore.set("0", str);

        await container2.attach(request);
        const responseAfter = await container2.request({ url: "/" });
        const defaultComponentAfter = responseAfter.value as TestFluidObject;
        const sharedStringAfter = await defaultComponentAfter.getSharedObject<SharedString>(sharedStringId);
        const sharedMapAfter = await defaultComponentAfter.getSharedObject<SharedMap>(sharedMapId);
        assert.strictEqual(JSON.stringify(sharedStringAfter.snapshot()), JSON.stringify(sharedStringBefore.snapshot()),
            "Snapshot of shared string should match and contents should be same!!");
        assert.strictEqual(JSON.stringify(sharedMapAfter.snapshot()), JSON.stringify(sharedMapBefore.snapshot()),
            "Snapshot of shared map should match and contents should be same!!");
    });
});
