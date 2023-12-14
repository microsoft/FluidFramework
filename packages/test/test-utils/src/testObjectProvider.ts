/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	IContainer,
	IHostLoader,
	IFluidCodeDetails,
	ILoader,
} from "@fluidframework/container-definitions";
import {
	ILoaderProps,
	Loader,
	waitContainerToCatchUp as waitContainerToCatchUp_original,
} from "@fluidframework/container-loader";
import { IContainerRuntimeOptions } from "@fluidframework/container-runtime";
import {
	ITelemetryGenericEvent,
	ITelemetryBaseLogger,
	ITelemetryBaseEvent,
	IRequestHeader,
} from "@fluidframework/core-interfaces";
import {
	IDocumentServiceFactory,
	IResolvedUrl,
	IUrlResolver,
} from "@fluidframework/driver-definitions";
import { ITestDriver, TestDriverTypes } from "@fluidframework/test-driver-definitions";
import { v4 as uuid } from "uuid";
import { createChildLogger, createMultiSinkLogger } from "@fluidframework/telemetry-utils";
import { LoaderContainerTracker } from "./loaderContainerTracker";
import { fluidEntryPoint, LocalCodeLoader } from "./localCodeLoader";
import { createAndAttachContainer } from "./localLoader";
import { ChannelFactoryRegistry } from "./testFluidObject";

const defaultCodeDetails: IFluidCodeDetails = {
	package: "defaultTestPackage",
	config: {},
};

/**
 * @alpha
 */
export interface IOpProcessingController {
	processIncoming(...containers: IContainer[]): Promise<void>;
	processOutgoing(...containers: IContainer[]): Promise<void>;
	pauseProcessing(...containers: IContainer[]): Promise<void>;
	resumeProcessing(...containers: IContainer[]): void;
}

/**
 * @internal
 */
export interface ITestObjectProvider {
	/**
	 * Indicates which type of test object provider is being used.
	 */
	type: "TestObjectProvider" | "TestObjectProviderWithVersionedLoad";

	/**
	 * The document id to retrieve or create containers
	 */
	documentId: string;

	/**
	 * Creates the document service after extracting different endpoints URLs from a resolved URL.
	 */
	documentServiceFactory: IDocumentServiceFactory;

	/**
	 * Test driver used to create the IDocumentServiceFactory. Varies depending on the test type.
	 */
	driver: ITestDriver;

	/**
	 * Logger used to track expected and unexpected events.
	 */
	logger: EventAndErrorTrackingLogger | undefined;

	/**
	 * Used to create a url for the created container with any data store path given in the relative url.
	 */
	urlResolver: IUrlResolver;

	/**
	 * Default IFluidCodeDetails used to create containers.
	 */
	defaultCodeDetails: IFluidCodeDetails;

	/**
	 * Contains functions to pause/resume op processing.
	 */
	opProcessingController: IOpProcessingController;

	/**
	 * Represents the entry point for a Fluid container.
	 */
	createFluidEntryPoint: (testContainerConfig?: ITestContainerConfig) => fluidEntryPoint;

	/**
	 * Create a loader. Containers created/loaded through this loader will be added to the OpProcessingController.
	 *
	 * Only the version of the loader will vary based on compat config. The version of
	 * containerRuntime/dataRuntime used in fluidEntryPoint will be used as is from what is passed in.
	 *
	 * @param packageEntries - list of code details and fluidEntryPoint pairs.
	 */
	createLoader(
		packageEntries: Iterable<[IFluidCodeDetails, fluidEntryPoint]>,
		loaderProps?: Partial<ILoaderProps>,
	): IHostLoader;

	/**
	 * Create a container using a default document id and code details.
	 * Container created is automatically added to the OpProcessingController to manage op flow
	 *
	 * Only the version of the loader will vary based on compat config. The version of
	 * containerRuntime/dataRuntime used in fluidEntryPoint will be used as is from what is passed in.
	 *
	 * @param packageEntries - list of code details and fluidEntryPoint pairs.
	 */

	createContainer(
		entryPoint: fluidEntryPoint,
		loaderProps?: Partial<ILoaderProps>,
	): Promise<IContainer>;

	/**
	 * Loads a container using the default document id
	 */
	loadContainer(
		entryPoint: fluidEntryPoint,
		loaderProps?: Partial<ILoaderProps>,
		requestHeader?: IRequestHeader,
	): Promise<IContainer>;

	/**
	 * Make a test loader. Containers created/loaded through this loader will be added to the OpProcessingController.
	 * The version of the loader/containerRuntime/dataRuntime may vary based on compat config of the current run
	 * @param testContainerConfig - optional configuring the test Container
	 */
	makeTestLoader(testContainerConfig?: ITestContainerConfig): IHostLoader;

	/**
	 * Make a container using a default document id and code details
	 * Container loaded is automatically added to the OpProcessingController to manage op flow
	 * @param testContainerConfig - optional configuring the test Container
	 */
	makeTestContainer(testContainerConfig?: ITestContainerConfig): Promise<IContainer>;

	/**
	 * Load a container using a default document id and code details.
	 * IContainer loaded is automatically added to the OpProcessingController to manage op flow
	 * @param testContainerConfig - optional configuring the test Container
	 * @param requestHeader - optional headers to be supplied to the loader
	 */
	loadTestContainer(
		testContainerConfig?: ITestContainerConfig,
		requestHeader?: IRequestHeader,
	): Promise<IContainer>;

	/**
	 * Update the document ID from the resolved container's URL and reset the ID property
	 */
	updateDocumentId(url: IResolvedUrl | undefined): void;

	/**
	 * Make sure all the tracked containers are synchronized.
	 */
	ensureSynchronized(timeoutDuration?: number): Promise<void>;

	/**
	 * Reset the tracker, closing all containers and stop tracking them.
	 */
	resetLoaderContainerTracker(syncSummarizerClients?: boolean);

	/**
	 * Resets and closes all tracked containers and class states.
	 */
	reset(): void;
}

/**
 * @internal
 */
export enum DataObjectFactoryType {
	Primed, // default
	Test,
}

/**
 * @internal
 */
export interface ITestContainerConfig {
	/** TestFluidDataObject instead of PrimedDataStore */
	fluidDataObjectType?: DataObjectFactoryType;

	/** An array of channel name and DDS factory pair to create on container creation time */
	registry?: ChannelFactoryRegistry;

	/** Container runtime options for the container instance */
	runtimeOptions?: IContainerRuntimeOptions;

	/** Whether this runtime should be instantiated using a mixed-in attributor class */
	enableAttribution?: boolean;

	/** Loader options for the loader used to create containers */
	loaderProps?: Partial<ILoaderProps>;
}

/**
 * @internal
 */
export const createDocumentId = (): string => uuid();

/**
 * Used to retrieve, update, and reset document id based on the type of driver being used.
 *
 * @internal
 */
export interface IDocumentIdStrategy {
	/**
	 * Get document id
	 */
	get(): string;
	/**
	 * Update the document ID from the resolved container's URL and reset the ID property
	 */
	update(resolvedUrl?: IResolvedUrl): void;
	/**
	 * Reset document id to a new document id
	 */
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
				update: () => {}, // do not update the document ID in odsp test cases
				reset: () => {
					documentId = createDocumentId();
				},
			};
		default:
			return {
				get: () => documentId,
				update: (resolvedUrl?: IResolvedUrl) => {
					// Extract the document ID from the resolved container's URL and reset the ID property
					documentId = resolvedUrl?.id ?? documentId;
				},
				reset: () => {
					documentId = createDocumentId();
				},
			};
	}
}

/**
 * This class tracks events. It allows specifying expected events, which will be looked for in order.
 * It also tracks all unexpected errors.
 * At any point you call reportAndClearTrackedEvents which will provide all unexpected errors, and
 * any expected events that have not occurred.
 * @internal
 */
export class EventAndErrorTrackingLogger implements ITelemetryBaseLogger {
	/**
	 * Even if these error events are logged, tests should still be allowed to pass
	 * Additionally, if downgrade is true, then log as generic (e.g. to avoid polluting the e2e test logs)
	 */
	private readonly allowedErrors: { eventName: string; downgrade?: true }[] = [
		// This log was removed in current version as unnecessary, but it's still present in previous versions
		{
			eventName: "fluid:telemetry:Container:NoRealStorageInDetachedContainer",
			downgrade: true,
		},
		// This log's category changes depending on the op latency. test results shouldn't be affected but if we see lots we'd like an alert from the logs.
		{ eventName: "fluid:telemetry:OpPerf:OpRoundtripTime" },
	];

	constructor(private readonly baseLogger: ITelemetryBaseLogger) {}

	private readonly expectedEvents: (
		| { index: number; event: ITelemetryGenericEvent | undefined }
		| undefined
	)[] = [];
	private readonly unexpectedErrors: ITelemetryBaseEvent[] = [];

	public registerExpectedEvent(...orderedExpectedEvents: ITelemetryGenericEvent[]) {
		if (this.expectedEvents.length !== 0) {
			// we don't have to error here. just no reason not to. given the events must be
			// ordered it could be tricky to figure out problems around multiple registrations.
			throw new Error(
				"Expected events already registered.\n" +
					"Call reportAndClearTrackedEvents to clear them before registering more",
			);
		}
		this.expectedEvents.push(
			...orderedExpectedEvents.map((event, index) => ({ index, event })),
		);
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
			// Check to see if this error is allowed and if its category should be downgraded
			const allowedError = this.allowedErrors.find(
				({ eventName }) => eventName === event.eventName,
			);

			if (allowedError === undefined) {
				this.unexpectedErrors.push(event);
			} else if (allowedError.downgrade) {
				event.category = "generic";
			}
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
 * @internal
 */
export class TestObjectProvider implements ITestObjectProvider {
	/**
	 * {@inheritDoc ITestObjectProvider."type"}
	 */
	public readonly type = "TestObjectProvider";
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
		private readonly LoaderConstructor: typeof Loader,
		/**
		 * {@inheritDoc ITestObjectProvider.driver}
		 */
		public readonly driver: ITestDriver,
		/**
		 * {@inheritDoc ITestObjectProvider.createFluidEntryPoint}
		 */
		public readonly createFluidEntryPoint: (
			testContainerConfig?: ITestContainerConfig,
		) => fluidEntryPoint,
	) {
		this._documentIdStrategy = getDocumentIdStrategy(driver.type);
	}

	/**
	 * {@inheritDoc ITestObjectProvider.logger}
	 */
	public get logger(): EventAndErrorTrackingLogger {
		if (this._logger === undefined) {
			this._logger = new EventAndErrorTrackingLogger(
				createChildLogger({
					logger: getTestLogger?.(),
					properties: {
						all: {
							driverType: this.driver.type,
							driverEndpointName: this.driver.endpointName,
							driverTenantName: this.driver.tenantName,
							driverUserIndex: this.driver.userIndex,
						},
					},
				}),
			);
		}
		return this._logger;
	}

	private set logger(logger: EventAndErrorTrackingLogger) {
		this._logger = logger;
	}

	/**
	 * {@inheritDoc ITestObjectProvider.documentServiceFactory}
	 */
	public get documentServiceFactory() {
		if (!this._documentServiceFactory) {
			this._documentServiceFactory = this.driver.createDocumentServiceFactory();
		}
		return this._documentServiceFactory;
	}

	/**
	 * {@inheritDoc ITestObjectProvider.urlResolver}
	 */
	public get urlResolver() {
		if (!this._urlResolver) {
			this._urlResolver = this.driver.createUrlResolver();
		}
		return this._urlResolver;
	}

	/**
	 * {@inheritDoc ITestObjectProvider.documentId}
	 */
	public get documentId() {
		return this._documentIdStrategy.get();
	}

	/**
	 * {@inheritDoc ITestObjectProvider.defaultCodeDetails}
	 */
	public get defaultCodeDetails() {
		return defaultCodeDetails;
	}

	/**
	 * {@inheritDoc ITestObjectProvider.opProcessingController}
	 */
	public get opProcessingController(): IOpProcessingController {
		return this._loaderContainerTracker;
	}

	/**
	 * {@inheritDoc ITestObjectProvider.createLoader}
	 */
	public createLoader(
		packageEntries: Iterable<[IFluidCodeDetails, fluidEntryPoint]>,
		loaderProps?: Partial<ILoaderProps>,
	) {
		const logger = createMultiSinkLogger({
			loggers: [this.logger, loaderProps?.logger],
		});

		const loader = new this.LoaderConstructor({
			...loaderProps,
			logger,
			codeLoader: loaderProps?.codeLoader ?? new LocalCodeLoader(packageEntries),
			urlResolver: loaderProps?.urlResolver ?? this.urlResolver,
			documentServiceFactory:
				loaderProps?.documentServiceFactory ?? this.documentServiceFactory,
		});
		this._loaderContainerTracker.add(loader);
		return loader;
	}

	/**
	 * {@inheritDoc ITestObjectProvider.createContainer}
	 */
	public async createContainer(entryPoint: fluidEntryPoint, loaderProps?: Partial<ILoaderProps>) {
		if (this._documentCreated) {
			throw new Error(
				"Only one container/document can be created. To load the container/document use loadContainer",
			);
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

	/**
	 * {@inheritDoc ITestObjectProvider.loadContainer}
	 */
	public async loadContainer(
		entryPoint: fluidEntryPoint,
		loaderProps?: Partial<ILoaderProps>,
		requestHeader?: IRequestHeader,
	): Promise<IContainer> {
		const loader = this.createLoader([[defaultCodeDetails, entryPoint]], loaderProps);
		return this.resolveContainer(loader, requestHeader);
	}

	private async resolveContainer(loader: ILoader, headers?: IRequestHeader) {
		return loader.resolve({
			url: await this.driver.createContainerUrl(this.documentId),
			headers,
		});
	}

	/**
	 * {@inheritDoc ITestObjectProvider.makeTestLoader}
	 */
	public makeTestLoader(testContainerConfig?: ITestContainerConfig) {
		return this.createLoader(
			[[defaultCodeDetails, this.createFluidEntryPoint(testContainerConfig)]],
			testContainerConfig?.loaderProps,
		);
	}

	/**
	 * {@inheritDoc ITestObjectProvider.makeTestContainer}
	 */
	public async makeTestContainer(
		testContainerConfig?: ITestContainerConfig,
	): Promise<IContainer> {
		if (this._documentCreated) {
			throw new Error(
				"Only one container/document can be created. To load the container/document use loadTestContainer",
			);
		}
		const loader = this.makeTestLoader(testContainerConfig);
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

	/**
	 * {@inheritDoc ITestObjectProvider.loadTestContainer}
	 */
	public async loadTestContainer(
		testContainerConfig?: ITestContainerConfig,
		requestHeader?: IRequestHeader,
	): Promise<IContainer> {
		const loader = this.makeTestLoader(testContainerConfig);

		const container = await this.resolveContainer(loader, requestHeader);
		await this.waitContainerToCatchUp(container);

		return container;
	}

	/**
	 * {@inheritDoc ITestObjectProvider.reset}
	 */
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

	/**
	 * {@inheritDoc ITestObjectProvider.ensureSynchronized}
	 */
	public async ensureSynchronized(): Promise<void> {
		return this._loaderContainerTracker.ensureSynchronized();
	}

	private async waitContainerToCatchUp(container: IContainer) {
		// The original waitContainerToCatchUp() from container loader uses either Container.resume()
		// or Container.connect() as part of its implementation. However, resume() was deprecated
		// and eventually replaced with connect(). To avoid issues during LTS compatibility testing
		// with older container versions issues, we use resume() when connect() is unavailable.
		if ((container as any).connect === undefined) {
			(container as any).connect = (container as any).resume;
		}

		return waitContainerToCatchUp_original(container);
	}

	/**
	 * {@inheritDoc ITestObjectProvider.updateDocumentId}
	 */
	public updateDocumentId(resolvedUrl: IResolvedUrl | undefined) {
		this._documentIdStrategy.update(resolvedUrl);
	}

	/**
	 * {@inheritDoc ITestObjectProvider.resetLoaderContainerTracker}
	 */
	public resetLoaderContainerTracker(syncSummarizerClients: boolean = false) {
		this._loaderContainerTracker.reset();
		this._loaderContainerTracker = new LoaderContainerTracker(syncSummarizerClients);
	}
}

/**
 * Implements {@link ITestObjectProvider}, but uses different versions to create and load containers.
 *
 * @internal
 */
export class TestObjectProviderWithVersionedLoad implements ITestObjectProvider {
	/**
	 * {@inheritDoc ITestObjectProvider."type"}
	 */
	public readonly type = "TestObjectProviderWithVersionedLoad";
	private _loaderContainerTracker = new LoaderContainerTracker();
	private _logger: EventAndErrorTrackingLogger | undefined;
	private readonly _documentIdStrategy: IDocumentIdStrategy;
	private _documentServiceFactory: IDocumentServiceFactory | undefined;
	private _urlResolver: IUrlResolver | undefined;
	// Since documentId doesn't change we can only create/make one container. Call the load functions instead.
	private _documentCreated = false;

	/**
	 * `_loadCount` is used to alternate which version we load the next container with.
	 * loadCount is even then we will load with the "create" version, and if odd we load with the "load" version.
	 * After each test we will reset loadCount to 0 to ensure we always create the first container with the create version.
	 *
	 * Note: This will only affect tests that load a container more than two times.
	 */

	private _loadCount: number = 0;

	constructor(
		private readonly LoaderConstructorForCreating: typeof Loader,
		private readonly LoaderConstructorForLoading: typeof Loader,
		private readonly driverForCreating: ITestDriver,
		private readonly driverForLoading: ITestDriver,
		private readonly createFluidEntryPointForCreating: (
			testContainerConfig?: ITestContainerConfig,
		) => fluidEntryPoint,
		private readonly createFluidEntryPointForLoading: (
			testContainerConfig?: ITestContainerConfig,
		) => fluidEntryPoint,
	) {
		this._documentIdStrategy = getDocumentIdStrategy(driverForCreating.type);
	}

	/**
	 * {@inheritDoc ITestObjectProvider.logger}
	 */
	public get logger(): EventAndErrorTrackingLogger {
		if (this._logger === undefined) {
			this._logger = new EventAndErrorTrackingLogger(
				createChildLogger({
					logger: getTestLogger?.(),
				}),
			);
		}
		return this._logger;
	}

	/**
	 * {@inheritDoc ITestObjectProvider.documentServiceFactory}
	 */
	public get documentServiceFactory() {
		if (!this._documentServiceFactory) {
			this._documentServiceFactory = this.driverForCreating.createDocumentServiceFactory();
		}
		return this._documentServiceFactory;
	}

	/**
	 * {@inheritDoc ITestObjectProvider.urlResolver}
	 */
	public get urlResolver() {
		if (!this._urlResolver) {
			this._urlResolver = this.driverForCreating.createUrlResolver();
		}
		return this._urlResolver;
	}

	/**
	 * {@inheritDoc ITestObjectProvider.documentId}
	 */
	public get documentId() {
		return this._documentIdStrategy.get();
	}

	/**
	 * {@inheritDoc ITestObjectProvider.defaultCodeDetails}
	 */
	public get defaultCodeDetails() {
		return defaultCodeDetails;
	}

	/**
	 * {@inheritDoc ITestObjectProvider.opProcessingController}
	 */
	public get opProcessingController(): IOpProcessingController {
		return this._loaderContainerTracker;
	}

	/**
	 * {@inheritDoc ITestObjectProvider.driver}
	 */
	public get driver(): ITestDriver {
		return this.nextLoaderShouldCreate() ? this.driverForCreating : this.driverForLoading;
	}

	/**
	 * {@inheritDoc ITestObjectProvider.createFluidEntryPoint}
	 */
	public get createFluidEntryPoint(): (
		testContainerConfig?: ITestContainerConfig,
	) => fluidEntryPoint {
		return this.nextLoaderShouldCreate()
			? this.createFluidEntryPointForCreating
			: this.createFluidEntryPointForLoading;
	}

	private createLoaderForCreating(
		packageEntries: Iterable<[IFluidCodeDetails, fluidEntryPoint]>,
		loaderProps?: Partial<ILoaderProps>,
	) {
		const logger = createMultiSinkLogger({
			loggers: [this.logger, loaderProps?.logger],
		});

		const loader = new this.LoaderConstructorForCreating({
			...loaderProps,
			logger,
			codeLoader: loaderProps?.codeLoader ?? new LocalCodeLoader(packageEntries),
			urlResolver: loaderProps?.urlResolver ?? this.urlResolver,
			documentServiceFactory:
				loaderProps?.documentServiceFactory ?? this.documentServiceFactory,
		});

		this._loaderContainerTracker.add(loader);
		return loader;
	}

	private createLoaderForLoading(
		packageEntries: Iterable<[IFluidCodeDetails, fluidEntryPoint]>,
		loaderProps?: Partial<ILoaderProps>,
	) {
		const logger = createMultiSinkLogger({
			loggers: [this.logger, loaderProps?.logger],
		});

		const loader = new this.LoaderConstructorForLoading({
			...loaderProps,
			logger,
			codeLoader: loaderProps?.codeLoader ?? new LocalCodeLoader(packageEntries),
			urlResolver: loaderProps?.urlResolver ?? this.urlResolver,
			documentServiceFactory:
				loaderProps?.documentServiceFactory ?? this.documentServiceFactory,
		});

		this._loaderContainerTracker.add(loader);
		return loader;
	}

	/**
	 * {@inheritDoc ITestObjectProvider.createLoader}
	 */
	public createLoader(
		packageEntries: Iterable<[IFluidCodeDetails, fluidEntryPoint]>,
		loaderProps?: Partial<ILoaderProps>,
	) {
		return this.nextLoaderShouldCreate(/** increment */ true)
			? this.createLoaderForCreating(packageEntries, loaderProps)
			: this.createLoaderForLoading(packageEntries, loaderProps);
	}

	/**
	 * {@inheritDoc ITestObjectProvider.createContainer}
	 */
	public async createContainer(entryPoint: fluidEntryPoint, loaderProps?: Partial<ILoaderProps>) {
		if (this._documentCreated) {
			throw new Error(
				"Only one container/document can be created. To load the container/document use loadContainer",
			);
		}
		const loader = this.createLoader([[defaultCodeDetails, entryPoint]], loaderProps);
		const container = await createAndAttachContainer(
			defaultCodeDetails,
			loader,
			this.driverForCreating.createCreateNewRequest(this.documentId),
		);
		this._documentCreated = true;
		// r11s driver will generate a new ID for the new container.
		// update the document ID with the actual ID of the attached container.
		this._documentIdStrategy.update(container.resolvedUrl);
		return container;
	}

	/**
	 * {@inheritDoc ITestObjectProvider.loadContainer}
	 */
	public async loadContainer(
		entryPoint: fluidEntryPoint,
		loaderProps?: Partial<ILoaderProps>,
		requestHeader?: IRequestHeader,
	): Promise<IContainer> {
		const driver = this.nextLoaderShouldCreate()
			? this.driverForCreating
			: this.driverForLoading;
		const loader = this.createLoader([[defaultCodeDetails, entryPoint]], loaderProps);
		return this.resolveContainer(loader, requestHeader, driver);
	}

	private async resolveContainer(
		loader: ILoader,
		headers?: IRequestHeader,
		driver?: ITestDriver,
	) {
		return loader.resolve({
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			url: await driver!.createContainerUrl(this.documentId),
			headers,
		});
	}

	/**
	 * {@inheritDoc ITestObjectProvider.makeTestLoader}
	 */
	public makeTestLoader(testContainerConfig?: ITestContainerConfig) {
		return this.createLoader(
			[[defaultCodeDetails, this.createFluidEntryPoint(testContainerConfig)]],
			testContainerConfig?.loaderProps,
		);
	}

	/**
	 * {@inheritDoc ITestObjectProvider.makeTestContainer}
	 */
	public async makeTestContainer(
		testContainerConfig?: ITestContainerConfig,
	): Promise<IContainer> {
		if (this._documentCreated) {
			throw new Error(
				"Only one container/document can be created. To load the container/document use loadTestContainer",
			);
		}
		const loader = this.createLoader(
			[[defaultCodeDetails, this.createFluidEntryPoint(testContainerConfig)]],
			testContainerConfig?.loaderProps,
		);
		const container = await createAndAttachContainer(
			defaultCodeDetails,
			loader,
			this.driverForCreating.createCreateNewRequest(this.documentId),
		);
		this._documentCreated = true;
		// r11s driver will generate a new ID for the new container.
		// update the document ID with the actual ID of the attached container.
		this._documentIdStrategy.update(container.resolvedUrl);
		return container;
	}

	/**
	 * {@inheritDoc ITestObjectProvider.loadTestContainer}
	 */
	public async loadTestContainer(
		testContainerConfig?: ITestContainerConfig,
		requestHeader?: IRequestHeader,
	): Promise<IContainer> {
		// Keep track of which Loader we are about to use so we can pass the correct driver through
		const driver = this.nextLoaderShouldCreate()
			? this.driverForCreating
			: this.driverForLoading;
		const loader = this.makeTestLoader(testContainerConfig);
		const container = await this.resolveContainer(loader, requestHeader, driver);
		await this.waitContainerToCatchUp(container);

		return container;
	}

	/**
	 * {@inheritDoc ITestObjectProvider.reset}
	 */
	public reset() {
		this._loadCount = 0;
		this._loaderContainerTracker.reset();
		this._logger = undefined;
		this._documentServiceFactory = undefined;
		this._urlResolver = undefined;
		this._documentIdStrategy.reset();
		const logError = getUnexpectedLogErrorException(this._logger);
		if (logError) {
			throw logError;
		}
		this._documentCreated = false;
	}

	/**
	 * {@inheritDoc ITestObjectProvider.ensureSynchronized}
	 */
	public async ensureSynchronized(): Promise<void> {
		return this._loaderContainerTracker.ensureSynchronized();
	}

	private async waitContainerToCatchUp(container: IContainer) {
		// The original waitContainerToCatchUp() from container loader uses either Container.resume()
		// or Container.connect() as part of its implementation. However, resume() was deprecated
		// and eventually replaced with connect(). To avoid issues during LTS compatibility testing
		// with older container versions issues, we use resume() when connect() is unavailable.
		if ((container as any).connect === undefined) {
			(container as any).connect = (container as any).resume;
		}

		return waitContainerToCatchUp_original(container);
	}

	/**
	 * {@inheritDoc ITestObjectProvider.updateDocumentId}
	 */
	public updateDocumentId(resolvedUrl: IResolvedUrl | undefined) {
		this._documentIdStrategy.update(resolvedUrl);
	}

	/**
	 * {@inheritDoc ITestObjectProvider.resetLoaderContainerTracker}
	 */
	public resetLoaderContainerTracker(syncSummarizerClients: boolean = false) {
		this._loaderContainerTracker.reset();
		this._loaderContainerTracker = new LoaderContainerTracker(syncSummarizerClients);
	}

	private nextLoaderShouldCreate(increment: boolean = false): boolean {
		const shouldCreate = this._loadCount % 2 === 0;
		if (increment) {
			this._loadCount++;
		}
		return shouldCreate;
	}
}

/**
 * @internal
 */
export function getUnexpectedLogErrorException(
	logger: EventAndErrorTrackingLogger | undefined,
	prefix?: string,
) {
	if (logger === undefined) {
		return;
	}
	const results = logger.reportAndClearTrackedEvents();
	if (results.unexpectedErrors.length > 0) {
		return new Error(
			`${prefix ?? ""}Unexpected Errors in Logs:\n${JSON.stringify(
				results.unexpectedErrors,
				undefined,
				2,
			)}`,
		);
	}
	if (results.expectedNotFound.length > 0) {
		return new Error(
			`${prefix ?? ""}Expected Events not found:\n${JSON.stringify(
				results.expectedNotFound,
				undefined,
				2,
			)}`,
		);
	}
}
