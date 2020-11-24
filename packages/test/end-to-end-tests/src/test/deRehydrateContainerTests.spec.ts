/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { fromBase64ToUtf8 } from "@fluidframework/common-utils";
import { Loader } from "@fluidframework/container-loader";
import { IUrlResolver } from "@fluidframework/driver-definitions";
import { LocalDocumentServiceFactory, LocalResolver } from "@fluidframework/local-driver";
import { ILocalDeltaConnectionServer, LocalDeltaConnectionServer } from "@fluidframework/server-local-server";
import {
    LocalCodeLoader,
    TestFluidObjectFactory,
    ITestFluidObject,
    TestFluidObject,
    OpProcessingController,
} from "@fluidframework/test-utils";
import { SharedMap, SharedDirectory } from "@fluidframework/map";
import { IDocumentAttributes } from "@fluidframework/protocol-definitions";
import { IContainerRuntimeBase } from "@fluidframework/runtime-definitions";
import { ConsensusRegisterCollection } from "@fluidframework/register-collection";
import { SharedString, SparseMatrix } from "@fluidframework/sequence";
import { SharedCell } from "@fluidframework/cell";
import { Ink } from "@fluidframework/ink";
import { SharedMatrix } from "@fluidframework/matrix";
import { ConsensusQueue, ConsensusOrderedCollection } from "@fluidframework/ordered-collection";
import { SharedCounter } from "@fluidframework/counter";
import { IRequest, IFluidCodeDetails } from "@fluidframework/core-interfaces";
import { requestFluidObject } from "@fluidframework/runtime-utils";

const detachedContainerRefSeqNumber = 0;

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
        const defaultDataStore = response.value as TestFluidObject;
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
        return new Loader({
            urlResolver,
            documentServiceFactory,
            codeLoader,
        });
    }

    const createPeerDataStore = async (
        containerRuntime: IContainerRuntimeBase,
    ) => {
        const peerDataStore = await requestFluidObject<ITestFluidObject>(
            await containerRuntime.createDataStore(["default"]),
            "/");
        return {
            peerDataStore,
            peerDataStoreRuntimeChannel: peerDataStore.channel,
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

        assert.ok(snapshotTree.trees[".protocol"], "protocol tree not present");
        assert.ok(snapshotTree.trees.default, "default dataStore tree not present");
        assert.ok(snapshotTree.trees._scheduler, "scheduler tree not present");
        assert.strictEqual(Object.keys(snapshotTree.trees[".protocol"].blobs).length, 8,
            "4 protocol blobs should be there(8 mappings)");

        // Check for protocol attributes
        const protocolAttributesBlobId = snapshotTree.trees[".protocol"].blobs.attributes;
        const protocolAttributes: IDocumentAttributes =
            JSON.parse(fromBase64ToUtf8(snapshotTree.trees[".protocol"].blobs[protocolAttributesBlobId]));
        assert.strictEqual(protocolAttributes.sequenceNumber, detachedContainerRefSeqNumber, "initial aeq #");
        assert(
            protocolAttributes.minimumSequenceNumber <= protocolAttributes.sequenceNumber,
            "Min Seq # <= seq #");

        // Check for default dataStore
        const defaultDataStoreBlobId = snapshotTree.trees.default.blobs[".component"];
        const dataStoreAttributes =
            JSON.parse(fromBase64ToUtf8(snapshotTree.trees.default.blobs[defaultDataStoreBlobId]));
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
            JSON.parse(fromBase64ToUtf8(snapshotTree1.trees[".protocol"].blobs[protocolAttributesBlobId1]));
        const protocolAttributes2: IDocumentAttributes =
            JSON.parse(fromBase64ToUtf8(snapshotTree2.trees[".protocol"].blobs[protocolAttributesBlobId2]));
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
        const rootOfDataStore1 = await defaultDataStore.getSharedObject<SharedMap>(sharedMapId);
        rootOfDataStore1.set("dataStore2", dataStore2.handle);

        const snapshotTree = JSON.parse(container.serialize());

        assert.ok(snapshotTree.trees[".protocol"], "protocol tree not present");
        assert.ok(snapshotTree.trees.default, "default dataStore tree not present");
        assert.ok(snapshotTree.trees._scheduler, "scheduler tree not present");
        assert.ok(
            // eslint-disable-next-line unicorn/no-unsafe-regex
            Object.keys(snapshotTree.trees).some((key) => /^(?:\w+-){4}\w+$/.test(key)),
            "peer data store tree not present",
        );

        assert(snapshotTree.trees[dataStore2.runtime.id], "Handle Bounded dataStore should be in summary");
    });

    it("Rehydrate container from snapshot and check contents before attach", async () => {
        const { container } =
            await createDetachedContainerAndGetRootDataStore();

        const snapshotTree = container.serialize();

        const container2 = await loader.rehydrateDetachedContainerFromSnapshot(snapshotTree);

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

        const snapshotTree = container.serialize();

        const container2 = await loader.rehydrateDetachedContainerFromSnapshot(snapshotTree);
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

    it("Change contents of dds, then rehydrate and then check summary", async () => {
        const { container } =
            await createDetachedContainerAndGetRootDataStore();

        const responseBefore = await container.request({ url: "/" });
        const defaultDataStoreBefore = responseBefore.value as TestFluidObject;
        const sharedStringBefore = await defaultDataStoreBefore.getSharedObject<SharedString>(sharedStringId);
        sharedStringBefore.insertText(0, "Hello");

        const snapshotTree = container.serialize();

        const container2 = await loader.rehydrateDetachedContainerFromSnapshot(snapshotTree);

        const responseAfter = await container2.request({ url: "/" });
        const defaultComponentAfter = responseAfter.value as TestFluidObject;
        const sharedStringAfter = await defaultComponentAfter.getSharedObject<SharedString>(sharedStringId);
        assert.strictEqual(
            JSON.stringify(sharedStringAfter.summarize()),
            JSON.stringify(sharedStringBefore.summarize()),
            "Summaries of shared string should match and contents should be same!!");
    });

    it("Rehydrate container from summary, change contents of dds and then check summary", async () => {
        const { container } =
            await createDetachedContainerAndGetRootDataStore();
        let str = "AA";
        const response1 = await container.request({ url: "/" });
        const defaultComponent1 = response1.value as TestFluidObject;
        const sharedString1 = await defaultComponent1.getSharedObject<SharedString>(sharedStringId);
        sharedString1.insertText(0, str);
        const snapshotTree = container.serialize();

        const container2 = await loader.rehydrateDetachedContainerFromSnapshot(snapshotTree);
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
        assert.strictEqual(
            JSON.stringify(sharedStringAfter.summarize()),
            JSON.stringify(sharedStringBefore.summarize()),
            "Summaries of shared string should match and contents should be same!!");
        assert.strictEqual(
            JSON.stringify(sharedMapAfter.summarize()),
            JSON.stringify(sharedMapBefore.summarize()),
            "Summaries of shared map should match and contents should be same!!");
    });

    it("Rehydrate container, don't load a data store and then load after container attachment. Make changes to " +
        "dds from rehydrated container and check reflection of changes in other container",
    async () => {
        const { container, defaultDataStore } =
            await createDetachedContainerAndGetRootDataStore();

        // Create another dataStore
        const peerDataStore = await createPeerDataStore(defaultDataStore.context.containerRuntime);
        const dataStore2 = peerDataStore.peerDataStore as TestFluidObject;
        peerDataStore.peerDataStoreRuntimeChannel.bindToContext();
        const sharedMap1 = await dataStore2.getSharedObject<SharedMap>(sharedMapId);
        sharedMap1.set("0", "A");
        const snapshotTree = container.serialize();

        const rehydratedContainer = await loader.rehydrateDetachedContainerFromSnapshot(snapshotTree);
        await rehydratedContainer.attach(request);

        // Now load the container from another loader.
        const urlResolver2 = new LocalResolver();
        const loader2 = createTestLoader(urlResolver2);
        assert(rehydratedContainer.resolvedUrl);
        const requestUrl2 = await urlResolver2.getAbsoluteUrl(rehydratedContainer.resolvedUrl, "");
        const container2 = await loader2.resolve({ url: requestUrl2 });

        // Get the sharedString1 from dataStore2 in rehydrated container.
        const responseBefore = await rehydratedContainer.request({ url: `/${dataStore2.context.id}` });
        const dataStore2FromRC = responseBefore.value as TestFluidObject;
        const sharedMapFromRC = await dataStore2FromRC.getSharedObject<SharedMap>(sharedMapId);
        sharedMapFromRC.set("1", "B");

        const responseAfter = await container2.request({ url: `/${dataStore2.context.id}` });
        const dataStore3 = responseAfter.value as TestFluidObject;
        const sharedMap3 = await dataStore3.getSharedObject<SharedMap>(sharedMapId);

        const opProcessingController = new OpProcessingController(testDeltaConnectionServer);
        opProcessingController.addDeltaManagers(container2.deltaManager, rehydratedContainer.deltaManager);

        await opProcessingController.process();
        assert.strictEqual(sharedMap3.get("1"), "B", "Contents should be as required");
        assert.strictEqual(
            JSON.stringify(sharedMap3.summarize()),
            JSON.stringify(sharedMapFromRC.summarize()),
            "Summaries of shared string should match and contents should be same!!");
    });

    it("Rehydrate container, create but don't load a data store. Attach rehydrated container and load " +
        "container 2 from another loader. Then load the created dataStore from container 2, make changes to dds " +
        "in it check reflection of changes in rehydrated container",
    async () => {
        const { container, defaultDataStore } =
            await createDetachedContainerAndGetRootDataStore();

        // Create another dataStore
        const peerDataStore = await createPeerDataStore(defaultDataStore.context.containerRuntime);
        const dataStore2 = peerDataStore.peerDataStore as TestFluidObject;
        peerDataStore.peerDataStoreRuntimeChannel.bindToContext();
        const sharedMap1 = await dataStore2.getSharedObject<SharedMap>(sharedMapId);
        sharedMap1.set("0", "A");
        const snapshotTree = container.serialize();

        const rehydratedContainer = await loader.rehydrateDetachedContainerFromSnapshot(snapshotTree);
        await rehydratedContainer.attach(request);

        // Now load the container from another loader.
        const urlResolver2 = new LocalResolver();
        const loader2 = createTestLoader(urlResolver2);
        assert(rehydratedContainer.resolvedUrl);
        const requestUrl2 = await urlResolver2.getAbsoluteUrl(rehydratedContainer.resolvedUrl, "");
        const container2 = await loader2.resolve({ url: requestUrl2 });

        // Get the sharedString1 from dataStore2 in container2.
        const responseBefore = await container2.request({ url: `/${dataStore2.context.id}` });
        const dataStore3 = responseBefore.value as TestFluidObject;
        const sharedMap3 = await dataStore3.getSharedObject<SharedMap>(sharedMapId);
        sharedMap3.set("1", "B");

        // Get the sharedString1 from dataStore2 in rehydrated container.
        const responseAfter = await rehydratedContainer.request({ url: `/${dataStore2.context.id}` });
        const dataStore2FromRC = responseAfter.value as TestFluidObject;
        const sharedMapFromRC = await dataStore2FromRC.getSharedObject<SharedMap>(sharedMapId);

        const opProcessingController = new OpProcessingController(testDeltaConnectionServer);
        opProcessingController.addDeltaManagers(container2.deltaManager, rehydratedContainer.deltaManager);

        await opProcessingController.process();
        assert.strictEqual(sharedMapFromRC.get("1"), "B", "Changes should be reflected in other map");
        assert.strictEqual(
            JSON.stringify(sharedMap3.summarize()),
            JSON.stringify(sharedMapFromRC.summarize()),
            "Summaries of shared string should match and contents should be same!!");
    });

    it("Container rehydration with not bounded dataStore handle stored in root of other bounded dataStore",
    async () => {
        const { container, defaultDataStore } =
            await createDetachedContainerAndGetRootDataStore();

        // Create another dataStore
        const peerDataStore = await createPeerDataStore(defaultDataStore.context.containerRuntime);
        const dataStore2 = peerDataStore.peerDataStore as TestFluidObject;

        const rootOfDataStore1 = await defaultDataStore.getSharedObject<SharedMap>(sharedMapId);
        rootOfDataStore1.set("dataStore2", dataStore2.handle);

        const snapshotTree = container.serialize();
        const rehydratedContainer = await loader.rehydrateDetachedContainerFromSnapshot(snapshotTree);

        const response = await rehydratedContainer.request({ url: `/${dataStore2.context.id}` });
        const dataStore2FromRC = response.value as TestFluidObject;
        assert(dataStore2FromRC, "DataStore2 should have been serialized properly");
        assert.strictEqual(dataStore2FromRC.runtime.id, dataStore2.runtime.id, "DataStore2 id should match");
    });

    it("Container rehydration with not bounded dds handle stored in root of bounded dataStore", async () => {
        const { container, defaultDataStore } =
            await createDetachedContainerAndGetRootDataStore();

        // Create another not bounded dds
        const ddsId = "notbounddds";
        const dds2 = defaultDataStore.runtime.createChannel(ddsId, SharedString.getFactory().type);

        const rootOfDataStore1 = await defaultDataStore.getSharedObject<SharedMap>(sharedMapId);
        rootOfDataStore1.set("dd2", dds2.handle);

        const snapshotTree = container.serialize();
        const rehydratedContainer = await loader.rehydrateDetachedContainerFromSnapshot(snapshotTree);

        const response = await rehydratedContainer.request({ url: `/${defaultDataStore.runtime.id}/${ddsId}` });
        const ddd2FromRC = response.value as SharedString;
        assert(ddd2FromRC, "ddd2 should have been serialized properly");
        assert.strictEqual(ddd2FromRC.id, ddsId, "DDS id should match");
        assert.strictEqual(ddd2FromRC.id, dds2.id, "Both dds id should match");
    });

    it("Container rehydration with not bounded dds handle stored in root of bound dataStore. The not bounded dds " +
        "also stores handle not bounded data store",
    async () => {
        const { container, defaultDataStore } =
            await createDetachedContainerAndGetRootDataStore();

        // Create another not bounded dataStore
        const peerDataStore = await createPeerDataStore(defaultDataStore.context.containerRuntime);
        const dataStore2 = peerDataStore.peerDataStore as TestFluidObject;

        // Create another not bounded dds
        const ddsId = "notbounddds";
        const dds2 = defaultDataStore.runtime.createChannel(ddsId, SharedMap.getFactory().type) as SharedMap;
        dds2.set("dataStore2", dataStore2.handle);

        const rootOfDataStore1 = await defaultDataStore.getSharedObject<SharedMap>(sharedMapId);
        rootOfDataStore1.set("dd2", dds2.handle);

        const snapshotTree = container.serialize();
        const rehydratedContainer = await loader.rehydrateDetachedContainerFromSnapshot(snapshotTree);

        const responseForDDS = await rehydratedContainer.request({ url: `/${defaultDataStore.runtime.id}/${ddsId}` });
        const ddd2FromRC = responseForDDS.value as SharedString;
        assert(ddd2FromRC, "ddd2 should have been serialized properly");
        assert.strictEqual(ddd2FromRC.id, ddsId, "DDS id should match");
        assert.strictEqual(ddd2FromRC.id, dds2.id, "Both dds id should match");

        const responseForDataStore = await rehydratedContainer.request({ url: `/${dataStore2.context.id}` });
        const dataStore2FromRC = responseForDataStore.value as TestFluidObject;
        assert(dataStore2FromRC, "DataStore2 should have been serialized properly");
        assert.strictEqual(dataStore2FromRC.runtime.id, dataStore2.runtime.id, "DataStore2 id should match");
    });

    it("Container rehydration with not bounded data store handle stored in root of bound dataStore. The not bounded" +
        "data store also stores handle not bounded dds",
    async () => {
        const { container, defaultDataStore } =
            await createDetachedContainerAndGetRootDataStore();

        // Create another not bounded dataStore
        const peerDataStore = await createPeerDataStore(defaultDataStore.context.containerRuntime);
        const dataStore2 = peerDataStore.peerDataStore as TestFluidObject;

        // Create another not bounded dds
        const ddsId = "notbounddds";
        const dds2 = dataStore2.runtime.createChannel(ddsId, SharedMap.getFactory().type) as SharedMap;
        const rootOfDataStore2 = await dataStore2.getSharedObject<SharedMap>(sharedMapId);
        rootOfDataStore2.set("dds2", dds2.handle);

        const rootOfDataStore1 = await defaultDataStore.getSharedObject<SharedMap>(sharedMapId);
        rootOfDataStore1.set("dataStore2", dataStore2.handle);

        const snapshotTree = container.serialize();
        const rehydratedContainer = await loader.rehydrateDetachedContainerFromSnapshot(snapshotTree);

        const responseForDDS = await rehydratedContainer.request({ url: `/${dataStore2.runtime.id}/${ddsId}` });
        const ddd2FromRC = responseForDDS.value as SharedString;
        assert(ddd2FromRC, "ddd2 should have been serialized properly");
        assert.strictEqual(ddd2FromRC.id, ddsId, "DDS id should match");
        assert.strictEqual(ddd2FromRC.id, dds2.id, "Both dds id should match");

        const responseForDataStore = await rehydratedContainer.request({ url: `/${dataStore2.context.id}` });
        const dataStore2FromRC = responseForDataStore.value as TestFluidObject;
        assert(dataStore2FromRC, "DataStore2 should have been serialized properly");
        assert.strictEqual(dataStore2FromRC.runtime.id, dataStore2.runtime.id, "DataStore2 id should match");
    });

    it("Not bounded/Unreferenced data store should not get serialized on container serialization", async () => {
        const { container, defaultDataStore } =
            await createDetachedContainerAndGetRootDataStore();

        // Create another not bounded dataStore
        await createPeerDataStore(defaultDataStore.context.containerRuntime);

        const snapshotTree = JSON.parse(container.serialize());

        assert.ok(snapshotTree.trees[".protocol"], "protocol tree not present");
        assert.ok(snapshotTree.trees.default, "default dataStore tree not present");
        assert.ok(snapshotTree.trees._scheduler, "scheduler tree not present");
        assert.ok(
            // eslint-disable-next-line unicorn/no-unsafe-regex
            !Object.keys(snapshotTree.trees).some((key) => /^(?:\w+-){4}\w+$/.test(key)),
            "unbounded/unreferenced data store tree present",
        );
    });
});
