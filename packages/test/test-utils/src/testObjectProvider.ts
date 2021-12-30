/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IContainer, IHostLoader, ILoaderOptions } from "@fluidframework/container-definitions";
import { ITelemetryBaseLogger } from "@fluidframework/common-definitions";
import { IDetachedBlobStorage, Loader, waitContainerToCatchUp } from "@fluidframework/container-loader";
import { IContainerRuntimeOptions } from "@fluidframework/container-runtime";
import { IFluidCodeDetails, IRequestHeader } from "@fluidframework/core-interfaces";
import { IDocumentServiceFactory, IResolvedUrl, IUrlResolver } from "@fluidframework/driver-definitions";
import { ensureFluidResolvedUrl } from "@fluidframework/driver-utils";
import { ITestDriver, TestDriverTypes } from "@fluidframework/test-driver-definitions";
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
    createFluidEntryPoint: (testContainerConfig?: ITestContainerConfig) => fluidEntryPoint;
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
    loadTestContainer(testContainerConfig?: ITestContainerConfig, requestHeader?: IRequestHeader): Promise<IContainer>,
    /**
     *
     * @param url - Resolved container URL
     */
    updateDocumentId(url: IResolvedUrl | undefined): void,

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
    /** TestFluidDataObject instead of PrimedDataStore */
    fluidDataObjectType?: DataObjectFactoryType,

    /** An array of channel name and DDS factory pair to create on container creation time */
    registry?: ChannelFactoryRegistry,

    /** Container runtime options for the container instance */
    runtimeOptions?: IContainerRuntimeOptions,

    /** Loader options for the loader used to create containers */
    loaderOptions?: ITestLoaderOptions,
}

// new interface to help inject custom loggers to tests
export interface ITestLoaderOptions extends ILoaderOptions {
    logger?: ITelemetryBaseLogger;
}

export const createDocumentId = (): string => uuid();

interface IDocumentIdStrategy {
    get(): string;
    update(resolvedUrl?: IResolvedUrl): void;
    reset(): void;
}

/**
 * Document ID is treated differently by test drivers. The key difference is in generating
 * a new container ID and accessing the container in multi-instance test cases.
 */
function getDocumentIdStrategy(type?: TestDriverTypes): IDocumentIdStrategy {
    let documentId = createDocumentId();
    switch (type) {
        case "odsp":
            return {
                get: () => documentId,
                update: () => { }, // do not update the document ID in odsp test cases
                reset: () => documentId = createDocumentId(),
            };
        default:
            return {
                get: () => documentId,
                update: (resolvedUrl?: IResolvedUrl) => {
                    // Extract the document ID from the resolved container's URL and reset the ID property
                    ensureFluidResolvedUrl(resolvedUrl);
                    documentId = resolvedUrl.id ?? documentId;
                },
                reset: () => documentId = createDocumentId(),
            };
    }
}

/**
 * Shared base class for test object provider.  Contain code for loader and container creation and loading
 */
export class TestObjectProvider {
    private readonly _loaderContainerTracker = new LoaderContainerTracker();
    private _documentServiceFactory: IDocumentServiceFactory | undefined;
    private _urlResolver: IUrlResolver | undefined;
    private _logger: ITelemetryBaseLogger | undefined;
    private readonly _documentIdStrategy: IDocumentIdStrategy;
    // Since documentId doesn't change we can only create/make one container. Call the load functions instead.
    private _documentCreated = false;

    /**
     * Manage objects for loading and creating container, including the driver, loader, and OpProcessingController
     * @param createFluidEntryPoint - callback to create a fluidEntryPoint, with an optional set of channel name
     * and factory for TestFluidObject
     */
    constructor(
        public readonly LoaderConstructor: typeof Loader,
        public readonly driver: ITestDriver,
        public readonly createFluidEntryPoint: (testContainerConfig?: ITestContainerConfig) => fluidEntryPoint,
    ) {
        this._documentIdStrategy = getDocumentIdStrategy(driver.type);
    }

    get logger() {
        if (this._logger === undefined) {
            this._logger = ChildLogger.create(getTestLogger?.(), undefined,
                {
                    all: {
                        driverType: this.driver.type,
                        driverEndpointName: this.driver.endpointName,
                        driverTenantName: this.driver.tenantName,
                        driverUserIndex: this.driver.userIndex,
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
        return this._documentIdStrategy.get();
    }

    get defaultCodeDetails() {
        return defaultCodeDetails;
    }

    get opProcessingController(): IOpProcessingController {
        return this._loaderContainerTracker;
    }

    /**
     * Create a loader. Containers created/loaded through this loader will be added to the OpProcessingController.
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
        if (this._documentCreated) {
            throw new Error(
                "Only one container/document can be created. To load the container/document use loadContainer");
        }
        const loader = this.createLoader([[defaultCodeDetails, entryPoint]], options);
        const container = await createAndAttachContainer(
            defaultCodeDetails,
            loader,
            this.driver.createCreateNewRequest(this.documentId),
        );
        this._documentCreated = true;
        // r11s driver will generate a new ID for the new container.
        // update the document ID with the actual ID of the attached container.
        this._documentIdStrategy.update(container.resolvedUrl);
        return container;
    }

    public async loadContainer(entryPoint: fluidEntryPoint, options?: ITestLoaderOptions,
        requestHeader?: IRequestHeader): Promise<IContainer> {
        const loader = this.createLoader([[defaultCodeDetails, entryPoint]], options);
        return loader.resolve({ url: await this.driver.createContainerUrl(this.documentId), headers: requestHeader });
    }

    /**
     * Make a test loader. Containers created/loaded through this loader will be added to the OpProcessingController.
     * The version of the loader/containerRuntime/dataRuntime may vary based on compat config of the current run
     * @param testContainerConfig - optional configuring the test Container
     */
    public makeTestLoader(testContainerConfig?: ITestContainerConfig, detachedBlobStorage?: IDetachedBlobStorage) {
        return this.createLoader(
            [[defaultCodeDetails, this.createFluidEntryPoint(testContainerConfig)]],
            testContainerConfig?.loaderOptions,
            detachedBlobStorage,
        );
    }

    /**
     * Make a container using a default document id and code details
     * Container loaded is automatically added to the OpProcessingController to manage op flow
     * @param testContainerConfig - optional configuring the test Container
     */
    public async makeTestContainer(testContainerConfig?: ITestContainerConfig): Promise<IContainer> {
        if (this._documentCreated) {
            throw new Error(
                "Only one container/document can be created. To load the container/document use loadTestContainer");
        }
        const loader = this.makeTestLoader(testContainerConfig);
        const container =
            await createAndAttachContainer(
                defaultCodeDetails,
                loader,
                this.driver.createCreateNewRequest(this.documentId));
        this._documentCreated = true;
        // r11s driver will generate a new ID for the new container.
        // update the document ID with the actual ID of the attached container.
        this._documentIdStrategy.update(container.resolvedUrl);
        return container;
    }

    /**
     * Load a container using a default document id and code details.
     * IContainer loaded is automatically added to the OpProcessingController to manage op flow
     * @param testContainerConfig - optional configuring the test Container
     * @param requestHeader - optional headers to be supplied to the loader
     */
    public async loadTestContainer(
        testContainerConfig?: ITestContainerConfig,
        requestHeader?: IRequestHeader,
    ): Promise<IContainer> {
        const loader = this.makeTestLoader(testContainerConfig);
        const container = await loader.resolve({
            url: await this.driver.createContainerUrl(this.documentId),
            headers: requestHeader,
        });
        await waitContainerToCatchUp(container);
        return container;
    }

    public reset() {
        this._loaderContainerTracker.reset();
        this._documentServiceFactory = undefined;
        this._urlResolver = undefined;
        this._documentIdStrategy.reset();
        this._logger = undefined;
        this._documentCreated = false;
    }

    public async ensureSynchronized() {
        return this._loaderContainerTracker.ensureSynchronized();
    }

    updateDocumentId(resolvedUrl: IResolvedUrl | undefined) {
        this._documentIdStrategy.update(resolvedUrl);
    }
}
