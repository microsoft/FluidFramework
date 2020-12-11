/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable import/no-extraneous-dependencies */
export {
    ContainerRuntimeFactoryWithDefaultDataStore,
    DataObject,
    DataObjectFactory,
} from "old-aqueduct";
export * from "old-container-definitions";
export * from "old-core-interfaces";
export { Container, Loader } from "old-container-loader";
export { ContainerRuntime, IContainerRuntimeOptions } from "old-container-runtime";
export { IDocumentServiceFactory, IUrlResolver } from "old-driver-definitions";
export { IFluidDataStoreFactory } from "old-runtime-definitions";
export { IChannelFactory } from "old-datastore-definitions";
export {
    createLocalLoader,
    createAndAttachContainer,
    TestFluidObjectFactory,
    TestContainerRuntimeFactory,
    LocalCodeLoader,
    ChannelFactoryRegistry,
    OpProcessingController,
} from "old-test-utils";
export { SharedDirectory, SharedMap } from "old-map";
export { SharedString, SparseMatrix } from "old-sequence";
export { LocalDocumentServiceFactory, LocalResolver } from "old-local-driver";
export { ConsensusRegisterCollection } from "old-register-collection";
export { SharedCell } from "old-cell";
export { SharedCounter } from "old-counter";
export { Ink } from "old-ink";
export { SharedMatrix } from "old-matrix";
export { ConsensusQueue } from "old-ordered-collection";

import { IFluidCodeDetails } from "old-core-interfaces";
import { Loader } from "old-container-loader";
import { IDocumentServiceFactory } from "old-driver-definitions";
import { LocalDocumentServiceFactory, LocalResolver } from "old-local-driver";
import { IServiceConfiguration } from "@fluidframework/protocol-definitions";
import { fluidEntryPoint, LocalCodeLoader, createAndAttachContainer, OpProcessingController } from "old-test-utils";
import { ILocalDeltaConnectionServer, LocalDeltaConnectionServer } from "@fluidframework/server-local-server";

const defaultDocumentId = "defaultDocumentId";
const defaultDocumentLoadUrl = `fluid-test://localhost/${defaultDocumentId}`;
const defaultCodeDetails: IFluidCodeDetails = {
    package: "defaultTestPackage",
    config: {},
};

// This is a replica of the code in localLoader.ts in test-utils, but bind to the old version.
// TODO: once 0.27 is the back-compat version that we test, we can just use the version in the old-test-utils
// However, if there are any changes to these class and code, we can shim it here.

/**
 * A convenience class to manage a set of local test object to create loaders/containers with configurable way
 * to create a runtime factory from channels and factories to allow different version of the runtime to be created.
 * The objects includes the LocalDeltaConnectionServer, DocumentServiceFactory, UrlResolver.
 *
 * When creating and loading containers, it uses a default document id and code detail.
 *
 * Since the channel is just a pass thru to the call back, the type is parameterized to allow use channel
 * from different version. The only types that required to compatible when using different versions are:
 *   fluidEntryPoint
 *   IServiceConfiguration
 *   ILocalDeltaConnectionServer
 */
export class LocalTestObjectProvider<TestContainerConfigType> {
    private _documentServiceFactory: IDocumentServiceFactory | undefined;
    private _defaultUrlResolver: LocalResolver | undefined;
    private _opProcessingController: OpProcessingController | undefined;

    /**
     * Create a set of object to
     * @param createFluidEntryPoint - callback to create a fluidEntryPoint, with an optiona; set of channel name
     * and factory for TestFluidObject
     * @param serviceConfiguration - optional serviceConfiguration to create the LocalDeltaConnectionServer with
     * @param _deltaConnectionServer - optional deltaConnectionServer to share documents between different provider
     */
    constructor(
        private readonly createFluidEntryPoint: (testContainerConfig?: TestContainerConfigType) => fluidEntryPoint,
        private readonly serviceConfiguration?: Partial<IServiceConfiguration>,
        private _deltaConnectionServer?: ILocalDeltaConnectionServer | undefined,
    ) {

    }

    get defaultCodeDetails() {
        return defaultCodeDetails;
    }

    get deltaConnectionServer() {
        if (!this._deltaConnectionServer) {
            this._deltaConnectionServer = LocalDeltaConnectionServer.create(undefined, this.serviceConfiguration);
        }
        return this._deltaConnectionServer;
    }

    get documentServiceFactory() {
        if (!this._documentServiceFactory) {
            this._documentServiceFactory = new LocalDocumentServiceFactory(this.deltaConnectionServer as any);
        }
        return this._documentServiceFactory;
    }

    get urlResolver() {
        if (!this._defaultUrlResolver) {
            this._defaultUrlResolver = new LocalResolver();
        }
        return this._defaultUrlResolver;
    }

    get opProcessingController() {
        if (!this._opProcessingController) {
            this._opProcessingController = new OpProcessingController(this.deltaConnectionServer as any);
        }
        return this._opProcessingController;
    }

    private createLoader(packageEntries: Iterable<[IFluidCodeDetails, fluidEntryPoint]>) {
        const codeLoader = new LocalCodeLoader(packageEntries);
        return new Loader({
            urlResolver: this.urlResolver,
            documentServiceFactory: this.documentServiceFactory,
            codeLoader,
        });
    }

    /**
     * Make a test loader
     * @param testContainerConfig - optional configuring the test Container
     */
    public makeTestLoader(testContainerConfig?: TestContainerConfigType) {
        return this.createLoader([[defaultCodeDetails, this.createFluidEntryPoint(testContainerConfig)]]);
    }

    /**
     * Make a container using a default document id and code details
     * @param testContainerConfig - optional configuring the test Container
     */
    public async makeTestContainer(testContainerConfig?: TestContainerConfigType) {
        const loader = this.makeTestLoader(testContainerConfig);
        const container =
            await createAndAttachContainer(defaultDocumentId, defaultCodeDetails, loader, this.urlResolver);

        // TODO: the old version delta manager on the container doesn't do pause/resume count
        // We can't use it to do pause/resume, or it will conflict with the call from the runtime's
        // DeltaManagerProxy. Reach in to get in until > 0.28
        const deltaManagerProxy = (container as any)._context.deltaManager;
        this.opProcessingController.addDeltaManagers(deltaManagerProxy);
        return container;
    }

    /**
     * Load a container using a default document id and code details
     * @param testContainerConfig - optional configuring the test Container
     */
    public async loadTestContainer(testContainerConfig?: TestContainerConfigType) {
        const loader = this.makeTestLoader(testContainerConfig);
        const container = await loader.resolve({ url: defaultDocumentLoadUrl });

        // TODO: the old version delta manager on the container doesn't do pause/resume count
        // We can't use it to do pause/resume, or it will conflict with the call from the runtime's
        // DeltaManagerProxy. Reach in to get in until > 0.28
        const deltaManagerProxy = (container as any)._context.deltaManager;
        this.opProcessingController.addDeltaManagers(deltaManagerProxy);
        return container;
    }

    /**
     * Close out the DeltaConnectionServer and clear all the document and reset to original state.
     * The object can continue to be used afterwards
     */
    public async reset() {
        await this._deltaConnectionServer?.webSocketServer.close();
        this._deltaConnectionServer = undefined;
        this._documentServiceFactory = undefined;
        this._opProcessingController = undefined;
    }
}

/* eslint-enable import/no-extraneous-dependencies */
