/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import type {
	ILayerCompatDetails,
	ILayerCompatSupportRequirements,
	IProvideLayerCompatDetails,
} from "@fluid-internal/client-utils";
import {
	AttachState,
	type IContainerContext,
} from "@fluidframework/container-definitions/internal";
import { FluidErrorTypes } from "@fluidframework/core-interfaces/internal";
import { createChildLogger, UsageError } from "@fluidframework/telemetry-utils/internal";
import {
	MockDeltaManager,
	MockAudience,
	MockQuorumClients,
} from "@fluidframework/test-runtime-utils/internal";

import { ContainerRuntime } from "../containerRuntime.js";
import {
	RuntimeCompatDetails,
	LoaderSupportRequirements,
	validateLoaderCompatibility,
} from "../layerCompatState.js";
import { pkgVersion } from "../packageVersion.js";

type ILayerCompatSupportRequirementsOverride = Omit<
	ILayerCompatSupportRequirements,
	"requiredFeatures"
> & {
	requiredFeatures: string[];
};

describe("Runtime Layer compatibility", () => {
	let originalRequiredFeatures: readonly string[];
	beforeEach(() => {
		originalRequiredFeatures = LoaderSupportRequirements.requiredFeatures;
	});

	afterEach(() => {
		(LoaderSupportRequirements as ILayerCompatSupportRequirementsOverride).requiredFeatures = [
			...originalRequiredFeatures,
		];
	});

	function validateFailureProperties(
		error: Error,
		isGenerationCompatible: boolean,
		loaderGeneration: number,
		unsupportedFeatures?: string[],
	) {
		assert(error instanceof UsageError, "The error should be a UsageError");
		assert.strictEqual(
			error.errorType,
			FluidErrorTypes.usageError,
			"Error type should be usageError",
		);
		const properties = error.getTelemetryProperties();
		assert.strictEqual(
			properties.isGenerationCompatible,
			isGenerationCompatible,
			"Generation compatibility not as expected",
		);
		assert.strictEqual(
			properties.runtimeVersion,
			pkgVersion,
			"Runtime version not as expected",
		);
		assert.strictEqual(properties.loaderVersion, pkgVersion, "Loader version not as expected");
		assert.strictEqual(
			properties.runtimeGeneration,
			RuntimeCompatDetails.generation,
			"Runtime generation not as expected",
		);
		assert.strictEqual(
			properties.loaderGeneration,
			loaderGeneration,
			"Loader generation not as expected",
		);
		assert.strictEqual(
			properties.minSupportedGeneration,
			LoaderSupportRequirements.minSupportedGeneration,
			"Min supported generation not as expected",
		);
		assert.strictEqual(
			properties.unsupportedFeatures,
			JSON.stringify(unsupportedFeatures),
			"Unsupported features not as expected",
		);
		return true;
	}

	/**
	 * These tests validates that the layer compat state and validateLoaderCompatibility function correctly
	 * validate the compatibility between Runtime and Loader layers.
	 */
	describe("validateLoaderCompatibility", () => {
		it("Runtime is compatible with old Loader (pre-enforcement)", () => {
			// Older Loader will not have ILayerCompatDetails defined.
			assert.doesNotThrow(
				() =>
					validateLoaderCompatibility(undefined /* maybeLoaderCompatDetails */, () => {
						throw new Error("should not dispose");
					}),
				"Runtime should be compatible with older Loader",
			);
		});

		it("Runtime generation and features are compatible with Loader", () => {
			(LoaderSupportRequirements as ILayerCompatSupportRequirementsOverride).requiredFeatures =
				["feature1", "feature2"];
			const loaderCompatDetails: ILayerCompatDetails = {
				pkgVersion,
				generation: LoaderSupportRequirements.minSupportedGeneration,
				supportedFeatures: new Set(LoaderSupportRequirements.requiredFeatures),
			};
			assert.doesNotThrow(
				() =>
					validateLoaderCompatibility(loaderCompatDetails, () => {
						throw new Error("should not dispose");
					}),
				"Runtime should be compatible with Loader layer",
			);
		});

		it("Runtime generation is incompatible with Loader", () => {
			(LoaderSupportRequirements as ILayerCompatSupportRequirementsOverride).requiredFeatures =
				["feature1", "feature2"];
			const loaderGeneration = LoaderSupportRequirements.minSupportedGeneration - 1;
			const loaderCompatDetails: ILayerCompatDetails = {
				pkgVersion,
				generation: loaderGeneration,
				supportedFeatures: new Set(LoaderSupportRequirements.requiredFeatures),
			};
			assert.throws(
				() => validateLoaderCompatibility(loaderCompatDetails, () => {}),
				(e: Error) =>
					validateFailureProperties(e, false /* isGenerationCompatible */, loaderGeneration),
				"Runtime should be incompatible with Loader layer",
			);
		});

		it("Runtime features are incompatible with Loader", () => {
			const requiredFeatures = ["feature2", "feature3"];
			(LoaderSupportRequirements as ILayerCompatSupportRequirementsOverride).requiredFeatures =
				requiredFeatures;

			const loaderCompatDetails: ILayerCompatDetails = {
				pkgVersion,
				generation: LoaderSupportRequirements.minSupportedGeneration,
				supportedFeatures: new Set(),
			};

			assert.throws(
				() => validateLoaderCompatibility(loaderCompatDetails, () => {}),
				(e: Error) =>
					validateFailureProperties(
						e,
						true /* isGenerationCompatible */,
						LoaderSupportRequirements.minSupportedGeneration,
						requiredFeatures,
					),
				"Runtime should be compatible with Loader layer",
			);
		});

		it("Runtime generation and features are both incompatible with Loader", () => {
			const loaderGeneration = LoaderSupportRequirements.minSupportedGeneration - 1;
			const requiredFeatures = ["feature2"];
			(LoaderSupportRequirements as ILayerCompatSupportRequirementsOverride).requiredFeatures =
				requiredFeatures;

			const loaderCompatDetails: ILayerCompatDetails = {
				pkgVersion,
				generation: loaderGeneration,
				supportedFeatures: new Set(),
			};

			assert.throws(
				() => validateLoaderCompatibility(loaderCompatDetails, () => {}),
				(e: Error) =>
					validateFailureProperties(
						e,
						false /* isGenerationCompatible */,
						loaderGeneration,
						requiredFeatures,
					),
				"Runtime should be compatible with Loader layer",
			);
		});
	});

	/**
	 * These tests validates that the Runtime layer compatibility is correctly enforced during container runtime creation.
	 */
	describe("Container Runtime create", () => {
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
			const loaderCompatDetails: ILayerCompatDetails = {
				pkgVersion,
				generation: LoaderSupportRequirements.minSupportedGeneration,
				supportedFeatures: new Set(),
			};

			await assert.doesNotReject(
				async () =>
					ContainerRuntime.loadRuntime({
						context: localGetMockContext(loaderCompatDetails) as IContainerContext,
						registryEntries: [],
						existing: false,
						provideEntryPoint: mockProvideEntryPoint,
					}),
				"Loader with generation >= minSupportedGeneration should be compatible",
			);
		});

		it("Loader with generation < minSupportedGeneration is not compatible", async () => {
			const loaderGeneration = LoaderSupportRequirements.minSupportedGeneration - 1;
			const loaderCompatDetails: ILayerCompatDetails = {
				pkgVersion,
				generation: loaderGeneration,
				supportedFeatures: new Set(),
			};

			await assert.rejects(
				async () =>
					ContainerRuntime.loadRuntime({
						context: localGetMockContext(loaderCompatDetails) as IContainerContext,
						registryEntries: [],
						existing: false,
						provideEntryPoint: mockProvideEntryPoint,
					}),
				(error: Error) =>
					validateFailureProperties(
						error,
						false /* isGenerationCompatible */,
						loaderGeneration,
					),
				"Loader with generation >= minSupportedGeneration should be incompatible",
			);
		});
	});
});
