/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { fromBase64ToUtf8 } from "@fluidframework/common-utils";
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
import { SharedMap } from "@fluidframework/map";
import { IDocumentAttributes } from "@fluidframework/protocol-definitions";
import { IContainerRuntimeBase } from "@fluidframework/runtime-definitions";
import { requestFluidObject } from "@fluidframework/runtime-utils";

describe(`Dehydrate Rehydrate Container Test`, () => {
    const codeDetails: IFluidCodeDetails = {
        package: "detachedContainerTestPackage1",
        config: {},
    };
    const mapId1 = "mapId1";

    let testDeltaConnectionServer: ILocalDeltaConnectionServer;
    let loader: Loader;

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
            [mapId1, SharedMap.getFactory()],
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
            JSON.parse(fromBase64ToUtf8(snapshotTree.trees[".protocol"].blobs[protocolAttributesBlobId]));
        assert.strictEqual(protocolAttributes.sequenceNumber, 0, "Seq number should be 0");
        assert.strictEqual(protocolAttributes.minimumSequenceNumber, 0, "Min Seq number should be 0");

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
        const rootOfDataStore1 = await (defaultDataStore as TestFluidObject).getSharedObject<SharedMap>(mapId1);
        rootOfDataStore1.set("dataStore2", dataStore2.handle);

        const snapshotTree = JSON.parse(container.serialize());

        assert.strictEqual(Object.keys(snapshotTree.trees).length, 4, "4 trees should be there");
        assert(snapshotTree.trees[dataStore2.runtime.id], "Handle Bounded dataStore should be in summary");
    });
});
