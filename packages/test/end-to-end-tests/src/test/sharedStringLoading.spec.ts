/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { Loader } from "@fluidframework/container-loader";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { SharedString } from "@fluidframework/sequence";
import {
    ChannelFactoryRegistry,
    ITestFluidObject,
    LocalCodeLoader,
    SupportedExportInterfaces,
    TestFluidObjectFactory,
} from "@fluidframework/test-utils";
import { LocalDeltaConnectionServer } from "@fluidframework/server-local-server";
import { LocalDocumentServiceFactory, LocalResolver } from "@fluidframework/local-driver";
import {
    IDocumentService,
    IDocumentServiceFactory,
    IDocumentStorageService,
    LoaderCachingPolicy,
 } from "@fluidframework/driver-definitions";
import { NetworkErrorBasic } from "@fluidframework/driver-utils";
import { IFluidHandle } from "@fluidframework/core-interfaces";

describe("SharedString", () => {
    it("Failure to Load in Shared String", async ()=>{
        const deltaConnectionServer = LocalDeltaConnectionServer.create();
        const stringId = "sharedStringKey";
        const registry: ChannelFactoryRegistry = [[stringId, SharedString.getFactory()]];
        const fluidExport: SupportedExportInterfaces = {
            IFluidDataStoreFactory: new TestFluidObjectFactory(registry),
        };
        const text = "hello world";
        const documentId = "sstest";
        { // creating client
            const urlResolver = new LocalResolver();
            const documentServiceFactory = new LocalDocumentServiceFactory(deltaConnectionServer);
            const codeDetails = { package: "no-dynamic-pkg" };
            const codeLoader = new LocalCodeLoader([
                [codeDetails, fluidExport],
            ]);

            const loader = new Loader({
                urlResolver,
                documentServiceFactory,
                codeLoader,
            });

            const container = await loader.createDetachedContainer(codeDetails);
            const dataObject = await requestFluidObject<ITestFluidObject>(container, "default");
            const sharedString  = await dataObject.root.get<IFluidHandle<SharedString>>(stringId).get();
            sharedString.insertText(0, text);

            await container.attach(urlResolver.createCreateNewRequest(documentId));
        }
        { // normal load client
            const urlResolver = new LocalResolver();
            const documentServiceFactory = new LocalDocumentServiceFactory(deltaConnectionServer);
            const codeDetails = { package: "no-dynamic-pkg" };
            const codeLoader = new LocalCodeLoader([
                [codeDetails, fluidExport],
            ]);

            const loader = new Loader({
                urlResolver,
                documentServiceFactory,
                codeLoader,
            });

            const container = await loader.resolve(urlResolver.createCreateNewRequest(documentId));
            const dataObject = await requestFluidObject<ITestFluidObject>(container, "default");
            const sharedString  = await dataObject.root.get<IFluidHandle<SharedString>>(stringId).get();
            assert.strictEqual(sharedString.getText(0), text);
        }
        { // failure load client
            const urlResolver = new LocalResolver();
            const realSf: IDocumentServiceFactory =
                new LocalDocumentServiceFactory(deltaConnectionServer);
            const documentServiceFactory: IDocumentServiceFactory = {
                ...realSf,
                createDocumentService: async (resolvedUrl,logger) => {
                    const realDs = await realSf.createDocumentService(resolvedUrl, logger);
                    const mockDs = Object.create(realDs) as IDocumentService;
                    mockDs.policies = {
                        ... mockDs.policies,
                        caching: LoaderCachingPolicy.NoCaching,
                    };
                    mockDs.connectToStorage = async ()=>{
                        const realStorage = await realDs.connectToStorage();
                        const mockstorage = Object.create(realStorage) as IDocumentStorageService;
                        mockstorage.read = async (id)=>{
                            const blob = await realStorage.read(id);
                            const blobObj = JSON.parse(Buffer.from(blob, "Base64").toString());
                            // throw when trying to load the header blob
                            if (blobObj.headerMetadata !== undefined) {
                                throw new NetworkErrorBasic(
                                    "Not Found",
                                    undefined,
                                    false,
                                    404);
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
                urlResolver,
                documentServiceFactory,
                codeLoader,
            });

            const container = await loader.resolve(urlResolver.createCreateNewRequest(documentId));
            const dataObject = await requestFluidObject<ITestFluidObject>(container, "default");

            try {
                await dataObject.root.get<IFluidHandle<SharedString>>(stringId).get();
                assert.fail("expected failure");
            } catch {}
        }
    });
});
