/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { Loader } from "@fluidframework/container-loader";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { SharedString } from "@fluidframework/sequence";
import {
    ChannelFactoryRegistry,
    createDocumentId,
    ITestFluidObject,
    LocalCodeLoader,
    SupportedExportInterfaces,
    TestFluidObjectFactory,
} from "@fluidframework/test-utils";
import {
    IDocumentService,
    IDocumentServiceFactory,
    IDocumentStorageService,
    IResolvedUrl,
} from "@fluidframework/driver-definitions";
import { NonRetryableError, readAndParse } from "@fluidframework/driver-utils";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import { ReferenceType, TextSegment } from "@fluidframework/merge-tree";
import { describeNoCompat, itExpects, pkgVersion } from "@fluidframework/test-version-utils";

// REVIEW: enable compat testing?
describeNoCompat("SharedString", (getTestObjectProvider) => {
    itExpects(
    "Failure to Load in Shared String",
    [
        {eventName: "fluid:telemetry:FluidDataStoreRuntime:RemoteChannelContext:ChannelStorageBlobError"},
        // eslint-disable-next-line max-len
        {eventName: "fluid:telemetry:FluidDataStoreRuntime:SharedSegmentSequence.MergeTreeClient:SnapshotLoader:CatchupOpsLoadFailure"},
        {eventName: "fluid:telemetry:FluidDataStoreRuntime:SequenceLoadFailed"},
        {eventName: "fluid:telemetry:FluidDataStoreRuntime:GetChannelFailedInRequest"},
        {eventName: "TestException"}
    ],
    async () => {
        const stringId = "sharedStringKey";
        const registry: ChannelFactoryRegistry = [[stringId, SharedString.getFactory()]];
        const fluidExport: SupportedExportInterfaces = {
            IFluidDataStoreFactory: new TestFluidObjectFactory(registry),
        };
        const text = "hello world";
        const documentId = createDocumentId();
        let containerUrl: IResolvedUrl | undefined;
        const provider = getTestObjectProvider();
        const logger = provider.logger;

        { // creating client
            const codeDetails = { package: "no-dynamic-pkg" };
            const codeLoader = new LocalCodeLoader([
                [codeDetails, fluidExport],
            ]);

            const loader = new Loader({
                urlResolver: provider.urlResolver,
                documentServiceFactory: provider.documentServiceFactory,
                codeLoader,
                logger,
            });

            const container = await loader.createDetachedContainer(codeDetails);
            const dataObject = await requestFluidObject<ITestFluidObject>(container, "default");
            const sharedString = await dataObject.root.get<IFluidHandle<SharedString>>(stringId)?.get();
            assert(sharedString);
            sharedString.insertText(0, text);

            await container.attach(provider.driver.createCreateNewRequest(documentId));
            containerUrl = container.resolvedUrl;
        }
        { // normal load client
            const codeDetails = { package: "no-dynamic-pkg" };
            const codeLoader = new LocalCodeLoader([
                [codeDetails, fluidExport],
            ]);

            const loader = new Loader({
                urlResolver: provider.urlResolver,
                documentServiceFactory: provider.documentServiceFactory,
                codeLoader,
                logger,
            });

            const container = await loader.resolve({
                url: await provider.driver.createContainerUrl(documentId, containerUrl),
            });
            const dataObject = await requestFluidObject<ITestFluidObject>(container, "default");
            const sharedString = await dataObject.root.get<IFluidHandle<SharedString>>(stringId)?.get();
            assert(sharedString);
            assert.strictEqual(sharedString.getText(0), text);
        }
        { // failure load client
            const realSf: IDocumentServiceFactory = provider.documentServiceFactory;
            const documentServiceFactory: IDocumentServiceFactory = {
                ...realSf,
                createDocumentService: async (resolvedUrl, logger2) => {
                    const realDs = await realSf.createDocumentService(resolvedUrl, logger2);
                    const mockDs = Object.create(realDs) as IDocumentService;
                    mockDs.connectToStorage = async () => {
                        const realStorage = await realDs.connectToStorage();
                        const mockstorage = Object.create(realStorage) as IDocumentStorageService;
                        mockstorage.readBlob = async (id) => {
                            const blob = await realStorage.readBlob(id);
                            const blobObj = await readAndParse<any>(realStorage, id);
                            // throw when trying to load the header blob
                            if (blobObj.headerMetadata !== undefined) {
                                throw new NonRetryableError(
                                    "notFound",
                                    "Not Found",
                                    "someErrorType",
                                    { statusCode: 404, driverVersion: pkgVersion });
                            }
                            return blob;
                        };
                        return mockstorage;
                    };
                    return mockDs;
                },
            };
            const codeDetails = { package: "no-dynamic-pkg" };
            const codeLoader = new LocalCodeLoader([
                [codeDetails, fluidExport],
            ]);

            const loader = new Loader({
                urlResolver: provider.urlResolver,
                documentServiceFactory,
                codeLoader,
                logger,
            });

            const container = await loader.resolve({
                url: await provider.driver.createContainerUrl(documentId, containerUrl),
            });
            const dataObject = await requestFluidObject<ITestFluidObject>(container, "default");

            await dataObject.root.get<IFluidHandle<SharedString>>(stringId)?.get();
        }
    });

    it("Text operations successfully round trip on detached create", async () => {
        const stringId = "sharedStringKey";
        const registry: ChannelFactoryRegistry = [[stringId, SharedString.getFactory()]];
        const fluidExport: SupportedExportInterfaces = {
            IFluidDataStoreFactory: new TestFluidObjectFactory(registry),
        };
        const text = "hello world";
        const documentId = createDocumentId();
        let containerUrl: IResolvedUrl | undefined;
        const provider = getTestObjectProvider();
        const logger = provider.logger;

        let initialText = "";
        { // creating client
            const codeDetails = { package: "no-dynamic-pkg" };
            const codeLoader = new LocalCodeLoader([
                [codeDetails, fluidExport],
            ]);

            const loader = new Loader({
                urlResolver: provider.urlResolver,
                documentServiceFactory: provider.documentServiceFactory,
                codeLoader,
                logger,
            });

            const container = await loader.createDetachedContainer(codeDetails);
            const dataObject = await requestFluidObject<ITestFluidObject>(container, "default");
            const sharedString = await dataObject.root.get<IFluidHandle<SharedString>>(stringId)?.get();
            assert(sharedString);

            for (let i = 0; i < 10; i++) {
                sharedString.insertText(0, text);

                const segInfo = sharedString.getContainingSegment(3);
                sharedString.insertAtReferencePosition(
                    sharedString.createPositionReference(segInfo.segment, segInfo.offset, ReferenceType.SlideOnRemove),
                    new TextSegment(text));

                sharedString.removeRange(0, 5);

                const length = sharedString.getLength();
                sharedString.replaceText(length - 5, length, text);
            }
            initialText = sharedString.getText();

            await container.attach(provider.driver.createCreateNewRequest(documentId));
            containerUrl = container.resolvedUrl;
        }
        { // normal load client
            const codeDetails = { package: "no-dynamic-pkg" };
            const codeLoader = new LocalCodeLoader([
                [codeDetails, fluidExport],
            ]);

            const loader = new Loader({
                urlResolver: provider.urlResolver,
                documentServiceFactory: provider.documentServiceFactory,
                codeLoader,
                logger,
            });

            const container = await loader.resolve({
                url: await provider.driver.createContainerUrl(documentId, containerUrl),
            });
            const dataObject = await requestFluidObject<ITestFluidObject>(container, "default");
            const sharedString = await dataObject.root.get<IFluidHandle<SharedString>>(stringId)?.get();
            assert(sharedString);
            assert.strictEqual(sharedString.getText(), initialText);
        }
    });
});
