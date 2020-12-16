/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { Container, Loader } from "@fluidframework/container-loader";
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
import {
    generateTest,
    ITestObjectProvider,
    ITestContainerConfig,
    DataObjectFactoryType,
} from "./compatUtils";

const stringId = "sharedStringKey";
const registry: ChannelFactoryRegistry = [[stringId, SharedString.getFactory()]];
const testContainerConfig: ITestContainerConfig = {
    fluidDataObjectType: DataObjectFactoryType.Test,
    registry,
};

const tests = (args: ITestObjectProvider) => {
    let sharedString1: SharedString;
    let sharedString2: SharedString;

    describe("collab",()=>{
        beforeEach(async () => {
            const container1 = await args.makeTestContainer(testContainerConfig) as Container;
            const dataObject1 = await requestFluidObject<ITestFluidObject>(container1, "default");
            sharedString1 = await dataObject1.getSharedObject<SharedString>(stringId);

            const container2 = await args.loadTestContainer(testContainerConfig) as Container;
            const dataObject2 = await requestFluidObject<ITestFluidObject>(container2, "default");
            sharedString2 = await dataObject2.getSharedObject<SharedString>(stringId);
        });

        it("can sync SharedString across multiple containers", async () => {
            const text = "syncSharedString";
            sharedString1.insertText(0, text);
            assert.equal(sharedString1.getText(), text, "The retrieved text should match the inserted text.");

            // Wait for the ops to to be submitted and processed across the containers.
            await args.opProcessingController.process();

            assert.equal(sharedString2.getText(), text, "The inserted text should have synced across the containers");
        });

        it("can sync SharedString to a newly loaded container", async () => {
            const text = "syncToNewContainer";
            sharedString1.insertText(0, text);
            assert.equal(sharedString1.getText(), text, "The retrieved text should match the inserted text.");

            // Wait for the ops to to be submitted and processed across the containers.
            await args.opProcessingController.process();

            // Create a initialize a new container with the same id.
            const newContainer = await args.loadTestContainer(testContainerConfig) as Container;
            const newComponent = await requestFluidObject<ITestFluidObject>(newContainer, "default");
            const newSharedString = await newComponent.getSharedObject<SharedString>(stringId);
            assert.equal(
                newSharedString.getText(), text, "The new container should receive the inserted text on creation");
        });
    });
};

describe("SharedString", () => {
    generateTest(tests, { tinylicious: true });

    describe("loading",()=>{
        it("Failure to Load in Shared String", async ()=>{
            const deltaConnectionServer = LocalDeltaConnectionServer.create();

            const fluidExport: SupportedExportInterfaces = {
                IFluidDataStoreFactory: new TestFluidObjectFactory([[stringId, SharedString.getFactory()]]),
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
                // TODO: this should probably throw, but currently returns the dataObject due to #4613
                // this test should be updated when that issue is fix
                const sharedString  = await dataObject.root.get<IFluidHandle<SharedString>>(stringId).get();
                // eslint-disable-next-line dot-notation
                assert.strictEqual(sharedString["getText"], undefined);
            }
        });
    });
});
