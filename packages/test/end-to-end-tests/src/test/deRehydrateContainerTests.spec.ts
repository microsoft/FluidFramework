/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { IFluidCodeDetails, IProxyLoaderFactory } from "@fluidframework/container-definitions";
import { Loader } from "@fluidframework/container-loader";
import { IUrlResolver } from "@fluidframework/driver-definitions";
import { TestDocumentServiceFactory, TestResolver } from "@fluidframework/local-driver";
import { ILocalDeltaConnectionServer, LocalDeltaConnectionServer } from "@fluidframework/server-local-server";
import {
    LocalCodeLoader,
    TestFluidComponentFactory,
} from "@fluidframework/test-utils";
import { SharedMap } from "@fluidframework/map";
import { IDocumentAttributes } from "@fluidframework/protocol-definitions";

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
        const documentServiceFactory = new TestDocumentServiceFactory(testDeltaConnectionServer);
        return new Loader(
            urlResolver,
            documentServiceFactory,
            codeLoader,
            {},
            {},
            new Map<string, IProxyLoaderFactory>());
    }

    beforeEach(async () => {
        testDeltaConnectionServer = LocalDeltaConnectionServer.create();
        const urlResolver = new TestResolver();
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
        const protocolAttributesBlobId = snapshotTree.trees[".protocol"].blobs[".attributes"];
        const protocolAttributes: IDocumentAttributes =
            JSON.parse(Buffer.from(snapshotTree.trees[".protocol"].blobs[protocolAttributesBlobId],
            "base64").toString());
        assert.strictEqual(protocolAttributes.sequenceNumber, 0, "Seq number should be 0");
        assert.strictEqual(protocolAttributes.minimumSequenceNumber, 0, "Min Seq number should be 0");

        // Check for default component
        const defaultComponentBlobId = snapshotTree.trees.default.blobs[".component"];
        const componentAttributes = JSON.parse(
            Buffer.from(snapshotTree.trees.default.blobs[defaultComponentBlobId], "base64").toString());
        assert.strictEqual(componentAttributes.pkg, JSON.stringify(["default"]), "Package name should be default");
    });
});
