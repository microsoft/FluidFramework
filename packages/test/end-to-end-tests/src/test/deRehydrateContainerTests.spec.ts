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
    TestFluidComponentFactory,
    ITestFluidComponent,
    TestFluidComponent,
} from "@fluidframework/test-utils";
import { SharedMap } from "@fluidframework/map";
import { IDocumentAttributes } from "@fluidframework/protocol-definitions";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions";
import { IContainerRuntimeBase } from "@fluidframework/runtime-definitions";

describe(`Dehydrate Rehydrate Container Test`, () => {
    const codeDetails: IFluidCodeDetails = {
        package: "detachedContainerTestPackage1",
        config: {},
    };
    const mapId1 = "mapId1";

    let testDeltaConnectionServer: ILocalDeltaConnectionServer;
    let loader: Loader;

    async function createDetachedContainerAndGetRootComponent() {
        const container = await loader.createDetachedContainer(codeDetails);
        // Get the root component from the detached container.
        const response = await container.request({ url: "/" });
        const defaultComponent = response.value;
        return {
            container,
            defaultComponent,
        };
    }

    function createTestLoader(urlResolver: IUrlResolver): Loader {
        const factory: TestFluidComponentFactory = new TestFluidComponentFactory([
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

    const createPeerComponent = async (
        containerRuntime: IContainerRuntimeBase,
    ) => {
        const peerComponentRuntimeChannel = await (containerRuntime as IContainerRuntime)
            .createDataStoreWithRealizationFn(["default"]);
        const peerComponent =
            (await peerComponentRuntimeChannel.request({ url: "/" })).value as ITestFluidComponent;
        return {
            peerComponent,
            peerComponentRuntimeChannel,
        };
    };

    beforeEach(async () => {
        testDeltaConnectionServer = LocalDeltaConnectionServer.create();
        const urlResolver = new LocalResolver();
        loader = createTestLoader(urlResolver);
    });

    it("Dehydrated container snapshot", async () => {
        const { container } =
            await createDetachedContainerAndGetRootComponent();
        const snapshotTree = JSON.parse(container.serialize());

        assert.strictEqual(Object.keys(snapshotTree.trees).length, 3,
            "3 trees should be there(protocol, default component, scheduler");
        assert.strictEqual(Object.keys(snapshotTree.trees[".protocol"].blobs).length, 8,
            "4 protocol blobs should be there(8 mappings)");

        // Check for protocol attributes
        const protocolAttributesBlobId = snapshotTree.trees[".protocol"].blobs.attributes;
        const protocolAttributes: IDocumentAttributes =
            JSON.parse(fromBase64ToUtf8(snapshotTree.trees[".protocol"].blobs[protocolAttributesBlobId]));
        assert.strictEqual(protocolAttributes.sequenceNumber, 0, "Seq number should be 0");
        assert.strictEqual(protocolAttributes.minimumSequenceNumber, 0, "Min Seq number should be 0");

        // Check for default component
        const defaultComponentBlobId = snapshotTree.trees.default.blobs[".component"];
        const componentAttributes =
            JSON.parse(fromBase64ToUtf8(snapshotTree.trees.default.blobs[defaultComponentBlobId]));
        assert.strictEqual(componentAttributes.pkg, JSON.stringify(["default"]), "Package name should be default");
    });

    it("Dehydrated container snapshot 2 times with changes in between", async () => {
        const { container, defaultComponent } =
            await createDetachedContainerAndGetRootComponent();
        const snapshotTree1 = JSON.parse(container.serialize());
        // Create a channel
        const channel = defaultComponent.runtime.createChannel("test1",
            "https://graph.microsoft.com/types/map") as SharedMap;
        channel.bindToContext();
        const snapshotTree2 = JSON.parse(container.serialize());

        assert.strictEqual(JSON.stringify(Object.keys(snapshotTree1.trees)),
            JSON.stringify(Object.keys(snapshotTree2.trees)),
            "3 trees should be there(protocol, default component, scheduler");

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

    it("Dehydrated container snapshot with component handle stored in map of other bound component", async () => {
        const { container, defaultComponent } =
            await createDetachedContainerAndGetRootComponent();

        // Create another component
        const peerComponent = await createPeerComponent(defaultComponent.context.containerRuntime);
        const component2 = peerComponent.peerComponent as TestFluidComponent;

        // Create a channel
        const rootOfComponent1 = await (defaultComponent as TestFluidComponent).getSharedObject<SharedMap>(mapId1);
        rootOfComponent1.set("component2", component2.handle);

        const snapshotTree = JSON.parse(container.serialize());

        assert.strictEqual(Object.keys(snapshotTree.trees).length, 4, "4 trees should be there");
        assert(snapshotTree.trees[component2.runtime.id], "Handle Bounded component should be in summary");
    });
});
