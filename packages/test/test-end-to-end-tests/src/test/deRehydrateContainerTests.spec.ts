/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { compare } from "semver";
import { bufferToString } from "@fluidframework/common-utils";
import { IContainer } from "@fluidframework/container-definitions";
import { Container, Loader } from "@fluidframework/container-loader";
import {
    LocalCodeLoader,
    TestFluidObjectFactory,
    ITestFluidObject,
    TestFluidObject,
    createDocumentId,
    LoaderContainerTracker,
    ITestObjectProvider,
} from "@fluidframework/test-utils";
import { SharedMap, SharedDirectory } from "@fluidframework/map";
import { IDocumentAttributes } from "@fluidframework/protocol-definitions";
import { IContainerRuntimeBase } from "@fluidframework/runtime-definitions";
import { ConsensusRegisterCollection } from "@fluidframework/register-collection";
import { IntervalType, SharedString, SparseMatrix } from "@fluidframework/sequence";
import { SharedCell } from "@fluidframework/cell";
import { Ink } from "@fluidframework/ink";
import { SharedMatrix } from "@fluidframework/matrix";
import { ConsensusQueue, ConsensusOrderedCollection } from "@fluidframework/ordered-collection";
import { SharedCounter } from "@fluidframework/counter";
import { IRequest, IFluidCodeDetails } from "@fluidframework/core-interfaces";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { describeFullCompat, itExpects } from "@fluidframework/test-version-utils";
import {
    getSnapshotTreeFromSerializedContainer,
    ISnapshotTreeWithBlobContents,
// eslint-disable-next-line import/no-internal-modules
} from "@fluidframework/container-loader/dist/utils";

const detachedContainerRefSeqNumber = 0;

describeFullCompat(`Dehydrate Rehydrate Container Test`, (getTestObjectProvider) => {
    let disableIsolatedChannels = false;

    function assertSubtree(tree: ISnapshotTreeWithBlobContents, key: string, msg?: string):
        ISnapshotTreeWithBlobContents
    {
        const subTree = tree.trees[key];
        assert(subTree, msg ?? `${key} subtree not present`);
        return subTree;
    }

    const assertChannelsTree = (rootOrDatastore: ISnapshotTreeWithBlobContents) => disableIsolatedChannels
        ? rootOrDatastore
        : assertSubtree(rootOrDatastore, ".channels");
    const assertProtocolTree = (root: ISnapshotTreeWithBlobContents) => assertSubtree(root, ".protocol");

    function assertChannelTree(rootOrDatastore: ISnapshotTreeWithBlobContents, key: string, msg?: string) {
        const channelsTree = assertChannelsTree(rootOrDatastore);
        return {
            channelsTree,
            datastoreTree: assertSubtree(channelsTree, key, msg ?? `${key} channel not present`),
        };
    }
    const assertDatastoreTree = (root: ISnapshotTreeWithBlobContents, key: string, msg?: string) =>
        assertChannelTree(root, key, `${key} datastore not present`);

    function assertBlobContents<T>(subtree: ISnapshotTreeWithBlobContents, key: string): T {
        const id = subtree.blobs[key];
        assert(id, `blob id for ${key} missing`);
        const contents = subtree.blobsContents[id];
        assert(contents, `blob contents for ${key} missing`);
        return JSON.parse(bufferToString(contents, "utf8")) as T;
    }

    const assertProtocolAttributes = (s: ISnapshotTreeWithBlobContents) =>
        assertBlobContents<IDocumentAttributes>(assertProtocolTree(s), "attributes");

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

    let provider: ITestObjectProvider;
    let loader: Loader;
    let request: IRequest;
    const loaderContainerTracker = new LoaderContainerTracker();

    async function createDetachedContainerAndGetRootDataStore() {
        const container: IContainer = await loader.createDetachedContainer(codeDetails);
        // Get the root dataStore from the detached container.
        const response = await container.request({ url: "/" });
        const defaultDataStore = response.value as TestFluidObject;
        return {
            container,
            defaultDataStore,
        };
    }

    function createTestLoader(): Loader {
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
        const codeLoader = new LocalCodeLoader(
            [[codeDetails, factory]],
            { summaryOptions: { disableIsolatedChannels } });
        const testLoader = new Loader({
            urlResolver: provider.urlResolver,
            documentServiceFactory: provider.documentServiceFactory,
            codeLoader,
            logger: provider.logger,
        });
        loaderContainerTracker.add(testLoader);
        return testLoader;
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

    const getSnapshotTreeFromSerializedSnapshot = (
        container: IContainer,
    ) => {
        return getSnapshotTreeFromSerializedContainer(JSON.parse(container.serialize()));
    };

    beforeEach(async function() {
        provider = getTestObjectProvider();
        if (compare(provider.driver.version, "0.46.0") === -1
            && (provider.driver.type === "routerlicious" || provider.driver.type === "tinylicious")) {
            this.skip();
        }
        const documentId = createDocumentId();
        request = provider.driver.createCreateNewRequest(documentId);
        loader = createTestLoader();
    });

    afterEach(() => {
        loaderContainerTracker.reset();
    });

    const tests = () => {
        it("Dehydrated container snapshot", async () => {
            const { container } =
                await createDetachedContainerAndGetRootDataStore();
            const snapshotTree = getSnapshotTreeFromSerializedSnapshot(container);

            // Check for protocol attributes
            const protocolTree = assertProtocolTree(snapshotTree);
            assert.strictEqual(Object.keys(protocolTree.blobs).length, 4,
                "4 protocol blobs should be there.");

            const protocolAttributes = assertProtocolAttributes(snapshotTree);
            assert.strictEqual(protocolAttributes.sequenceNumber, detachedContainerRefSeqNumber, "initial aeq #");
            assert(
                protocolAttributes.minimumSequenceNumber <= protocolAttributes.sequenceNumber,
                "Min Seq # <= seq #");

            // Check blobs contents for protocolAttributes
            const protocolAttributesBlobId = snapshotTree.trees[".protocol"].blobs.attributes;
            assert(snapshotTree.trees[".protocol"].blobsContents[protocolAttributesBlobId] !== undefined,
                "Blobs should contain attributes blob");
            // Check for default dataStore
            const { datastoreTree: defaultDatastore } = assertDatastoreTree(snapshotTree, "default");
            const datastoreAttributes = assertBlobContents<{ pkg: string }>(defaultDatastore, ".component");
            assert.strictEqual(datastoreAttributes.pkg, JSON.stringify(["default"]), "Package name should be default");
        });

        it("Dehydrated container snapshot 2 times with changes in between", async () => {
            const { container, defaultDataStore } =
                await createDetachedContainerAndGetRootDataStore();
            const snapshotTree1 = getSnapshotTreeFromSerializedSnapshot(container);
            // Create a channel
            const channel = defaultDataStore.runtime.createChannel("test1",
                "https://graph.microsoft.com/types/map") as SharedMap;
            channel.bindToContext();
            const snapshotTree2 = getSnapshotTreeFromSerializedSnapshot(container);

            assert.strictEqual(JSON.stringify(Object.keys(snapshotTree1.trees)),
                JSON.stringify(Object.keys(snapshotTree2.trees)),
                "2 trees should be there(protocol, default dataStore");

            // Check for protocol attributes
            const protocolAttributes1 = assertProtocolAttributes(snapshotTree1);
            const protocolAttributes2 = assertProtocolAttributes(snapshotTree2);
            assert.strictEqual(JSON.stringify(protocolAttributes1), JSON.stringify(protocolAttributes2),
                "Protocol attributes should be same as no change happened");

            // Check for newly create channel
            const defaultChannelsTree1 = assertChannelsTree(
                assertDatastoreTree(snapshotTree1, "default").datastoreTree);
            assert(defaultChannelsTree1.trees.test1 === undefined,
                "Test channel 1 should not be present in snapshot 1");
            assertChannelTree(assertDatastoreTree(snapshotTree2, "default").datastoreTree, "test1",
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

            const snapshotTree = getSnapshotTreeFromSerializedSnapshot(container);

            assertProtocolTree(snapshotTree);
            assertDatastoreTree(snapshotTree, "default");

            assertDatastoreTree(snapshotTree, dataStore2.runtime.id, "Handle Bounded dataStore should be in summary");
        });

        it("Rehydrate container from snapshot and check contents before attach", async () => {
            const { container } =
                await createDetachedContainerAndGetRootDataStore();

            const snapshotTree = container.serialize();

            const container2 = await loader.rehydrateDetachedContainerFromSnapshot(snapshotTree);

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

        it("Rehydrate container multiple times round trip serialize/deserialize", async () => {
            const { container } =
                await createDetachedContainerAndGetRootDataStore();
            let container1 = container;
            for (let i = 0; i < 5; ++i) {
                const snapshotTree1 = container1.serialize();
                container1 = await loader.rehydrateDetachedContainerFromSnapshot(snapshotTree1);
            }

            // Check for default data store
            const response = await container1.request({ url: "/" });
            assert.strictEqual(response.status, 200, `Component should exist!! ${response.value}`);
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

        itExpects("Storage in detached container",
        [
            {eventName:"fluid:telemetry:Container:NoRealStorageInDetachedContainer"},
            {eventName:"fluid:telemetry:Container:NoRealStorageInDetachedContainer"},
        ],
        async () => {
            const { container } =
                await createDetachedContainerAndGetRootDataStore();

            const snapshotTree = container.serialize();
            assert((container as Container).storage !== undefined, "Storage should be present in detached container");
            const response = await container.request({ url: "/" });
            const defaultDataStore = response.value as TestFluidObject;
            assert(defaultDataStore.context.storage !== undefined,
                "Storage should be present in detached data store");
            let success1: boolean | undefined;
            await defaultDataStore.context.storage.getSnapshotTree(undefined).catch((err) => { success1 = false; });
            assert(success1 === false, "Snapshot fetch should not be allowed in detached data store");

            const container2: IContainer = await loader.rehydrateDetachedContainerFromSnapshot(snapshotTree);
            assert(
                (container2 as Container).storage !== undefined,
                "Storage should be present in rehydrated container",
            );
            const response2 = await container2.request({ url: "/" });
            const defaultDataStore2 = response2.value as TestFluidObject;
            assert(defaultDataStore2.context.storage !== undefined,
                "Storage should be present in rehydrated data store");
            let success2: boolean | undefined;
            await defaultDataStore2.context.storage.getSnapshotTree(undefined).catch((err) => { success2 = false; });
            assert(success2 === false, "Snapshot fetch should not be allowed in rehydrated data store");
        });

        it("Change contents of dds, then rehydrate and then check summary", async () => {
            const { container } =
                await createDetachedContainerAndGetRootDataStore();

            const responseBefore = await container.request({ url: "/" });
            const defaultDataStoreBefore = responseBefore.value as TestFluidObject;
            const sharedStringBefore = await defaultDataStoreBefore.getSharedObject<SharedString>(sharedStringId);
            const intervalsBefore = sharedStringBefore.getIntervalCollection("intervals");
            sharedStringBefore.insertText(0, "Hello");
            let interval0 = intervalsBefore.add(0, 0, IntervalType.SlideOnRemove);
            let interval1 = intervalsBefore.add(0, 1, IntervalType.SlideOnRemove);
            let id0;
            let id1;

            if (typeof(intervalsBefore.change) === "function") {
                id0 = interval0.getIntervalId();
                id1 = interval1.getIntervalId();
                assert.strictEqual(typeof(id0), "string");
                assert.strictEqual(typeof(id1), "string");
                intervalsBefore.change(id0, 2, 3);
                intervalsBefore.change(id1, 0, 3);
            }

            const snapshotTree = container.serialize();

            const container2 = await loader.rehydrateDetachedContainerFromSnapshot(snapshotTree);

            const responseAfter = await container2.request({ url: "/" });
            const defaultComponentAfter = responseAfter.value as TestFluidObject;
            const sharedStringAfter = await defaultComponentAfter.getSharedObject<SharedString>(sharedStringId);
            const intervalsAfter = sharedStringAfter.getIntervalCollection("intervals");
            assert.strictEqual(
                JSON.stringify(sharedStringAfter.summarize()),
                JSON.stringify(sharedStringBefore.summarize()),
                "Summaries of shared string should match and contents should be same!!");
            if (typeof(intervalsBefore.change) === "function" &&
                typeof(intervalsAfter.change) === "function") {
                interval0 = intervalsAfter.getIntervalById(id0);
                assert.notStrictEqual(interval0, undefined);
                assert.strictEqual(interval0.start.getOffset(), 2);
                assert.strictEqual(interval0.end.getOffset(), 3);

                interval1 = intervalsAfter.getIntervalById(id1);
                assert.notStrictEqual(interval1, undefined);
                assert.strictEqual(interval1.start.getOffset(), 0);
                assert.strictEqual(interval1.end.getOffset(), 3);
            }
            for (const interval of intervalsBefore) {
                if (typeof(interval.getIntervalId) === "function") {
                    const id = interval.getIntervalId();
                    assert.strictEqual(typeof(id), "string");
                    if (id) {
                        assert.notStrictEqual(intervalsAfter.getIntervalById(id), undefined,
                            "Interval not present after rehydration");
                        intervalsAfter.removeIntervalById(id);
                        assert.strictEqual(intervalsAfter.getIntervalById(id), undefined,
                            "Interval not deleted");
                    }
                }
            }
            for (const interval of intervalsAfter) {
                assert.fail(
                    `Unexpected interval after rehydration: ${interval.start.getOffset()}-${interval.end.getOffset()}`);
            }
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
            // close the container that we don't use any more, so it doesn't block ensureSynchronized()
            container.close();

            const rehydratedContainer = await loader.rehydrateDetachedContainerFromSnapshot(snapshotTree);
            await rehydratedContainer.attach(request);

            // Now load the container from another loader.
            const urlResolver2 = provider.urlResolver;
            const loader2 = createTestLoader();
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

            await loaderContainerTracker.ensureSynchronized();
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
            // close the container that we don't use any more, so it doesn't block ensureSynchronized()
            container.close();

            const rehydratedContainer = await loader.rehydrateDetachedContainerFromSnapshot(snapshotTree);
            await rehydratedContainer.attach(request);

            // Now load the container from another loader.
            const urlResolver2 = provider.urlResolver;
            const loader2 = createTestLoader();
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

            await loaderContainerTracker.ensureSynchronized();
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

            const responseForDDS =
                await rehydratedContainer.request({ url: `/${defaultDataStore.runtime.id}/${ddsId}` });
            const ddd2FromRC = responseForDDS.value as SharedString;
            assert(ddd2FromRC, "ddd2 should have been serialized properly");
            assert.strictEqual(ddd2FromRC.id, ddsId, "DDS id should match");
            assert.strictEqual(ddd2FromRC.id, dds2.id, "Both dds id should match");

            const responseForDataStore = await rehydratedContainer.request({ url: `/${dataStore2.context.id}` });
            const dataStore2FromRC = responseForDataStore.value as TestFluidObject;
            assert(dataStore2FromRC, "DataStore2 should have been serialized properly");
            assert.strictEqual(dataStore2FromRC.runtime.id, dataStore2.runtime.id, "DataStore2 id should match");
        });

        it("Container rehydration with not bounded data store handle stored in root of bound dataStore. " +
            "The not bounded data store also stores handle not bounded dds",
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

            const snapshotTree = getSnapshotTreeFromSerializedSnapshot(container);

            assertProtocolTree(snapshotTree);
            assertDatastoreTree(snapshotTree, "default");
        });
    };

    // Run once with isolated channels
    tests();

    // Run again with isolated channels disabled
    describe("With isolated channels disabled", () => {
        before(() => {
            disableIsolatedChannels = true;
        });

        tests();
    });
});
