/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/*
 * Shared building blocks for the ODSP real-service point-in-time (`loadContainerToSequenceNumber`)
 * test suites: a tiny `DataObject` whose `SharedCounter` drives op generation, container
 * create/attach helpers, and a helper that loads a container to a target sequence number through the
 * ODSP point-in-time document-service factory.
 */

import { strict as assert } from "assert";

import { OdspTestDriver } from "@fluid-private/test-drivers";
import type { CompatApis } from "@fluid-private/test-version-utils";
import type {
	IContainer,
	IFluidCodeDetails,
	IRuntimeFactory,
} from "@fluidframework/container-definitions/internal";
import { loadContainerToSequenceNumber } from "@fluidframework/container-loader/internal";
import type { ISummarizer } from "@fluidframework/container-runtime/internal";
import type { IFluidHandle, ITelemetryBaseLogger } from "@fluidframework/core-interfaces";
import type { ISharedCounter } from "@fluidframework/counter/internal";
import {
	type ITestObjectProvider,
	LoaderContainerTracker,
	LocalCodeLoader,
	createAndAttachContainer,
	createDocumentId,
	createLoader,
	createSummarizerFromFactory,
	summarizeNow,
} from "@fluidframework/test-utils/internal";

import {
	createOdspVersionTestApiProps,
	triggerVersionViaMetadata,
	type OdspVersionTestApiProps,
} from "./odspVersionTestApi.js";

/**
 * The test object surfaced by {@link createPointInTimeTestObjectFactory}: a counter whose increments
 * are the ops the point-in-time scenarios sequence, replay, and load to.
 */
export interface IPointInTimeTestObject {
	/** Current counter value. */
	readonly value: number;
	/** Increment the counter, producing one op. */
	increment(): void;
}

const counterKey = "counter";

function buildFactory(apis: Pick<CompatApis, "dds" | "dataRuntime">) {
	const { SharedCounter } = apis.dds;
	const { DataObject, DataObjectFactory } = apis.dataRuntime;

	class PointInTimeTestObject extends DataObject implements IPointInTimeTestObject {
		public static readonly type = "@fluid-example/point-in-time-test-object";

		private counter: ISharedCounter | undefined;

		public get value(): number {
			assert(this.counter !== undefined, "counter not initialized");
			return this.counter.value;
		}

		public increment(): void {
			assert(this.counter !== undefined, "counter not initialized");
			this.counter.increment(1);
		}

		protected async initializingFirstTime(): Promise<void> {
			this.root.set(counterKey, SharedCounter.create(this.runtime).handle);
		}

		protected async hasInitialized(): Promise<void> {
			const handle = this.root.get<IFluidHandle<ISharedCounter>>(counterKey);
			assert(handle !== undefined, "counter handle missing");
			this.counter = await handle.get();
		}
	}

	return new DataObjectFactory({
		type: PointInTimeTestObject.type,
		ctor: PointInTimeTestObject,
		sharedObjects: [SharedCounter.getFactory()],
	});
}

/**
 * Build the container runtime factory that hosts a single {@link IPointInTimeTestObject}.
 */
export function createPointInTimeRuntimeFactory(
	apis: Pick<CompatApis, "dds" | "dataRuntime" | "containerRuntime">,
): IRuntimeFactory {
	const { ContainerRuntimeFactoryWithDefaultDataStore } = apis.containerRuntime;
	const dataObjectFactory = buildFactory(apis);
	return new ContainerRuntimeFactoryWithDefaultDataStore({
		defaultFactory: dataObjectFactory,
		registryEntries: [[dataObjectFactory.type, Promise.resolve(dataObjectFactory)]],
	}) as unknown as IRuntimeFactory;
}

/**
 * Create and attach a container hosting {@link IPointInTimeTestObject}, tracking it so its ops can
 * be flushed with {@link LoaderContainerTracker.ensureSynchronized}.
 */
export async function createAttachedPointInTimeContainer(
	provider: ITestObjectProvider,
	runtimeFactory: IRuntimeFactory,
	tracker: LoaderContainerTracker,
	documentId: string,
): Promise<IContainer> {
	const loader = createLoader(
		[[provider.defaultCodeDetails, runtimeFactory]],
		provider.documentServiceFactory,
		provider.urlResolver,
		provider.logger,
	);
	const container = await createAndAttachContainer(
		provider.defaultCodeDetails,
		loader,
		provider.driver.createCreateNewRequest(documentId),
	);
	tracker.addContainer(container);
	return container;
}

/**
 * Load a read-only container materialized at `loadToSequenceNumber`, using the ODSP point-in-time
 * document-service factory. The driver must be the ODSP test driver.
 *
 * `logger` overrides the telemetry sink passed to the load (defaults to `provider.logger`); tests use
 * it to observe load-progress events - e.g. to fire an {@link AbortSignal} once the op replay begins.
 */
export async function loadPointInTimeContainer(
	provider: ITestObjectProvider,
	runtimeFactory: IRuntimeFactory,
	documentId: string,
	loadToSequenceNumber: number,
	signal?: AbortSignal,
	logger?: ITelemetryBaseLogger,
): Promise<IContainer> {
	assert(provider.driver.type === "odsp", "Point-in-time load requires the odsp driver");
	const odspDriver = provider.driver as OdspTestDriver;
	const documentServiceFactory = odspDriver.createPointInTimeDocumentServiceFactory();
	const url = await provider.driver.createContainerUrl(documentId);
	const codeDetails: IFluidCodeDetails = provider.defaultCodeDetails;
	return loadContainerToSequenceNumber({
		codeLoader: new LocalCodeLoader([[codeDetails, runtimeFactory]]),
		urlResolver: provider.urlResolver,
		documentServiceFactory,
		request: { url },
		loadToSequenceNumber,
		logger: logger ?? provider.logger,
		signal,
	});
}

/**
 * Create a summarizer client for the point-in-time test container.
 *
 * A metadata PATCH (see {@link triggerVersionViaMetadata}) snaps a driveItem version whose snapshot
 * is only the file's *persisted* Fluid state - which advances solely when the runtime writes a
 * summary. Without a summary every snapped version resolves to the creation snapshot (sequence
 * number 0), so the point-in-time factory can never find a base at a meaningful sequence number, and
 * the bridging ops never get flushed into the queryable op stream. Forcing a summary before each snap
 * makes the version capture the advanced state so a recoverable base with retained ops exists.
 */
export async function createPointInTimeSummarizer(
	provider: ITestObjectProvider,
	container: IContainer,
	apis: Pick<CompatApis, "dds" | "dataRuntime" | "containerRuntime">,
): Promise<ISummarizer> {
	const dataObjectFactory = buildFactory(apis);
	const { summarizer } = await createSummarizerFromFactory(
		provider,
		container,
		dataObjectFactory,
		undefined /* summaryVersion */,
		apis.containerRuntime.ContainerRuntimeFactoryWithDefaultDataStore,
	);
	return summarizer;
}

/**
 * Force a summary so the current container state is persisted to ODSP. Callers snap a driveItem
 * version immediately after so it captures this advanced (non-zero) snapshot as a recoverable
 * point-in-time base, and so the bridging ops are flushed into the queryable op stream.
 */
export async function summarizePointInTime(summarizer: ISummarizer): Promise<void> {
	await summarizeNow(summarizer);
}

/**
 * Per-suite fixture shared by the ODSP point-in-time suites. Call it once inside the
 * {@link describeCompat} body: it registers the odsp-only `before` hook (which skips non-odsp
 * drivers and builds the runtime factory) and the `afterEach` that resets the container tracker, and
 * exposes the lazily-initialized {@link ITestObjectProvider} and {@link IRuntimeFactory} plus the
 * tracker itself.
 */
export interface PointInTimeSuiteFixture {
	/** The container tracker whose lifetime spans the suite. */
	readonly tracker: LoaderContainerTracker;
	/** The test object provider; only valid after the registered `before` hook has run. */
	provider(): ITestObjectProvider;
	/** The point-in-time runtime factory; only valid after the registered `before` hook has run. */
	runtimeFactory(): IRuntimeFactory;
}

/**
 * Register the shared `before`/`afterEach` hooks for an ODSP point-in-time suite and return a
 * {@link PointInTimeSuiteFixture} for accessing the provider, runtime factory, and container tracker.
 */
export function setupPointInTimeSuite(
	getTestObjectProvider: () => ITestObjectProvider,
	apis: Pick<CompatApis, "dds" | "dataRuntime" | "containerRuntime">,
): PointInTimeSuiteFixture {
	let provider: ITestObjectProvider | undefined;
	let runtimeFactory: IRuntimeFactory | undefined;
	const tracker = new LoaderContainerTracker();

	before(function () {
		provider = getTestObjectProvider();
		if (provider.driver.type !== "odsp") {
			this.skip();
		}
		runtimeFactory = createPointInTimeRuntimeFactory(apis);
	});

	afterEach(() => tracker.reset());

	return {
		tracker,
		provider() {
			assert(
				provider !== undefined,
				"provider is only available after the before() hook runs",
			);
			return provider;
		},
		runtimeFactory() {
			assert(
				runtimeFactory !== undefined,
				"runtimeFactory is only available after the before() hook runs",
			);
			return runtimeFactory;
		},
	};
}

/**
 * The per-test harness shared by the point-in-time suites: an attached container hosting a counter
 * {@link IPointInTimeTestObject}, the raw ODSP version REST api bound to that file, and helpers to
 * generate/sequence ops and to snap driveItem versions.
 */
export interface PointInTimeTestContext {
	/** The id of the created document. */
	readonly documentId: string;
	/** The attached container hosting the counter data object. */
	readonly container: IContainer;
	/** The counter data object whose increments are the ops the scenarios sequence and replay. */
	readonly dataObject: IPointInTimeTestObject;
	/** The raw ODSP version REST api bound to this container's file. */
	readonly versionApi: OdspVersionTestApiProps;
	/** The summarizer, present only when the context was created with `withSummarizer: true`. */
	readonly summarizer: ISummarizer | undefined;
	/** How many versions {@link snapVersion} has snapped so far. */
	snapCount(): number;
	/** Generate `count` ops (counter increments) and wait for them to be sequenced. */
	incrementAndSync(count: number): Promise<void>;
	/**
	 * Snap a new driveItem version and assert it succeeded. When the context was created with a
	 * summarizer, a summary is forced first so the version captures advanced (non-zero) persisted
	 * state; otherwise the current persisted state is snapped. `label` is embedded in a unique
	 * version description.
	 */
	snapVersion(label: string): Promise<void>;
}

/**
 * Bootstrap a {@link PointInTimeTestContext} for a single test: create and attach a container, bind
 * the ODSP version api to it, and (when `withSummarizer` is set) create a summarizer so snapped
 * versions capture advanced state. Must be called after the {@link setupPointInTimeSuite} `before`
 * hook has run (i.e. from within a test or `beforeEach`).
 */
export async function createPointInTimeTestContext(
	fixture: PointInTimeSuiteFixture,
	apis: Pick<CompatApis, "dds" | "dataRuntime" | "containerRuntime">,
	options: { withSummarizer: boolean },
): Promise<PointInTimeTestContext> {
	const provider = fixture.provider();
	const runtimeFactory = fixture.runtimeFactory();
	const { tracker } = fixture;

	const documentId = createDocumentId();
	const container = await createAttachedPointInTimeContainer(
		provider,
		runtimeFactory,
		tracker,
		documentId,
	);
	const dataObject = (await container.getEntryPoint()) as IPointInTimeTestObject;
	const versionApi = createOdspVersionTestApiProps(provider, container);
	const summarizer = options.withSummarizer
		? await createPointInTimeSummarizer(provider, container, apis)
		: undefined;

	let snapCount = 0;

	return {
		documentId,
		container,
		dataObject,
		versionApi,
		summarizer,
		snapCount: () => snapCount,
		async incrementAndSync(count: number): Promise<void> {
			for (let i = 0; i < count; i++) {
				dataObject.increment();
			}
			await tracker.ensureSynchronized(container);
		},
		async snapVersion(label: string): Promise<void> {
			if (summarizer !== undefined) {
				await summarizePointInTime(summarizer);
			}
			const snapped = await triggerVersionViaMetadata(versionApi, {
				description: `${label}-${snapCount++} ${Date.now()}`,
			});
			assert.strictEqual(snapped, true, "metadata PATCH should snap a new version");
		},
	};
}
