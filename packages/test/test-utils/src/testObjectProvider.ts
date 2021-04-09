/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IContainer, IHostLoader, ILoaderOptions } from "@fluidframework/container-definitions";
import { Container, Loader, waitContainerToCatchUp } from "@fluidframework/container-loader";
import { IContainerRuntimeOptions } from "@fluidframework/container-runtime";
import { IFluidCodeDetails } from "@fluidframework/core-interfaces";
import { IDocumentServiceFactory, IUrlResolver } from "@fluidframework/driver-definitions";
import { ITestDriver } from "@fluidframework/test-driver-definitions";
import { v4 as uuid } from "uuid";
import { ChildLogger } from "@fluidframework/telemetry-utils";
import { LoaderContainerTracker } from "./loaderContainerTracker";
import { fluidEntryPoint, LocalCodeLoader } from "./localCodeLoader";
import { createAndAttachContainer } from "./localLoader";
import { ChannelFactoryRegistry } from "./testFluidObject";

const defaultCodeDetails: IFluidCodeDetails = {
    package: "defaultTestPackage",
    config: {},
};

export interface IOpProcessingController {
    processIncoming(...containers: IContainer[]): Promise<void>;
    processOutgoing(...containers: IContainer[]): Promise<void>;
    pauseProcessing(...containers: IContainer[]): Promise<void>;
    resumeProcessing(...containers: IContainer[]): void;
}

export interface ITestObjectProvider {
    createLoader(packageEntries: Iterable<[IFluidCodeDetails, fluidEntryPoint]>, options?: ILoaderOptions): IHostLoader;
    createContainer(entryPoint: fluidEntryPoint, options?: ILoaderOptions): Promise<IContainer>;
    loadContainer(entryPoint: fluidEntryPoint, options?: ILoaderOptions): Promise<IContainer>;

    /**
     * Used to create a test Container. The Loader/ContainerRuntime/DataRuntime might be different versioned.
     * In generateLocalCompatTest(), this Container and its runtime will be arbitrarily-versioned.
     */
    makeTestLoader(testContainerConfig?: ITestContainerConfig): IHostLoader,
    makeTestContainer(testContainerConfig?: ITestContainerConfig): Promise<IContainer>,
    loadTestContainer(testContainerConfig?: ITestContainerConfig): Promise<IContainer>,

    documentServiceFactory: IDocumentServiceFactory,
    urlResolver: IUrlResolver,
    defaultCodeDetails: IFluidCodeDetails,
    opProcessingController: IOpProcessingController,

    ensureSynchronized(): Promise<void>;
    reset(): void,

    documentId: string,
    driver: ITestDriver;

}

export enum DataObjectFactoryType {
    Primed, // default
    Test,
}

export interface ITestContainerConfig {
    // TestFluidDataObject instead of PrimedDataStore
    fluidDataObjectType?: DataObjectFactoryType,

    // And array of channel name and DDS factory pair to create on container creation time
    registry?: ChannelFactoryRegistry,

    // Container runtime options for the container instance
    runtimeOptions?: IContainerRuntimeOptions,
}

export const createDocumentId = (): string => uuid();

/**
 * Shared base class for test object provider.  Contain code for loader and container creation and loading
 */
export class TestObjectProvider {
    private readonly _loaderContainerTracker = new LoaderContainerTracker();
    private _documentServiceFactory: IDocumentServiceFactory | undefined;
    private _urlResolver: IUrlResolver | undefined;
    private _documentId?: string;

    /**
     * Manage objects for loading and creating container, including the driver, loader, and OpProcessingController
     * @param createFluidEntryPoint - callback to create a fluidEntryPoint, with an optiona; set of channel name
     * and factory for TestFluidObject
     */
    constructor(
        public readonly LoaderConstructor: typeof Loader,
        public readonly driver: ITestDriver,
        private readonly createFluidEntryPoint: (testContainerConfig?: ITestContainerConfig) => fluidEntryPoint,
    ) {

    }

    get documentServiceFactory() {
        if (!this._documentServiceFactory) {
            this._documentServiceFactory = this.driver.createDocumentServiceFactory();
        }
        return this._documentServiceFactory;
    }

    get urlResolver() {
        if (!this._urlResolver) {
            this._urlResolver = this.driver.createUrlResolver();
        }
        return this._urlResolver;
    }

    get documentId() {
        if (this._documentId === undefined) {
            this._documentId = createDocumentId();
        }
        return this._documentId;
    }

    get defaultCodeDetails() {
        return defaultCodeDetails;
    }

    get opProcessingController(): IOpProcessingController {
        return this._loaderContainerTracker;
    }

    /**
     * Create a loader.  Container created/loaded thru this loader will not be automatically added
     * to the OpProcessingController, and will need to be added manually if needed.
     *
     * Only the version of the loader will vary based on compat config. The version of
     * containerRuntime/dataRuntime used in fluidEntryPoint will be used as is from what is passed in.
     *
     * @param packageEntries - list of code details and fluidEntryPoint pairs.
     */
    public createLoader(packageEntries: Iterable<[IFluidCodeDetails, fluidEntryPoint]>, options?: ILoaderOptions) {
        const codeLoader = new LocalCodeLoader(packageEntries);
        const loader = new this.LoaderConstructor({
            urlResolver: this.urlResolver,
            documentServiceFactory: this.documentServiceFactory,
            codeLoader,
            logger: ChildLogger.create(getTestLogger?.(), undefined, { all: { driverType: this.driver.type } }),
            options,
        });
        this._loaderContainerTracker.add(loader);
        return loader;
    }

    /**
     * Create a container using a default document id and code details.
     * Container created is automatically added to the OpProcessingController to manage op flow
     *
     * Only the version of the loader will vary based on compat config. The version of
     * containerRuntime/dataRuntime used in fluidEntryPoint will be used as is from what is passed in.
     *
     * @param packageEntries - list of code details and fluidEntryPoint pairs.
     */
    public async createContainer(entryPoint: fluidEntryPoint, options?: ILoaderOptions) {
        const loader = this.createLoader([[defaultCodeDetails, entryPoint]], options);
        const container = await createAndAttachContainer(
            defaultCodeDetails,
            loader,
            this.driver.createCreateNewRequest(this.documentId),
        );
        return container;
    }

    public async loadContainer(entryPoint: fluidEntryPoint, options?: ILoaderOptions) {
        const loader = this.createLoader([[defaultCodeDetails, entryPoint]], options);
        return loader.resolve({ url: await this.driver.createContainerUrl(this.documentId) });
    }
    /**
     * Make a test loader.  Container created/loaded thru this loader will not be automatically added
     * to the OpProcessingController, and will need to be added manually if needed.
     * The version of the loader/containerRuntime/dataRuntime may vary based on compat config of the current run
     * @param testContainerConfig - optional configuring the test Container
     */
    public makeTestLoader(testContainerConfig?: ITestContainerConfig) {
        return this.createLoader([[defaultCodeDetails, this.createFluidEntryPoint(testContainerConfig)]]);
    }

    /**
     * Make a container using a default document id and code details
     * Container loaded is automatically added to the OpProcessingController to manage op flow
     * @param testContainerConfig - optional configuring the test Container
     */
    public async makeTestContainer(testContainerConfig?: ITestContainerConfig): Promise<IContainer> {
        const loader = this.makeTestLoader(testContainerConfig);
        const container =
            await createAndAttachContainer(
                defaultCodeDetails,
                loader,
                this.driver.createCreateNewRequest(this.documentId));
        return container;
    }

    /**
     * Load a container using a default document id and code details.
     * Container loaded is automatically added to the OpProcessingController to manage op flow
     * @param testContainerConfig - optional configuring the test Container
     */
    public async loadTestContainer(testContainerConfig?: ITestContainerConfig): Promise<Container> {
        const loader = this.makeTestLoader(testContainerConfig);
        const container = await loader.resolve({ url: await this.driver.createContainerUrl(this.documentId) });
        await waitContainerToCatchUp(container);
        return container;
    }

    public reset() {
        this._loaderContainerTracker.reset();
        this._documentServiceFactory = undefined;
        this._urlResolver = undefined;
        this._documentId = undefined;
    }

    public async ensureSynchronized() {
        return this._loaderContainerTracker.ensureSynchronized();
    }
}
