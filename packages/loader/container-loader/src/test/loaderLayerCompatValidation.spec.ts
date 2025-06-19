/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type {
	ILayerCompatDetails,
	ILayerCompatSupportRequirements,
} from "@fluid-internal/client-utils";
import type { ICriticalContainerError } from "@fluidframework/container-definitions/internal";
import {
	FluidErrorTypes,
	type ITelemetryBaseProperties,
} from "@fluidframework/core-interfaces/internal";
import {
	type IResolvedUrl,
	type IUrlResolver,
} from "@fluidframework/driver-definitions/internal";
import { isFluidError } from "@fluidframework/telemetry-utils/internal";
import Sinon from "sinon";

import { Loader } from "../loader.js";
import {
	driverSupportRequirementsForLoader,
	loaderCoreCompatDetails,
	runtimeSupportRequirementsForLoader,
	validateDriverCompatibility,
	validateRuntimeCompatibility,
} from "../loaderLayerCompatState.js";
import { pkgVersion } from "../packageVersion.js";

import { failSometimeProxy } from "./failProxy.js";
import {
	createTestCodeLoaderProxy,
	createTestDocumentServiceFactoryProxy,
} from "./testProxies.js";

type ILayerCompatSupportRequirementsOverride = Omit<
	ILayerCompatSupportRequirements,
	"requiredFeatures"
> & {
	requiredFeatures: string[];
};

function validateFailureProperties(
	error: Error,
	isGenerationCompatible: boolean,
	layerGeneration: number,
	layerType: "Runtime" | "Driver",
	unsupportedFeatures?: string[],
): boolean {
	assert(
		isFluidError(error) && error.errorType === FluidErrorTypes.usageError,
		"Error should be a usageError",
	);
	assert.strictEqual(
		error.errorType,
		FluidErrorTypes.usageError,
		"Error type should be usageError",
	);
	const telemetryProps = error.getTelemetryProperties();
	assert(typeof telemetryProps.errorDetails === "string", "Error details should be present");
	const properties = JSON.parse(telemetryProps.errorDetails) as ITelemetryBaseProperties;
	assert.strictEqual(
		properties.isGenerationCompatible,
		isGenerationCompatible,
		"Generation compatibility not as expected",
	);
	assert.strictEqual(properties.loaderVersion, pkgVersion, "Loader version not as expected");
	assert.strictEqual(
		properties.loaderGeneration,
		loaderCoreCompatDetails.generation,
		"Loader generation not as expected",
	);
	assert.deepStrictEqual(
		properties.unsupportedFeatures,
		unsupportedFeatures,
		"Unsupported features not as expected",
	);

	if (layerType === "Runtime") {
		assert.strictEqual(
			properties.runtimeVersion,
			pkgVersion,
			"Runtime version not as expected",
		);
		assert.strictEqual(
			properties.runtimeGeneration,
			layerGeneration,
			"Runtime generation not as expected",
		);
	} else {
		assert.strictEqual(properties.driverVersion, pkgVersion, "Driver version not as expected");
		assert.strictEqual(
			properties.driverGeneration,
			layerGeneration,
			"Driver generation not as expected",
		);
	}
	return true;
}

describe("Loader Layer compatibility", () => {
	/**
	 * These tests ensure that the validation logic for layer compatibility is correct
	 * and has the correct error / properties.
	 */
	describe("Validation error and properties", () => {
		const testCases: {
			layerType: "Runtime" | "Driver";
			layerSupportRequirements: ILayerCompatSupportRequirementsOverride;
			validateCompatibility: (
				maybeCompatDetails: ILayerCompatDetails | undefined,
				disposeFn: (error?: ICriticalContainerError) => void,
			) => void;
		}[] = [
			{
				layerType: "Runtime",
				validateCompatibility: validateRuntimeCompatibility,
				layerSupportRequirements:
					runtimeSupportRequirementsForLoader as ILayerCompatSupportRequirementsOverride,
			},
			{
				layerType: "Driver",
				validateCompatibility: validateDriverCompatibility,
				layerSupportRequirements:
					driverSupportRequirementsForLoader as ILayerCompatSupportRequirementsOverride,
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
				it(`Loader is compatible with old ${testCase.layerType} (pre-enforcement)`, () => {
					// Older layer will not have ILayerCompatDetails defined.
					assert.doesNotThrow(
						() =>
							testCase.validateCompatibility(undefined /* maybeCompatDetails */, () => {
								throw new Error("should not dispose");
							}),
						`Loader should be compatible with older ${testCase.layerType} layer`,
					);
				});

				it(`Loader generation and features are compatible with ${testCase.layerType}`, () => {
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
						`Loader should be compatible with ${testCase.layerType} layer`,
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
						`Loader should be incompatible with ${testCase.layerType} layer`,
					);
					assert(disposeFn.calledOnce, "Dispose should be called");
				});

				it(`Loader features are incompatible with ${testCase.layerType}`, () => {
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
						`Loader should be incompatible with ${testCase.layerType} layer`,
					);
					assert(disposeFn.calledOnce, "Dispose should be called");
				});

				it(`Loader generation and features are both incompatible with ${testCase.layerType}`, () => {
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
						`Loader should be incompatible with ${testCase.layerType} layer`,
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
			layerType: "Runtime" | "Driver";
			layerSupportRequirements: ILayerCompatSupportRequirementsOverride;
		}[] = [
			{
				layerType: "Runtime",
				layerSupportRequirements:
					runtimeSupportRequirementsForLoader as ILayerCompatSupportRequirementsOverride,
			},
			{
				layerType: "Driver",
				layerSupportRequirements:
					driverSupportRequirementsForLoader as ILayerCompatSupportRequirementsOverride,
			},
		];

		const resolvedUrl: IResolvedUrl = {
			id: "none",
			endpoints: {},
			tokens: {},
			type: "fluid",
			url: "none",
		};
		const urlResolver = failSometimeProxy<IUrlResolver>({
			resolve: async () => resolvedUrl,
		});

		async function createAndAttachContainer(loader: Loader): Promise<void> {
			const container = await loader.createDetachedContainer({ package: "none" });
			await container.attach({ url: "none" });
		}

		for (const testCase of testCases) {
			describe(`Validate ${testCase.layerType} Compatibility`, () => {
				it(`Older ${testCase.layerType} is compatible`, async () => {
					const loader = new Loader({
						codeLoader: createTestCodeLoaderProxy(),
						documentServiceFactory: createTestDocumentServiceFactoryProxy(resolvedUrl),
						urlResolver,
					});
					await assert.doesNotReject(
						async () => createAndAttachContainer(loader),
						`Older ${testCase.layerType} should be compatible`,
					);
				});

				it(`${testCase.layerType} with generation >= minSupportedGeneration is compatible`, async () => {
					const layerCompatDetails: ILayerCompatDetails = {
						pkgVersion,
						generation: testCase.layerSupportRequirements.minSupportedGeneration,
						supportedFeatures: new Set(),
					};
					const loader = new Loader({
						codeLoader: createTestCodeLoaderProxy(
							testCase.layerType === "Runtime" ? { layerCompatDetails } : {},
						),
						documentServiceFactory: createTestDocumentServiceFactoryProxy(
							resolvedUrl,
							testCase.layerType === "Driver" ? layerCompatDetails : undefined,
						),
						urlResolver,
					});

					await assert.doesNotReject(
						async () => createAndAttachContainer(loader),
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
					const loader = new Loader({
						codeLoader: createTestCodeLoaderProxy(
							testCase.layerType === "Runtime" ? { layerCompatDetails } : {},
						),
						documentServiceFactory: createTestDocumentServiceFactoryProxy(
							resolvedUrl,
							testCase.layerType === "Driver" ? layerCompatDetails : undefined,
						),
						urlResolver,
					});

					await assert.rejects(
						async () => createAndAttachContainer(loader),
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
});
