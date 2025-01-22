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
import type {
	ICodeDetailsLoader,
	IRuntime,
	IRuntimeFactory,
} from "@fluidframework/container-definitions/internal";
import { FluidErrorTypes } from "@fluidframework/core-interfaces/internal";
import { SummaryType } from "@fluidframework/driver-definitions";
import { UsageError } from "@fluidframework/telemetry-utils/internal";
import Sinon from "sinon";

import {
	LoaderCompatDetails,
	RuntimeSupportRequirements,
	validateRuntimeCompatibility,
} from "../layerCompatState.js";
import { Loader } from "../loader.js";
import { pkgVersion } from "../packageVersion.js";

import { failProxy, failSometimeProxy } from "./failProxy.js";

type ILayerCompatSupportRequirementsOverride = Omit<
	ILayerCompatSupportRequirements,
	"requiredFeatures"
> & {
	requiredFeatures: string[];
};

describe("Runtime Layer compatibility", () => {
	let originalRequiredFeatures: readonly string[];
	beforeEach(() => {
		originalRequiredFeatures = RuntimeSupportRequirements.requiredFeatures;
	});

	afterEach(() => {
		(RuntimeSupportRequirements as ILayerCompatSupportRequirementsOverride).requiredFeatures =
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
		const properties = error.getTelemetryProperties();
		assert.strictEqual(
			properties.isGenerationCompatible,
			isGenerationCompatible,
			"Generation compatibility not as expected",
		);
		assert.strictEqual(properties.loaderVersion, pkgVersion, "Loader version not as expected");
		assert.strictEqual(
			properties.runtimeVersion,
			pkgVersion,
			"Runtime version not as expected",
		);
		assert.strictEqual(
			properties.loaderGeneration,
			LoaderCompatDetails.generation,
			"Loader generation not as expected",
		);
		assert.strictEqual(
			properties.runtimeGeneration,
			runtimeGeneration,
			"Runtime generation not as expected",
		);
		assert.strictEqual(
			properties.minSupportedGeneration,
			RuntimeSupportRequirements.minSupportedGeneration,
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
	 * These tests validates that the layer compat state and validateRuntimeCompatibility function correctly
	 * validate the compatibility between Loader and Runtime layers.
	 */
	describe("validateRuntimeCompatibility", () => {
		it("Loader is compatible with old Runtime (pre-enforcement)", () => {
			// Older Runtime will not have ILayerCompatDetails defined.
			assert.doesNotThrow(
				() =>
					validateRuntimeCompatibility(undefined /* maybeRuntimeCompatDetails */, () => {
						throw new Error("should not dispose");
					}),
				"Loader should be compatible with older Loader",
			);
		});

		it("Loader generation and features are compatible with Runtime", () => {
			(
				RuntimeSupportRequirements as ILayerCompatSupportRequirementsOverride
			).requiredFeatures = ["feature1", "feature2"];
			const runtimeCompatDetails: ILayerCompatDetails = {
				pkgVersion,
				generation: RuntimeSupportRequirements.minSupportedGeneration,
				supportedFeatures: new Set(RuntimeSupportRequirements.requiredFeatures),
			};
			assert.doesNotThrow(
				() =>
					validateRuntimeCompatibility(runtimeCompatDetails, () => {
						throw new Error("should not dispose");
					}),
				"Loader should be compatible with Runtime layer",
			);
		});

		it("Loader generation is incompatible with Runtime", () => {
			const disposeFn = Sinon.fake();
			(
				RuntimeSupportRequirements as ILayerCompatSupportRequirementsOverride
			).requiredFeatures = ["feature1", "feature2"];
			const runtimeGeneration = RuntimeSupportRequirements.minSupportedGeneration - 1;
			const runtimeCompatDetails: ILayerCompatDetails = {
				pkgVersion,
				generation: runtimeGeneration,
				supportedFeatures: new Set(RuntimeSupportRequirements.requiredFeatures),
			};
			assert.throws(
				() => validateRuntimeCompatibility(runtimeCompatDetails, disposeFn),
				(e: Error) =>
					validateFailureProperties(e, false /* isGenerationCompatible */, runtimeGeneration),
				"Loader should be incompatible with Runtime layer",
			);
			assert(disposeFn.calledOnce, "Dispose should be called");
		});

		it("Loader features are incompatible with Runtime", () => {
			const disposeFn = Sinon.fake();
			const runtimeGeneration = RuntimeSupportRequirements.minSupportedGeneration;
			const requiredFeatures = ["feature2", "feature3"];
			(
				RuntimeSupportRequirements as ILayerCompatSupportRequirementsOverride
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
						true /* isGenerationCompatible */,
						runtimeGeneration,
						requiredFeatures,
					),
				"Loader should be compatible with Runtime layer",
			);
			assert(disposeFn.calledOnce, "Dispose should be called");
		});

		it("Loader generation and features are both incompatible with Runtime", () => {
			const disposeFn = Sinon.fake();
			const runtimeGeneration = RuntimeSupportRequirements.minSupportedGeneration - 1;
			const requiredFeatures = ["feature2"];
			(
				RuntimeSupportRequirements as ILayerCompatSupportRequirementsOverride
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
				"Loader should be compatible with Runtime layer",
			);
			assert(disposeFn.calledOnce, "Dispose should be called");
		});
	});

	/**
	 * These tests validates that the Loader layer compatibility is correctly enforced during container creation.
	 */
	describe("Container create", () => {
		function getCodeLoader(compatibilityDetails?: ILayerCompatDetails): ICodeDetailsLoader {
			return {
				load: async () => {
					return {
						details: {
							package: "none",
						},
						module: {
							fluidExport: {
								IRuntimeFactory: {
									get IRuntimeFactory(): IRuntimeFactory {
										return this;
									},
									async instantiateRuntime(context, existing): Promise<IRuntime> {
										return failSometimeProxy<IRuntime & IProvideLayerCompatDetails>({
											createSummary: () => ({
												tree: {},
												type: SummaryType.Tree,
											}),
											setAttachState: () => {},
											getPendingLocalState: () => ({
												pending: [],
											}),
											ILayerCompatDetails: compatibilityDetails,
										});
									},
								},
							},
						},
					};
				},
			} satisfies ICodeDetailsLoader;
		}

		it("Older Runtime is compatible", async () => {
			const loader = new Loader({
				codeLoader: getCodeLoader(),
				documentServiceFactory: failProxy(),
				urlResolver: failProxy(),
			});
			await assert.doesNotReject(
				async () => loader.createDetachedContainer({ package: "none" }),
				"Older Runtime should be compatible",
			);
		});

		it("Runtime with generation >= minSupportedGeneration is compatible", async () => {
			const runtimeCompatDetails: ILayerCompatDetails = {
				pkgVersion,
				generation: RuntimeSupportRequirements.minSupportedGeneration,
				supportedFeatures: new Set(),
			};
			const loader = new Loader({
				codeLoader: getCodeLoader(runtimeCompatDetails),
				documentServiceFactory: failProxy(),
				urlResolver: failProxy(),
			});

			await assert.doesNotReject(
				async () => loader.createDetachedContainer({ package: "none" }),
				"Runtime with generation >= minSupportedGeneration should be compatible",
			);
		});

		it("Runtime with generation < minSupportedGeneration is not compatible", async () => {
			const runtimeGeneration = RuntimeSupportRequirements.minSupportedGeneration - 1;
			const runtimeCompatDetails: ILayerCompatDetails = {
				pkgVersion,
				generation: runtimeGeneration,
				supportedFeatures: new Set(),
			};
			const loader = new Loader({
				codeLoader: getCodeLoader(runtimeCompatDetails),
				documentServiceFactory: failProxy(),
				urlResolver: failProxy(),
			});

			await assert.rejects(
				async () => loader.createDetachedContainer({ package: "none" }),
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
