/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type {
	FluidLayer,
	ILayerCompatDetails,
	ILayerCompatSupportRequirements,
	IProvideLayerCompatDetails,
} from "@fluid-internal/client-utils";
import {
	AttachState,
	type IContainerContext,
	type ICriticalContainerError,
} from "@fluidframework/container-definitions/internal";
import type { ITelemetryBaseProperties } from "@fluidframework/core-interfaces/internal";
import {
	createChildLogger,
	createChildMonitoringContext,
	isLayerIncompatibilityError,
	mixinMonitoringContext,
	MockLogger,
	type MonitoringContext,
} from "@fluidframework/telemetry-utils/internal";
import {
	MockDeltaManager,
	MockAudience,
	MockQuorumClients,
} from "@fluidframework/test-runtime-utils/internal";
import Sinon from "sinon";

import { ContainerRuntime } from "../containerRuntime.js";
import { pkgVersion } from "../packageVersion.js";
import {
	loaderSupportRequirementsForRuntime,
	validateLoaderCompatibility,
	validateDatastoreCompatibility,
	dataStoreSupportRequirementsForRuntime,
	runtimeCoreCompatDetails,
	disableStrictLoaderLayerCompatibilityCheckKey,
} from "../runtimeLayerCompatState.js";

import { createLocalDataStoreContext } from "./dataStoreCreationHelper.js";
// eslint-disable-next-line import-x/no-internal-modules
import { createTestConfigProvider } from "./gc/gcUnitTestHelpers.js";

type ILayerCompatSupportRequirementsOverride = Omit<
	ILayerCompatSupportRequirements,
	"requiredFeatures" | "minSupportedGeneration"
> & {
	requiredFeatures: string[];
	minSupportedGeneration: number;
};

function validateFailureProperties(
	error: Error,
	isGenerationCompatible: boolean,
	incompatibleLayerGeneration: number,
	incompatibleLayer: FluidLayer,
	unsupportedFeatures?: string[],
): boolean {
	assert(isLayerIncompatibilityError(error), "Error should be a layerIncompatibilityError");
	assert(typeof error.details === "string", "Error details should be present");
	const detailedProperties = JSON.parse(error.details) as ITelemetryBaseProperties;
	assert.strictEqual(
		detailedProperties.isGenerationCompatible,
		isGenerationCompatible,
		"Generation compatibility not as expected",
	);

	assert.strictEqual(error.layer, "runtime", "Layer type not as expected");
	assert.strictEqual(
		error.incompatibleLayer,
		incompatibleLayer,
		"Incompatible layer type not as expected",
	);

	assert.strictEqual(error.layerVersion, pkgVersion, "Runtime version not as expected");
	assert.strictEqual(
		detailedProperties.layerGeneration,
		runtimeCoreCompatDetails.generation,
		"Runtime generation not as expected",
	);
	assert.deepStrictEqual(
		detailedProperties.unsupportedFeatures,
		unsupportedFeatures,
		"Unsupported features not as expected",
	);

	assert.strictEqual(
		error.incompatibleLayerVersion,
		pkgVersion,
		`${incompatibleLayer} version not as expected`,
	);
	assert.strictEqual(
		detailedProperties.incompatibleLayerGeneration,
		incompatibleLayerGeneration,
		`${incompatibleLayer} generation not as expected`,
	);
	return true;
}

async function createAndLoadRuntime(
	compatibilityDetails?: ILayerCompatDetails,
): Promise<void> {
	const mockContext: Partial<IContainerContext & IProvideLayerCompatDetails> = {
		attachState: AttachState.Attached,
		deltaManager: new MockDeltaManager(),
		audience: new MockAudience(),
		quorum: new MockQuorumClients(),
		taggedLogger: createChildLogger({}),
		clientDetails: { capabilities: { interactive: true } },
		closeFn: (error): void => {},
		updateDirtyContainerState: (_dirty: boolean) => {},
		getLoadedFromVersion: () => undefined,
		ILayerCompatDetails: compatibilityDetails,
	};

	await ContainerRuntime.loadRuntime({
		context: mockContext as IContainerContext,
		registryEntries: [],
		existing: false,
		provideEntryPoint: async () => ({
			myProp: "myValue",
		}),
	});
}

async function createAndLoadDataStore(
	compatibilityDetails?: ILayerCompatDetails,
): Promise<void> {
	const localDataStoreContext = createLocalDataStoreContext({}, compatibilityDetails);
	await localDataStoreContext.realize();
}

describe("Runtime Layer compatibility", () => {
	/**
	 * These tests ensure that the validation logic for layer compatibility is correct
	 * and has the correct error / properties.
	 */
	describe("Validation error and properties", () => {
		const mc = createChildMonitoringContext({ logger: createChildLogger() });
		const testCases: {
			layerType: "loader" | "dataStore";
			layerSupportRequirements: ILayerCompatSupportRequirementsOverride;
			validateCompatibility: (
				maybeCompatDetails: ILayerCompatDetails | undefined,
				disposeFn: (error?: ICriticalContainerError) => void,
			) => void;
		}[] = [
			{
				layerType: "loader",
				validateCompatibility: (maybeCompatDetails, disposeFn) =>
					validateLoaderCompatibility(maybeCompatDetails, disposeFn, mc),
				layerSupportRequirements:
					loaderSupportRequirementsForRuntime as ILayerCompatSupportRequirementsOverride,
			},
			{
				layerType: "dataStore",
				validateCompatibility: (maybeCompatDetails, disposeFn) =>
					validateDatastoreCompatibility(maybeCompatDetails, disposeFn, mc),
				layerSupportRequirements:
					dataStoreSupportRequirementsForRuntime as ILayerCompatSupportRequirementsOverride,
			},
		];

		for (const testCase of testCases) {
			const layerSupportRequirements = testCase.layerSupportRequirements;
			let originalRequiredFeatures: readonly string[];
			beforeEach(() => {
				originalRequiredFeatures = [...layerSupportRequirements.requiredFeatures];
			});

			afterEach(() => {
				layerSupportRequirements.requiredFeatures = [...originalRequiredFeatures];
			});

			describe(`Validate ${testCase.layerType} Compatibility`, () => {
				it(`Runtime is compatible with old ${testCase.layerType} (pre-enforcement)`, () => {
					// Older layer will not have ILayerCompatDetails defined.
					assert.doesNotThrow(
						() =>
							testCase.validateCompatibility(undefined /* maybeCompatDetails */, () => {
								throw new Error("should not dispose");
							}),
						`Runtime should be compatible with older ${testCase.layerType} layer`,
					);
				});

				it(`Runtime generation and features are compatible with ${testCase.layerType}`, () => {
					layerSupportRequirements.requiredFeatures = ["feature1", "feature2"];
					const layerCompatDetails: ILayerCompatDetails = {
						pkgVersion,
						generation: layerSupportRequirements.minSupportedGeneration,
						supportedFeatures: new Set(layerSupportRequirements.requiredFeatures),
					};
					assert.doesNotThrow(
						() =>
							testCase.validateCompatibility(layerCompatDetails, () => {
								throw new Error("should not dispose");
							}),
						`Runtime should be compatible with ${testCase.layerType} layer`,
					);
				});

				it(`Loader generation is incompatible with ${testCase.layerType}`, () => {
					const disposeFn = Sinon.fake();
					layerSupportRequirements.requiredFeatures = ["feature1", "feature2"];
					const layerGeneration = layerSupportRequirements.minSupportedGeneration - 1;
					const layerCompatDetails: ILayerCompatDetails = {
						pkgVersion,
						generation: layerGeneration,
						supportedFeatures: new Set(layerSupportRequirements.requiredFeatures),
					};
					assert.throws(
						() => testCase.validateCompatibility(layerCompatDetails, disposeFn),
						(e: Error) =>
							validateFailureProperties(
								e,
								false /* isGenerationCompatible */,
								layerGeneration,
								testCase.layerType,
							),
						`Runtime should be incompatible with ${testCase.layerType} layer`,
					);
					assert(disposeFn.calledOnce, "Dispose should be called");
				});

				it(`Runtime features are incompatible with ${testCase.layerType}`, () => {
					const disposeFn = Sinon.fake();
					const layerGeneration = layerSupportRequirements.minSupportedGeneration;
					const requiredFeatures = ["feature2", "feature3"];
					layerSupportRequirements.requiredFeatures = requiredFeatures;

					const layerCompatDetails: ILayerCompatDetails = {
						pkgVersion,
						generation: layerGeneration,
						supportedFeatures: new Set(),
					};

					assert.throws(
						() => testCase.validateCompatibility(layerCompatDetails, disposeFn),
						(e: Error) =>
							validateFailureProperties(
								e,
								true /* isGenerationCompatible */,
								layerGeneration,
								testCase.layerType,
								requiredFeatures,
							),
						`Runtime should be incompatible with ${testCase.layerType} layer`,
					);
					assert(disposeFn.calledOnce, "Dispose should be called");
				});

				it(`Runtime generation and features are both incompatible with ${testCase.layerType}`, () => {
					const disposeFn = Sinon.fake();
					const layerGeneration = layerSupportRequirements.minSupportedGeneration - 1;
					const requiredFeatures = ["feature2"];
					layerSupportRequirements.requiredFeatures = requiredFeatures;

					const layerCompatDetails: ILayerCompatDetails = {
						pkgVersion,
						generation: layerGeneration,
						supportedFeatures: new Set(),
					};

					assert.throws(
						() => testCase.validateCompatibility(layerCompatDetails, disposeFn),
						(e: Error) =>
							validateFailureProperties(
								e,
								false /* isGenerationCompatible */,
								layerGeneration,
								testCase.layerType,
								requiredFeatures,
							),
						`Runtime should be incompatible with ${testCase.layerType} layer`,
					);
					assert(disposeFn.calledOnce, "Dispose should be called");
				});
			});
		}
	});

	/**
	 * These tests validates that the Loader layer compatibility is correctly enforced during load / initialization.
	 */
	describe("Validation during load / initialization", () => {
		const testCases: {
			layerType: "loader" | "dataStore";
			layerSupportRequirements: ILayerCompatSupportRequirementsOverride;
			createAndLoad: (compatibilityDetails?: ILayerCompatDetails) => Promise<void>;
		}[] = [
			{
				layerType: "loader",
				layerSupportRequirements:
					loaderSupportRequirementsForRuntime as ILayerCompatSupportRequirementsOverride,
				createAndLoad: createAndLoadRuntime,
			},
			{
				layerType: "dataStore",
				layerSupportRequirements:
					dataStoreSupportRequirementsForRuntime as ILayerCompatSupportRequirementsOverride,
				createAndLoad: createAndLoadDataStore,
			},
		];

		for (const testCase of testCases) {
			describe(`Validate ${testCase.layerType} Compatibility`, () => {
				it(`Older ${testCase.layerType} is compatible`, async () => {
					await assert.doesNotReject(
						async () => testCase.createAndLoad(),
						`Older ${testCase.layerType} should be compatible`,
					);
				});

				it(`${testCase.layerType} with generation >= minSupportedGeneration is compatible`, async () => {
					const layerCompatDetails: ILayerCompatDetails = {
						pkgVersion,
						generation: testCase.layerSupportRequirements.minSupportedGeneration,
						supportedFeatures: new Set(),
					};

					await assert.doesNotReject(
						async () => testCase.createAndLoad(layerCompatDetails),
						`${testCase.layerType} with generation >= minSupportedGeneration should be compatible`,
					);
				});

				it(`${testCase.layerType} with generation < minSupportedGeneration is not compatible`, async () => {
					const layerGeneration = testCase.layerSupportRequirements.minSupportedGeneration - 1;
					const layerCompatDetails: ILayerCompatDetails = {
						pkgVersion,
						generation: layerGeneration,
						supportedFeatures: new Set(),
					};

					await assert.rejects(
						async () => testCase.createAndLoad(layerCompatDetails),
						(error: Error) =>
							validateFailureProperties(
								error,
								false /* isGenerationCompatible */,
								layerGeneration,
								testCase.layerType,
							),
						`${testCase.layerType} with generation < minSupportedGeneration should be incompatible`,
					);
				});
			});
		}
	});

	describe("DisableStrictLoaderLayerCompatibilityCheck config for missing loader compat details", () => {
		let originalMinSupportedGeneration: number;
		let mc: MonitoringContext;
		let logger: MockLogger;
		let configProvider: ReturnType<typeof createTestConfigProvider>;

		beforeEach(() => {
			const loaderSupportRequirements =
				loaderSupportRequirementsForRuntime as ILayerCompatSupportRequirementsOverride;
			// Set up incompatible configuration
			originalMinSupportedGeneration = loaderSupportRequirements.minSupportedGeneration;
			loaderSupportRequirements.minSupportedGeneration = 1;

			configProvider = createTestConfigProvider();
			logger = new MockLogger();
			mc = mixinMonitoringContext(logger.toTelemetryLogger(), configProvider);
		});

		afterEach(() => {
			// Restore original configuration
			const loaderSupportRequirements =
				loaderSupportRequirementsForRuntime as ILayerCompatSupportRequirementsOverride;
			loaderSupportRequirements.minSupportedGeneration = originalMinSupportedGeneration;
		});

		it("DisableStrictLoaderLayerCompatibilityCheck = undefined (default) should fail validation", () => {
			const disposeFn = Sinon.fake();
			assert.throws(
				() => validateLoaderCompatibility(undefined /* maybeCompatDetails */, disposeFn, mc),
				(error: Error) => isLayerIncompatibilityError(error),
				"Should throw LayerIncompatibilityError when loader compat details are missing and strict check is enabled",
			);
			assert(disposeFn.calledOnce, "Dispose should be called");
			logger.assertMatch([
				{
					eventName: "LayerIncompatibilityError",
				},
			]);
		});

		it("DisableStrictLoaderLayerCompatibilityCheck = false should fail validation", () => {
			configProvider.set(disableStrictLoaderLayerCompatibilityCheckKey, false);
			const disposeFn = Sinon.fake();
			assert.throws(
				() => validateLoaderCompatibility(undefined /* maybeCompatDetails */, disposeFn, mc),
				(error: Error) => isLayerIncompatibilityError(error),
				"Should throw LayerIncompatibilityError when loader compat details are missing and strict check is enabled",
			);
			assert(disposeFn.calledOnce, "Dispose should be called");
			logger.assertMatch([
				{
					eventName: "LayerIncompatibilityError",
				},
			]);
		});

		it("DisableStrictLoaderLayerCompatibilityCheck = true should skip validation", () => {
			configProvider.set(disableStrictLoaderLayerCompatibilityCheckKey, true);
			const disposeFn = Sinon.fake();
			assert.doesNotThrow(
				() => validateLoaderCompatibility(undefined /* maybeCompatDetails */, disposeFn, mc),
				"Should not throw when loader compat details are missing and strict check is enabled",
			);
			assert(disposeFn.notCalled, "Dispose should not be called");
			logger.assertMatch([
				{
					eventName: "LayerIncompatibilityDetectedButBypassed",
				},
			]);
		});
	});
});
