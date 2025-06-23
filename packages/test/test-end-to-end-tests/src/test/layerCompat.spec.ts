/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import type {
	ILayerCompatDetails,
	ILayerCompatSupportRequirements,
} from "@fluid-internal/client-utils";
import type { TestDriverTypes } from "@fluid-internal/test-driver-definitions";
import {
	describeCompat,
	itExpects,
	type ExpectedEvents,
} from "@fluid-private/test-version-utils";
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
import { type ITelemetryBaseProperties } from "@fluidframework/core-interfaces/internal";
import {
	dataStoreCompatDetailsForRuntime,
	dataStoreCoreCompatDetails,
	runtimeSupportRequirementsForDataStore,
} from "@fluidframework/datastore/internal";
import { localDriverCompatDetailsForLoader } from "@fluidframework/local-driver/internal";
import { odspDriverCompatDetailsForLoader } from "@fluidframework/odsp-driver/internal";
import { r11sDriverCompatDetailsForLoader } from "@fluidframework/routerlicious-driver/internal";
import { isUsageError, ITestObjectProvider } from "@fluidframework/test-utils/internal";

type ILayerCompatSupportRequirementsOverride = Omit<
	ILayerCompatSupportRequirements,
	"requiredFeatures" | "minSupportedGeneration"
> & {
	requiredFeatures: ILayerCompatSupportRequirements["requiredFeatures"];
	minSupportedGeneration: ILayerCompatSupportRequirements["minSupportedGeneration"];
};

type LayerType = "Driver" | "Loader" | "Runtime" | "DataStore";

interface ILayerValidationProps {
	type: LayerType;
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
	layerValidationProps: ILayerValidationProps[],
	unsupportedFeatures?: string[],
): boolean {
	assert(isUsageError(error), "Error should be a usageError");
	const telemetryProps = error.getTelemetryProperties();
	assert(typeof telemetryProps.errorDetails === "string", "Error details should be present");
	const properties = JSON.parse(telemetryProps.errorDetails) as ITelemetryBaseProperties;
	assert.strictEqual(
		properties.isGenerationCompatible,
		isGenerationCompatible,
		"Generation compatibility not as expected",
	);
	assert.strictEqual(
		properties.minSupportedGeneration,
		minSupportedGeneration,
		"Minimum supported generation not as expected",
	);
	assert.deepStrictEqual(
		properties.unsupportedFeatures,
		unsupportedFeatures,
		"Unsupported features not as expected",
	);

	for (const { type, pkgVersion, generation } of layerValidationProps) {
		let layerVersion: string;
		let layerGeneration: number;
		switch (type) {
			case "Driver":
				layerVersion = properties.driverVersion as string;
				layerGeneration = properties.driverGeneration as number;
				break;
			case "Loader":
				layerVersion = properties.loaderVersion as string;
				layerGeneration = properties.loaderGeneration as number;
				break;
			case "Runtime":
				layerVersion = properties.runtimeVersion as string;
				layerGeneration = properties.runtimeGeneration as number;
				break;
			case "DataStore":
				layerVersion = properties.dataStoreVersion as string;
				layerGeneration = properties.dataStoreGeneration as number;
				break;
			default:
				assert.fail(`Unexpected layer type: ${type}`);
		}
		assert.strictEqual(layerVersion, pkgVersion, `${type} version not as expected`);
		assert.strictEqual(layerGeneration, generation, `${type} generation not as expected`);
	}
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
	layer1: LayerType,
	layer2: LayerType,
	driverType?: TestDriverTypes,
): {
	layer1SupportRequirements: ILayerCompatSupportRequirementsOverride;
	layer1Version: string;
	layer1Generation: number;
	layer2CompatDetails: ILayerCompatDetails;
} {
	switch (`${layer1}-${layer2}`) {
		case "Loader-Driver":
			assert(
				driverType !== undefined,
				"Driver type must be provided for Loader-Driver combination",
			);
			return {
				layer1SupportRequirements:
					driverSupportRequirementsForLoader as ILayerCompatSupportRequirementsOverride,
				layer1Version: loaderCoreCompatDetails.pkgVersion,
				layer1Generation: loaderCoreCompatDetails.generation,
				layer2CompatDetails: getDriverCompatDetailsForLoader(driverType),
			};
		case "Loader-Runtime":
			return {
				layer1SupportRequirements:
					runtimeSupportRequirementsForLoader as ILayerCompatSupportRequirementsOverride,
				layer1Version: loaderCoreCompatDetails.pkgVersion,
				layer1Generation: loaderCoreCompatDetails.generation,
				layer2CompatDetails: runtimeCompatDetailsForLoader,
			};
		case "Runtime-Loader":
			return {
				layer1SupportRequirements:
					loaderSupportRequirementsForRuntime as ILayerCompatSupportRequirementsOverride,
				layer1Version: runtimeCoreCompatDetails.pkgVersion,
				layer1Generation: runtimeCoreCompatDetails.generation,
				layer2CompatDetails: loaderCompatDetailsForRuntime,
			};
		case "Runtime-DataStore":
			return {
				layer1SupportRequirements:
					dataStoreSupportRequirementsForRuntime as ILayerCompatSupportRequirementsOverride,
				layer1Version: runtimeCoreCompatDetails.pkgVersion,
				layer1Generation: runtimeCoreCompatDetails.generation,
				layer2CompatDetails: dataStoreCompatDetailsForRuntime,
			};
		case "DataStore-Runtime":
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

async function createAndLoadContainers(provider: ITestObjectProvider) {
	await provider.makeTestContainer();
	await provider.loadTestContainer();
}

describeCompat("Layer compatibility", "NoCompat", (getTestObjectProvider) => {
	let provider: ITestObjectProvider;
	beforeEach("getTestObjectProvider", function () {
		provider = getTestObjectProvider();
	});

	// The combinations of the layers for which we support compatibility. Here, layer1 will validate that
	// layer2 is compatible with it. The order of the layers matters, as the compatibility check is directional.
	const layerCombinations: { layer1: LayerType; layer2: LayerType }[] = [
		{
			layer1: "Loader",
			layer2: "Driver",
		},
		{
			layer1: "Loader",
			layer2: "Runtime",
		},
		{
			layer1: "Runtime",
			layer2: "Loader",
		},
		{
			layer1: "Runtime",
			layer2: "DataStore",
		},
		{
			layer1: "DataStore",
			layer2: "Runtime",
		},
		// This will be enabled once Runtime / Driver compatibility enforcement is implemented - AB#33773.
		// {
		// 	layer1: "Runtime",
		// 	layer2: "Driver",
		// },
	];

	for (const { layer1, layer2 } of layerCombinations) {
		describe(`${layer1} / ${layer2} compatibility`, () => {
			// The container disposes with a usage error event if the compatibility check fails.
			const expectedErrorEvents: ExpectedEvents = [
				{ eventName: "fluid:telemetry:Container:ContainerDispose", errorType: "usageError" },
			];

			// In case of validating compatibility of DataStore with Runtime, we expect an additional error event
			// when the data store context tries to attach the data store runtime. This is logged before the
			// container dispose event.
			if (layer2 === "DataStore") {
				expectedErrorEvents.unshift({
					eventName: "fluid:telemetry:FluidDataStoreContext:AttachRuntimeError",
					errorType: "usageError",
				});
			}

			let originalRequiredFeatures: readonly string[];
			let originalMinSupportedGeneration: number;
			let layer1SupportRequirements: ILayerCompatSupportRequirementsOverride;
			let layer1Version: string;
			let layer1Generation: number;
			let layer2CompatDetails: ILayerCompatDetails;

			before("setup", function () {
				if (layer1 !== "Driver" && layer2 !== "Driver" && provider.driver.type !== "local") {
					// These tests need to run for every driver only if one of the layers is a driver.
					// Otherwise, they are driver agnostic, so skip them for non-local drivers.
					this.skip();
				}
			});

			beforeEach(function () {
				const testParams = getLayerTestParams(layer1, layer2, provider.driver.type);
				layer1SupportRequirements = testParams.layer1SupportRequirements;
				layer1Version = testParams.layer1Version;
				layer1Generation = testParams.layer1Generation;
				layer2CompatDetails = testParams.layer2CompatDetails;
				originalRequiredFeatures = [...layer1SupportRequirements.requiredFeatures];
				originalMinSupportedGeneration = layer1SupportRequirements.minSupportedGeneration;
			});

			afterEach(() => {
				layer1SupportRequirements.requiredFeatures = [...originalRequiredFeatures];
				layer1SupportRequirements.minSupportedGeneration = originalMinSupportedGeneration;
			});

			it(`${layer2} is compatible with ${layer1}`, async () => {
				layer1SupportRequirements.requiredFeatures = [
					...layer2CompatDetails.supportedFeatures,
				];
				layer1SupportRequirements.minSupportedGeneration = layer2CompatDetails.generation;

				await assert.doesNotReject(
					createAndLoadContainers(provider),
					`${layer2} should be compatible with ${layer1}`,
				);
			});

			itExpects(
				`${layer2} generation is not compatible with ${layer1}`,
				expectedErrorEvents,
				async () => {
					layer1SupportRequirements.requiredFeatures = [
						...layer2CompatDetails.supportedFeatures,
					];
					layer1SupportRequirements.minSupportedGeneration =
						layer2CompatDetails.generation + 1;
					await assert.rejects(
						createAndLoadContainers(provider),
						(e: Error) =>
							validateFailureProperties(
								e,
								false /* isGenerationCompatible */,
								layer1SupportRequirements.minSupportedGeneration,
								[
									{ type: layer1, pkgVersion: layer1Version, generation: layer1Generation },
									{
										type: layer2,
										pkgVersion: layer2CompatDetails.pkgVersion,
										generation: layer2CompatDetails.generation,
									},
								],
							),
						`${layer2}'s generation should not be compatible with ${layer1}`,
					);
				},
			);

			itExpects(
				`${layer2} supported features are not compatible with ${layer1}`,
				expectedErrorEvents,
				async () => {
					const requiredFeatures = ["feature2", "feature3"];
					layer1SupportRequirements.requiredFeatures = requiredFeatures;
					layer1SupportRequirements.minSupportedGeneration = layer2CompatDetails.generation;
					await assert.rejects(
						createAndLoadContainers(provider),
						(e: Error) =>
							validateFailureProperties(
								e,
								true /* isGenerationCompatible */,
								layer1SupportRequirements.minSupportedGeneration,
								[
									{ type: layer1, pkgVersion: layer1Version, generation: layer1Generation },
									{
										type: layer2,
										pkgVersion: layer2CompatDetails.pkgVersion,
										generation: layer2CompatDetails.generation,
									},
								],
								requiredFeatures,
							),
						`${layer2}'s supported features should not be compatible with ${layer1}`,
					);
				},
			);
		});
	}
});
