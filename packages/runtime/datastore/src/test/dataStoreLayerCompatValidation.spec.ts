/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type {
	ILayerCompatDetails,
	ILayerCompatSupportRequirements,
} from "@fluid-internal/client-utils";
import {
	FluidErrorTypes,
	type ITelemetryBaseProperties,
} from "@fluidframework/core-interfaces/internal";
import type { IChannel } from "@fluidframework/datastore-definitions/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";
import { MockFluidDataStoreContext } from "@fluidframework/test-runtime-utils/internal";
import Sinon from "sinon";

import {
	dataStoreCompatDetailsForRuntime,
	runtimeSupportRequirements,
	validateRuntimeCompatibility,
} from "../dataStoreLayerCompatState.js";
import { FluidDataStoreRuntime, ISharedObjectRegistry } from "../dataStoreRuntime.js";
import { pkgVersion } from "../packageVersion.js";

type ILayerCompatSupportRequirementsOverride = Omit<
	ILayerCompatSupportRequirements,
	"requiredFeatures"
> & {
	requiredFeatures: string[];
};

describe("DataStore Layer compatibility", () => {
	let originalRequiredFeatures: readonly string[];
	beforeEach(() => {
		originalRequiredFeatures = runtimeSupportRequirements.requiredFeatures;
	});

	afterEach(() => {
		(runtimeSupportRequirements as ILayerCompatSupportRequirementsOverride).requiredFeatures =
			[...originalRequiredFeatures];
	});

	function validateFailureProperties(
		error: Error,
		isGenerationCompatible: boolean,
		runtimeGeneration: number,
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
		assert.strictEqual(
			properties.dataStoreVersion,
			pkgVersion,
			"DataStore version not as expected",
		);
		assert.strictEqual(
			properties.runtimeVersion,
			pkgVersion,
			"Runtime version not as expected",
		);
		assert.strictEqual(
			properties.dataStoreGeneration,
			dataStoreCompatDetailsForRuntime.generation,
			"DataStore generation not as expected",
		);
		assert.strictEqual(
			properties.runtimeGeneration,
			runtimeGeneration,
			"Runtime generation not as expected",
		);
		assert.strictEqual(
			properties.minSupportedGeneration,
			runtimeSupportRequirements.minSupportedGeneration,
			"Min supported generation not as expected",
		);
		assert.deepStrictEqual(
			properties.unsupportedFeatures,
			unsupportedFeatures,
			"Unsupported features not as expected",
		);
		return true;
	}

	/**
	 * These tests validates that the layer compat state and validateRuntimeCompatibility function correctly
	 * validate the compatibility between DataStore and Runtime layers.
	 */
	describe("validateRuntimeCompatibility", () => {
		it("DataStore is compatible with old Runtime (pre-enforcement)", () => {
			// Older Runtime will not have ILayerCompatDetails defined.
			assert.doesNotThrow(
				() =>
					validateRuntimeCompatibility(undefined /* maybeRuntimeCompatDetails */, () => {
						throw new Error("should not dispose");
					}),
				"DataStore should be compatible with older Runtime",
			);
		});

		it("DataStore generation and features are compatible with Runtime", () => {
			(
				runtimeSupportRequirements as ILayerCompatSupportRequirementsOverride
			).requiredFeatures = ["feature1", "feature2"];
			const runtimeCompatDetails: ILayerCompatDetails = {
				pkgVersion,
				generation: runtimeSupportRequirements.minSupportedGeneration,
				supportedFeatures: new Set(runtimeSupportRequirements.requiredFeatures),
			};
			assert.doesNotThrow(
				() =>
					validateRuntimeCompatibility(runtimeCompatDetails, () => {
						throw new Error("should not dispose");
					}),
				"DataStore should be compatible with Runtime layer",
			);
		});

		it("DataStore generation is incompatible with Runtime", () => {
			const disposeFn = Sinon.fake();
			(
				runtimeSupportRequirements as ILayerCompatSupportRequirementsOverride
			).requiredFeatures = ["feature1", "feature2"];
			const runtimeGeneration = runtimeSupportRequirements.minSupportedGeneration - 1;
			const runtimeCompatDetails: ILayerCompatDetails = {
				pkgVersion,
				generation: runtimeGeneration,
				supportedFeatures: new Set(runtimeSupportRequirements.requiredFeatures),
			};
			assert.throws(
				() => validateRuntimeCompatibility(runtimeCompatDetails, disposeFn),
				(e: Error) =>
					validateFailureProperties(e, false /* isGenerationCompatible */, runtimeGeneration),
				"DataStore should be incompatible with Runtime layer",
			);
			assert(disposeFn.calledOnce, "Dispose should be called");
		});

		it("DataStore features are incompatible with Runtime", () => {
			const disposeFn = Sinon.fake();
			const requiredFeatures = ["feature2", "feature3"];
			(
				runtimeSupportRequirements as ILayerCompatSupportRequirementsOverride
			).requiredFeatures = requiredFeatures;

			const runtimeCompatDetails: ILayerCompatDetails = {
				pkgVersion,
				generation: runtimeSupportRequirements.minSupportedGeneration,
				supportedFeatures: new Set(),
			};

			assert.throws(
				() => validateRuntimeCompatibility(runtimeCompatDetails, disposeFn),
				(e: Error) =>
					validateFailureProperties(
						e,
						true /* isGenerationCompatible */,
						runtimeSupportRequirements.minSupportedGeneration,
						requiredFeatures,
					),
				"DataStore should be incompatible with Runtime layer",
			);
			assert(disposeFn.calledOnce, "Dispose should be called");
		});

		it("DataStore generation and features are both incompatible with Runtime", () => {
			const disposeFn = Sinon.fake();
			const runtimeGeneration = runtimeSupportRequirements.minSupportedGeneration - 1;
			const requiredFeatures = ["feature2"];
			(
				runtimeSupportRequirements as ILayerCompatSupportRequirementsOverride
			).requiredFeatures = requiredFeatures;

			const runtimeCompatDetails: ILayerCompatDetails = {
				pkgVersion,
				generation: runtimeGeneration,
				supportedFeatures: new Set(),
			};

			assert.throws(
				() => validateRuntimeCompatibility(runtimeCompatDetails, disposeFn),
				(e: Error) =>
					validateFailureProperties(
						e,
						false /* isGenerationCompatible */,
						runtimeGeneration,
						requiredFeatures,
					),
				"DataStore should be incompatible with Runtime layer",
			);
			assert(disposeFn.calledOnce, "Dispose should be called");
		});
	});

	/**
	 * These tests validates that layer compatibility is correctly enforced during data store runtime creation.
	 */
	describe("DataStoreRuntime creation", () => {
		const sharedObjectRegistry: ISharedObjectRegistry = {
			get(type: string) {
				return {
					type,
					attributes: { type, snapshotFormatVersion: "0" },
					create: () => ({}) as any as IChannel,
					load: async () => Promise.resolve({} as any as IChannel),
				};
			},
		};

		let dataStoreContext: MockFluidDataStoreContext;

		beforeEach(() => {
			dataStoreContext = new MockFluidDataStoreContext();
		});

		function createDataStoreRuntime(compatDetails?: ILayerCompatDetails) {
			if (compatDetails !== undefined) {
				dataStoreContext.ILayerCompatDetails = compatDetails;
			}
			const runtime: FluidDataStoreRuntime = new FluidDataStoreRuntime(
				dataStoreContext,
				sharedObjectRegistry,
				/* existing */ false,
				async () => runtime,
			);
			return runtime;
		}

		it("Older Runtime is compatible", async () => {
			await assert.doesNotReject(
				async () => createDataStoreRuntime(),
				"Older Runtime should be compatible",
			);
		});

		it("Runtime with generation >= minSupportedGeneration is compatible", async () => {
			const runtimeCompatDetails: ILayerCompatDetails = {
				pkgVersion,
				generation: runtimeSupportRequirements.minSupportedGeneration,
				supportedFeatures: new Set(),
			};

			await assert.doesNotReject(
				async () => createDataStoreRuntime(runtimeCompatDetails),
				"Runtime with generation >= minSupportedGeneration should be compatible",
			);
		});

		it("Runtime with generation < minSupportedGeneration is not compatible", async () => {
			const runtimeGeneration = runtimeSupportRequirements.minSupportedGeneration - 1;
			const runtimeCompatDetails: ILayerCompatDetails = {
				pkgVersion,
				generation: runtimeGeneration,
				supportedFeatures: new Set(),
			};

			await assert.rejects(
				async () => createDataStoreRuntime(runtimeCompatDetails),
				(error: Error) =>
					validateFailureProperties(
						error,
						false /* isGenerationCompatible */,
						runtimeGeneration,
					),
				"Runtime with generation < minSupportedGeneration should be incompatible",
			);
		});
	});
});
