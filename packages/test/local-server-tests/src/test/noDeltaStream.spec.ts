/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { IContainer, LoaderHeader } from "@fluidframework/container-definitions";
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
    LoaderContainerTracker,
    TestContainerRuntimeFactory,
    TestFluidObjectFactory,
} from "@fluidframework/test-utils";
import { Container, waitContainerToCatchUp } from "@fluidframework/container-loader";
import { IDocumentServiceFactory } from "@fluidframework/driver-definitions";
import { DeltaStreamConnectionForbiddenError } from "@fluidframework/driver-utils";

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
        new TestFluidObjectFactory([[stringId, SharedString.getFactory()]]));

    let deltaConnectionServer: ILocalDeltaConnectionServer;
    let loaderContainerTracker: LoaderContainerTracker;

    async function createContainer(): Promise<IContainer> {
        const loader = createLoader(
            [[codeDetails, factory]],
            new LocalDocumentServiceFactory(deltaConnectionServer),
            new LocalResolver());
        loaderContainerTracker.add(loader);
        const container = await createAndAttachContainer(
            codeDetails,
            loader,
            createLocalResolverCreateNewRequest(documentId));
        return container;
    }

    async function loadContainer(storageOnly: boolean, track = true): Promise<IContainer> {
        const service = new LocalDocumentServiceFactory(deltaConnectionServer, { storageOnly });
        const loader = createLoader(
            [[codeDetails, factory]],
            service,
            new LocalResolver());
        if (!storageOnly) {
            loaderContainerTracker.add(loader);
        }

        // See issue #7426 - need better long term solution
        const container = await loader.resolve({
            url: documentLoadUrl,
            headers: { [LoaderHeader.loadMode]: { opsBeforeReturn: "all" }},
        });
        await loaderContainerTracker.ensureSynchronized();
        return container;
    }

    async function loadContainerWithDocServiceFactory(
        documentServiceFactory: IDocumentServiceFactory,
    ): Promise<IContainer> {
        const loader = createLoader(
            [[codeDetails, factory]],
            documentServiceFactory,
            new LocalResolver());
        const container = await loader.resolve({ url: documentLoadUrl });
        await loaderContainerTracker.ensureSynchronized();
        return container;
    }

    beforeEach(async () => {
        deltaConnectionServer = LocalDeltaConnectionServer.create();
        loaderContainerTracker = new LoaderContainerTracker();

        // Create a Container for the first client.
        const container = await createContainer();
        const dataObject = await requestFluidObject<ITestFluidObject>(container, "default");

        assert.strictEqual(container.deltaManager.active, false, "active");
        assert.strictEqual(container.deltaManager.readonly, false, "readonly");

        assert.strictEqual(dataObject.runtime.connected, true, "connected");
        assert.notStrictEqual(dataObject.runtime.clientId, undefined, "clientId");

        dataObject.root.set("test", "key");
        await loaderContainerTracker.ensureSynchronized();
    });

    afterEach(() => {
        loaderContainerTracker.reset();
    });

    it("Validate Properties on Loaded Container With No Delta Stream", async () => {
        // Load the Container that was created by the first client.
        const container = await loadContainer(true) as Container;

        assert.strictEqual(container.connected, true, "container.connected");
        assert.strictEqual(container.clientId, "storage-only client", "container.clientId");
        assert.strictEqual(container.readonly, true, "container.readonly");
        assert.strictEqual(container.readonlyPermissions, true, "container.readonlyPermissions");
        assert.ok(container.readOnlyInfo.readonly, "container.storageOnly");

        const deltaManager = container.deltaManager;
        assert.strictEqual(deltaManager.active, false, "deltaManager.active");
        assert.strictEqual(deltaManager.readonly, true, "deltaManager.readonly");
        assert.ok(deltaManager.readOnlyInfo.readonly, "deltaManager.readOnlyInfo.readonly");
        assert.ok(deltaManager.readOnlyInfo.permissions, "deltaManager.readOnlyInfo.permissions");
        assert.ok(deltaManager.readOnlyInfo.storageOnly, "deltaManager.readOnlyInfo.storageOnly");

        const dataObject = await requestFluidObject<ITestFluidObject>(container, "default");
        assert.strictEqual(dataObject.runtime.connected, true, "dataObject.runtime.connected");
        assert.strictEqual(dataObject.runtime.clientId, "storage-only client", "dataObject.runtime.clientId");

        assert.strictEqual(dataObject.root.get("test"), "key", "mapKey");

        container.close();
    });

    it("doesn't affect normal containers", async () => {
        await loadContainer(true) as Container;
        const normalContainer1 = await loadContainer(false) as Container;
        const normalContainer2 = await loadContainer(false) as Container;
        const normalDataObject1 = await requestFluidObject<ITestFluidObject>(normalContainer1, "default");
        const normalDataObject2 = await requestFluidObject<ITestFluidObject>(normalContainer2, "default");
        normalDataObject1.root.set("fluid", "great");
        normalDataObject2.root.set("prague", "a city in europe");
        assert.strictEqual(await normalDataObject1.root.wait("prague"), "a city in europe");
        assert.strictEqual(await normalDataObject2.root.wait("fluid"), "great");

        const storageOnlyContainer = await loadContainer(true);
        await waitContainerToCatchUp(storageOnlyContainer as Container);
        const storageOnlyDataObject = await requestFluidObject<ITestFluidObject>(storageOnlyContainer, "default");
        assert.strictEqual(await storageOnlyDataObject.root.wait("prague"), "a city in europe");
        assert.strictEqual(await storageOnlyDataObject.root.wait("fluid"), "great");
    });

    it("loads in storage-only mode on error thrown from connectToDeltaStream()", async () => {
        const documentServiceFactory = new LocalDocumentServiceFactory(deltaConnectionServer);
        const createDocServ = documentServiceFactory.createDocumentService.bind(documentServiceFactory);
        documentServiceFactory.createDocumentService = async (...args) => {
            return createDocServ(...args).then((docService) => {
                docService.connectToDeltaStream = async () => {
                    throw new DeltaStreamConnectionForbiddenError("asdf");
                };
                return docService;
            });
        };
        const container = await loadContainerWithDocServiceFactory(documentServiceFactory) as Container;

        assert.strictEqual(container.connected, true, "container.connected");
        assert.strictEqual(container.clientId, "storage-only client", "container.clientId");
        assert.strictEqual(container.readonly, true, "container.readonly");
        assert.strictEqual(container.readonlyPermissions, true, "container.readonlyPermissions");
        assert.ok(container.readOnlyInfo.readonly, "container.storageOnly");

        const deltaManager = container.deltaManager;
        assert.strictEqual(deltaManager.active, false, "deltaManager.active");
        assert.strictEqual(deltaManager.readonly, true, "deltaManager.readonly");
        assert.ok(deltaManager.readOnlyInfo.readonly, "deltaManager.readOnlyInfo.readonly");
        assert.ok(deltaManager.readOnlyInfo.permissions, "deltaManager.readOnlyInfo.permissions");
        assert.ok(deltaManager.readOnlyInfo.storageOnly, "deltaManager.readOnlyInfo.storageOnly");

        const dataObject = await requestFluidObject<ITestFluidObject>(container, "default");
        assert.strictEqual(dataObject.runtime.connected, true, "dataObject.runtime.connected");
        assert.strictEqual(dataObject.runtime.clientId, "storage-only client", "dataObject.runtime.clientId");

        assert.strictEqual(dataObject.root.get("test"), "key", "mapKey");

        container.close();
    });

    // eslint-disable-next-line no-constant-condition
    const loadOptions: IContainerLoadMode[] = 0 === 0 ? [{}] :
        generatePairwiseOptions<IContainerLoadMode>({
                deltaConnection: [undefined, "none", "delayed"],
                opsBeforeReturn: [undefined, "cached", "all"],
            });

    const testConfigs =
        generatePairwiseOptions({
            loadOptions,
            waitForSummary: [true], // , false],
        });

    for(const testConfig of testConfigs) {
        it.only(`Validate Load Modes: ${JSON.stringify(testConfig ?? "undefined")}`, async () => {
            const normalContainer = await loadContainer(false) as Container;

            const normalDataObject = await requestFluidObject<ITestFluidObject>(normalContainer, "default");
            const summaryCollection =
                new SummaryCollection(normalContainer.deltaManager, new TelemetryNullLogger());

            for(let i = 0; i < 100; i++) {
                normalDataObject.root.set(i.toString(), i);
            }

            if(testConfig.waitForSummary) {
                let summary: boolean = false;
                const summaryP = new Promise<boolean>(
                    (res)=>{
                        summaryCollection.once("summaryAck", ()=>res(true));
                    });
                while(!summary) {
                    summary = await timeoutAwait<boolean>(
                        summaryP,
                        {reject: false, value: false});
                }
            }

            const storageOnlyContainer = await loadContainer(
                true,
                { headers: {[LoaderHeader.loadMode]: testConfig.loadOptions}}) as Container;

            await timeoutAwait(waitContainerToCatchUp(storageOnlyContainer));
            const storageOnlyDataObject = await requestFluidObject<ITestFluidObject>(storageOnlyContainer, "default");
            assert.strictEqual(
                Array.from(storageOnlyDataObject.root.keys()).length,
                Array.from(normalDataObject.root.keys()).length);

            for(const key of normalDataObject.root.keys()) {
                assert.strictEqual(
                    storageOnlyDataObject.root.get(key),
                    normalDataObject.root.get(key));
            }
        });
    }

    afterEach(async () => {
        await deltaConnectionServer.webSocketServer.close();
    });
});
