/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "assert";
import { benchmark } from "@fluid-tools/benchmark";
import { ITelemetryBaseEvent, ITelemetryBaseLogger } from "@fluidframework/core-interfaces";
import {
	ITestObjectProvider,
	ChannelFactoryRegistry,
	ITestContainerConfig,
	DataObjectFactoryType,
	ITestFluidObject,
} from "@fluidframework/test-utils";
import { describeNoCompat } from "@fluid-internal/test-version-utils";
import { ConfigTypes, IConfigProviderBase } from "@fluidframework/telemetry-utils";
import { ISharedCounter, SharedCounter } from "@fluidframework/counter";
import { requestFluidObject } from "@fluidframework/runtime-utils";

class TestLogger implements ITelemetryBaseLogger {
	public events: ITelemetryBaseEvent[] = [];
	public send(event: ITelemetryBaseEvent): void {
		this.events.push(event);
	}

	public clear(): void {
		this.events = [];
	}
}

const counterId = "counterKey";
const registry: ChannelFactoryRegistry = [[counterId, SharedCounter.getFactory()]];
const testContainerConfig: ITestContainerConfig = {
	fluidDataObjectType: DataObjectFactoryType.Test,
	registry,
};

const opCounts = [100, 500, 1_000, 2_000];

describeNoCompat.only(
	"Container - testing unsampled telemetry perf hit",
	(getTestObjectProvider) => {
		let provider: ITestObjectProvider;

		before(async () => {
			provider = getTestObjectProvider();
		});

		let sampledCounter: ISharedCounter;
		let unsampledCounter: ISharedCounter;
		const sampledLogger = new TestLogger();
		const unsampledLogger = new TestLogger();

		beforeEach(async () => {
			// Create a Container for the loader without feature flag (does sampling).
			const sampledLoader = provider.makeTestLoader({
				...testContainerConfig,
				loaderProps: { logger: sampledLogger },
			});
			const sampledContainer = await sampledLoader.createDetachedContainer(
				provider.defaultCodeDetails,
			);
			const sampledDs = await requestFluidObject<ITestFluidObject>(
				sampledContainer,
				"default",
			);
			sampledCounter = await sampledDs.getSharedObject<SharedCounter>(counterId);

			// Create a Container for the loader with feature flag (does NOT do sampling)
			const configProvider: IConfigProviderBase = {
				getRawConfig: (name: string): ConfigTypes =>
					name === "Fluid.Telemetry.DisableSampling" ? true : undefined,
			};
			const unsampledLoader = provider.makeTestLoader({
				...testContainerConfig,
				loaderProps: { logger: unsampledLogger, configProvider },
			});
			const unsampledContainer = await unsampledLoader.createDetachedContainer(
				provider.defaultCodeDetails,
			);
			const unsampledDs = await requestFluidObject<ITestFluidObject>(
				unsampledContainer,
				"default",
			);
			unsampledCounter = await unsampledDs.getSharedObject<SharedCounter>(counterId);
			await sampledContainer.attach(provider.driver.createCreateNewRequest());
			await unsampledContainer.attach(provider.driver.createCreateNewRequest());
		});

		for (const opCount of opCounts) {
			benchmark({
				title: `Generate ${opCount} ops without sampling`,
				benchmarkFnAsync: async () => {
					for (let i = 0; i < opCount; i++) {
						unsampledCounter.increment(1);
					}
					await provider.ensureSynchronized(); // Wait for all ops to roundtrip so we generate OpRoundtripTime events.
					assert(
						unsampledLogger.events.filter((x) =>
							x.eventName.endsWith("OpRoundtripTime"),
						).length >= opCount,
						`Too few events (${unsampledLogger.events.length}) seen in logger. Is sampling really disabled?`,
					);
					unsampledLogger.clear();
				},
			});

			benchmark({
				title: `Generate ${opCount} ops with sampling`,
				benchmarkFnAsync: async () => {
					for (let i = 0; i < opCount; i++) {
						sampledCounter.increment(1);
					}
					await provider.ensureSynchronized(); // Wait for all ops to roundtrip so we generate OpRoundtripTime events.
					assert(
						sampledLogger.events.filter((x) => x.eventName.endsWith("OpRoundtripTime"))
							.length <=
							Math.ceil(opCount / 500) + 1, // Sampling rate is 500; bit of buffer to make tests not fail
						`Too many events (${sampledLogger.events.length}) seen in logger. Is sampling really enabled?`,
					);
					sampledLogger.clear();
				},
			});
		}
	},
);
