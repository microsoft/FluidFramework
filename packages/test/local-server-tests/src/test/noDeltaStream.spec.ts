/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { IContainer, ILoader } from "@fluidframework/container-definitions";
import { IFluidCodeDetails } from "@fluidframework/core-interfaces";
import {
    createLocalResolverCreateNewRequest,
    LocalDocumentServiceFactory,
    LocalResolver,
 } from "@fluidframework/local-driver";
import { SharedString } from "@fluidframework/sequence";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { LocalDeltaConnectionServer, ILocalDeltaConnectionServer } from "@fluidframework/server-local-server";
import {
    createAndAttachContainer,
    createLoader,
    ITestFluidObject,
    OpProcessingController,
    TestContainerRuntimeFactory,
    TestFluidObjectFactory,
} from "@fluidframework/test-utils";
import { Container, DeltaManager } from "@fluidframework/container-loader";

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
    let opc: OpProcessingController;

    async function createContainer(): Promise<IContainer> {
        const loader: ILoader = createLoader(
            [[codeDetails, factory]],
            new LocalDocumentServiceFactory(deltaConnectionServer),
            new LocalResolver());
        const container = await createAndAttachContainer(
            codeDetails,
            loader,
            createLocalResolverCreateNewRequest(documentId));
        opc.addDeltaManagers(container.deltaManager);
        return container;
    }

    async function loadContainer(noDeltaStream: boolean): Promise<IContainer> {
        const loader: ILoader = createLoader(
            [[codeDetails, factory]],
            new LocalDocumentServiceFactory(deltaConnectionServer, noDeltaStream),
            new LocalResolver());
        const container = await loader.resolve({ url: documentLoadUrl });
        opc.addDeltaManagers(container.deltaManager);
        return container;
    }

    beforeEach(async () => {
        deltaConnectionServer = LocalDeltaConnectionServer.create();
        opc = new OpProcessingController();

        // Create a Container for the first client.
        const container = await createContainer();
        const dataObject = await requestFluidObject<ITestFluidObject>(container, "default");

        assert.strictEqual(container.deltaManager.active, false, "active");
        assert.strictEqual(container.deltaManager.readonly, false, "readonly");

        assert.strictEqual(dataObject.runtime.existing, false, "existing");
        assert.strictEqual(dataObject.runtime.connected, true, "connected");
        assert.notStrictEqual(dataObject.runtime.clientId, undefined, "clientId");

        dataObject.root.set("test","key");
        await opc.process();
    });

    it("Validate Properties on Loaded Container With No Delta Stream", async () => {
        // Load the Container that was created by the first client.
        const container = await loadContainer(true) as Container;

        assert.strictEqual(container.connected, true, "container.connected");
        assert.strictEqual(container.clientId, undefined, "container.clientId");
        assert.strictEqual(container.existing, true, "container.existing");
        assert.strictEqual(container.readonly, true, "container.readonly");
        assert.strictEqual(container.readonlyPermissions, true, "container.readonlyPermissions");

        const deltaManager = container.deltaManager as DeltaManager;
        assert.strictEqual(deltaManager.active, false, "deltaManager.active");
        assert.strictEqual(deltaManager.readonly, true, "deltaManager.readonly");
        assert.strictEqual(deltaManager.readonlyPermissions, true, "deltaManager.readonlyPermissions");
        assert.strictEqual(deltaManager.connectionMode, "read", "deltaManager.connectionMode");
        assert.strictEqual(deltaManager.storageOnly, true, "deltaManager.storageOnly");

        const dataObject = await requestFluidObject<ITestFluidObject>(container, "default");
        assert.strictEqual(dataObject.runtime.existing, true, "dataObject.runtime.existing");
        assert.strictEqual(dataObject.runtime.connected, true, "dataObject.runtime.connected");
        assert.strictEqual(dataObject.runtime.clientId, undefined, "dataObject.runtime.clientId");

        assert.strictEqual(dataObject.root.get("test"), "key", "mapKey");

        container.close();
    });

    it("can't send ops", async () => {
        const container = await loadContainer(true) as Container;
        const dataObject = await requestFluidObject<ITestFluidObject>(container, "default");

        let err = false;
        try {
            dataObject.root.set("asdfasdf", "asfdasdfasdfasdf");
        } catch (e) {
            err = true;
        }
        assert.strictEqual(err, true);

        container.close();
    });

    afterEach(async () => {
        await deltaConnectionServer.webSocketServer.close();
    });
});
