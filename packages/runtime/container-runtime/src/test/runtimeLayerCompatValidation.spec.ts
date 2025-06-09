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
} from "@fluidframework/container-definitions/internal";
import {
	FluidErrorTypes,
	type ITelemetryBaseProperties,
} from "@fluidframework/core-interfaces/internal";
import { createChildLogger, UsageError } from "@fluidframework/telemetry-utils/internal";
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
	loaderSupportRequirements,
	validateLoaderCompatibility,
	validateDatastoreCompatibility,
	dataStoreSupportRequirements,
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
	layerType: "Loader" | "DataStore",
	unsupportedFeatures?: string[],
): boolean {
	assert(error instanceof UsageError, "The error should be a UsageError");
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

	if (layerType === "Loader") {
		assert.strictEqual(properties.loaderVersion, pkgVersion, "Loader version not as expected");
		assert.strictEqual(
			properties.loaderGeneration,
			layerGeneration,
			"Loader generation not as expected",
		);
	} else {
		assert.strictEqual(
			properties.dataStoreVersion,
			pkgVersion,
			"DataStore version not as expected",
		);
		assert.strictEqual(
			properties.dataStoreGeneration,
			layerGeneration,
			"DataStore generation not as expected",
		);
	}
	return true;
}

describe("Runtime Layer compatibility", () => {
	describe("Runtime <-> Loader compatibility", () => {
		let originalRequiredFeatures: readonly string[];
		beforeEach(() => {
			originalRequiredFeatures = loaderSupportRequirements.requiredFeatures;
		});

		afterEach(() => {
			(loaderSupportRequirements as ILayerCompatSupportRequirementsOverride).requiredFeatures =
				[...originalRequiredFeatures];
		});
		/**
		 * These tests validates that the layer compat state and validateLoaderCompatibility function correctly
		 * validates the compatibility between Runtime and Loader layers.
		 */
		describe("validateLoaderCompatibility", () => {
			it("Runtime is compatible with old Loader (pre-enforcement)", () => {
				// Older Loader will not have ILayerCompatDetails defined.
				assert.doesNotThrow(
					() =>
						validateLoaderCompatibility(
							undefined /* maybeloaderCompatDetailsForRuntime */,
							() => {
								throw new Error("should not dispose");
							},
						),
					"Runtime should be compatible with older Loader",
				);
			});

			it("Runtime generation and features are compatible with Loader", () => {
				(
					loaderSupportRequirements as ILayerCompatSupportRequirementsOverride
				).requiredFeatures = ["feature1", "feature2"];
				const loaderCompatDetailsForRuntime: ILayerCompatDetails = {
					pkgVersion,
					generation: loaderSupportRequirements.minSupportedGeneration,
					supportedFeatures: new Set(loaderSupportRequirements.requiredFeatures),
				};
				assert.doesNotThrow(
					() =>
						validateLoaderCompatibility(loaderCompatDetailsForRuntime, () => {
							throw new Error("should not dispose");
						}),
					"Runtime should be compatible with Loader layer",
				);
			});

			it("Runtime generation is incompatible with Loader", () => {
				const disposeFn = Sinon.fake();
				(
					loaderSupportRequirements as ILayerCompatSupportRequirementsOverride
				).requiredFeatures = ["feature1", "feature2"];
				const loaderGeneration = loaderSupportRequirements.minSupportedGeneration - 1;
				const loaderCompatDetailsForRuntime: ILayerCompatDetails = {
					pkgVersion,
					generation: loaderGeneration,
					supportedFeatures: new Set(loaderSupportRequirements.requiredFeatures),
				};
				assert.throws(
					() => validateLoaderCompatibility(loaderCompatDetailsForRuntime, disposeFn),
					(e: Error) =>
						validateFailureProperties(
							e,
							false /* isGenerationCompatible */,
							loaderGeneration,
							"Loader",
						),
					"Runtime should be incompatible with Loader layer",
				);
				assert(disposeFn.calledOnce, "Dispose should be called");
			});

			it("Runtime features are incompatible with Loader", () => {
				const disposeFn = Sinon.fake();
				const requiredFeatures = ["feature2", "feature3"];
				(
					loaderSupportRequirements as ILayerCompatSupportRequirementsOverride
				).requiredFeatures = requiredFeatures;

				const loaderCompatDetailsForRuntime: ILayerCompatDetails = {
					pkgVersion,
					generation: loaderSupportRequirements.minSupportedGeneration,
					supportedFeatures: new Set(),
				};

				assert.throws(
					() => validateLoaderCompatibility(loaderCompatDetailsForRuntime, disposeFn),
					(e: Error) =>
						validateFailureProperties(
							e,
							true /* isGenerationCompatible */,
							loaderSupportRequirements.minSupportedGeneration,
							"Loader",
							requiredFeatures,
						),
					"Runtime should be incompatible with Loader layer",
				);
				assert(disposeFn.calledOnce, "Dispose should be called");
			});

			it("Runtime generation and features are both incompatible with Loader", () => {
				const disposeFn = Sinon.fake();
				const loaderGeneration = loaderSupportRequirements.minSupportedGeneration - 1;
				const requiredFeatures = ["feature2"];
				(
					loaderSupportRequirements as ILayerCompatSupportRequirementsOverride
				).requiredFeatures = requiredFeatures;

				const loaderCompatDetailsForRuntime: ILayerCompatDetails = {
					pkgVersion,
					generation: loaderGeneration,
					supportedFeatures: new Set(),
				};

				assert.throws(
					() => validateLoaderCompatibility(loaderCompatDetailsForRuntime, disposeFn),
					(e: Error) =>
						validateFailureProperties(
							e,
							false /* isGenerationCompatible */,
							loaderGeneration,
							"Loader",
							requiredFeatures,
						),
					"Runtime should be incompatible with Loader layer",
				);
				assert(disposeFn.calledOnce, "Dispose should be called");
			});
		});

		/**
		 * These tests validates that the Runtime layer compatibility is correctly enforced during container runtime creation.
		 */
		describe("Container Runtime creation", () => {
			const mockProvideEntryPoint = async () => ({
				myProp: "myValue",
			});

			const localGetMockContext = (
				compatibilityDetails?: ILayerCompatDetails,
			): Partial<IContainerContext & IProvideLayerCompatDetails> => {
				return {
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
			};

			it("Older Loader is compatible", async () => {
				await assert.doesNotReject(
					async () =>
						ContainerRuntime.loadRuntime({
							context: localGetMockContext() as IContainerContext,
							registryEntries: [],
							existing: false,
							provideEntryPoint: mockProvideEntryPoint,
						}),
					"Older Loader should be compatible",
				);
			});

			it("Loader with generation >= minSupportedGeneration is compatible", async () => {
				const loaderCompatDetailsForRuntime: ILayerCompatDetails = {
					pkgVersion,
					generation: loaderSupportRequirements.minSupportedGeneration,
					supportedFeatures: new Set(),
				};

				await assert.doesNotReject(
					async () =>
						ContainerRuntime.loadRuntime({
							context: localGetMockContext(loaderCompatDetailsForRuntime) as IContainerContext,
							registryEntries: [],
							existing: false,
							provideEntryPoint: mockProvideEntryPoint,
						}),
					"Loader with generation >= minSupportedGeneration should be compatible",
				);
			});

			it("Loader with generation < minSupportedGeneration is not compatible", async () => {
				const loaderGeneration = loaderSupportRequirements.minSupportedGeneration - 1;
				const loaderCompatDetailsForRuntime: ILayerCompatDetails = {
					pkgVersion,
					generation: loaderGeneration,
					supportedFeatures: new Set(),
				};

				await assert.rejects(
					async () =>
						ContainerRuntime.loadRuntime({
							context: localGetMockContext(loaderCompatDetailsForRuntime) as IContainerContext,
							registryEntries: [],
							existing: false,
							provideEntryPoint: mockProvideEntryPoint,
						}),
					(error: Error) =>
						validateFailureProperties(
							error,
							false /* isGenerationCompatible */,
							loaderGeneration,
							"Loader",
						),
					"Loader with generation < minSupportedGeneration should be incompatible",
				);
			});
		});
	});

	describe("Runtime <-> DataStore compatibility", () => {
		let originalRequiredFeatures: readonly string[];
		beforeEach(() => {
			originalRequiredFeatures = dataStoreSupportRequirements.requiredFeatures;
		});

		afterEach(() => {
			(
				dataStoreSupportRequirements as ILayerCompatSupportRequirementsOverride
			).requiredFeatures = [...originalRequiredFeatures];
		});
		/**
		 * These tests validates that the layer compat state and validateDataStoreCompatibility function correctly
		 * validate the compatibility between Runtime and DataStore layers.
		 */
		describe("validateDataStoreCompatibility", () => {
			it("Runtime is compatible with old DataStore (pre-enforcement)", () => {
				// Older DataStore will not have ILayerCompatDetails defined.
				assert.doesNotThrow(
					() =>
						validateDatastoreCompatibility(undefined /* maybeDataStoreCompatDetails */, () => {
							throw new Error("should not dispose");
						}),
					"Runtime should be compatible with older DataStore",
				);
			});

			it("Runtime generation and features are compatible with DataStore", () => {
				(
					dataStoreSupportRequirements as ILayerCompatSupportRequirementsOverride
				).requiredFeatures = ["feature1", "feature2"];
				const dataStoreCompatDetails: ILayerCompatDetails = {
					pkgVersion,
					generation: dataStoreSupportRequirements.minSupportedGeneration,
					supportedFeatures: new Set(dataStoreSupportRequirements.requiredFeatures),
				};
				assert.doesNotThrow(
					() =>
						validateDatastoreCompatibility(dataStoreCompatDetails, () => {
							throw new Error("should not dispose");
						}),
					"Runtime should be compatible with DataStore layer",
				);
			});

			it("Runtime generation is incompatible with DataStore", () => {
				const disposeFn = Sinon.fake();
				(
					dataStoreSupportRequirements as ILayerCompatSupportRequirementsOverride
				).requiredFeatures = ["feature1", "feature2"];
				const dataStoreGeneration = dataStoreSupportRequirements.minSupportedGeneration - 1;
				const dataStoreCompatDetails: ILayerCompatDetails = {
					pkgVersion,
					generation: dataStoreGeneration,
					supportedFeatures: new Set(dataStoreSupportRequirements.requiredFeatures),
				};
				assert.throws(
					() => validateDatastoreCompatibility(dataStoreCompatDetails, disposeFn),
					(e: Error) =>
						validateFailureProperties(
							e,
							false /* isGenerationCompatible */,
							dataStoreGeneration,
							"DataStore",
						),
					"Runtime should be incompatible with DataStore layer",
				);
				assert(disposeFn.calledOnce, "Dispose should be called");
			});

			it("Runtime features are incompatible with DataStore", () => {
				const disposeFn = Sinon.fake();
				const requiredFeatures = ["feature2", "feature3"];
				(
					dataStoreSupportRequirements as ILayerCompatSupportRequirementsOverride
				).requiredFeatures = requiredFeatures;

				const dataStoreCompatDetails: ILayerCompatDetails = {
					pkgVersion,
					generation: dataStoreSupportRequirements.minSupportedGeneration,
					supportedFeatures: new Set(),
				};

				assert.throws(
					() => validateDatastoreCompatibility(dataStoreCompatDetails, disposeFn),
					(e: Error) =>
						validateFailureProperties(
							e,
							true /* isGenerationCompatible */,
							dataStoreSupportRequirements.minSupportedGeneration,
							"DataStore",
							requiredFeatures,
						),
					"Runtime should be incompatible with DataStore layer",
				);
				assert(disposeFn.calledOnce, "Dispose should be called");
			});

			it("Runtime generation and features are both incompatible with DataStore", () => {
				const disposeFn = Sinon.fake();
				const dataStoreGeneration = dataStoreSupportRequirements.minSupportedGeneration - 1;
				const requiredFeatures = ["feature2"];
				(
					dataStoreSupportRequirements as ILayerCompatSupportRequirementsOverride
				).requiredFeatures = requiredFeatures;

				const dataStoreCompatDetails: ILayerCompatDetails = {
					pkgVersion,
					generation: dataStoreGeneration,
					supportedFeatures: new Set(),
				};

				assert.throws(
					() => validateDatastoreCompatibility(dataStoreCompatDetails, disposeFn),
					(e: Error) =>
						validateFailureProperties(
							e,
							false /* isGenerationCompatible */,
							dataStoreGeneration,
							"DataStore",
							requiredFeatures,
						),
					"Runtime should be incompatible with DataStore layer",
				);
				assert(disposeFn.calledOnce, "Dispose should be called");
			});
		});

		/**
		 * These tests validates that the Runtime layer compatibility is correctly enforced during data store context realization.
		 */
		describe("FluidDataStoreContext realization", () => {
			it("Older DataStore is compatible", async () => {
				const localDataStoreContext = createLocalDataStoreContext({});
				await assert.doesNotReject(
					async () => localDataStoreContext.realize(),
					"Older DataStore should be compatible",
				);
			});

			it("DataStore with generation >= minSupportedGeneration is compatible", async () => {
				const dataStoreCompatDetails: ILayerCompatDetails = {
					pkgVersion,
					generation: dataStoreSupportRequirements.minSupportedGeneration,
					supportedFeatures: new Set(),
				};
				const localDataStoreContext = createLocalDataStoreContext({}, dataStoreCompatDetails);

				await assert.doesNotReject(
					async () => localDataStoreContext.realize(),
					"DataStore with generation >= minSupportedGeneration should be compatible",
				);
			});

			it("DataStore with generation < minSupportedGeneration is not compatible", async () => {
				const dataStoreGeneration = dataStoreSupportRequirements.minSupportedGeneration - 1;
				const dataStoreCompatDetails: ILayerCompatDetails = {
					pkgVersion,
					generation: dataStoreGeneration,
					supportedFeatures: new Set(),
				};
				const localDataStoreContext = createLocalDataStoreContext({}, dataStoreCompatDetails);

				await assert.rejects(
					async () => localDataStoreContext.realize(),
					(error: Error) =>
						validateFailureProperties(
							error,
							false /* isGenerationCompatible */,
							dataStoreGeneration,
							"DataStore",
						),
					"DataStore with generation < minSupportedGeneration should be incompatible",
				);
			});
		});
	});
});
