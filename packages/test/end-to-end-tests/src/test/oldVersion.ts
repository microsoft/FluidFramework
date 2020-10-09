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
export { Container, Loader } from "old-container-loader";
export { ContainerRuntime, IContainerRuntimeOptions } from "old-container-runtime";
export { IDocumentServiceFactory } from "old-driver-definitions";
export { IFluidDataStoreFactory } from "old-runtime-definitions";
export {
    createLocalLoader,
    createAndAttachContainer,
    TestFluidObjectFactory,
    TestContainerRuntimeFactory,
    LocalCodeLoader,
    ChannelFactoryRegistry,
} from "old-test-utils";
export { SharedDirectory, SharedMap } from "old-map";
export { SharedString, SparseMatrix } from "old-sequence";
export { LocalDocumentServiceFactory, LocalResolver } from "old-local-driver";
export { ConsensusRegisterCollection } from "old-register-collection";
export { SharedCell } from "old-cell";
export { Ink } from "old-ink";
export { SharedMatrix } from "old-matrix";
export { ConsensusQueue } from "old-ordered-collection";

import {
    IFluidCodeDetails,
    IProxyLoaderFactory,
} from "old-container-definitions";
import { Loader } from "old-container-loader";
import { IDocumentServiceFactory } from "old-driver-definitions";
import { LocalDocumentServiceFactory, LocalResolver } from "old-local-driver";
import { IServiceConfiguration } from "@fluidframework/protocol-definitions";
import { ILocalDeltaConnectionServer, LocalDeltaConnectionServer } from "@fluidframework/server-local-server";
import { fluidEntryPoint, LocalCodeLoader, createAndAttachContainer } from "old-test-utils";

const defaultDocumentId = "defaultDocumentId";
const defaultDocumentLoadUrl = `fluid-test://localhost/${defaultDocumentId}`;
const defaultCodeDetails: IFluidCodeDetails = {
    package: "defaultTestPackage",
    config: {},
};

// This is a replica to the code in localLoader.ts in test-utils, but bind to the old version.
// TODO: once 0.27 is the back-compat version that we test, we can just use the version in the old-test-utils
// However, if there are any changes to these class and code, we can shim it here.

/**
 * A convenience class to manage a set of local test object to create loaders/containers with configurable way
 * to create a runtime factory from channels to allow different version of the runtime to be created.
 * These includes the LocalDeltaConnectionServer, DocumentServiceFactory, UrlResolver.
 *
 * When creating and loading containers, it uses a default document id and code detail.
 *
 * Since the channel is just a pass thru to the call back, the type is parameterized to allow use channel
 * from different version. The only types that required to compatible when using different versions are:
 *   fluidEntryPoint
 *   IServiceConfiguration
 *   ILocalDeltaConnectionServer
 */
export class LocalTestObjectProvider<ChannelFactoryRegistryType> {
    private _documentServiceFactory: IDocumentServiceFactory | undefined;
    private _defaultUrlResolver: LocalResolver | undefined;

    /**
     * Create a set of object to
     * @param createFluidEntryPoint callback to create a fluidEntryPoint from a set of channel registry
     * @param serviceConfiguration optional serviceConfiguration to create the LocalDeltaConnectionServer with
     * @param _deltaConnectionServer optional deltaConnectionServer to share documents between different provider
     */
    constructor(
        private readonly createFluidEntryPoint: (registry?: ChannelFactoryRegistryType) => fluidEntryPoint,
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
            // We are using the new DeltaConnectionServer, which is not type compatible with the old one.
            // However it doesn't matter functionality wise, so force casting it.
            // TODO: this can be removed once we upgrade version or move this to test-utils to use
            // a consistent version of the class
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

    private createLoader(packageEntries: Iterable<[IFluidCodeDetails, fluidEntryPoint]>) {
        const codeLoader = new LocalCodeLoader(packageEntries);
        return new Loader(
            this.urlResolver,
            this.documentServiceFactory,
            codeLoader,
            {},
            {},
            new Map<string, IProxyLoaderFactory>());
    }

    /**
     * Make a test loader
     * @param registry optional registry to create the fluidEntryPoint
     */
    public makeTestLoader(registry?: ChannelFactoryRegistryType) {
        return this.createLoader([[defaultCodeDetails, this.createFluidEntryPoint(registry) ]]);
    }

    /**
     * Make a container using a default document id and code details
     * @param registry optional registry to create the fluidEntryPoint
     */
    public async makeTestContainer(registry?: ChannelFactoryRegistryType) {
        const loader = this.makeTestLoader(registry);
        return createAndAttachContainer(defaultDocumentId, defaultCodeDetails, loader, this.urlResolver);
    }

    /**
     * Load a container using a default document id and code details
     * @param registry optional registry to create the fluidEntryPoint
     */
    public async loadTestContainer(registry?: ChannelFactoryRegistryType) {
        const loader = this.makeTestLoader(registry);
        return loader.resolve({ url: defaultDocumentLoadUrl });
    }

    /**
     * Close out the DeltaConnectionServer and clear all the document and reset to original state.
     * The object can continue to be used afterwards
     */
    public async reset() {
        await this._deltaConnectionServer?.webSocketServer.close();
        this._deltaConnectionServer = undefined;
        this._documentServiceFactory = undefined;
    }
}

/* eslint-enable import/no-extraneous-dependencies */
