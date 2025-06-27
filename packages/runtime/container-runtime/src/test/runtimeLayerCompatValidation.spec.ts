/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type {
	ILayerCompatDetails,
	ILayerCompatSupportRequirements,
	IProvideLayerCompatDetails,
} from "@fluid-internal/client-utils";
import {
	AttachState,
	type IContainerContext,
	type ICriticalContainerError,
} from "@fluidframework/container-definitions/internal";
import {
	FluidErrorTypes,
	type ITelemetryBaseProperties,
	type Tagged,
	type TelemetryBaseEventPropertyType,
} from "@fluidframework/core-interfaces/internal";
import { createChildLogger, isFluidError } from "@fluidframework/telemetry-utils/internal";
import {
	MockDeltaManager,
	MockAudience,
	MockQuorumClients,
} from "@fluidframework/test-runtime-utils/internal";
import Sinon from "sinon";

import { ContainerRuntime } from "../containerRuntime.js";
import { pkgVersion } from "../packageVersion.js";
import {
	runtimeCompatDetailsForLoader,
	loaderSupportRequirementsForRuntime,
	validateLoaderCompatibility,
	validateDatastoreCompatibility,
	dataStoreSupportRequirementsForRuntime,
} from "../runtimeLayerCompatState.js";

import { createLocalDataStoreContext } from "./dataStoreCreationHelper.js";

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
	layerType: "Loader" | "Driver" | "DataStore",
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
	assert.strictEqual(properties.runtimeVersion, pkgVersion, "Runtime version not as expected");
	assert.strictEqual(
		properties.runtimeGeneration,
		runtimeCompatDetailsForLoader.generation,
		"Runtime generation not as expected",
	);
	assert.deepStrictEqual(
		properties.unsupportedFeatures,
		unsupportedFeatures,
		"Unsupported features not as expected",
	);

	let otherLayerVersion:
		| TelemetryBaseEventPropertyType
		| Tagged<TelemetryBaseEventPropertyType>
		| undefined;
	let otherLayerGeneration:
		| TelemetryBaseEventPropertyType
		| Tagged<TelemetryBaseEventPropertyType>
		| undefined;

	switch (layerType) {
		case "Loader": {
			otherLayerVersion = properties.loaderVersion;
			otherLayerGeneration = properties.loaderGeneration;
			break;
		}
		case "Driver": {
			otherLayerVersion = properties.driverVersion;
			otherLayerGeneration = properties.driverGeneration;
			break;
		}
		case "DataStore": {
			otherLayerVersion = properties.dataStoreVersion;
			otherLayerGeneration = properties.dataStoreGeneration;
			break;
		}
		default: {
			assert.fail(`Unexpected layer type: ${layerType}`);
		}
	}

	assert.strictEqual(otherLayerVersion, pkgVersion, `${layerType} version not as expected`);
	assert.strictEqual(
		otherLayerGeneration,
		layerGeneration,
		`${layerType} generation not as expected`,
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
		const testCases: {
			layerType: "Loader" | "Driver" | "DataStore";
			layerSupportRequirements: ILayerCompatSupportRequirementsOverride;
			validateCompatibility: (
				maybeCompatDetails: ILayerCompatDetails | undefined,
				disposeFn: (error?: ICriticalContainerError) => void,
			) => void;
		}[] = [
			{
				layerType: "Loader",
				validateCompatibility: validateLoaderCompatibility,
				layerSupportRequirements:
					loaderSupportRequirementsForRuntime as ILayerCompatSupportRequirementsOverride,
			},
			{
				layerType: "DataStore",
				validateCompatibility: validateDatastoreCompatibility,
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
			layerType: "Loader" | "DataStore" | "Driver";
			layerSupportRequirements: ILayerCompatSupportRequirementsOverride;
			createAndLoad: (compatibilityDetails?: ILayerCompatDetails) => Promise<void>;
		}[] = [
			{
				layerType: "Loader",
				layerSupportRequirements:
					loaderSupportRequirementsForRuntime as ILayerCompatSupportRequirementsOverride,
				createAndLoad: createAndLoadRuntime,
			},
			{
				layerType: "DataStore",
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
});
