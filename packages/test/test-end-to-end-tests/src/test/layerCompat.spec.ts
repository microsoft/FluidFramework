/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import type {
	FluidLayer,
	ILayerCompatDetails,
	ILayerCompatSupportRequirements,
} from "@fluid-internal/client-utils";
import type { TestDriverTypes } from "@fluid-internal/test-driver-definitions";
import {
	describeCompat,
	itExpects,
	type ExpectedEvents,
} from "@fluid-private/test-version-utils";
import type { IContainer } from "@fluidframework/container-definitions/internal";
import {
	driverSupportRequirementsForLoader,
	loaderCompatDetailsForRuntime,
	loaderCoreCompatDetails,
	runtimeSupportRequirementsForLoader,
} from "@fluidframework/container-loader/internal";
import {
	dataStoreSupportRequirementsForRuntime,
	loaderSupportRequirementsForRuntime,
	runtimeCompatDetailsForDataStore,
	runtimeCompatDetailsForLoader,
	runtimeCoreCompatDetails,
} from "@fluidframework/container-runtime/internal";
import {
	FluidErrorTypes,
	type ITelemetryBaseProperties,
} from "@fluidframework/core-interfaces/internal";
import {
	dataStoreCompatDetailsForRuntime,
	dataStoreCoreCompatDetails,
	runtimeSupportRequirementsForDataStore,
} from "@fluidframework/datastore/internal";
import { localDriverCompatDetailsForLoader } from "@fluidframework/local-driver/internal";
import { odspDriverCompatDetailsForLoader } from "@fluidframework/odsp-driver/internal";
import { r11sDriverCompatDetailsForLoader } from "@fluidframework/routerlicious-driver/internal";
import {
	allowIncompatibleLayersKey,
	isLayerIncompatibilityError,
	MockLogger,
} from "@fluidframework/telemetry-utils/internal";
import {
	createTestConfigProvider,
	ITestObjectProvider,
} from "@fluidframework/test-utils/internal";

type ILayerCompatSupportRequirementsOverride = Omit<
	ILayerCompatSupportRequirements,
	"requiredFeatures" | "minSupportedGeneration"
> & {
	requiredFeatures: ILayerCompatSupportRequirements["requiredFeatures"];
	minSupportedGeneration: ILayerCompatSupportRequirements["minSupportedGeneration"];
};

interface ILayerValidationProps {
	type: FluidLayer;
	pkgVersion: string;
	generation: number;
}

/**
 * Validates the properties of a failure that occurs when a layer compatibility check fails.
 * @param error - The error thrown during the compatibility check.
 * @param isGenerationCompatible - Whether the generation compatibility is expected to be true or false.
 * @param minSupportedGeneration - The minimum supported generation for the layer that failed compatibility.
 * @param layerValidationProps - Properties of the layers to be validated against the properties in the error.
 * @param unsupportedFeatures - Features unsupported by the layer that failed validation, if any.
 * @returns True if validation passes, otherwise throws an assertion error.
 */
function validateFailureProperties(
	error: Error,
	isGenerationCompatible: boolean,
	minSupportedGeneration: number,
	layer1ValidationProps: ILayerValidationProps,
	layer2ValidationProps: ILayerValidationProps,
	unsupportedFeatures?: string[],
): boolean {
	assert(isLayerIncompatibilityError(error), "Error should be a layerIncompatibilityError");
	const detailedProperties = JSON.parse(error.details) as ITelemetryBaseProperties;
	assert.strictEqual(
		detailedProperties.isGenerationCompatible,
		isGenerationCompatible,
		"Generation compatibility not as expected",
	);
	assert.strictEqual(
		detailedProperties.minSupportedGeneration,
		minSupportedGeneration,
		"Minimum supported generation not as expected",
	);
	assert.deepStrictEqual(
		detailedProperties.unsupportedFeatures,
		unsupportedFeatures,
		"Unsupported features not as expected",
	);

	assert.strictEqual(error.layer, layer1ValidationProps.type, "Layer type not as expected");
	assert.strictEqual(
		error.incompatibleLayer,
		layer2ValidationProps.type,
		"Incompatible layer type not as expected",
	);
	assert.strictEqual(
		error.layerVersion,
		layer1ValidationProps.pkgVersion,
		"Layer version not as expected",
	);
	assert.strictEqual(
		error.incompatibleLayerVersion,
		layer2ValidationProps.pkgVersion,
		"Incompatible layer version not as expected",
	);
	assert.strictEqual(
		detailedProperties.layerGeneration,
		layer1ValidationProps.generation,
		"Layer generation not as expected",
	);
	assert.strictEqual(
		detailedProperties.incompatibleLayerGeneration,
		layer2ValidationProps.generation,
		"Incompatible layer generation not as expected",
	);
	return true;
}

/**
 * Returns the compatibility details for the driver layer based on the provided driver type.
 * @param driverType - The type of driver for which compatibility details are required.
 * @returns The compatibility details for the specified driver type.
 */
function getDriverCompatDetailsForLoader(driverType: TestDriverTypes): ILayerCompatDetails {
	switch (driverType) {
		case "tinylicious":
		case "t9s":
		case "routerlicious":
		case "r11s":
			return r11sDriverCompatDetailsForLoader;
		case "odsp":
			return odspDriverCompatDetailsForLoader;
		case "local":
			return localDriverCompatDetailsForLoader;
		default:
			assert.fail(`Unexpected driver type: ${driverType}`);
	}
}

/**
 * Returns the parameters required for testing that layer2 is compatible with layer1.
 * @param layer1 - The layer that is validating compatibility.
 * @param layer2 - The layer that is being validated for compatibility.
 * @param driverType - The type of driver, if applicable (only used for compatibility involving the driver layer).
 * @returns An object containing the support requirements for layer1, its version, generation, and compatibility
 * details for layer2.
 */
function getLayerTestParams(
	layer1: FluidLayer,
	layer2: FluidLayer,
	driverType?: TestDriverTypes,
): {
	layer1SupportRequirements: ILayerCompatSupportRequirementsOverride;
	layer1Version: string;
	layer1Generation: number;
	layer2CompatDetails: ILayerCompatDetails;
} {
	switch (`${layer1}-${layer2}`) {
		case "loader-driver":
			assert(
				driverType !== undefined,
				"Driver type must be provided for loader-driver combination",
			);
			return {
				layer1SupportRequirements:
					driverSupportRequirementsForLoader as ILayerCompatSupportRequirementsOverride,
				layer1Version: loaderCoreCompatDetails.pkgVersion,
				layer1Generation: loaderCoreCompatDetails.generation,
				layer2CompatDetails: getDriverCompatDetailsForLoader(driverType),
			};
		case "loader-runtime":
			return {
				layer1SupportRequirements:
					runtimeSupportRequirementsForLoader as ILayerCompatSupportRequirementsOverride,
				layer1Version: loaderCoreCompatDetails.pkgVersion,
				layer1Generation: loaderCoreCompatDetails.generation,
				layer2CompatDetails: runtimeCompatDetailsForLoader,
			};
		case "runtime-loader":
			return {
				layer1SupportRequirements:
					loaderSupportRequirementsForRuntime as ILayerCompatSupportRequirementsOverride,
				layer1Version: runtimeCoreCompatDetails.pkgVersion,
				layer1Generation: runtimeCoreCompatDetails.generation,
				layer2CompatDetails: loaderCompatDetailsForRuntime,
			};
		case "runtime-dataStore":
			return {
				layer1SupportRequirements:
					dataStoreSupportRequirementsForRuntime as ILayerCompatSupportRequirementsOverride,
				layer1Version: runtimeCoreCompatDetails.pkgVersion,
				layer1Generation: runtimeCoreCompatDetails.generation,
				layer2CompatDetails: dataStoreCompatDetailsForRuntime,
			};
		case "dataStore-runtime":
			return {
				layer1SupportRequirements:
					runtimeSupportRequirementsForDataStore as ILayerCompatSupportRequirementsOverride,
				layer1Version: dataStoreCoreCompatDetails.pkgVersion,
				layer1Generation: dataStoreCoreCompatDetails.generation,
				layer2CompatDetails: runtimeCompatDetailsForDataStore,
			};
		default:
			assert.fail(`Unexpected layer combination: ${layer1} / ${layer2}`);
	}
}

/**
 * Layer validation will result in telemetry events if incompatibility is detected. Depending on the layers
 * involved and the flow (container create or load), the events may differ. This function returns the expected
 * events for a given combination of layers and flow.
 */
function getExpectedErrorEvents(
	layer1: FluidLayer,
	layer2: FluidLayer,
	flow: "create" | "load",
): ExpectedEvents {
	// The container disposes with a usage error event if the compatibility check fails.
	const expectedErrorEvents: ExpectedEvents = [
		{
			eventName: "fluid:telemetry:Container:ContainerDispose",
			errorType: FluidErrorTypes.layerIncompatibilityError,
		},
	];

	// Loader layer validates Driver compatibility during container creation, so if it fails,
	// there is no container to dispose of and we won't get the dispose event.
	if (layer1 === "loader" && layer2 === "driver") {
		expectedErrorEvents.pop();
	}

	// In case of validating Runtime and DataStore, we expect one of the following addition error events
	// to be logged before the container dispose event:
	if ((layer1 === "dataStore" || layer2 === "dataStore") && flow === "load") {
		// In load flows, the layer compat validation in the Runtime and the DataStore layers both happen
		// during data store realization, so we expect this error event to be logged.
		expectedErrorEvents.unshift({
			eventName: "fluid:telemetry:FluidDataStoreContext:RealizeError",
			errorType: FluidErrorTypes.layerIncompatibilityError,
		});
	} else if (layer2 === "dataStore" && flow === "create") {
		// In create flows, the layer compat validation in the Runtime layer happens during data store runtime
		// attach, so we expect this error event to be logged.
		// However, the validation in the DataStore layer happens during its creation which is outside of the
		// data store runtime attach flow, so we do not expect this error event to be logged.
		expectedErrorEvents.unshift({
			eventName: "fluid:telemetry:FluidDataStoreContext:AttachRuntimeError",
			errorType: FluidErrorTypes.layerIncompatibilityError,
		});
	}

	let telemetryNamespace: string = ":";
	switch (layer1) {
		case "loader":
			telemetryNamespace = ":Container:";
			break;
		case "runtime":
			telemetryNamespace =
				layer2 === "dataStore" ? ":FluidDataStoreContext:" : ":ContainerRuntime:";
			break;
		case "dataStore":
			telemetryNamespace = ":FluidDataStoreRuntime:";
			break;
		default:
			assert.fail(`Unexpected layer type: ${layer1}`);
	}

	expectedErrorEvents.unshift({
		eventName: `fluid:telemetry${telemetryNamespace}LayerIncompatibilityError`,
		category: "error",
	});
	return expectedErrorEvents;
}

describeCompat("Layer compatibility validation", "NoCompat", (getTestObjectProvider) => {
	let provider: ITestObjectProvider;
	beforeEach("getTestObjectProvider", function () {
		provider = getTestObjectProvider();
	});

	// The combinations of the layers for which we support compatibility. Here, layer1 will validate that
	// layer2 is compatible with it. The order of the layers matters, as the compatibility check is directional.
	const layerCombinations: { layer1: FluidLayer; layer2: FluidLayer }[] = [
		{
			layer1: "loader",
			layer2: "driver",
		},
		{
			layer1: "loader",
			layer2: "runtime",
		},
		{
			layer1: "runtime",
			layer2: "loader",
		},
		{
			layer1: "runtime",
			layer2: "dataStore",
		},
		{
			layer1: "dataStore",
			layer2: "runtime",
		},
	];

	for (const { layer1, layer2 } of layerCombinations) {
		describe(`${layer1} / ${layer2} compatibility`, () => {
			let originalRequiredFeatures: readonly string[];
			let originalMinSupportedGeneration: number;
			let layer1SupportRequirements: ILayerCompatSupportRequirementsOverride;
			let layer1Version: string;
			let layer1Generation: number;
			let layer2CompatDetails: ILayerCompatDetails;

			beforeEach(async function () {
				if (layer1 !== "driver" && layer2 !== "driver" && provider.driver.type !== "local") {
					// These tests need to run for every driver only if one of the layers is a driver.
					// Otherwise, they are driver agnostic, so skip them for non-local drivers.
					this.skip();
				}

				const testParams = getLayerTestParams(layer1, layer2, provider.driver.type);
				layer1SupportRequirements = testParams.layer1SupportRequirements;
				layer1Version = testParams.layer1Version;
				layer1Generation = testParams.layer1Generation;
				layer2CompatDetails = testParams.layer2CompatDetails;
				originalRequiredFeatures = [...layer1SupportRequirements.requiredFeatures];
				originalMinSupportedGeneration = layer1SupportRequirements.minSupportedGeneration;
			});

			afterEach(function () {
				if (layer1 !== "driver" && layer2 !== "driver" && provider.driver.type !== "local") {
					// If the test was skipped, the original vales would not be set, so skip the reset.
					this.skip();
				}

				layer1SupportRequirements.requiredFeatures = [...originalRequiredFeatures];
				layer1SupportRequirements.minSupportedGeneration = originalMinSupportedGeneration;
			});

			// The tests validate both the container creation and load flows since the validation happens
			// during different phases of the container lifecycle in these flows.
			type CreateOrLoad = "create" | "load";

			// In the validation step, we create or load a container based on the flow type.
			async function validationStep(flow: CreateOrLoad): Promise<IContainer> {
				return flow === "create" ? provider.makeTestContainer() : provider.loadTestContainer();
			}

			const createOrLoadFlows: CreateOrLoad[] = ["create", "load"];

			for (const flow of createOrLoadFlows) {
				// The container disposes with a usage error event if the compatibility check fails.
				const expectedErrorEvents = getExpectedErrorEvents(layer1, layer2, flow);

				describe(`${flow} flow`, () => {
					beforeEach(async function () {
						// During load flow, container creation happens during setup and the validation happens
						// during container load.
						if (flow === "load") {
							await provider.makeTestContainer();
						}
					});

					it(`${layer2} is compatible with ${layer1} - ${flow} flow`, async () => {
						layer1SupportRequirements.requiredFeatures = [
							...layer2CompatDetails.supportedFeatures,
						];
						layer1SupportRequirements.minSupportedGeneration = layer2CompatDetails.generation;

						await assert.doesNotReject(
							validationStep(flow),
							`${layer2} should be compatible with ${layer1}`,
						);
					});

					itExpects(
						`${layer2} generation is not compatible with ${layer1} - ${flow} flow`,
						expectedErrorEvents,
						async () => {
							layer1SupportRequirements.requiredFeatures = [
								...layer2CompatDetails.supportedFeatures,
							];
							layer1SupportRequirements.minSupportedGeneration =
								layer2CompatDetails.generation + 1;
							await assert.rejects(
								validationStep(flow),
								(e: Error) =>
									validateFailureProperties(
										e,
										false /* isGenerationCompatible */,
										layer1SupportRequirements.minSupportedGeneration,
										{
											type: layer1,
											pkgVersion: layer1Version,
											generation: layer1Generation,
										},
										{
											type: layer2,
											pkgVersion: layer2CompatDetails.pkgVersion,
											generation: layer2CompatDetails.generation,
										},
									),
								`${layer2}'s generation should not be compatible with ${layer1}`,
							);
						},
					);

					itExpects(
						`${layer2} supported features are not compatible with ${layer1} - ${flow} flow`,
						expectedErrorEvents,
						async () => {
							const requiredFeatures = ["feature2", "feature3"];
							layer1SupportRequirements.requiredFeatures = requiredFeatures;
							layer1SupportRequirements.minSupportedGeneration =
								layer2CompatDetails.generation;
							await assert.rejects(
								validationStep(flow),
								(e: Error) =>
									validateFailureProperties(
										e,
										true /* isGenerationCompatible */,
										layer1SupportRequirements.minSupportedGeneration,
										{
											type: layer1,
											pkgVersion: layer1Version,
											generation: layer1Generation,
										},
										{
											type: layer2,
											pkgVersion: layer2CompatDetails.pkgVersion,
											generation: layer2CompatDetails.generation,
										},
										requiredFeatures,
									),
								`${layer2}'s supported features should not be compatible with ${layer1}`,
							);
						},
					);
				});
			}
		});
	}

	describe("Config flag to disable layer compatibility validation", () => {
		it("allowIncompatibleLayersKey set to true disables validation during container creation", async () => {
			// Get test params for a layer combination that would normally fail validation
			const testParams = getLayerTestParams("runtime", "dataStore");
			const layer1SupportRequirements = testParams.layer1SupportRequirements;

			// Set up incompatible configuration
			const originalMinSupportedGeneration = layer1SupportRequirements.minSupportedGeneration;
			layer1SupportRequirements.minSupportedGeneration =
				testParams.layer2CompatDetails.generation + 1;

			try {
				// Create config provider with validation disabled
				const configProvider = createTestConfigProvider();
				configProvider.set(allowIncompatibleLayersKey, true);

				// This should NOT throw an error even though the layers are incompatible
				const logger = new MockLogger();
				await assert.doesNotReject(
					provider.makeTestContainer({ loaderProps: { configProvider, logger } }),
					"Container creation should succeed when layer validation is disabled",
				);
				logger.assertMatch([
					{
						eventName:
							"fluid:telemetry:FluidDataStoreContext:LayerIncompatibilityDetectedButBypassed",
					},
				]);

				// Try again and make sure the bypass event is not logged again because it should only be logged
				// once per session.
				const logger2 = new MockLogger();
				await assert.doesNotReject(
					provider.loadTestContainer({ loaderProps: { configProvider, logger: logger2 } }),
					"Container load should succeed when layer validation is disabled",
				);
				logger2.assertMatchNone([
					{
						eventName:
							"fluid:telemetry:FluidDataStoreContext:LayerIncompatibilityDetectedButBypassed",
					},
				]);
			} finally {
				// Restore original value
				layer1SupportRequirements.minSupportedGeneration = originalMinSupportedGeneration;
			}
		});

		it("allowIncompatibleLayersKey set to true disables validation during container load", async () => {
			// Get test params for a layer combination that would normally fail validation
			const testParams = getLayerTestParams("runtime", "dataStore");
			const layer1SupportRequirements = testParams.layer1SupportRequirements;

			// First create a container normally
			await provider.makeTestContainer();

			// Set up incompatible configuration
			const originalMinSupportedGeneration = layer1SupportRequirements.minSupportedGeneration;
			layer1SupportRequirements.minSupportedGeneration =
				testParams.layer2CompatDetails.generation + 1;

			try {
				// Create config provider with validation disabled
				const configProvider = createTestConfigProvider();
				configProvider.set(allowIncompatibleLayersKey, true);

				// This should NOT throw an error even though the layers are incompatible
				await assert.doesNotReject(
					provider.loadTestContainer({ loaderProps: { configProvider } }),
					"Container load should succeed when layer validation is disabled",
				);
			} finally {
				// Restore original value
				layer1SupportRequirements.minSupportedGeneration = originalMinSupportedGeneration;
			}
		});

		itExpects(
			"allowIncompatibleLayersKey set to false (default) enables validation",
			[
				{ eventName: "fluid:telemetry:FluidDataStoreContext:LayerIncompatibilityError" },
				{ eventName: "fluid:telemetry:FluidDataStoreContext:AttachRuntimeError" },
				{ eventName: "fluid:telemetry:Container:ContainerDispose" },
			],
			async () => {
				// Get test params for a layer combination that would normally fail validation
				const testParams = getLayerTestParams("runtime", "dataStore");
				const layer1SupportRequirements = testParams.layer1SupportRequirements;

				// Set up incompatible configuration
				const originalMinSupportedGeneration =
					layer1SupportRequirements.minSupportedGeneration;
				layer1SupportRequirements.minSupportedGeneration =
					testParams.layer2CompatDetails.generation + 1;

				try {
					// Create config provider with validation explicitly set to false
					const configProvider = createTestConfigProvider();
					configProvider.set(allowIncompatibleLayersKey, false);

					// This SHOULD throw an error because the layers are incompatible
					await assert.rejects(
						provider.makeTestContainer({ loaderProps: { configProvider } }),
						(e: Error) => isLayerIncompatibilityError(e),
						"Container creation should fail when layer validation is enabled (default behavior)",
					);
				} finally {
					// Restore original value
					layer1SupportRequirements.minSupportedGeneration = originalMinSupportedGeneration;
				}
			},
		);
	});
});
