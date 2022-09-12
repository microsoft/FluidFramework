/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IContainer, IHostLoader, IFluidCodeDetails } from "@fluidframework/container-definitions";
import { ITelemetryGenericEvent, ITelemetryBaseLogger, ITelemetryBaseEvent } from "@fluidframework/common-definitions";
import {
    ILoaderProps,
    Loader,
    waitContainerToCatchUp as waitContainerToCatchUp_original,
} from "@fluidframework/container-loader";
import { IContainerRuntimeOptions } from "@fluidframework/container-runtime";
import { IRequestHeader } from "@fluidframework/core-interfaces";
import { IDocumentServiceFactory, IResolvedUrl, IUrlResolver } from "@fluidframework/driver-definitions";
import { ensureFluidResolvedUrl } from "@fluidframework/driver-utils";
import { ITestDriver, TestDriverTypes } from "@fluidframework/test-driver-definitions";
import { v4 as uuid } from "uuid";
import { ChildLogger, MultiSinkLogger, TelemetryLogger } from "@fluidframework/telemetry-utils";
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
        loaderProps?: Partial<ILoaderProps>,
    ): IHostLoader;
    createContainer(entryPoint: fluidEntryPoint, loaderProps?: Partial<ILoaderProps>): Promise<IContainer>;
    loadContainer(
        entryPoint: fluidEntryPoint,
        loaderProps?: Partial<ILoaderProps>,
        requestHeader?: IRequestHeader,
    ): Promise<IContainer>;

    /**
     * Used to create a test Container. The Loader/ContainerRuntime/DataRuntime might be different versioned.
     * In generateLocalCompatTest(), this Container and its runtime will be arbitrarily-versioned.
     */
    makeTestLoader(testContainerConfig?: ITestContainerConfig): IHostLoader;
    makeTestContainer(testContainerConfig?: ITestContainerConfig): Promise<IContainer>;
    loadTestContainer(testContainerConfig?: ITestContainerConfig, requestHeader?: IRequestHeader): Promise<IContainer>;
    /**
     *
     * @param url - Resolved container URL
     */
    updateDocumentId(url: IResolvedUrl | undefined): void;

    logger: ITelemetryBaseLogger;
    documentServiceFactory: IDocumentServiceFactory;
    urlResolver: IUrlResolver;
    defaultCodeDetails: IFluidCodeDetails;
    opProcessingController: IOpProcessingController;

    ensureSynchronized(timeoutDuration?: number): Promise<void>;
    reset(): void;

    documentId: string;
    driver: ITestDriver;
}

export enum DataObjectFactoryType {
    Primed, // default
    Test,
}

export interface ITestContainerConfig {
    /** TestFluidDataObject instead of PrimedDataStore */
    fluidDataObjectType?: DataObjectFactoryType;

    /** An array of channel name and DDS factory pair to create on container creation time */
    registry?: ChannelFactoryRegistry;

    /** Container runtime options for the container instance */
    runtimeOptions?: IContainerRuntimeOptions;

    /** Loader options for the loader used to create containers */
    loaderProps?: Partial<ILoaderProps>;
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
                reset: () => { documentId = createDocumentId(); },
            };
        default:
            return {
                get: () => documentId,
                update: (resolvedUrl?: IResolvedUrl) => {
                    // Extract the document ID from the resolved container's URL and reset the ID property
                    ensureFluidResolvedUrl(resolvedUrl);
                    documentId = resolvedUrl.id ?? documentId;
                },
                reset: () => { documentId = createDocumentId(); },
            };
    }
}

/**
 * This class tracks events. It allows specifying expected events, which will be looked for in order.
 * It also tracks all unexpected errors.
 * At any point you call reportAndClearTrackedEvents which will provide all unexpected errors, and
 * any expected events that have not occurred.
 */
export class EventAndErrorTrackingLogger extends TelemetryLogger {
    constructor(private readonly baseLogger: ITelemetryBaseLogger) {
        super();
    }

    private readonly expectedEvents: ({ index: number; event: ITelemetryGenericEvent | undefined; } | undefined)[] = [];
    private readonly unexpectedErrors: ITelemetryBaseEvent[] = [];

    public registerExpectedEvent(... orderedExpectedEvents: ITelemetryGenericEvent[]) {
        if (this.expectedEvents.length !== 0) {
            // we don't have to error here. just no reason not to. given the events must be
            // ordered it could be tricky to figure out problems around multiple registrations.
            throw new Error(
                "Expected events already registered.\n"
                + "Call reportAndClearTrackedEvents to clear them before registering more");
        }
        this.expectedEvents.push(... orderedExpectedEvents.map((event, index) => ({ index, event })));
    }

    send(event: ITelemetryBaseEvent): void {
        const ee = this.expectedEvents[0]?.event;
        if (ee?.eventName === event.eventName) {
            let matches = true;
            for (const key of Object.keys(ee)) {
                if (ee[key] !== event[key]) {
                    matches = false;
                    break;
                }
            }
            if (matches) {
                // we found an expected event
                // so remove it from the list of expected events
                // and if it is an error, change it to generic
                // this helps keep our telemetry clear of
                // expected errors.
                this.expectedEvents.shift();
                if (event.category === "error") {
                    event.category = "generic";
                }
            }
        }
        if (event.category === "error") {
            this.unexpectedErrors.push(event);
        }

        this.baseLogger.send(event);
    }

    public reportAndClearTrackedEvents() {
        const expectedNotFound = this.expectedEvents.splice(0, this.expectedEvents.length);
        const unexpectedErrors = this.unexpectedErrors.splice(0, this.unexpectedErrors.length);
        return {
            expectedNotFound,
            unexpectedErrors,
        };
    }
}

/**
 * Shared base class for test object provider.  Contain code for loader and container creation and loading
 */
export class TestObjectProvider implements ITestObjectProvider {
    private _loaderContainerTracker = new LoaderContainerTracker();
    private _documentServiceFactory: IDocumentServiceFactory | undefined;
    private _urlResolver: IUrlResolver | undefined;
    private _logger: EventAndErrorTrackingLogger | undefined;
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

    get logger(): EventAndErrorTrackingLogger {
        if (this._logger === undefined) {
            this._logger = new EventAndErrorTrackingLogger(
                ChildLogger.create(getTestLogger?.(), undefined,
                {
                    all: {
                        driverType: this.driver.type,
                        driverEndpointName: this.driver.endpointName,
                        driverTenantName: this.driver.tenantName,
                        driverUserIndex: this.driver.userIndex,
                    },
                }));
        }
        return this._logger;
    }

    set logger(logger: EventAndErrorTrackingLogger) {
        this._logger = logger;
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
        loaderProps?: Partial<ILoaderProps>,
    ) {
        const multiSinkLogger = new MultiSinkLogger();
        multiSinkLogger.addLogger(this.logger);
        if (loaderProps?.logger !== undefined) {
            multiSinkLogger.addLogger(loaderProps.logger);
        }

        const loader = new this.LoaderConstructor({
            ... loaderProps,
            logger: multiSinkLogger,
            codeLoader: loaderProps?.codeLoader ?? new LocalCodeLoader(packageEntries),
            urlResolver: loaderProps?.urlResolver ?? this.urlResolver,
            documentServiceFactory: loaderProps?.documentServiceFactory ?? this.documentServiceFactory,
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
    public async createContainer(entryPoint: fluidEntryPoint, loaderProps?: Partial<ILoaderProps>) {
        if (this._documentCreated) {
            throw new Error(
                "Only one container/document can be created. To load the container/document use loadContainer");
        }
        const loader = this.createLoader([[defaultCodeDetails, entryPoint]], loaderProps);
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

    public async loadContainer(
        entryPoint: fluidEntryPoint,
        loaderProps?: Partial<ILoaderProps>,
        requestHeader?: IRequestHeader): Promise<IContainer> {
        const loader = this.createLoader([[defaultCodeDetails, entryPoint]], loaderProps);
        return loader.resolve({ url: await this.driver.createContainerUrl(this.documentId), headers: requestHeader });
    }

    /**
     * Make a test loader. Containers created/loaded through this loader will be added to the OpProcessingController.
     * The version of the loader/containerRuntime/dataRuntime may vary based on compat config of the current run
     * @param testContainerConfig - optional configuring the test Container
     */
    public makeTestLoader(testContainerConfig?: ITestContainerConfig) {
        return this.createLoader(
            [[defaultCodeDetails, this.createFluidEntryPoint(testContainerConfig)]],
            testContainerConfig?.loaderProps,
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
        await this.waitContainerToCatchUp(container);

        return container;
    }

    public reset() {
        this._loaderContainerTracker.reset();
        this._documentServiceFactory = undefined;
        this._urlResolver = undefined;
        this._documentIdStrategy.reset();
        const logError = getUnexpectedLogErrorException(this._logger);
        if (logError) {
            throw logError;
        }
        this._logger = undefined;
        this._documentCreated = false;
    }

    public async ensureSynchronized(timeoutDuration?: number) {
        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
        if (!timeoutDuration) {
            return this._loaderContainerTracker.ensureSynchronized();
        } else {
            return this._loaderContainerTracker.ensureSynchronizedWithTimeout?.(timeoutDuration);
        }
    }

    public async waitContainerToCatchUp(container: IContainer) {
        // The original waitContainerToCatchUp() from container loader uses either Container.resume()
        // or Container.connect() as part of its implementation. However, resume() was deprecated
        // and eventually replaced with connect(). To avoid issues during LTS compatibility testing
        // with older container versions issues, we use resume() when connect() is unavailable.
        if ((container as any).connect === undefined) {
            (container as any).connect = (container as any).resume;
        }

        return waitContainerToCatchUp_original(container);
    }

    updateDocumentId(resolvedUrl: IResolvedUrl | undefined) {
        this._documentIdStrategy.update(resolvedUrl);
    }

    public resetLoaderContainerTracker(syncSummarizerClients: boolean = false) {
        this._loaderContainerTracker.reset();
        this._loaderContainerTracker = new LoaderContainerTracker(syncSummarizerClients);
    }
}

export function getUnexpectedLogErrorException(logger: EventAndErrorTrackingLogger | undefined, prefix?: string) {
    if (logger === undefined) {
        return;
    }
    const results = logger.reportAndClearTrackedEvents();
    if (results.unexpectedErrors.length > 0) {
        return new Error(
            `${prefix ?? ""}Unexpected Errors in Logs:\n${JSON.stringify(results.unexpectedErrors, undefined, 2)}`);
    }
    if (results.expectedNotFound.length > 0) {
        return new Error(
            `${prefix ?? ""}Expected Events not found:\n${JSON.stringify(results.expectedNotFound, undefined, 2)}`);
    }
}
