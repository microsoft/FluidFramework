/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type {
	FluidLayer,
	ILayerCompatDetails,
	ILayerCompatSupportRequirements,
} from "@fluid-internal/client-utils";
import type { ICriticalContainerError } from "@fluidframework/container-definitions/internal";
import type { ITelemetryBaseProperties } from "@fluidframework/core-interfaces/internal";
import type { IResolvedUrl, IUrlResolver } from "@fluidframework/driver-definitions/internal";
import {
	createChildLogger,
	createChildMonitoringContext,
	isLayerIncompatibilityError,
} from "@fluidframework/telemetry-utils/internal";
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

	assert.strictEqual(error.layer, "loader", "Layer type not as expected");
	assert.strictEqual(
		error.incompatibleLayer,
		incompatibleLayer,
		"Incompatible layer type not as expected",
	);

	assert.strictEqual(error.layerVersion, pkgVersion, "Loader version not as expected");
	assert.strictEqual(
		detailedProperties.layerGeneration,
		loaderCoreCompatDetails.generation,
		"Loader generation not as expected",
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

function validateDisposeCall(
	layerType: "runtime" | "driver",
	disposeFn: Sinon.SinonSpy,
): void {
	if (layerType === "runtime") {
		// In case of "Runtime", the dispose is not called during validation. It is called as part of the overall
		// container creation / load.
		assert(disposeFn.notCalled, `Dispose should not be called for ${layerType} layer`);
	} else {
		assert(disposeFn.calledOnce, `Dispose should be called for ${layerType} layer`);
	}
}

describe("Loader Layer compatibility", () => {
	/**
	 * These tests ensure that the validation logic for layer compatibility is correct
	 * and has the correct error / properties.
	 */
	describe("Validation error and properties", () => {
		const mc = createChildMonitoringContext({ logger: createChildLogger() });
		const testCases: {
			layerType: "runtime" | "driver";
			layerSupportRequirements: ILayerCompatSupportRequirementsOverride;
			validateCompatibility: (
				maybeCompatDetails: ILayerCompatDetails | undefined,
				disposeFn: (error?: ICriticalContainerError) => void,
			) => void;
		}[] = [
			{
				layerType: "runtime",
				validateCompatibility: (maybeCompatDetails, disposeFn) =>
					validateRuntimeCompatibility(maybeCompatDetails, mc),
				layerSupportRequirements:
					runtimeSupportRequirementsForLoader as ILayerCompatSupportRequirementsOverride,
			},
			{
				layerType: "driver",
				validateCompatibility: (maybeCompatDetails, disposeFn) =>
					validateDriverCompatibility(maybeCompatDetails, disposeFn, mc),
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
					validateDisposeCall(testCase.layerType, disposeFn);
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
					validateDisposeCall(testCase.layerType, disposeFn);
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
					validateDisposeCall(testCase.layerType, disposeFn);
				});
			});
		}
	});

	/**
	 * These tests validates that the Loader layer compatibility is correctly enforced during load / initialization.
	 */
	describe("Validation during load / initialization", () => {
		const testCases: {
			layerType: "runtime" | "driver";
			layerSupportRequirements: ILayerCompatSupportRequirementsOverride;
		}[] = [
			{
				layerType: "runtime",
				layerSupportRequirements:
					runtimeSupportRequirementsForLoader as ILayerCompatSupportRequirementsOverride,
			},
			{
				layerType: "driver",
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
							testCase.layerType === "runtime" ? { layerCompatDetails } : {},
						),
						documentServiceFactory: createTestDocumentServiceFactoryProxy(
							resolvedUrl,
							testCase.layerType === "driver" ? layerCompatDetails : undefined,
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
							testCase.layerType === "runtime" ? { layerCompatDetails } : {},
						),
						documentServiceFactory: createTestDocumentServiceFactoryProxy(
							resolvedUrl,
							testCase.layerType === "driver" ? layerCompatDetails : undefined,
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
