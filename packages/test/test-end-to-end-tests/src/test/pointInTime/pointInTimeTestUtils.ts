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
import type { IFluidHandle } from "@fluidframework/core-interfaces";
import type { ISharedCounter } from "@fluidframework/counter/internal";
import {
	type ITestObjectProvider,
	LoaderContainerTracker,
	LocalCodeLoader,
	createAndAttachContainer,
	createLoader,
} from "@fluidframework/test-utils/internal";

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
 */
export async function loadPointInTimeContainer(
	provider: ITestObjectProvider,
	runtimeFactory: IRuntimeFactory,
	documentId: string,
	loadToSequenceNumber: number,
	signal?: AbortSignal,
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
		logger: provider.logger,
		signal,
	});
}
