/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IContainer, IHostLoader, ILoaderOptions } from "@fluidframework/container-definitions";
import { ITelemetryBaseLogger } from "@fluidframework/common-definitions";
import { Container, IDetachedBlobStorage, Loader, waitContainerToCatchUp } from "@fluidframework/container-loader";
import { IContainerRuntimeOptions } from "@fluidframework/container-runtime";
import { IFluidCodeDetails, IRequestHeader } from "@fluidframework/core-interfaces";
import { IDocumentServiceFactory, IUrlResolver } from "@fluidframework/driver-definitions";
import { ITestDriver } from "@fluidframework/test-driver-definitions";
import { v4 as uuid } from "uuid";
import { ChildLogger, MultiSinkLogger } from "@fluidframework/telemetry-utils";
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
    createLoader(
        packageEntries: Iterable<[IFluidCodeDetails, fluidEntryPoint]>,
        options?: ITestLoaderOptions,
        detachedBlobStorage?: IDetachedBlobStorage,
    ): IHostLoader;
    createContainer(entryPoint: fluidEntryPoint, options?: ITestLoaderOptions): Promise<IContainer>;
    loadContainer(
        entryPoint: fluidEntryPoint,
        options?: ITestLoaderOptions,
        requestHeader?: IRequestHeader,
    ): Promise<IContainer>;

    /**
     * Used to create a test Container. The Loader/ContainerRuntime/DataRuntime might be different versioned.
     * In generateLocalCompatTest(), this Container and its runtime will be arbitrarily-versioned.
     */
    makeTestLoader(testContainerConfig?: ITestContainerConfig, detachedBlobStorage?: IDetachedBlobStorage): IHostLoader,
    makeTestContainer(testContainerConfig?: ITestContainerConfig): Promise<IContainer>,
    loadTestContainer(testContainerConfig?: ITestContainerConfig): Promise<IContainer>,

    logger: ITelemetryBaseLogger,
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

// new interface to help inject custom loggers to tests
export interface ITestLoaderOptions extends ILoaderOptions {
    logger?: ITelemetryBaseLogger;
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
    private _logger: ITelemetryBaseLogger | undefined;

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

    get logger() {
        if (this._logger === undefined) {
            this._logger = ChildLogger.create(getTestLogger?.(), undefined,
                {
                    all: {
                        driverType: this.driver.type,
                        driverEndpointName: this.driver.endpointName,
                    },
                });
        }
        return this._logger;
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
    public createLoader(
        packageEntries: Iterable<[IFluidCodeDetails, fluidEntryPoint]>,
        options?: ITestLoaderOptions,
        detachedBlobStorage?: IDetachedBlobStorage,
    ) {
        const multiSinkLogger = new MultiSinkLogger();
        multiSinkLogger.addLogger(this.logger);
        if (options?.logger !== undefined) {
            multiSinkLogger.addLogger(options.logger);
        }

        const codeLoader = new LocalCodeLoader(packageEntries);
        const loader = new this.LoaderConstructor({
            urlResolver: this.urlResolver,
            documentServiceFactory: this.documentServiceFactory,
            codeLoader,
            logger: multiSinkLogger,
            options,
            detachedBlobStorage,
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
    public async createContainer(entryPoint: fluidEntryPoint, options?: ITestLoaderOptions) {
        const loader = this.createLoader([[defaultCodeDetails, entryPoint]], options);
        const container = await createAndAttachContainer(
            defaultCodeDetails,
            loader,
            this.driver.createCreateNewRequest(this.documentId),
        );
        return container;
    }

    public async loadContainer(entryPoint: fluidEntryPoint, options?: ITestLoaderOptions,
        requestHeader?: IRequestHeader) {
        const loader = this.createLoader([[defaultCodeDetails, entryPoint]], options);
        return loader.resolve({ url: await this.driver.createContainerUrl(this.documentId), headers: requestHeader });
    }

    /**
     * Make a test loader.  Container created/loaded thru this loader will not be automatically added
     * to the OpProcessingController, and will need to be added manually if needed.
     * The version of the loader/containerRuntime/dataRuntime may vary based on compat config of the current run
     * @param testContainerConfig - optional configuring the test Container
     */
    public makeTestLoader(testContainerConfig?: ITestContainerConfig, detachedBlobStorage?: IDetachedBlobStorage) {
        return this.createLoader(
            [[defaultCodeDetails, this.createFluidEntryPoint(testContainerConfig)]],
            undefined,
            detachedBlobStorage,
        );
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
        this._logger = undefined;
    }

    public async ensureSynchronized() {
        return this._loaderContainerTracker.ensureSynchronized();
    }
}
