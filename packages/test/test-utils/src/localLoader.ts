/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    ICodeLoader,
    IContainer,
    ILoader,
    IFluidCodeDetails,
} from "@fluidframework/container-definitions";
import { Loader } from "@fluidframework/container-loader";
import { IUrlResolver, IDocumentServiceFactory } from "@fluidframework/driver-definitions";
import { LocalDocumentServiceFactory, LocalResolver } from "@fluidframework/local-driver";
import { IServiceConfiguration } from "@fluidframework/protocol-definitions";
import { ILocalDeltaConnectionServer, LocalDeltaConnectionServer } from "@fluidframework/server-local-server";
import { fluidEntryPoint, LocalCodeLoader } from "./localCodeLoader";

/**
 * Creates a loader with the given package entries and a delta connection server.
 * @param packageEntries - A list of code details to Fluid entry points.
 * @param deltaConnectionServer - The delta connection server to use as the server.
 */
export function createLocalLoader(
    packageEntries: Iterable<[IFluidCodeDetails, fluidEntryPoint]>,
    deltaConnectionServer: ILocalDeltaConnectionServer,
    urlResolver: IUrlResolver,
): ILoader {
    const documentServiceFactory = new LocalDocumentServiceFactory(deltaConnectionServer);
    const codeLoader: ICodeLoader = new LocalCodeLoader(packageEntries);

    return new Loader({
        urlResolver,
        documentServiceFactory,
        codeLoader,
    });
}

/**
 * Creates a detached Container and attaches it.
 * @param documentId - The documentId for the container.
 * @param source - The code details used to create the Container.
 * @param loader - The loader to use to initialize the container.
 * @param urlresolver - The url resolver to get the create new request from.
 */

export async function createAndAttachContainer(
    documentId: string,
    source: IFluidCodeDetails,
    loader: ILoader,
    urlResolver: IUrlResolver,
): Promise<IContainer> {
    const container = await loader.createDetachedContainer(source);
    const attachUrl = (urlResolver as LocalResolver).createCreateNewRequest(documentId);
    await container.attach(attachUrl);

    return container;
}

const defaultDocumentId = "defaultDocumentId";
const defaultDocumentLoadUrl = `fluid-test://localhost/${defaultDocumentId}`;
const defaultCodeDetails: IFluidCodeDetails = {
    package: "defaultTestPackage",
    config: {},
};

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
export class LocalTestObjectProvider<ChannelFactoryRegistryType> {
    private _documentServiceFactory: IDocumentServiceFactory | undefined;
    private _defaultUrlResolver: LocalResolver | undefined;

    /**
     * Create a set of object to
     * @param createFluidEntryPoint - callback to create a fluidEntryPoint, with an optiona; set of channel name
     * and factory for TestFluidObject
     * @param serviceConfiguration - optional serviceConfiguration to create the LocalDeltaConnectionServer with
     * @param _deltaConnectionServer - optional deltaConnectionServer to share documents between different provider
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
            this._documentServiceFactory = new LocalDocumentServiceFactory(this.deltaConnectionServer);
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
        return new Loader({
            urlResolver: this.urlResolver,
            documentServiceFactory: this.documentServiceFactory,
            codeLoader,
        });
    }

    /**
     * Make a test loader
     * @param registry - optional channel to factory pair used create the TestfluidObject with
     */
    public makeTestLoader(registry?: ChannelFactoryRegistryType) {
        return this.createLoader([[defaultCodeDetails, this.createFluidEntryPoint(registry) ]]);
    }

    /**
     * Make a container using a default document id and code details
     * @param registry - optional channel to factory pair used create the TestfluidObject with
     */
    public async makeTestContainer(registry?: ChannelFactoryRegistryType) {
        const loader = this.makeTestLoader(registry);
        return createAndAttachContainer(defaultDocumentId, defaultCodeDetails, loader, this.urlResolver);
    }

    /**
     * Load a container using a default document id and code details
     * @param registry - optional channel to factory pair used create the TestfluidObject with
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
