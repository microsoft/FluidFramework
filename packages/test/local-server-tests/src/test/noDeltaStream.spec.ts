/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { IContainer, ILoader } from "@fluidframework/container-definitions";
import { IFluidCodeDetails } from "@fluidframework/core-interfaces";
import { LocalDocumentServiceFactory, LocalResolver } from "@fluidframework/local-driver";
import { SharedString } from "@fluidframework/sequence";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { LocalDeltaConnectionServer, ILocalDeltaConnectionServer } from "@fluidframework/server-local-server";
import {
    createAndAttachContainer,
    createLoader,
    ITestFluidObject,
    TestContainerRuntimeFactory,
    TestFluidObjectFactory,
} from "@fluidframework/test-utils";

describe("No Delta Stream", () => {
    const documentId = "localServerTest";
    const documentLoadUrl = `fluid-test://localhost/${documentId}`;
    const stringId = "stringKey";
    const codeDetails: IFluidCodeDetails = {
        package: "localServerTestPackage",
        config: {},
    };
    const factory = new TestContainerRuntimeFactory(
        "",
        new TestFluidObjectFactory([[stringId, SharedString.getFactory()]]),
        {generateSummaries: true});

    let deltaConnectionServer: ILocalDeltaConnectionServer;
    let urlResolver: LocalResolver;

    async function createContainer(): Promise<IContainer> {
        const loader: ILoader = createLoader(
            [[codeDetails, factory]],
            new LocalDocumentServiceFactory(deltaConnectionServer),
            urlResolver);
        return createAndAttachContainer(
            codeDetails, loader, urlResolver.createCreateNewRequest(documentId));
    }

    async function loadContainer(): Promise<IContainer> {
        const loader: ILoader = createLoader(
            [[codeDetails, factory]],
            new LocalDocumentServiceFactory(deltaConnectionServer, true),
            urlResolver);
        return loader.resolve({ url: documentLoadUrl });
    }

    beforeEach(async () => {
        deltaConnectionServer = LocalDeltaConnectionServer.create();
        urlResolver = new LocalResolver();

        // Create a Container for the first client.
        const container = await createContainer();
        const dataObject = await requestFluidObject<ITestFluidObject>(container, "default");

        assert.strictEqual(container.deltaManager.active, false, "active");
        assert.strictEqual(container.deltaManager.readonly, false, "readonly");

        assert.strictEqual(dataObject.runtime.existing, false, "existing");
        assert.strictEqual(dataObject.runtime.connected, true, "connected");
        assert.notStrictEqual(dataObject.runtime.clientId, undefined, "clientId");

        dataObject.root.set("test","key");
    });

    it("Validate Properties on Loaded Container With No Delta Stream", async () => {
        // Load the Container that was created by the first client.
        const container = await loadContainer();
        const dataObject = await requestFluidObject<ITestFluidObject>(container, "default");

        assert.strictEqual(container.deltaManager.active, false, "active");
        assert.strictEqual(container.deltaManager.readonly, true, "readonly");

        assert.strictEqual(dataObject.runtime.existing, true, "existing");
        assert.strictEqual(dataObject.runtime.connected, true, "connected");
        assert.strictEqual(dataObject.runtime.clientId, undefined, "clientId");

        assert.strictEqual(await dataObject.root.wait("test"), "key", "mapKey");
    });

    afterEach(async () => {
        await deltaConnectionServer.webSocketServer.close();
    });
});
